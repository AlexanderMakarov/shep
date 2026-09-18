import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetClusterUseCase } from '@/application/use-cases/clusters/get-cluster.use-case.js';
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

const sampleCluster: Cluster = {
  id: 'cluster-1',
  name: 'Test Cluster',
  slug: 'test-cluster',
  status: ClusterStatus.Stopped,
  argoCdEnabled: false,
  argoCdNamespace: 'argocd',
  nodeCount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('GetClusterUseCase', () => {
  let useCase: GetClusterUseCase;
  let mockRepo: IClusterRepository;
  let mockProcessService: IClusterAgentProcessService;
  let reconcileStuckCluster: ReconcileStuckClusterUseCase;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    mockProcessService = {
      spawn: vi.fn(),
      isAlive: vi.fn().mockReturnValue(true),
      kill: vi.fn(),
    };
    reconcileStuckCluster = new ReconcileStuckClusterUseCase(mockRepo, mockProcessService);
    useCase = new GetClusterUseCase(mockRepo, reconcileStuckCluster);
  });

  it('should return cluster by ID', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleCluster);

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cluster).toEqual(sampleCluster);
    expect(mockRepo.findById).toHaveBeenCalledWith('cluster-1');
  });

  it('should return error when cluster not found', async () => {
    const result = await useCase.execute('non-existent');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster not found: "non-existent"');
  });

  it('should return a stuck Provisioning cluster as Error with a stale-heartbeat message', async () => {
    const staleTimestamp = new Date(Date.now() - PROVISIONING_STALENESS_THRESHOLD_MS - 1_000);
    vi.mocked(mockRepo.findById).mockResolvedValue({
      ...sampleCluster,
      status: ClusterStatus.Provisioning,
      lastHealthCheckAt: staleTimestamp,
    });

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cluster.status).toBe(ClusterStatus.Error);
    expect(result.cluster.errorMessage).toContain('no health check received');
    expect(mockRepo.update).toHaveBeenCalledWith(
      'cluster-1',
      expect.objectContaining({ status: ClusterStatus.Error })
    );
  });
});
