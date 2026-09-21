/**
 * ShepHomePermissionsDiagnostic
 *
 * `~/.shep` holds the SQLite database, and that database stores plaintext
 * tokens. `ensureShepDirectory()` creates the directory `0700`, but only
 * when it does not already exist — an older install, a restored backup or
 * a permissive umask leaves it group- and world-readable, and nothing ever
 * looked. On the audited machine it is `drwxrwxr-x`, with the data file at
 * `-rw-r--r--`.
 *
 * Any bit outside the owner's is a FAIL: on a shared machine that is a
 * credential readable by every local account.
 */

import { inject, injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import type {
  IShepEnvironmentInspector,
  PathPermissions,
} from '../../../ports/output/services/shep-environment-inspector.interface.js';

/** Bits that must be clear: group (0o070) and other (0o007). */
export const NON_OWNER_PERMISSION_BITS = 0o077;

/** Mode a directory holding secrets should carry. */
export const EXPECTED_DIRECTORY_MODE = 0o700;

/** Mode a file holding secrets should carry. */
export const EXPECTED_FILE_MODE = 0o600;

@injectable()
export class ShepHomePermissionsDiagnostic implements IDiagnostic {
  readonly name = 'shep-home-permissions';

  constructor(
    @inject('IShepEnvironmentInspector')
    private readonly inspector: IShepEnvironmentInspector
  ) {}

  async run(): Promise<DiagnosticResult> {
    let permissions: PathPermissions[];
    try {
      permissions = await this.inspector.readSensitivePermissions();
    } catch (err) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Could not read permissions under ${this.inspector.getShepHomePath()}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        fixHint: 'Check that the Shep home directory exists and is readable',
      };
    }

    if (!this.inspector.arePosixPermissionsMeaningful()) {
      return {
        name: this.name,
        status: DiagnosticStatus.Warn,
        detail:
          'POSIX permissions are not enforced on this platform (Windows uses ACLs) — ' +
          `verify that ${this.inspector.getShepHomePath()} is not shared`,
        fixHint: 'Restrict the directory to your user account in its Security properties',
      };
    }

    const offenders = permissions.filter(isOverlyPermissive);
    if (offenders.length === 0) {
      return {
        name: this.name,
        status: DiagnosticStatus.Ok,
        detail: `${this.inspector.getShepHomePath()} is owner-only`,
      };
    }

    const described = offenders
      .map((entry) => `${entry.path} is ${toOctal(entry.mode)} (expected ${expectedFor(entry)})`)
      .join('; ');
    const chmodCommands = offenders
      .map((entry) => `chmod ${expectedFor(entry)} ${entry.path}`)
      .join(' && ');

    return {
      name: this.name,
      status: DiagnosticStatus.Fail,
      detail: `Readable beyond the owner — ${described}. The database stores plaintext tokens.`,
      fixHint: chmodCommands,
    };
  }
}

function isOverlyPermissive(entry: PathPermissions): boolean {
  if (!entry.exists || entry.mode === null) return false;
  return (entry.mode & NON_OWNER_PERMISSION_BITS) !== 0;
}

function expectedFor(entry: PathPermissions): string {
  return toOctal(entry.isDirectory ? EXPECTED_DIRECTORY_MODE : EXPECTED_FILE_MODE);
}

function toOctal(mode: number | null): string {
  return mode === null ? 'unknown' : mode.toString(8).padStart(3, '0');
}
