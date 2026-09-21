/**
 * VersionService.getBuildIdentity() — `version.service.ts` previously read
 * only name/version/description from package.json, so no caller could
 * report the OS or the git SHA a bug reproduced on.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { VersionService } from '@/infrastructure/services/version.service.js';
import { GIT_SHA_ENV_VARS } from '@/domain/value-objects/build-identity.js';

describe('VersionService.getBuildIdentity', () => {
  it('reports the running Node version, platform, OS release and arch', () => {
    const identity = new VersionService().getBuildIdentity();
    expect(identity.nodeVersion).toBe(process.version);
    expect(identity.platform).toBe(process.platform);
    expect(identity.arch).toBe(process.arch);
    expect(identity.osRelease.length).toBeGreaterThan(0);
  });

  it('carries the same CLI version getVersion() reports', () => {
    const service = new VersionService();
    expect(service.getBuildIdentity().cliVersion).toBe(service.getVersion().version);
  });

  it('prefers a git SHA supplied through the environment', () => {
    const service = new VersionService({ env: { [GIT_SHA_ENV_VARS[0]]: 'abc1234' } });
    expect(service.getBuildIdentity().gitSha).toBe('abc1234');
  });

  it('falls back to the next known SHA env var (CI sets GITHUB_SHA)', () => {
    const service = new VersionService({
      env: { GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567' },
    });
    expect(service.getBuildIdentity().gitSha).toBe('0123456');
  });

  it('reports null rather than throwing when git cannot be consulted', () => {
    const service = new VersionService({
      env: {},
      readGitSha: () => {
        throw new Error('not a git repository');
      },
    });
    expect(service.getBuildIdentity().gitSha).toBeNull();
  });

  it('trims the SHA a git invocation returns', () => {
    const service = new VersionService({ env: {}, readGitSha: () => '  deadbee\n' });
    expect(service.getBuildIdentity().gitSha).toBe('deadbee');
  });

  it('treats an empty git result as unavailable', () => {
    const service = new VersionService({ env: {}, readGitSha: () => '   ' });
    expect(service.getBuildIdentity().gitSha).toBeNull();
  });
});
