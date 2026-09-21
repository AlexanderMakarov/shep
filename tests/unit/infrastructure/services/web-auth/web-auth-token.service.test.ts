/**
 * Unit tests — Web Auth Token Service
 *
 * The control-center daemon needs a per-install bearer token so that the
 * HTTP surface on localhost is not reachable by every page the operator
 * visits and every process on the box. The token is generated on first
 * run and persisted inside SHEP_HOME with owner-only permissions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WEB_AUTH_TOKEN_FILENAME,
  WEB_AUTH_TOKEN_BYTE_LENGTH,
  WEB_AUTH_TOKEN_FILE_MODE,
  getWebAuthTokenPath,
  getOrCreateWebAuthToken,
  timingSafeTokenEquals,
} from '../../../../../packages/core/src/infrastructure/services/web-auth/web-auth-token.service.js';

const IS_WINDOWS = process.platform === 'win32';

describe('web auth token service', () => {
  let shepHome: string;
  let previousShepHome: string | undefined;

  beforeEach(() => {
    previousShepHome = process.env.SHEP_HOME;
    shepHome = mkdtempSync(join(tmpdir(), 'shep-web-auth-'));
    process.env.SHEP_HOME = shepHome;
  });

  afterEach(() => {
    if (previousShepHome === undefined) {
      delete process.env.SHEP_HOME;
    } else {
      process.env.SHEP_HOME = previousShepHome;
    }
    rmSync(shepHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it('stores the token inside SHEP_HOME under a stable filename', () => {
    expect(getWebAuthTokenPath()).toBe(join(shepHome, WEB_AUTH_TOKEN_FILENAME));
  });

  it('generates a high-entropy token on first run', () => {
    const token = getOrCreateWebAuthToken();

    // Hex encoding of WEB_AUTH_TOKEN_BYTE_LENGTH random bytes.
    expect(token).toMatch(/^[0-9a-f]+$/);
    expect(token).toHaveLength(WEB_AUTH_TOKEN_BYTE_LENGTH * 2);
  });

  it('persists the token so restarts keep the same value', () => {
    const first = getOrCreateWebAuthToken();
    const onDisk = readFileSync(getWebAuthTokenPath(), 'utf-8').trim();

    expect(onDisk).toBe(first);
  });

  it('reuses an existing token file rather than rotating it', () => {
    writeFileSync(getWebAuthTokenPath(), 'deadbeefcafe\n', { mode: WEB_AUTH_TOKEN_FILE_MODE });

    expect(getOrCreateWebAuthToken()).toBe('deadbeefcafe');
  });

  it.skipIf(IS_WINDOWS)('writes the token file with owner-only permissions', () => {
    getOrCreateWebAuthToken();

    const mode = statSync(getWebAuthTokenPath()).mode & 0o777;
    expect(mode).toBe(WEB_AUTH_TOKEN_FILE_MODE);
  });

  it('regenerates when the stored token is empty or corrupt', () => {
    writeFileSync(getWebAuthTokenPath(), '   \n', { mode: WEB_AUTH_TOKEN_FILE_MODE });

    const token = getOrCreateWebAuthToken();
    expect(token).toHaveLength(WEB_AUTH_TOKEN_BYTE_LENGTH * 2);
  });

  it('does not cache across SHEP_HOME changes', () => {
    const first = getOrCreateWebAuthToken();

    const otherHome = mkdtempSync(join(tmpdir(), 'shep-web-auth-other-'));
    process.env.SHEP_HOME = otherHome;
    try {
      expect(getOrCreateWebAuthToken()).not.toBe(first);
    } finally {
      process.env.SHEP_HOME = shepHome;
      rmSync(otherHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });

  describe('timingSafeTokenEquals', () => {
    it('accepts an exact match', () => {
      expect(timingSafeTokenEquals('abc123', 'abc123')).toBe(true);
    });

    it('rejects a different value of the same length', () => {
      expect(timingSafeTokenEquals('abc123', 'abc124')).toBe(false);
    });

    it('rejects a different length without throwing', () => {
      expect(timingSafeTokenEquals('abc123', 'abc')).toBe(false);
      expect(timingSafeTokenEquals('abc', 'abc123')).toBe(false);
    });

    it('rejects empty or missing candidates', () => {
      expect(timingSafeTokenEquals('', '')).toBe(false);
      expect(timingSafeTokenEquals('abc123', null)).toBe(false);
      expect(timingSafeTokenEquals('abc123', undefined)).toBe(false);
    });
  });
});
