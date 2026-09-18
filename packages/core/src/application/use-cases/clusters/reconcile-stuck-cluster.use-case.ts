/**
 * ReconcileStuckClusterUseCase
 *
 * Self-healing check that closes the gap where a cluster's worker died or
 * hung without ever reaching the LangGraph `handle-error` terminal: on every
 * read of a `Provisioning` cluster, this checks whether the worker process is
 * still alive and whether its heartbeat is still fresh, and if not, persists
 * `status: Error` with a distinguishing, human-readable message before
 * returning the cluster.
 *
 * Mirrors ReconcileBlockedFeaturesUseCase's shape: idempotent, cheap when the
 * invariant already holds (a single status check), and safe to call on every
 * read so it can be injected into every cluster read path (list/get/status)
 * without any presentation-layer logic duplicating the check.
 */

import { injectable, inject } from 'tsyringe';
import { ClusterStatus } from '../../../domain/generated/output.js';
import type { Cluster } from '../../../domain/generated/output.js';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { IClusterAgentProcessService } from '../../ports/output/services/cluster-agent-process-service.interface.js';
import { isProvisioningStale } from '../../../domain/shared/cluster-liveness.js';

const DEAD_WORKER_MESSAGE = 'Provisioning worker stopped responding (process no longer running)';

function staleWorkerMessage(lastHealthCheckAt: Date | undefined, now: Date): string {
  if (lastHealthCheckAt === undefined) {
    return 'Provisioning worker stopped responding (no health check received)';
  }
  const elapsedSeconds = Math.floor((now.getTime() - lastHealthCheckAt.getTime()) / 1000);
  return `Provisioning worker stopped responding (no health check received in over ${elapsedSeconds} seconds)`;
}

@injectable()
export class ReconcileStuckClusterUseCase {
  constructor(
    @inject('IClusterRepository') private readonly clusterRepo: IClusterRepository,
    @inject('IClusterAgentProcessService')
    private readonly processService: IClusterAgentProcessService
  ) {}

  async execute(cluster: Cluster): Promise<Cluster> {
    if (cluster.status !== ClusterStatus.Provisioning) {
      return cluster;
    }

    if (cluster.workerPid !== undefined && !this.processService.isAlive(cluster.workerPid)) {
      return this.persistStuck(cluster, DEAD_WORKER_MESSAGE);
    }

    const now = new Date();
    if (isProvisioningStale(cluster.lastHealthCheckAt, now)) {
      return this.persistStuck(cluster, staleWorkerMessage(cluster.lastHealthCheckAt, now));
    }

    return cluster;
  }

  private async persistStuck(cluster: Cluster, errorMessage: string): Promise<Cluster> {
    await this.clusterRepo.update(cluster.id, { status: ClusterStatus.Error, errorMessage });
    return { ...cluster, status: ClusterStatus.Error, errorMessage };
  }
}
