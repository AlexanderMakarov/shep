/**
 * Log File Store
 *
 * Filesystem adapter over `~/.shep/logs`. Listing tolerates a missing
 * directory and files that vanish mid-walk (a worker can rotate or a
 * `prune` can race); deletion does not, because a prune that silently
 * fails to delete is worse than one that says so.
 */

import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { injectable } from 'tsyringe';

import type {
  ILogFileStore,
  LogFileInfo,
} from '../../../application/ports/output/services/log-file-store.interface.js';
import { getShepHomeDir } from '../filesystem/shep-directory.service.js';

/** Sub-directory of the Shep home holding feature-agent worker logs. */
const LOGS_DIRNAME = 'logs';

@injectable()
export class LogFileStoreService implements ILogFileStore {
  getLogsDirectory(): string {
    return join(getShepHomeDir(), LOGS_DIRNAME);
  }

  async list(): Promise<LogFileInfo[]> {
    const directory = this.getLogsDirectory();
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      // Nothing has ever run, or the directory was removed — not an error.
      return [];
    }

    const files: LogFileInfo[] = [];
    for (const name of entries) {
      const path = join(directory, name);
      try {
        const stats = await stat(path);
        if (!stats.isFile()) continue;
        files.push({ path, name, sizeBytes: stats.size, modifiedAt: new Date(stats.mtimeMs) });
      } catch {
        // Removed between readdir and stat — skip it.
        continue;
      }
    }
    return files;
  }

  async remove(path: string): Promise<void> {
    await unlink(path);
  }
}
