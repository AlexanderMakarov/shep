import { injectable, inject } from 'tsyringe';
import type { Cluster } from '../../../domain/generated/output.js';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { ListClustersInput } from './types.js';
import { ReconcileStuckClusterUseCase } from './reconcile-stuck-cluster.use-case.js';

@injectable()
export class ListClustersUseCase {
  constructor(
    @inject('IClusterRepository') private readonly clusterRepo: IClusterRepository,
    @inject(ReconcileStuckClusterUseCase)
    private readonly reconcileStuckCluster: ReconcileStuckClusterUseCase
  ) {}

  async execute(input?: ListClustersInput): Promise<Cluster[]> {
    const clusters = await this.clusterRepo.list(input?.status);
    return Promise.all(clusters.map((cluster) => this.reconcileStuckCluster.execute(cluster)));
  }
}
