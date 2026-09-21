/**
 * Cluster Agent Process Service
 *
 * Infrastructure implementation of IClusterAgentProcessService.
 * Manages background worker processes for cluster agent execution
 * using Node.js child_process.fork().
 *
 * Follows the FeatureAgentProcessService pattern exactly.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { openSync, mkdirSync, chmodSync } from 'node:fs';
import type {
  IClusterAgentProcessService,
  ClusterAgentSpawnOptions,
} from '../../../../application/ports/output/services/cluster-agent-process-service.interface.js';
import { IS_WINDOWS } from '../../../platform.js';
import { getShepHomeDir } from '../../filesystem/shep-directory.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ClusterAgentProcessService implements IClusterAgentProcessService {
  spawn(clusterId: string, runId: string, options?: ClusterAgentSpawnOptions): number {
    const workerPath = join(__dirname, 'cluster-agent-worker.js');

    const args = ['--cluster-id', clusterId, '--run-id', runId];

    if (options?.argoCdEnabled) {
      args.push('--argocd-enabled');
    }
    if (options?.argoCdNamespace) {
      args.push('--argocd-namespace', options.argoCdNamespace);
    }
    if (options?.resume) {
      args.push('--resume');
    }
    if (options?.threadId) {
      args.push('--thread-id', options.threadId);
    }

    // Create log file for worker output
    // Two bugs lived on these two lines: the directory was created with the
    // default mode (0777 & ~umask, so world-readable — and worker logs carry
    // every tool call's full input, including tokenised git remote URLs), and
    // `homedir()` bypassed getShepHomeDir(), so SHEP_HOME was ignored and test
    // runs wrote into the user's real ~/.shep.
    const logsDir = join(getShepHomeDir(), 'logs');
    mkdirSync(logsDir, { recursive: true, ...(IS_WINDOWS ? {} : { mode: 0o700 }) });
    // mkdirSync applies `mode` only when it CREATES the directory, so an
    // install that already has a permissive ~/.shep/logs would never be
    // repaired. chmod every time; a volume that refuses chmod must not stop a
    // run from starting.
    if (!IS_WINDOWS) {
      try {
        chmodSync(logsDir, 0o700);
      } catch {
        /* read-only or unsupported filesystem — not worth failing the run */
      }
    }
    const logPath = join(logsDir, `cluster-worker-${runId}.log`);
    const logFd = openSync(logPath, 'a', IS_WINDOWS ? undefined : 0o600);

    const child = fork(workerPath, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd, 'ipc'],
      ...(IS_WINDOWS ? { windowsHide: true } : {}),
    });

    if (!child.pid) {
      throw new Error('Failed to spawn cluster agent worker: no PID returned');
    }

    // Disconnect IPC so parent can exit cleanly without breaking the child
    child.disconnect();
    child.unref();
    return child.pid;
  }

  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  kill(pid: number): void {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may already be dead
    }
  }
}
