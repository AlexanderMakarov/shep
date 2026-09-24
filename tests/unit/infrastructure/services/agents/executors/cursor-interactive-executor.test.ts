/**
 * CursorInteractiveExecutor Unit Tests
 *
 * RED-first coverage for Application-chat multi-turn sessions driven by
 * cursor-agent create-chat / --print stream-json / --resume.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

vi.mock('@/infrastructure/platform.js', () => ({
  get IS_WINDOWS() {
    return process.platform === 'win32';
  },
}));

import { CursorInteractiveExecutor } from '@/infrastructure/services/agents/common/executors/cursor-interactive-executor.service.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import type { InteractiveAgentEvent } from '@/application/ports/output/agents/interactive-agent-executor.interface.js';

function createMockChildProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 4242;
  proc.kill = vi.fn();
  return proc;
}

function buildAssistant(text: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
  });
}

function buildToolCall(subtype: 'started' | 'completed', toolName: string): string {
  return JSON.stringify({
    type: 'tool_call',
    subtype,
    [toolName]: {},
  });
}

function buildResult(sessionId: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'result',
    session_id: sessionId,
    duration_ms: 120,
    result: 'final answer',
    ...extra,
  });
}

function buildError(message: string): string {
  return JSON.stringify({ type: 'error', message });
}

function emitLines(
  proc: ReturnType<typeof createMockChildProcess>,
  lines: string[],
  exitCode: number | null = 0
): void {
  process.nextTick(() => {
    for (const line of lines) {
      proc.stdout.write(`${line}\n`);
    }
    proc.stdout.end();
    proc.stderr.end();
    proc.emit('close', exitCode);
  });
}

async function collectEvents(
  stream: AsyncIterable<InteractiveAgentEvent>
): Promise<InteractiveAgentEvent[]> {
  const events: InteractiveAgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('CursorInteractiveExecutor', () => {
  let mockSpawn: ReturnType<typeof vi.fn>;
  let executor: CursorInteractiveExecutor;
  const chatId = '34278ae8-b800-4ce7-9bce-0ee2ab199a4d';

  beforeEach(() => {
    mockSpawn = vi.fn();
    executor = new CursorInteractiveExecutor(mockSpawn as unknown as SpawnFunction);
  });

  describe('createSession', () => {
    it('spawns create-chat and exposes the chat id as sessionId', async () => {
      const createProc = createMockChildProcess();
      mockSpawn.mockReturnValueOnce(createProc);
      emitLines(createProc, [chatId]);

      const handle = await executor.createSession({ cwd: '/tmp/wt' });

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        ['create-chat'],
        expect.objectContaining({ cwd: '/tmp/wt' })
      );
      expect(handle.sessionId).toBe(chatId);
    });
  });

  describe('resumeSession', () => {
    it('does not call create-chat and uses the provided session id', async () => {
      const handle = await executor.resumeSession(chatId, { cwd: '/tmp/wt' });

      expect(mockSpawn).not.toHaveBeenCalled();
      expect(handle.sessionId).toBe(chatId);
    });

    it('first turn spawns with --resume and stream-json flags', async () => {
      const turnProc = createMockChildProcess();
      mockSpawn.mockReturnValueOnce(turnProc);
      emitLines(turnProc, [buildAssistant('hi'), buildResult(chatId)]);

      const handle = await executor.resumeSession(chatId, {
        cwd: '/tmp/wt',
        model: 'composer-2.5',
      });
      await handle.send('hello');
      await collectEvents(handle.stream());

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const [cmd, args, opts] = mockSpawn.mock.calls[0] as [string, string[], object];
      expect(cmd).toBe('cursor-agent');
      expect(args).toContain('--yolo');
      expect(args).toContain('--output-format');
      expect(args).toContain('stream-json');
      expect(args).toContain('--stream-partial-output');
      expect(args).toContain('--resume');
      expect(args).toContain(chatId);
      expect(args).toContain('--model');
      expect(args).toContain('composer-2.5');
      expect(args).toContain('-p');
      expect(args).toContain('hello');
      expect(opts).toEqual(expect.objectContaining({ cwd: '/tmp/wt' }));
    });
  });

  describe('stream mapping', () => {
    async function streamTurn(lines: string[], exitCode: number | null = 0) {
      const turnProc = createMockChildProcess();
      mockSpawn.mockReturnValueOnce(turnProc);
      emitLines(turnProc, lines, exitCode);

      const handle = await executor.resumeSession(chatId, { cwd: '/tmp/wt' });
      await handle.send('go');
      return { events: await collectEvents(handle.stream()), turnProc };
    }

    it('maps assistant text to delta and result to done with usage', async () => {
      const { events } = await streamTurn([
        buildAssistant('Hello'),
        buildAssistant(' world'),
        buildResult(chatId),
      ]);

      expect(events.filter((e) => e.type === 'delta').map((e) => e.content)).toEqual([
        'Hello',
        ' world',
      ]);
      const done = events.find((e) => e.type === 'done');
      expect(done).toMatchObject({
        type: 'done',
        content: 'final answer',
        usage: { durationMs: 120 },
      });
    });

    it('maps tool_call started to tool_use and completed to status', async () => {
      const { events } = await streamTurn([
        buildToolCall('started', 'shellToolCall'),
        buildToolCall('completed', 'shellToolCall'),
        buildResult(chatId),
      ]);

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'tool_use', label: 'shellToolCall' }),
          expect.objectContaining({ type: 'status', label: 'shellToolCall' }),
          expect.objectContaining({ type: 'done' }),
        ])
      );
    });

    it('maps error events and failed results to error', async () => {
      const { events: errorEvents } = await streamTurn([buildError('boom')]);
      expect(errorEvents.some((e) => e.type === 'error' && e.content?.includes('boom'))).toBe(true);

      const { events: failEvents } = await streamTurn([
        buildResult(chatId, { is_error: true, result: 'turn limit', subtype: 'error_max_turns' }),
      ]);
      expect(failEvents.some((e) => e.type === 'error')).toBe(true);
      expect(failEvents.some((e) => e.type === 'done')).toBe(false);
    });

    it('emits error when the process exits non-zero without a result', async () => {
      const { events } = await streamTurn([buildAssistant('partial')], 1);
      expect(events.some((e) => e.type === 'error')).toBe(true);
    });
  });

  describe('abort', () => {
    it('terminates the active child process', async () => {
      const turnProc = createMockChildProcess();
      mockSpawn.mockReturnValueOnce(turnProc);

      const handle = await executor.resumeSession(chatId, { cwd: '/tmp/wt' });
      await handle.send('long');

      const streamPromise = collectEvents(handle.stream());
      // Allow spawn to run and stream loop to attach
      await new Promise((r) => setImmediate(r));
      handle.abort();
      process.nextTick(() => {
        turnProc.emit('close', null, 'SIGTERM');
      });
      await streamPromise;

      expect(turnProc.kill).toHaveBeenCalled();
    });
  });
});
