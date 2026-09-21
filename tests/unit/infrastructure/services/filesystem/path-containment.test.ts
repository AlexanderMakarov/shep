// @vitest-environment node

/**
 * Unit tests — path containment helpers.
 *
 * `resolved.startsWith(root)` accepts `<root>-evil`. Two routes shipped that
 * bug (`attachments/preview`, `evidence`); these helpers are the one place
 * the separator-terminated comparison now lives.
 */

import { describe, it, expect } from 'vitest';
import { join, resolve, sep } from 'node:path';
import {
  isPathInsideAnyRoot,
  isPathInsideRoot,
  parseRootsList,
  rootWithSeparator,
} from '@shepai/core/infrastructure/services/filesystem/path-containment';

const ROOT = resolve('/srv/shep/attachments');

describe('isPathInsideRoot', () => {
  it('accepts a descendant', () => {
    expect(isPathInsideRoot(join(ROOT, 'pending-1', 'a.png'), ROOT)).toBe(true);
  });

  it('rejects a sibling that shares the prefix', () => {
    expect(isPathInsideRoot(`${ROOT}-evil${sep}a.png`, ROOT)).toBe(false);
  });

  it('rejects the root itself by default', () => {
    expect(isPathInsideRoot(ROOT, ROOT)).toBe(false);
  });

  it('accepts the root itself when asked to', () => {
    expect(isPathInsideRoot(ROOT, ROOT, true)).toBe(true);
  });

  it('rejects an ancestor', () => {
    expect(isPathInsideRoot(resolve('/srv/shep'), ROOT)).toBe(false);
  });

  it('resolves traversal before comparing', () => {
    expect(isPathInsideRoot(join(ROOT, '..', '..', 'etc', 'passwd'), ROOT)).toBe(false);
    expect(isPathInsideRoot(join(ROOT, 'a', '..', 'b.png'), ROOT)).toBe(true);
  });

  it('tolerates a root that already ends in a separator', () => {
    expect(isPathInsideRoot(join(ROOT, 'a.png'), ROOT + sep)).toBe(true);
  });
});

describe('isPathInsideAnyRoot', () => {
  it('accepts a path inside the second root', () => {
    const other = resolve('/workspaces');
    expect(isPathInsideAnyRoot(join(other, 'repo'), [ROOT, other])).toBe(true);
  });

  it('rejects a path inside none of them', () => {
    expect(isPathInsideAnyRoot(resolve('/etc/passwd'), [ROOT])).toBe(false);
  });

  it('rejects everything when there are no roots', () => {
    expect(isPathInsideAnyRoot(join(ROOT, 'a.png'), [])).toBe(false);
  });
});

describe('rootWithSeparator', () => {
  it('always ends in the platform separator exactly once', () => {
    expect(rootWithSeparator(ROOT)).toBe(ROOT + sep);
    expect(rootWithSeparator(ROOT + sep)).toBe(ROOT + sep);
  });
});

describe('parseRootsList', () => {
  const separator = process.platform === 'win32' ? ';' : ':';

  it('returns an empty list for undefined or blank', () => {
    expect(parseRootsList(undefined)).toEqual([]);
    expect(parseRootsList('')).toEqual([]);
    expect(parseRootsList(separator.repeat(3))).toEqual([]);
  });

  it('splits, trims and absolutises', () => {
    const raw = ` ${ROOT} ${separator} ${resolve('/workspaces')} `;
    expect(parseRootsList(raw)).toEqual([ROOT, resolve('/workspaces')]);
  });
});
