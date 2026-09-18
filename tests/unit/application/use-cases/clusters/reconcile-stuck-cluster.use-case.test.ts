import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconcileStuckClusterUseCase } from '@/application/use-cases/clusters/reconcile-stuck-cluster.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import type { IClusterAgentProcessService } from '@/application/ports/output/services/cluster-agent-process-service.interface.js';
import type { Cluster } from '@/domain/generated/output.js';
import { ClusterStatus } from '@/domain/generated/output.js';
import { PROVISIONING_STALENESS_THRESHOLD_MS } from '@/domain/shared/cluster-liveness.js';

function createMockClusterRepo(): IClusterRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    linkRepository: vi.fn(),
    unlinkRepository: vi.fn(),
    getLinkedRepositories: vi.fn().mockResolvedValue([]),
    linkApplication: vi.fn(),
    unlinkApplication: vi.fn(),
    getLinkedApplications: vi.fn().mockResolvedValue([]),
  };
}

function createMockProcessService(): IClusterAgentProcessService {
  return {
    spawn: vi.fn(),
    isAlive: vi.fn().mockReturnValue(true),
    kill: vi.fn(),
  };
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'cluster-1',
    name: 'Test Cluster',
    slug: 'test-cluster',
    status: ClusterStatus.Provisioning,
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    nodeCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastHealthCheckAt: new Date(),
    ...overrides,
  };
}

describe('ReconcileStuckClusterUseCase', () => {
  let useCase: ReconcileStuckClusterUseCase;
  let mockRepo: IClusterRepository;
  let mockProcessService: IClusterAgentProcessService;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    mockProcessService = createMockProcessService();
    useCase = new ReconcileStuckClusterUseCase(mockRepo, mockProcessService);
  });

  it('returns a non-Provisioning cluster unchanged without touching the process service', async () => {
    const cluster = makeCluster({ status: ClusterStatus.Ready });

    const result = await useCase.execute(cluster);

    expect(result).toEqual(cluster);
    expect(mockProcessService.isAlive).not.toHaveBeenCalled();
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('persists status Error with a dead-worker message when workerPid is no longer alive', async () => {
    const cluster = makeCluster({ workerPid: 4242, lastHealthCheckAt: new Date() });
    vi.mocked(mockProcessService.isAlive).mockReturnValue(false);

    const result = await useCase.execute(cluster);

    expect(mockProcessService.isAlive).toHaveBeenCalledWith(4242);
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Error,
      errorMessage: expect.stringContaining('process no longer running'),
    });
    expect(result.status).toBe(ClusterStatus.Error);
    expect(result.errorMessage).toContain('process no longer running');
  });

  it('persists status Error with a stale-heartbeat message when alive but stale', async () => {
    const staleTimestamp = new Date(Date.now() - PROVISIONING_STALENESS_THRESHOLD_MS - 1_000);
    const cluster = makeCluster({ workerPid: 4242, lastHealthCheckAt: staleTimestamp });
    vi.mocked(mockProcessService.isAlive).mockReturnValue(true);

    const result = await useCase.execute(cluster);

    expect(mockProcessService.isAlive).toHaveBeenCalledWith(4242);
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Error,
      errorMessage: expect.stringContaining('no health check received'),
    });
    expect(result.status).toBe(ClusterStatus.Error);
    expect(result.errorMessage).toContain('no health check received');
  });

  it('falls back to staleness-only detection and never calls isAlive when workerPid is absent', async () => {
    const staleTimestamp = new Date(Date.now() - PROVISIONING_STALENESS_THRESHOLD_MS - 1_000);
    const cluster = makeCluster({ workerPid: undefined, lastHealthCheckAt: staleTimestamp });

    const result = await useCase.execute(cluster);

    expect(mockProcessService.isAlive).not.toHaveBeenCalled();
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Error,
      errorMessage: expect.stringContaining('no health check received'),
    });
    expect(result.status).toBe(ClusterStatus.Error);
  });

  it('returns a Provisioning cluster unchanged when alive and heartbeat is fresh', async () => {
    const cluster = makeCluster({ workerPid: 4242, lastHealthCheckAt: new Date() });
    vi.mocked(mockProcessService.isAlive).mockReturnValue(true);

    const result = await useCase.execute(cluster);

    expect(result).toEqual(cluster);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
