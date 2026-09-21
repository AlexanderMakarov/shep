// @vitest-environment node

/**
 * Smoke test — relative `.js` imports in the core modules Turbopack bundles.
 *
 * Turbopack consumes `@shepai/core` as raw TypeScript and does NOT map
 * `.js` → `.ts`, so a relative import written `'./x.js'` fails to resolve
 * inside the web bundle. `smoke-imports.test.ts` already guards
 * `packages/core/src/domain/`, but the web package value-imports
 * infrastructure and application modules too, and those are not covered — a
 * new module under `infrastructure/services/` written in the surrounding
 * `.js` house style builds fine everywhere except `next build`.
 *
 * Type-only imports are exempt in both directions: `import type` is erased
 * before Turbopack resolves anything, which is why the existing `.js`
 * specifiers all over the port interfaces are harmless. This test therefore
 * walks ONLY the value-import graph, starting from the value imports of
 * `@shepai/core` in the web package.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../..');
const WEB_ROOT = join(REPO_ROOT, 'src/presentation/web');
const CORE_SRC = join(REPO_ROOT, 'packages/core/src');

/** Directories inside the web package that are not part of the bundle. */
const WEB_SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'public']);

/**
 * Any `import <clause> from '<specifier>'`. The clause is inspected
 * separately so `import type` and `{ type A, type B }` can be excluded.
 *
 * Anchored to the start of a line: prose and JSDoc examples contain the word
 * `import` too (` * import { getSettings } from './…js';`), and a lazy match
 * from one of those swallows the real statement below it and misreports its
 * clause.
 */
const IMPORT_STATEMENT = /^import\s+([\s\S]*?)\s*from\s+['"]([^'"]+)['"]/gm;

/** True when nothing from this import survives to runtime. */
function isTypeOnlyImport(clause: string): boolean {
  const trimmed = clause.trim();
  if (trimmed.startsWith('type ')) return true;

  const braced = trimmed.match(/^\{([\s\S]*)\}$/);
  if (!braced) return false;

  const bindings = braced[1]
    .split(',')
    .map((binding) => binding.trim())
    .filter((binding) => binding.length > 0);

  return bindings.length > 0 && bindings.every((binding) => binding.startsWith('type '));
}

function collectFiles(dir: string, extensions: string[], skip: Set<string>): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectFiles(full, extensions, skip));
    } else if (extensions.some((extension) => full.endsWith(extension))) {
      results.push(full);
    }
  }
  return results;
}

/** Resolve a `@shepai/core/<subpath>` specifier to a file on disk. */
function resolveCoreSubpath(subpath: string): string | null {
  const base = join(CORE_SRC, subpath);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts'), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Resolve a relative specifier from `fromFile`, tolerating a `.js` suffix. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    join(base, 'index.ts'),
    base.replace(/\.js$/, '.ts'),
    join(base.replace(/\.js$/, ''), 'index.ts'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

describe('smoke: core modules reachable from the web bundle', () => {
  it('uses no relative .js VALUE imports — Turbopack cannot resolve them', () => {
    const webFiles = collectFiles(WEB_ROOT, ['.ts', '.tsx'], WEB_SKIP_DIRECTORIES);

    // 1. Every core module the web package value-imports.
    const entryPoints = new Set<string>();
    for (const file of webFiles) {
      const contents = readFileSync(file, 'utf-8');
      for (const [, clause, specifier] of contents.matchAll(IMPORT_STATEMENT)) {
        if (!specifier.startsWith('@shepai/core/')) continue;
        if (isTypeOnlyImport(clause)) continue;

        const resolved = resolveCoreSubpath(specifier.slice('@shepai/core/'.length));
        if (resolved) entryPoints.add(resolved);
      }
    }

    expect(entryPoints.size).toBeGreaterThan(0);

    // 2. Walk the value-import graph outward from there.
    const violations: string[] = [];
    const seen = new Set<string>();
    const queue = [...entryPoints];

    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);

      const contents = readFileSync(file, 'utf-8');
      const relativePath = file.replace(`${REPO_ROOT}/`, '');

      for (const [, clause, specifier] of contents.matchAll(IMPORT_STATEMENT)) {
        if (!specifier.startsWith('.')) continue;
        if (isTypeOnlyImport(clause)) continue;

        if (specifier.endsWith('.js')) {
          violations.push(`${relativePath}: ${specifier}`);
        }

        const next = resolveRelative(file, specifier);
        if (next?.startsWith(CORE_SRC)) queue.push(next);
      }
    }

    expect(
      violations,
      'Relative VALUE imports in @shepai/core modules reachable from the web bundle must not ' +
        'use .js extensions — Turbopack consumes these as raw .ts source and cannot resolve .js.\n' +
        `Violations:\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
