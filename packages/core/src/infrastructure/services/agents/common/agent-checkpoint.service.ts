import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { injectable } from 'tsyringe';
import type { IAgentCheckpointService } from '@/application/ports/output/agents/agent-checkpoint-service.interface.js';
import { getShepHomeDir } from '../../filesystem/shep-directory.service.js';

@injectable()
export class AgentCheckpointService implements IAgentCheckpointService {
  getFeatureCheckpointPath(checkpointId: string): string {
    return join(getShepHomeDir(), 'checkpoints', `${checkpointId}.db`);
  }

  getClusterCheckpointPath(checkpointId: string): string {
    return join(getShepHomeDir(), 'checkpoints', `cluster-${checkpointId}.db`);
  }

  async removeFeatureCheckpoint(checkpointId: string): Promise<void> {
    await unlink(this.getFeatureCheckpointPath(checkpointId));
  }
}
