/**
 * ReconcileStuckClusterUseCase Integration Tests
 *
 * Exercises the real ClusterAgentProcessService (real `process.kill(pid, 0)`
 * liveness checks against real spawned/killed OS processes) and a real
 * SQLite-backed IClusterRepository — no mocks for either. Per NFR-4, worker
 * crash-handling and staleness-detection logic must be proven against real
 * process lifecycle behavior, not mocks, since that is exactly the class of
 * bug this feature closes.
 *
 * Covers the second and third success criteria from
 * specs/113-cluster-provisioning-error-details/spec.yaml:
 *  - a worker killed out-of-band (SIGKILL) is detected as no-longer-alive
 *  - a worker that is alive but has stopped advancing lastHealthCheckAt is
 *    detected as stalled
 * Both flow through the same read paths a real caller uses
 * (ListClustersUseCase, GetClusterStatusUseCase) so the reconciliation wiring
 * itself — not just the use case in isolation — is what's under test.
 */

import 'reflect-metadata';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteClusterRepository } from '@/infrastructure/repositories/sqlite-cluster.repository.js';
import { ClusterAgentProcessService } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-process.service.js';
import { ReconcileStuckClusterUseCase } from '@/application/use-cases/clusters/reconcile-stuck-cluster.use-case.js';
import { ListClustersUseCase } from '@/application/use-cases/clusters/list-clusters.use-case.js';
import { GetClusterStatusUseCase } from '@/application/use-cases/clusters/get-cluster-status.use-case.js';
import type { IKubectlService } from '@/application/ports/output/services/kubectl-service.interface.js';
import type { IArgoCDService } from '@/application/ports/output/services/argocd-service.interface.js';
import type { Cluster } from '@/domain/generated/output.js';
import { ClusterStatus } from '@/domain/generated/output.js';
import { PROVISIONING_STALENESS_THRESHOLD_MS } from '@/domain/shared/cluster-liveness.js';

/** No-op stand-ins: the cluster stays out of Ready status in every test here, so neither is ever called. */
function createUnusedKubectl(): IKubectlService {
  return {
    apply: async () => {
      throw new Error('unused in this test');
    },
    applyStdin: async () => {
      throw new Error('unused in this test');
    },
    getNamespaces: async () => [],
    getPods: async () => [],
    getServices: async () => [],
    waitForReady: async () => {
      throw new Error('unused in this test');
    },
  };
}

function createUnusedArgoCD(): IArgoCDService {
  return {
    install: async () => {
      throw new Error('unused in this test');
    },
    getStatus: async () => ({ installed: false, podCount: 0, serverReady: false }),
    createApp: async () => {
      throw new Error('unused in this test');
    },
    syncApp: async () => {
      throw new Error('unused in this test');
    },
  };
}

/** Spawns a real, long-running Node child process for liveness tests. Caller owns killing it. */
function spawnLongRunningChildProcess(): ChildProcess {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });
  if (!child.pid) {
    throw new Error('Failed to spawn test child process: no PID returned');
  }
  return child;
}

/** Resolves once the child process has actually exited (and been reaped), not just been signaled. */
function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
  });
}

describe('ReconcileStuckClusterUseCase (integration)', () => {
  let db: Database.Database;
  let repository: SQLiteClusterRepository;
  let processService: ClusterAgentProcessService;
  let reconcileUseCase: ReconcileStuckClusterUseCase;
  const spawnedChildren: ChildProcess[] = [];

  function makeProvisioningCluster(overrides: Partial<Cluster> = {}): Cluster {
    return {
      id: `cluster-${randomUUID()}`,
      name: 'Test Cluster',
      slug: `test-cluster-${randomUUID()}`,
      status: ClusterStatus.Provisioning,
      argoCdEnabled: false,
      argoCdNamespace: 'argocd',
      nodeCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'clusters')).toBe(true);
    repository = new SQLiteClusterRepository(db);
    processService = new ClusterAgentProcessService();
    reconcileUseCase = new ReconcileStuckClusterUseCase(repository, processService);
  });

  afterEach(() => {
    for (const child of spawnedChildren) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
    spawnedChildren.length = 0;
    db.close();
  });

  it('detects a SIGKILLed worker process and transitions the cluster to Error via ListClustersUseCase', async () => {
    const child = spawnLongRunningChildProcess();
    spawnedChildren.push(child);
    const workerPid = child.pid as number;

    const cluster = makeProvisioningCluster({
      workerPid,
      lastHealthCheckAt: new Date(), // fresh — only the liveness signal should fire, not staleness
    });
    await repository.create(cluster);

    // Kill out-of-band, bypassing IClusterAgentProcessService.kill()'s graceful SIGTERM.
    const exited = waitForExit(child);
    process.kill(workerPid, 'SIGKILL');
    await exited;

    const listClusters = new ListClustersUseCase(repository, reconcileUseCase);
    const results = await listClusters.execute();
    const reconciled = results.find((c) => c.id === cluster.id);

    expect(reconciled?.status).toBe(ClusterStatus.Error);
    expect(reconciled?.errorMessage).toContain('process no longer running');

    // Persisted, not just returned in-memory.
    const persisted = await repository.findById(cluster.id);
    expect(persisted?.status).toBe(ClusterStatus.Error);
    expect(persisted?.errorMessage).toContain('process no longer running');
  });

  it('detects a hung-but-alive worker (stale heartbeat) and transitions the cluster to Error via GetClusterStatusUseCase', async () => {
    const child = spawnLongRunningChildProcess();
    spawnedChildren.push(child);
    const workerPid = child.pid as number;

    const staleTimestamp = new Date(Date.now() - PROVISIONING_STALENESS_THRESHOLD_MS - 5_000);
    const cluster = makeProvisioningCluster({
      workerPid,
      lastHealthCheckAt: staleTimestamp,
    });
    await repository.create(cluster);

    // Sanity: the real liveness check must see this process as alive — the
    // staleness signal, not the liveness signal, must be what fires.
    expect(processService.isAlive(workerPid)).toBe(true);

    const getClusterStatus = new GetClusterStatusUseCase(
      repository,
      createUnusedKubectl(),
      createUnusedArgoCD(),
      reconcileUseCase
    );
    const result = await getClusterStatus.execute(cluster.id);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok result');
    expect(result.status.cluster.status).toBe(ClusterStatus.Error);
    expect(result.status.cluster.errorMessage).toContain('no health check received');

    const persisted = await repository.findById(cluster.id);
    expect(persisted?.status).toBe(ClusterStatus.Error);
    expect(persisted?.errorMessage).toContain('no health check received');
  });
});
