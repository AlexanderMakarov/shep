/**
 * Executor Logger
 *
 * Every CLI agent executor logs its spawn line, the agent's own output and the
 * child's stderr into the worker log file, and every one of them has to honour
 * `options.silent`.
 *
 * That flag used to live as a mutable field on the executor instance. The
 * executor factory caches one instance per agent type, so two agents running in
 * parallel — or a stream started after a silent call — inherited whichever
 * value was set last, and silently muted each other's logs. A logger built per
 * call carries the flag with it and cannot be overwritten by a concurrent run.
 *
 * Every line also passes through {@link redactLogLine}. What executors write
 * here is agent-authored output — tool-call inputs, raw stdout, child stderr —
 * and the merge node instructs the agent to push, so a tool call carrying
 * `git push https://x-access-token:ghs_…@github.com/o/r` used to reach
 * `~/.shep/logs/worker-*.log` verbatim. Users paste those logs into issues.
 * Redacting in the one place every executor already funnels through means the
 * next executor cannot forget to do it.
 */

import { getCurrentPhase, getLogPrefix } from '../../feature-agent/log-context.js';
import { redactLogLine } from '../../../logging/redact-log-line.js';

/** Writes one timestamped, phase-tagged line per message. */
export type ExecutorLogger = (message: string) => void;

/**
 * Build a logger bound to a single execution.
 *
 * Output goes to stdout rather than a logger service because the feature-agent
 * worker's stdout *is* the log file the user tails.
 *
 * @param silent - When true, the returned logger discards every message.
 */
export function createExecutorLogger(silent: boolean | undefined): ExecutorLogger {
  if (silent) return () => undefined;

  return (message: string): void => {
    const timestamp = new Date().toISOString();
    process.stdout.write(
      `[${timestamp}] ${getCurrentPhase()}${getLogPrefix()}${redactLogLine(message)}\n`
    );
  };
}
