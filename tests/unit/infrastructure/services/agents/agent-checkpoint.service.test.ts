import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentCheckpointService } from '@/infrastructure/services/agents/common/agent-checkpoint.service.js';

describe('AgentCheckpointService', () => {
  let service: AgentCheckpointService;
  let tempHome: string;
  let originalShepHome: string | undefined;

  beforeEach(async () => {
    originalShepHome = process.env.SHEP_HOME;
    tempHome = await mkdtemp(join(tmpdir(), 'shep-checkpoint-'));
    process.env.SHEP_HOME = tempHome;
    service = new AgentCheckpointService();
  });

  afterEach(async () => {
    if (originalShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = originalShepHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  it('resolves feature and cluster checkpoints under SHEP_HOME', () => {
    expect(service.getFeatureCheckpointPath('thread-1')).toBe(
      join(tempHome, 'checkpoints', 'thread-1.db')
    );
    expect(service.getClusterCheckpointPath('run-1')).toBe(
      join(tempHome, 'checkpoints', 'cluster-run-1.db')
    );
  });

  it('falls back to ~/.shep/checkpoints when SHEP_HOME is unset', () => {
    delete process.env.SHEP_HOME;
    expect(service.getFeatureCheckpointPath('thread-2')).toBe(
      join(homedir(), '.shep', 'checkpoints', 'thread-2.db')
    );
  });

  it('removes a feature checkpoint from the configured home', async () => {
    const checkpointPath = service.getFeatureCheckpointPath('thread-delete');
    await mkdir(join(tempHome, 'checkpoints'), { recursive: true });
    await writeFile(checkpointPath, 'checkpoint');

    await service.removeFeatureCheckpoint('thread-delete');

    expect(existsSync(checkpointPath)).toBe(false);
  });
});
