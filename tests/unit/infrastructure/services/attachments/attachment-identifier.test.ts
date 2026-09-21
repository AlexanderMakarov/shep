// @vitest-environment node

/**
 * Unit tests — attachment identifier validation.
 *
 * Verified exploit: a sessionId of `"../../../../.config/systemd/user"`
 * turned `~/.shep/attachments/pending-<sessionId>` into
 * `~/.config/systemd/user`, which was then created and written into.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_IDENTIFIER_LENGTH,
  isSafePathSegment,
  isValidAttachmentSessionId,
  isValidAttachmentSlug,
  isValidWorkItemId,
} from '@shepai/core/infrastructure/services/attachments/attachment-identifier';

describe('attachment identifier validation', () => {
  const traversals = [
    '../../../../.config/systemd/user',
    '..',
    '.',
    '../secrets',
    'a/../../b',
    'a/b',
    'a\\b',
    '/etc/passwd',
    'C:\\Windows',
    '.ssh',
    '.hidden',
    '',
    '   ',
    'a\0b',
    'a b',
  ];

  it.each(traversals)('rejects %j', (value) => {
    expect(isSafePathSegment(value)).toBe(false);
  });

  it('rejects an id longer than the cap', () => {
    expect(isSafePathSegment('a'.repeat(MAX_IDENTIFIER_LENGTH + 1))).toBe(false);
    expect(isSafePathSegment('a'.repeat(MAX_IDENTIFIER_LENGTH))).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(isSafePathSegment(undefined)).toBe(false);
    expect(isSafePathSegment(null)).toBe(false);
    expect(isSafePathSegment(42)).toBe(false);
  });

  const legitimate = [
    '11111111-2222-4333-8444-555555555555',
    'onboarding',
    'chat-feat-11111111-2222-4333-8444-555555555555',
    'add_login_page',
    'feature.v2',
  ];

  it.each(legitimate)('accepts the real-world id %j', (value) => {
    expect(isSafePathSegment(value)).toBe(true);
  });

  it('applies the same rule to every id kind that names a directory', () => {
    const traversal = '../../../../.config/systemd/user';

    expect(isValidAttachmentSessionId(traversal)).toBe(false);
    expect(isValidWorkItemId(traversal)).toBe(false);
    expect(isValidAttachmentSlug(traversal)).toBe(false);

    expect(isValidAttachmentSessionId('onboarding')).toBe(true);
    expect(isValidWorkItemId('WI-123')).toBe(true);
    expect(isValidAttachmentSlug('add-login-page')).toBe(true);
  });
});
