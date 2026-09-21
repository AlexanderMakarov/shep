// @vitest-environment node

/**
 * API Route Tests: POST /api/attachments/upload-from-path
 *
 * Reproduces the arbitrary file read the audit found: no base directory, no
 * canonicalisation, no containment check, an extension test that let
 * extensionless files through unconditionally, and a size cap applied AFTER
 * the read. The file was then copied somewhere the preview route serves back.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ATTACHMENT_ROOTS_ENV } from '@shepai/core/infrastructure/services/attachments/attachment-source-policy';

const mockStore = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn((token: string) => {
    if (token === 'AttachmentStorageService') {
      return { store: mockStore };
    }
    throw new Error(`Unknown token: ${token}`);
  }),
}));

const SESSION_ID = '11111111-2222-4333-8444-555555555555';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:4050/api/attachments/upload-from-path', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/attachments/upload-from-path', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let routeModule: typeof import('@/app/api/attachments/upload-from-path/route');
  let allowedRoot: string;
  let forbiddenRoot: string;
  let savedRootsEnv: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    savedRootsEnv = process.env[ATTACHMENT_ROOTS_ENV];

    allowedRoot = mkdtempSync(join(tmpdir(), 'shep-attach-allowed-'));
    forbiddenRoot = mkdtempSync(join(tmpdir(), 'shep-attach-forbidden-'));
    process.env[ATTACHMENT_ROOTS_ENV] = allowedRoot;

    mockStore.mockImplementation((buffer: Buffer, name: string, mimeType: string) => ({
      id: 'attachment-id',
      name,
      size: BigInt(buffer.length),
      mimeType,
      path: join(allowedRoot, name),
      createdAt: new Date(),
    }));

    vi.resetModules();
    routeModule = await import(
      '../../../../../src/presentation/web/app/api/attachments/upload-from-path/route.js'
    );
  });

  afterEach(() => {
    if (savedRootsEnv === undefined) delete process.env[ATTACHMENT_ROOTS_ENV];
    else process.env[ATTACHMENT_ROOTS_ENV] = savedRootsEnv;
    for (const dir of [allowedRoot, forbiddenRoot]) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });

  it('refuses an extensionless file such as /etc/passwd', async () => {
    const path = join(allowedRoot, 'passwd');
    writeFileSync(path, 'root:x:0:0:root:/root:/bin/bash\n');

    const response = await routeModule.POST(makeRequest({ path, sessionId: SESSION_ID }));

    expect(response.status).toBe(400);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('refuses a private key even when it is inside an allowed root', async () => {
    const sshDir = join(allowedRoot, '.ssh');
    mkdirSync(sshDir);
    const path = join(sshDir, 'id_rsa.txt');
    writeFileSync(path, '-----BEGIN OPENSSH PRIVATE KEY-----\n');

    const response = await routeModule.POST(makeRequest({ path, sessionId: SESSION_ID }));

    expect(response.status).toBe(400);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('refuses a file outside every allowed root', async () => {
    const path = join(forbiddenRoot, 'secrets.json');
    writeFileSync(path, '{"token":"sk-live"}');

    const response = await routeModule.POST(makeRequest({ path, sessionId: SESSION_ID }));

    expect(response.status).toBe(400);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('refuses a traversal path', async () => {
    const response = await routeModule.POST(
      makeRequest({ path: join(allowedRoot, '..', '..', 'etc', 'passwd'), sessionId: SESSION_ID })
    );

    expect(response.status).toBe(400);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('refuses a session id that is not a UUID', async () => {
    const path = join(allowedRoot, 'notes.md');
    writeFileSync(path, 'hello');

    const response = await routeModule.POST(
      makeRequest({ path, sessionId: '../../../../.config/systemd/user' })
    );

    expect(response.status).toBe(400);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('stores a legitimate attachment', async () => {
    const path = join(allowedRoot, 'notes.md');
    writeFileSync(path, 'hello');

    const response = await routeModule.POST(makeRequest({ path, sessionId: SESSION_ID }));
    const body = (await response.json()) as { name: string; mimeType: string };

    expect(response.status).toBe(200);
    expect(body.name).toBe('notes.md');
    expect(body.mimeType).toBe('text/markdown');
    expect(mockStore).toHaveBeenCalledWith(
      expect.any(Buffer),
      'notes.md',
      'text/markdown',
      SESSION_ID
    );
  });

  it('still requires path and sessionId', async () => {
    const response = await routeModule.POST(makeRequest({}));

    expect(response.status).toBe(400);
  });
});
