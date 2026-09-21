/**
 * BuildIdentity — the block `shep doctor` exists to print and never did.
 */

import { describe, it, expect } from 'vitest';
import {
  GIT_SHA_UNAVAILABLE,
  formatBuildIdentityLine,
  type BuildIdentity,
} from '@/domain/value-objects/build-identity.js';

const identity: BuildIdentity = {
  cliVersion: '1.6.1',
  nodeVersion: 'v22.5.1',
  platform: 'linux',
  osRelease: '6.8.0-generic',
  arch: 'x64',
  gitSha: '3f9a1c2',
};

describe('formatBuildIdentityLine', () => {
  it('renders one paste-ready line with every field', () => {
    const line = formatBuildIdentityLine(identity);
    expect(line).toContain('1.6.1');
    expect(line).toContain('v22.5.1');
    expect(line).toContain('linux');
    expect(line).toContain('6.8.0-generic');
    expect(line).toContain('x64');
    expect(line).toContain('3f9a1c2');
  });

  it('is a single line so it survives being pasted into an issue', () => {
    expect(formatBuildIdentityLine(identity)).not.toContain('\n');
  });

  it('says so explicitly when the git SHA is unavailable', () => {
    const line = formatBuildIdentityLine({ ...identity, gitSha: null });
    expect(line).toContain(GIT_SHA_UNAVAILABLE);
    expect(line).not.toContain('null');
  });
});
