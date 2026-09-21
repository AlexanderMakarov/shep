/**
 * Crash-Detection Unit Tests
 *
 * `checkAndMarkCrashed` reads the run, sees a non-terminal status, then asks
 * the OS whether the PID is alive and writes `interrupted`. The worker's
 * NORMAL exit path lands in that window: it writes `completed` and exits, so
 * by the time `isAlive()` is asked the process is gone — and the unguarded
 * `UPDATE agent_runs SET ... WHERE id = ?` overwrote a successful run with
 * "crashed or was killed", clobbering completedAt and error along with it.
 *
 * The status guard has to live in the WRITE, not in the read before it.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureAgentProcessService } from '@/infrastructure/services/agents/feature-agent/feature-agent-process.service.js';
import { AgentRunStatus } from '@/domain/generated/output.js';
import type { AgentRun } from '@/domain/generated/output.js';

const RUN_ID = 'run-1';
const DEAD_PID = 999_999;

function makeRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: RUN_ID,
    agentType: 'claude-code' as AgentRun['agentType'],
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'do the thing',
    threadId: 'thread-1',
    pid: DEAD_PID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('FeatureAgentProcessService.checkAndMarkCrashed', () => {
  let runRepository: { findById: ReturnType<typeof vi.fn>; updateStatus: ReturnType<typeof vi.fn> };
  let service: FeatureAgentProcessService;

  beforeEach(() => {
    runRepository = {
      findById: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(true),
    };
    service = new FeatureAgentProcessService(runRepository as never);
  });

  it('marks a run whose process is gone as interrupted', async () => {
    runRepository.findById.mockResolvedValue(makeRun());

    await service.checkAndMarkCrashed(RUN_ID);

    expect(runRepository.updateStatus).toHaveBeenCalledWith(
      RUN_ID,
      AgentRunStatus.interrupted,
      expect.objectContaining({ error: expect.stringContaining(String(DEAD_PID)) }),
      expect.anything()
    );
  });

  it('guards the write against every terminal status, not just the one it read', async () => {
    runRepository.findById.mockResolvedValue(makeRun());

    await service.checkAndMarkCrashed(RUN_ID);

    const options = runRepository.updateStatus.mock.calls[0][3] as {
      allowedFrom: AgentRunStatus[];
    };
    expect(options.allowedFrom).toEqual(
      expect.arrayContaining([AgentRunStatus.running, AgentRunStatus.pending])
    );
    expect(options.allowedFrom).not.toContain(AgentRunStatus.completed);
    expect(options.allowedFrom).not.toContain(AgentRunStatus.failed);
    expect(options.allowedFrom).not.toContain(AgentRunStatus.interrupted);
    expect(options.allowedFrom).not.toContain(AgentRunStatus.cancelled);
  });

  it('does not write at all when the read already shows a terminal status', async () => {
    runRepository.findById.mockResolvedValue(makeRun({ status: AgentRunStatus.completed }));

    await service.checkAndMarkCrashed(RUN_ID);

    expect(runRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('does not write when the run has no PID to check', async () => {
    runRepository.findById.mockResolvedValue(makeRun({ pid: undefined }));

    await service.checkAndMarkCrashed(RUN_ID);

    expect(runRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('does not write when the process is still alive', async () => {
    runRepository.findById.mockResolvedValue(makeRun({ pid: process.pid }));

    await service.checkAndMarkCrashed(RUN_ID);

    expect(runRepository.updateStatus).not.toHaveBeenCalled();
  });
});
