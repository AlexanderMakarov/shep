// @vitest-environment node

/**
 * API Route Tests: the two multipart upload routes.
 *
 * Both name a directory after a caller-supplied id
 * (`pending-<sessionId>`, `pm/<workItemId>`) and both wrote the file before
 * anything validated that id. `pm-attachments/upload` wrote at line 84 and
 * only validated at line 87, so a traversing id had already created and
 * populated a directory by the time the work item was checked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockStore = vi.fn();
const mockUploadExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn((token: string) => {
    if (token === 'AttachmentStorageService') return { store: mockStore };
    if (token === 'UploadAttachmentUseCase') return { execute: mockUploadExecute };
    throw new Error(`Unknown token: ${token}`);
  }),
}));

const TRAVERSAL_ID = '../../../../.config/systemd/user';

function formDataRequest(url: string, entries: Record<string, string | File>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    form.append(key, value);
  }
  return new Request(url, { method: 'POST', body: form });
}

function textFile(name: string, contents = 'hello'): File {
  return new File([contents], name, { type: 'text/plain' });
}

describe('attachment upload routes', () => {
  let shepHome: string;
  let savedShepHome: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    savedShepHome = process.env.SHEP_HOME;
    shepHome = mkdtempSync(join(tmpdir(), 'shep-upload-'));
    process.env.SHEP_HOME = shepHome;
    vi.resetModules();

    mockStore.mockImplementation((buffer: Buffer, name: string, mimeType: string) => ({
      id: 'attachment-id',
      name,
      size: BigInt(buffer.length),
      mimeType,
      path: join(shepHome, name),
      createdAt: new Date(),
    }));
    mockUploadExecute.mockResolvedValue({
      ok: true,
      attachment: {
        id: 'pm-attachment-id',
        filename: 'notes.txt',
        mimeType: 'text/plain',
        fileSize: 5,
        createdAt: new Date(),
      },
    });
  });

  afterEach(() => {
    if (savedShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = savedShepHome;
    rmSync(shepHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  describe('POST /api/attachments/upload', () => {
    async function loadRoute() {
      return import('../../../../../src/presentation/web/app/api/attachments/upload/route.js');
    }

    it('refuses a traversing sessionId before storing anything', async () => {
      const { POST } = await loadRoute();

      const response = await POST(
        formDataRequest('http://localhost:4050/api/attachments/upload', {
          file: textFile('notes.txt'),
          sessionId: TRAVERSAL_ID,
        })
      );

      expect(response.status).toBe(400);
      expect(mockStore).not.toHaveBeenCalled();
    });

    it('refuses a file with no extension', async () => {
      // The check was `if (ext && !ALLOWED.has(ext))`, so `passwd` passed.
      const { POST } = await loadRoute();

      const response = await POST(
        formDataRequest('http://localhost:4050/api/attachments/upload', {
          file: textFile('passwd'),
          sessionId: 'session-1',
        })
      );

      expect(response.status).toBe(400);
      expect(mockStore).not.toHaveBeenCalled();
    });

    it('accepts a normal upload', async () => {
      const { POST } = await loadRoute();

      const response = await POST(
        formDataRequest('http://localhost:4050/api/attachments/upload', {
          file: textFile('notes.txt'),
          sessionId: 'session-1',
        })
      );

      expect(response.status).toBe(200);
      expect(mockStore).toHaveBeenCalledOnce();
    });
  });

  describe('POST /api/pm-attachments/upload', () => {
    async function loadRoute() {
      return import('../../../../../src/presentation/web/app/api/pm-attachments/upload/route.js');
    }

    it('refuses a traversing workItemId and writes nothing', async () => {
      const { POST } = await loadRoute();

      const response = await POST(
        formDataRequest('http://localhost:4050/api/pm-attachments/upload', {
          file: textFile('notes.txt'),
          workItemId: TRAVERSAL_ID,
        })
      );

      expect(response.status).toBe(400);
      expect(mockUploadExecute).not.toHaveBeenCalled();
      expect(existsSync(join(shepHome, '..', '..', '..', '..', '.config'))).toBe(false);
    });

    it('refuses a file with no extension', async () => {
      const { POST } = await loadRoute();

      const response = await POST(
        formDataRequest('http://localhost:4050/api/pm-attachments/upload', {
          file: textFile('passwd'),
          workItemId: 'WI-1',
        })
      );

      expect(response.status).toBe(400);
      expect(mockUploadExecute).not.toHaveBeenCalled();
    });

    it('does not leave a file behind when the work item is rejected', async () => {
      mockUploadExecute.mockResolvedValue({ ok: false, error: 'Work item not found' });
      const { POST } = await loadRoute();

      const response = await POST(
        formDataRequest('http://localhost:4050/api/pm-attachments/upload', {
          file: textFile('notes.txt'),
          workItemId: 'WI-missing',
        })
      );

      expect(response.status).toBe(400);
      expect(existsSync(join(shepHome, 'attachments', 'pm', 'WI-missing', 'notes.txt'))).toBe(
        false
      );
    });

    it('accepts a normal upload', async () => {
      const { POST } = await loadRoute();

      const response = await POST(
        formDataRequest('http://localhost:4050/api/pm-attachments/upload', {
          file: textFile('notes.txt'),
          workItemId: 'WI-1',
        })
      );

      expect(response.status).toBe(200);
      expect(mockUploadExecute).toHaveBeenCalledOnce();
    });
  });
});
