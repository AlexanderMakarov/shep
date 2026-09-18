import { injectable, inject } from 'tsyringe';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { GetClusterResult } from './types.js';
import { ReconcileStuckClusterUseCase } from './reconcile-stuck-cluster.use-case.js';

@injectable()
export class GetClusterUseCase {
  constructor(
    @inject('IClusterRepository') private readonly clusterRepo: IClusterRepository,
    @inject(ReconcileStuckClusterUseCase)
    private readonly reconcileStuckCluster: ReconcileStuckClusterUseCase
  ) {}

  async execute(id: string): Promise<GetClusterResult> {
    const cluster = await this.clusterRepo.findById(id);
    if (!cluster) {
      return { ok: false, error: `Cluster not found: "${id}"` };
    }
    return { ok: true, cluster: await this.reconcileStuckCluster.execute(cluster) };
  }
}
