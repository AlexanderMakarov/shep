/**
 * TelemetryFailureCounter Unit Tests
 *
 * The heartbeat and phase-timing writes caught their failures into empty
 * blocks, so a run whose telemetry died under SQLite lock contention looked
 * exactly like one that finished. This counter is what makes the difference
 * observable without drowning the log in one line per failed write.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelemetryFailureCounter } from '@/infrastructure/services/agents/feature-agent/telemetry-failure-counter.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';

function createLogger(): ILogger & { error: ReturnType<typeof vi.fn> } {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger & { error: ReturnType<typeof vi.fn> };
}

describe('TelemetryFailureCounter', () => {
  let logger: ReturnType<typeof createLogger>;
  let counter: TelemetryFailureCounter;

  beforeEach(() => {
    logger = createLogger();
    counter = new TelemetryFailureCounter('heartbeat', logger);
  });

  it('should stay silent below the threshold', () => {
    counter.recordFailure(new Error('locked'));
    counter.recordFailure(new Error('locked'));

    expect(logger.error).not.toHaveBeenCalled();
    expect(counter.consecutiveFailures).toBe(2);
  });

  it('should log once when the episode crosses the threshold', () => {
    for (let i = 0; i < 3; i += 1) counter.recordFailure(new Error('database is locked'));

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message, meta] = logger.error.mock.calls[0];
    expect(message).toContain('heartbeat');
    expect(message).toContain('3 times in a row');
    expect(meta).toEqual({ error: 'database is locked' });
  });

  /** A locked database fails every write; one line per failure buries the signal. */
  it('should not log again while the same episode continues', () => {
    for (let i = 0; i < 50; i += 1) counter.recordFailure(new Error('locked'));

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(counter.consecutiveFailures).toBe(50);
  });

  it('should reset the run of failures on a success', () => {
    counter.recordFailure(new Error('locked'));
    counter.recordFailure(new Error('locked'));
    counter.recordSuccess();

    expect(counter.consecutiveFailures).toBe(0);

    counter.recordFailure(new Error('locked'));
    counter.recordFailure(new Error('locked'));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should report a second episode after recovery', () => {
    for (let i = 0; i < 3; i += 1) counter.recordFailure(new Error('locked'));
    counter.recordSuccess();
    for (let i = 0; i < 3; i += 1) counter.recordFailure(new Error('locked again'));

    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('should stringify a non-Error rejection', () => {
    const custom = new TelemetryFailureCounter('phase timing write', logger, 1);

    custom.recordFailure('SQLITE_BUSY');

    expect(logger.error.mock.calls[0][1]).toEqual({ error: 'SQLITE_BUSY' });
  });

  it('should honour a custom threshold', () => {
    const custom = new TelemetryFailureCounter('phase timing write', logger, 1);

    custom.recordFailure(new Error('locked'));

    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('should forget everything on reset, so tests cannot leak episodes', () => {
    for (let i = 0; i < 3; i += 1) counter.recordFailure(new Error('locked'));
    counter.reset();

    expect(counter.consecutiveFailures).toBe(0);

    for (let i = 0; i < 3; i += 1) counter.recordFailure(new Error('locked'));
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
