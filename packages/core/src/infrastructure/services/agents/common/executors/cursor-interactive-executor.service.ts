/**
 * Cursor Interactive Executor Service
 *
 * Infrastructure implementation of IInteractiveAgentExecutor for Cursor.
 * Application chat needs a durable multi-turn handle; Cursor has no persistent
 * SDK session like Claude Code V2. Instead each turn is a `cursor-agent --print`
 * subprocess with `stream-json`, stitched together by a chat id from
 * `create-chat` / `--resume`.
 *
 * AskUserQuestion / onUserQuestion pause UX is intentionally unsupported —
 * `--yolo` auto-approves tools. Companion UX guard: issue #895.
 */

import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type {
  IInteractiveAgentExecutor,
  InteractiveAgentOptions,
  InteractiveAgentSessionHandle,
  InteractiveAgentEvent,
  ToolResultMessage,
} from '../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import type { SpawnFunction } from '../types.js';
import { IS_WINDOWS } from '../../../../platform.js';
import { EventChannel } from '../../streaming/event-channel.js';
import { describeSubprocessFailure } from './subprocess-failure-message.js';
import { describeResultEventError, resultEventError } from './result-event-outcome.js';
import {
  buildSpawnOptions,
  classifySpawnError,
  createLineAccumulator,
  createStderrTail,
  signalTerminationMessage,
  terminateWithEscalation,
} from './process-stream.js';

const AGENT_NAME = 'Cursor';
const CURSOR_BINARY = 'cursor-agent';
const CURSOR_NOT_FOUND_MESSAGE =
  'Cursor agent CLI not found. Please install Cursor and ensure the "cursor-agent" command is available on PATH.';

/** Map legacy / Shep-canonical model IDs to current Cursor CLI ids. */
const CURSOR_MODEL_MAP: Record<string, string> = {
  'composer-1.5': 'composer-2.5',
  'claude-opus-5': 'claude-opus-5-high',
  'claude-opus-4-8': 'claude-opus-4-8-high',
  'claude-opus-4-7': 'claude-opus-4-7-high',
  'claude-opus-4-6': 'claude-4.6-opus-high',
  'claude-sonnet-5': 'claude-sonnet-5-high',
  'claude-sonnet-4-6': 'claude-4.6-sonnet-medium',
  'claude-haiku-4-5': 'claude-4.5-sonnet',
  'grok-code': 'cursor-grok-4.6-high',
  'gemini-3.1-pro-preview': 'gemini-3.1-pro',
};

function toCursorModelName(model: string): string {
  return CURSOR_MODEL_MAP[model] ?? model;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

function assistantText(parsed: Record<string, unknown>): string {
  const message = parsed.message as { content?: unknown } | undefined;
  if (!Array.isArray(message?.content)) return '';
  return message.content
    .filter((block: { type?: string; text?: unknown }) => block.type === 'text' && block.text)
    .map((block: { text?: unknown }) => asText(block.text))
    .join('');
}

function toolCallName(parsed: Record<string, unknown>, fallback: string): string {
  return (
    Object.keys(parsed).find((k) => k.endsWith('ToolCall') || k.endsWith('toolCall')) ?? fallback
  );
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function removeTempFile(tmpFile: string | undefined): void {
  if (!tmpFile) return;
  try {
    unlinkSync(tmpFile);
  } catch {
    /* already removed */
  }
}

/**
 * Interactive Cursor sessions: one CLI process per turn, durable chat id.
 */
export class CursorInteractiveExecutor implements IInteractiveAgentExecutor {
  constructor(private readonly spawn: SpawnFunction) {}

  async createSession(options: InteractiveAgentOptions): Promise<InteractiveAgentSessionHandle> {
    const chatId = await this.createChat(options.cwd);
    return this.wrapSession(chatId, options);
  }

  async resumeSession(
    sessionId: string,
    options: InteractiveAgentOptions
  ): Promise<InteractiveAgentSessionHandle> {
    return this.wrapSession(sessionId, options);
  }

  private createChat(cwd: string): Promise<string> {
    const spawnOpts = buildSpawnOptions({ cwd });
    const proc = this.spawn(CURSOR_BINARY, ['create-chat'], spawnOpts);

    return new Promise<string>((resolve, reject) => {
      const stderr = createStderrTail();
      let stdout = '';
      let settled = false;

      const settle = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        outcome();
      };

      proc.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));

      proc.on('error', (error: Error & { code?: string }) => {
        settle(() => reject(classifySpawnError(error, CURSOR_NOT_FOUND_MESSAGE)));
      });

      proc.on('close', (code: number | null) => {
        const chatId = stdout.trim().split(/\s+/)[0] ?? '';
        settle(() => {
          if (code !== 0 && code !== null) {
            reject(
              new Error(
                describeSubprocessFailure({
                  code,
                  resultText: stdout.trim(),
                  stderr: stderr.text(),
                })
              )
            );
            return;
          }
          if (!chatId) {
            reject(new Error('cursor-agent create-chat returned an empty chat id'));
            return;
          }
          resolve(chatId);
        });
      });
    });
  }

  private wrapSession(
    chatId: string,
    options: InteractiveAgentOptions
  ): InteractiveAgentSessionHandle {
    let pendingMessage: string | null = null;
    let activeProc: ChildProcess | null = null;
    let cancelEscalation: (() => void) | undefined;
    let closed = false;

    const clearActive = (): void => {
      activeProc = null;
    };

    return {
      get sessionId() {
        return chatId;
      },
      send: async (message: string) => {
        if (closed) throw new Error('Cursor interactive session is closed');
        pendingMessage = message;
      },
      sendToolResult: async (_toolResult: ToolResultMessage) => {
        // Cursor --print/--yolo has no AskUserQuestion pause path.
      },
      stream: () => {
        if (closed) {
          throw new Error('Cursor interactive session is closed');
        }
        const message = pendingMessage;
        pendingMessage = null;
        if (message === null) {
          throw new Error('Cursor interactive session: send() a message before stream()');
        }
        return this.runTurn(chatId, message, options, {
          onSpawn: (proc) => {
            activeProc = proc;
          },
          onDone: clearActive,
        });
      },
      close: async () => {
        closed = true;
        if (activeProc) {
          cancelEscalation?.();
          cancelEscalation = terminateWithEscalation(activeProc);
        }
        clearActive();
      },
      abort: () => {
        if (activeProc) {
          cancelEscalation?.();
          cancelEscalation = terminateWithEscalation(activeProc);
        }
      },
    };
  }

  private async *runTurn(
    chatId: string,
    prompt: string,
    options: InteractiveAgentOptions,
    hooks: { onSpawn: (proc: ChildProcess) => void; onDone: () => void }
  ): AsyncIterable<InteractiveAgentEvent> {
    const { proc, tmpFile } = this.spawnTurn(prompt, chatId, options);
    hooks.onSpawn(proc);

    const channel = new EventChannel<InteractiveAgentEvent>();
    const stderr = createStderrTail();
    let resultText = '';
    let resultSeen = false;
    let processClosed = false;

    const accumulator = createLineAccumulator((line) => {
      const parsed = parseJsonLine(line);
      if (parsed === null) {
        if (line.trim()) {
          channel.push({ type: 'status', content: line });
        }
        return;
      }

      for (const event of this.mapCursorEvent(parsed, {
        onAssistantText: (text) => {
          resultText += text;
        },
        onResultText: (text) => {
          if (text) resultText = text;
        },
      })) {
        if (parsed.type === 'result') resultSeen = true;
        channel.push(event);
      }
    });

    proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));

    proc.on('error', (error: Error & { code?: string }) => {
      processClosed = true;
      channel.push({
        type: 'error',
        content: classifySpawnError(error, CURSOR_NOT_FOUND_MESSAGE).message,
      });
      channel.close();
      hooks.onDone();
    });

    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      processClosed = true;
      accumulator.flush();

      if (code !== 0 && code !== null && !resultSeen) {
        channel.push({
          type: 'error',
          content: describeSubprocessFailure({
            code,
            resultText,
            stderr: stderr.text(),
          }),
        });
      } else if (code === null && !resultSeen) {
        channel.push({
          type: 'error',
          content: signalTerminationMessage(signal, stderr.text()),
        });
      }
      channel.close();
      hooks.onDone();
      removeTempFile(tmpFile);
    });

    try {
      yield* channel;
    } finally {
      if (!processClosed) {
        terminateWithEscalation(proc);
      }
      removeTempFile(tmpFile);
      hooks.onDone();
    }
  }

  /**
   * Map one Cursor NDJSON object to zero or more InteractiveAgentEvents.
   */
  private mapCursorEvent(
    parsed: Record<string, unknown>,
    sinks: {
      onAssistantText: (text: string) => void;
      onResultText: (text: string) => void;
    }
  ): InteractiveAgentEvent[] {
    if (parsed.type === 'assistant') {
      const text = assistantText(parsed);
      if (!text) return [];
      sinks.onAssistantText(text);
      return [{ type: 'delta', content: text }];
    }

    if (parsed.type === 'tool_call') {
      const name = toolCallName(parsed, 'tool');
      if (parsed.subtype === 'started') {
        return [{ type: 'tool_use', label: name, detail: asText(parsed[name] ?? {}) }];
      }
      if (parsed.subtype === 'completed') {
        return [{ type: 'status', label: name, content: `Tool completed: ${name}` }];
      }
      return [];
    }

    if (parsed.type === 'result') {
      const content =
        typeof parsed.result === 'string' && parsed.result ? parsed.result : undefined;
      if (content) sinks.onResultText(content);
      const failure = resultEventError(parsed);
      const durationMs = typeof parsed.duration_ms === 'number' ? parsed.duration_ms : undefined;
      if (failure) {
        return [
          {
            type: 'error',
            content: describeResultEventError(AGENT_NAME, failure, content ?? ''),
            usage: durationMs !== undefined ? { durationMs } : undefined,
          },
        ];
      }
      return [
        {
          type: 'done',
          content: content ?? '',
          usage: durationMs !== undefined ? { durationMs } : undefined,
        },
      ];
    }

    if (parsed.type === 'user') {
      return [];
    }

    if (parsed.type === 'error') {
      return [{ type: 'error', content: asText(parsed.error ?? parsed.message) }];
    }

    return [];
  }

  private spawnTurn(
    prompt: string,
    chatId: string,
    options: InteractiveAgentOptions
  ): { proc: ChildProcess; tmpFile: string | undefined } {
    const flags = [
      '--yolo',
      '--output-format',
      'stream-json',
      '--stream-partial-output',
      '--resume',
      chatId,
    ];
    if (options.model) {
      flags.push('--model', toCursorModelName(options.model));
    }

    const spawnOpts = buildSpawnOptions({ cwd: options.cwd });

    if (IS_WINDOWS) {
      const tmpFile = join(
        tmpdir(),
        `shep-cursor-interactive-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`
      );
      writeFileSync(tmpFile, prompt, 'utf8');
      const psCmd = `$p = Get-Content -Raw ${psQuote(tmpFile)}; & ${CURSOR_BINARY} ${flags
        .map(psQuote)
        .join(' ')} -p $p`;
      const proc = this.spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psCmd],
        spawnOpts
      );
      if (proc.stdin) proc.stdin.end();
      return { proc, tmpFile };
    }

    const args = [...flags, '-p', prompt];
    const proc = this.spawn(CURSOR_BINARY, args, spawnOpts);
    if (proc.stdin) proc.stdin.end();
    return { proc, tmpFile: undefined };
  }
}
