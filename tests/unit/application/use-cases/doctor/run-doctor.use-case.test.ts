import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { RunDoctorUseCase } from '@/application/use-cases/doctor/run-doctor.use-case.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import type {
  DiagnosticResult,
  DoctorReport,
  IDiagnostic,
  IDiagnosticRunner,
} from '@/application/ports/output/services/diagnostic.interface.js';
import type { IVersionService } from '@/application/ports/output/services/version-service.interface.js';
import type { BuildIdentity } from '@/domain/value-objects/build-identity.js';

const BUILD_IDENTITY: BuildIdentity = {
  cliVersion: '1.6.1',
  nodeVersion: 'v22.5.1',
  platform: 'linux',
  osRelease: '6.8.0-generic',
  arch: 'x64',
  gitSha: '3f9a1c2',
};

function fakeVersionService(identity: BuildIdentity = BUILD_IDENTITY): IVersionService {
  return {
    getVersion: () => ({
      version: identity.cliVersion,
      name: '@shepai/cli',
      description: 'test',
    }),
    getBuildIdentity: () => identity,
  };
}

function fakeDiagnostic(name: string, status: DiagnosticStatus): IDiagnostic {
  return {
    name,
    run: async (): Promise<DiagnosticResult> => ({ name, status, detail: `${name}-detail` }),
  };
}

function fakeRunner(report: DoctorReport): IDiagnosticRunner {
  return { runAll: vi.fn().mockResolvedValue(report) };
}

describe('RunDoctorUseCase', () => {
  it('aggregates ok/warn/fail counts from the runner output', async () => {
    const diagnostics = [
      fakeDiagnostic('a', DiagnosticStatus.Ok),
      fakeDiagnostic('b', DiagnosticStatus.Warn),
      fakeDiagnostic('c', DiagnosticStatus.Fail),
      fakeDiagnostic('d', DiagnosticStatus.Ok),
    ];
    const report: DoctorReport = {
      results: diagnostics.map((d, i) => ({
        name: d.name,
        status:
          i === 0 || i === 3
            ? DiagnosticStatus.Ok
            : i === 1
              ? DiagnosticStatus.Warn
              : DiagnosticStatus.Fail,
        detail: 'x',
      })),
      overallStatus: DiagnosticStatus.Fail,
      totalDurationMs: 12,
    };
    const runner = fakeRunner(report);
    const useCase = new RunDoctorUseCase(runner, diagnostics, fakeVersionService());

    const result = await useCase.execute();

    expect(runner.runAll).toHaveBeenCalledWith(diagnostics);
    expect(result.summary).toEqual({ ok: 2, warn: 1, fail: 1 });
    expect(result.overallStatus).toBe(DiagnosticStatus.Fail);
    expect(result.results).toHaveLength(4);
  });

  it('returns zero counts when the diagnostic list is empty', async () => {
    const report: DoctorReport = {
      results: [],
      overallStatus: DiagnosticStatus.Ok,
      totalDurationMs: 0,
    };
    const useCase = new RunDoctorUseCase(fakeRunner(report), [], fakeVersionService());
    const result = await useCase.execute();
    expect(result.summary).toEqual({ ok: 0, warn: 0, fail: 0 });
  });

  it('does not perform any presentation formatting', async () => {
    const report: DoctorReport = {
      results: [{ name: 'a', status: DiagnosticStatus.Ok, detail: 'fine' }],
      overallStatus: DiagnosticStatus.Ok,
      totalDurationMs: 1,
    };
    const useCase = new RunDoctorUseCase(
      fakeRunner(report),
      [fakeDiagnostic('a', DiagnosticStatus.Ok)],
      fakeVersionService()
    );
    const result = await useCase.execute();
    expect(result).toMatchObject({
      results: report.results,
      overallStatus: DiagnosticStatus.Ok,
    });
    expect(typeof result).toBe('object');
  });
});

describe('RunDoctorUseCase build identity', () => {
  const emptyReport: DoctorReport = {
    results: [],
    overallStatus: DiagnosticStatus.Ok,
    totalDurationMs: 0,
  };

  it('includes the build identity so the CLI does not have to assemble it', async () => {
    const useCase = new RunDoctorUseCase(fakeRunner(emptyReport), [], fakeVersionService());
    const result = await useCase.execute();
    expect(result.buildIdentity).toEqual(BUILD_IDENTITY);
  });

  it('includes the paste-ready one-line form of it', async () => {
    const useCase = new RunDoctorUseCase(fakeRunner(emptyReport), [], fakeVersionService());
    const result = await useCase.execute();
    expect(result.buildIdentityLine).toContain('shep 1.6.1');
    expect(result.buildIdentityLine).toContain('3f9a1c2');
  });

  it('still produces a report when the version service throws', async () => {
    const broken: IVersionService = {
      getVersion: () => {
        throw new Error('package.json unreadable');
      },
      getBuildIdentity: () => {
        throw new Error('package.json unreadable');
      },
    };
    const useCase = new RunDoctorUseCase(fakeRunner(emptyReport), [], broken);
    const result = await useCase.execute();
    expect(result.buildIdentity).toBeNull();
    expect(result.summary).toEqual({ ok: 0, warn: 0, fail: 0 });
  });
});
