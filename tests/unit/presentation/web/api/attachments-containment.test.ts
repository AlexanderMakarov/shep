// @vitest-environment node

/**
 * API Route Tests: containment of the file-serving routes.
 *
 * `attachments/preview` and `evidence` both compared the resolved path with
 * `startsWith(root)` and NO trailing separator, so a sibling directory whose
 * name merely begins with the root's name — `~/.shep/attachments-evil/` for
 * `~/.shep/attachments` — passed the check. The repo gets this right in
 * `node-application-file-system.service.ts`, which appends `path.sep`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let shepHome: string;
let savedShepHome: string | undefined;

function makeRequest(path: string, route: string): NextRequest {
  const url = new URL(`http://localhost:4050${route}`);
  url.searchParams.set('path', path);
  return new NextRequest(url);
}

describe('attachment and evidence containment', () => {
  beforeEach(() => {
    savedShepHome = process.env.SHEP_HOME;
    shepHome = mkdtempSync(join(tmpdir(), 'shep-containment-'));
    process.env.SHEP_HOME = shepHome;
    vi.resetModules();
  });

  afterEach(() => {
    if (savedShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = savedShepHome;
    rmSync(shepHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  describe('GET /api/attachments/preview', () => {
    async function loadRoute() {
      return import('../../../../../src/presentation/web/app/api/attachments/preview/route.js');
    }

    it('refuses a sibling directory that shares the attachments prefix', async () => {
      const evilDir = join(shepHome, 'attachments-evil');
      mkdirSync(evilDir, { recursive: true });
      const evilFile = join(evilDir, 'stolen.png');
      writeFileSync(evilFile, 'not really a png');

      const { GET } = await loadRoute();
      const response = await GET(makeRequest(evilFile, '/api/attachments/preview'));

      expect(response.status).toBe(403);
    });

    it('refuses a path outside SHEP_HOME entirely', async () => {
      const { GET } = await loadRoute();
      const response = await GET(makeRequest('/etc/passwd', '/api/attachments/preview'));

      expect(response.status).toBe(403);
    });

    it('serves a real attachment', async () => {
      const dir = join(shepHome, 'attachments', 'pending-session-1');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, 'screenshot.png');
      writeFileSync(file, 'png-bytes');

      const { GET } = await loadRoute();
      const response = await GET(makeRequest(file, '/api/attachments/preview'));

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');
    });
  });

  describe('GET /api/evidence', () => {
    async function loadRoute() {
      return import('../../../../../src/presentation/web/app/api/evidence/route.js');
    }

    it('refuses a sibling directory that shares the repos prefix', async () => {
      const evilDir = join(shepHome, 'repos-evil');
      mkdirSync(evilDir, { recursive: true });
      const evilFile = join(evilDir, 'stolen.log');
      writeFileSync(evilFile, 'secrets');

      const { GET } = await loadRoute();
      const response = await GET(makeRequest(evilFile, '/api/evidence'));

      expect(response.status).toBe(403);
    });

    it('serves a real evidence file', async () => {
      const dir = join(shepHome, 'repos', 'my-repo');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, 'run.log');
      writeFileSync(file, 'log line');

      const { GET } = await loadRoute();
      const response = await GET(makeRequest(file, '/api/evidence'));

      expect(response.status).toBe(200);
    });
  });
});
