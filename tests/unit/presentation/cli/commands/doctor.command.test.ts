// @vitest-environment node

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createDoctorCommand } from '../../../../../src/presentation/cli/commands/doctor.command.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import type { DoctorReportWithSummary } from '@/application/use-cases/doctor/run-doctor.use-case.js';

function makeReport(overrides: Partial<DoctorReportWithSummary> = {}): DoctorReportWithSummary {
  return {
    results: [
      { name: 'node-version', status: DiagnosticStatus.Ok, detail: 'Node v22.5.1' },
      { name: 'git-installed', status: DiagnosticStatus.Ok, detail: 'git version 2.45.0' },
    ],
    overallStatus: DiagnosticStatus.Ok,
    totalDurationMs: 8,
    summary: { ok: 2, warn: 0, fail: 0 },
    buildIdentity: {
      cliVersion: '1.6.1',
      nodeVersion: 'v22.5.1',
      platform: 'linux',
      osRelease: '6.8.0-generic',
      arch: 'x64',
      gitSha: '3f9a1c2',
    },
    buildIdentityLine: 'shep 1.6.1 · node v22.5.1 · linux 6.8.0-generic x64 · git 3f9a1c2',
    ...overrides,
  };
}

describe('createDoctorCommand', () => {
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = 0;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('exits 0 when all diagnostics are ok', async () => {
    const lines: string[] = [];
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({ execute: async () => makeReport() }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(process.exitCode).toBe(0);
    expect(lines.join('\n')).toContain('node-version');
    expect(lines.join('\n')).toContain('Summary:');
  });

  it('exits 0 when warns are present but no fails', async () => {
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({
        execute: async () =>
          makeReport({
            results: [
              { name: 'dotenv-presence', status: DiagnosticStatus.Warn, detail: '.env missing' },
            ],
            overallStatus: DiagnosticStatus.Warn,
            summary: { ok: 0, warn: 1, fail: 0 },
          }),
      }),
      out: () => undefined,
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(process.exitCode).toBe(0);
  });

  it('exits non-zero when at least one diagnostic fails', async () => {
    const lines: string[] = [];
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({
        execute: async () =>
          makeReport({
            results: [
              {
                name: 'pnpm-installed',
                status: DiagnosticStatus.Fail,
                detail: 'pnpm not on PATH',
                fixHint: 'Install pnpm via corepack',
              },
            ],
            overallStatus: DiagnosticStatus.Fail,
            summary: { ok: 0, warn: 0, fail: 1 },
          }),
      }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(process.exitCode).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('pnpm-installed');
    expect(output).toContain('pnpm not on PATH');
    expect(output).toContain('Install pnpm via corepack');
  });

  it('exits non-zero and surfaces the error when the use case throws', async () => {
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({
        execute: async () => {
          throw new Error('container exploded');
        },
      }),
      out: () => undefined,
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(process.exitCode).toBe(1);
  });
});

describe('createDoctorCommand build identity header', () => {
  it('prints the build identity line above the diagnostics table', async () => {
    const lines: string[] = [];
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({ execute: async () => makeReport() }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep']);

    const output = lines.join('\n');
    expect(output).toContain('shep 1.6.1');
    expect(output).toContain('v22.5.1');
    expect(output).toContain('linux');
    expect(output).toContain('3f9a1c2');

    const identityIndex = lines.findIndex((l) => l.includes('1.6.1'));
    const tableIndex = lines.findIndex((l) => l.includes('node-version'));
    expect(identityIndex).toBeGreaterThanOrEqual(0);
    expect(identityIndex).toBeLessThan(tableIndex);
  });

  it('still renders the table when the build identity is unavailable', async () => {
    const lines: string[] = [];
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({
        execute: async () => makeReport({ buildIdentity: null, buildIdentityLine: null }),
      }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(lines.join('\n')).toContain('node-version');
    expect(process.exitCode).toBe(0);
  });
});
