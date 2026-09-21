// @vitest-environment node

/**
 * API Route Tests: GET /api/pm-attachments/download
 *
 * The route served `attachment.storagePath` verbatim. That path comes from a
 * database row rather than from the request, but the upload route only ever
 * writes it inside `~/.shep/attachments/pm/<workItemId>/`, so anything
 * outside that tree means the row was written by something else — a poisoned
 * row, a hand-edited database, or a traversal that got in before the upload
 * route was fixed. Serving it anyway turns any of those into a file read.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockFindById = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn((token: string) => {
    if (token === 'IPmAttachmentRepository') return { findById: mockFindById };
    throw new Error(`Unknown token: ${token}`);
  }),
}));

function makeRequest(id: string): Request {
  return new Request(`http://localhost:4050/api/pm-attachments/download?id=${id}`);
}

describe('GET /api/pm-attachments/download', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let routeModule: typeof import('@/app/api/pm-attachments/download/route');
  let shepHome: string;
  let outside: string;
  let savedShepHome: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    savedShepHome = process.env.SHEP_HOME;
    shepHome = mkdtempSync(join(tmpdir(), 'shep-pm-download-'));
    outside = mkdtempSync(join(tmpdir(), 'shep-pm-outside-'));
    process.env.SHEP_HOME = shepHome;

    vi.resetModules();
    routeModule = await import(
      '../../../../../src/presentation/web/app/api/pm-attachments/download/route.js'
    );
  });

  afterEach(() => {
    if (savedShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = savedShepHome;
    for (const dir of [shepHome, outside]) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });

  it('refuses a storagePath outside the pm attachment tree', async () => {
    const secret = join(outside, 'id_rsa');
    writeFileSync(secret, 'PRIVATE KEY');
    mockFindById.mockResolvedValue({
      id: 'a1',
      filename: 'id_rsa',
      mimeType: 'text/plain',
      storagePath: secret,
    });

    const response = await routeModule.GET(makeRequest('a1'));

    expect(response.status).toBe(403);
  });

  it('refuses a sibling directory that shares the prefix', async () => {
    const evilDir = join(shepHome, 'attachments', 'pm-evil');
    mkdirSync(evilDir, { recursive: true });
    const evil = join(evilDir, 'notes.txt');
    writeFileSync(evil, 'secrets');
    mockFindById.mockResolvedValue({
      id: 'a1',
      filename: 'notes.txt',
      mimeType: 'text/plain',
      storagePath: evil,
    });

    const response = await routeModule.GET(makeRequest('a1'));

    expect(response.status).toBe(403);
  });

  it('serves a real pm attachment', async () => {
    const dir = join(shepHome, 'attachments', 'pm', 'WI-1');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, '1700000000000-notes.txt');
    writeFileSync(file, 'hello');
    mockFindById.mockResolvedValue({
      id: 'a1',
      filename: 'notes.txt',
      mimeType: 'text/plain',
      storagePath: file,
    });

    const response = await routeModule.GET(makeRequest('a1'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
  });

  it('still 404s an unknown attachment', async () => {
    mockFindById.mockResolvedValue(null);

    const response = await routeModule.GET(makeRequest('missing'));

    expect(response.status).toBe(404);
  });
});
