// @vitest-environment node

import 'reflect-metadata';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';
import { computeRepoDevConfigFingerprint } from '@/infrastructure/services/deployment/repo-dev-config-approval.js';
import {
  readRepoDevConfig,
  readValidatedRepoDevConfig,
} from '@/infrastructure/services/deployment/repo-dev-config-reader.js';
import { createDevCommand } from '../../../../../../src/presentation/cli/commands/dev/index.js';

const { resolveTarget } = vi.hoisted(() => ({ resolveTarget: vi.fn() }));
vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: () => ({ resolve: resolveTarget }) },
}));

describe('shep dev approve', () => {
  let fixture: string;
  let repoPath: string;
  let output: string;
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'shep-cli-approve-'));
    repoPath = join(fixture, 'repo with spaces');
    mkdirSync(join(repoPath, '.shep'), { recursive: true });
    vi.stubEnv('SHEP_HOME', join(fixture, 'shep-home'));
    previousExitCode = process.exitCode;
    process.exitCode = 0;
    output = '';
    vi.spyOn(console, 'log').mockImplementation((message) => {
      output += String(message);
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    resolveTarget.mockResolvedValue({ status: 'resolved', target: { repoPath } });
    writeConfig('npm run dev');
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    removeDirWithRetry(fixture);
  });

  function writeConfig(command: string) {
    writeFileSync(
      join(repoPath, '.shep', 'dev.json'),
      JSON.stringify({
        command,
        packageManager: 'npm',
        setupCommands: ['npm run prepare'],
      })
    );
  }

  async function run(...args: string[]) {
    await createDevCommand()
      .exitOverride()
      .parseAsync(['approve', '--repo', repoPath, ...args], { from: 'user' });
  }

  it('shows every executable field and fingerprint without granting consent', async () => {
    await run();
    expect(output).toContain('npm run dev');
    expect(output).toContain('npm run prepare');
    expect(output).toContain('"packageManager": "npm"');
    expect(output).toContain(JSON.stringify(repoPath));
    expect(output).toContain('--fingerprint');
    expect(readRepoDevConfig(repoPath)).toBeNull();
    expect(process.exitCode).toBe(0);
  });

  it('persists consent for the exact reviewed fingerprint', async () => {
    const fingerprint = computeRepoDevConfigFingerprint(readValidatedRepoDevConfig(repoPath)!);
    await run('--fingerprint', fingerprint);
    expect(readRepoDevConfig(repoPath)).toMatchObject({ command: 'npm run dev' });
    expect(process.exitCode).toBe(0);
  });

  it('fails without approving commands changed after review', async () => {
    const fingerprint = computeRepoDevConfigFingerprint(readValidatedRepoDevConfig(repoPath)!);
    writeConfig('npm run changed');
    await run('--fingerprint', fingerprint);
    expect(readRepoDevConfig(repoPath)).toBeNull();
    expect(process.exitCode).toBe(1);
  });

  it('reports invalid configuration as a failure', async () => {
    writeConfig('');
    await run();
    expect(process.exitCode).toBe(1);
  });
});
