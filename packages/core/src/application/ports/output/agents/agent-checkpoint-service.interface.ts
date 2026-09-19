/**
 * Output port for feature/cluster agent checkpoint paths and lifecycle.
 * Path and filesystem details remain in infrastructure.
 */
export interface IAgentCheckpointService {
  getFeatureCheckpointPath(checkpointId: string): string;
  getClusterCheckpointPath(checkpointId: string): string;
  removeFeatureCheckpoint(checkpointId: string): Promise<void>;
}
