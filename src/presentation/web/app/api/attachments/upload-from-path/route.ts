/**
 * POST /api/attachments/upload-from-path
 *
 * Copies a file the operator picked in the native file dialog into the
 * pending-attachment store.
 *
 * Every path that reaches this route is caller-supplied, so it is validated
 * by `validateAttachmentSourcePath` before anything is read: containment in
 * an allowed root (realpath + separator-terminated prefix), an extension
 * allowlist that rejects extensionless files, a credential-directory deny
 * list, a regular-file check, and a size cap taken from `stat` rather than
 * from the buffer. The session id is validated as a UUID before it can reach
 * the storage service, which uses it to build a directory name.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from '@/lib/server-container';
import {
  resolveAttachmentRoots,
  validateAttachmentSourcePath,
} from '@shepai/core/infrastructure/services/attachments/attachment-source-policy';
import { isValidAttachmentSessionId } from '@shepai/core/infrastructure/services/attachments/attachment-identifier';
import type { AttachmentStorageService } from '@shepai/core/infrastructure/services/attachment-storage.service';

const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { path, sessionId } = body as { path?: string; sessionId?: string };

    if (!path || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields: path, sessionId' },
        { status: HTTP_BAD_REQUEST }
      );
    }

    if (!isValidAttachmentSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: HTTP_BAD_REQUEST });
    }

    const validation = validateAttachmentSourcePath(path, resolveAttachmentRoots(homedir()));
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: HTTP_BAD_REQUEST });
    }

    // Read the canonical path the validation returned, never the original
    // string — re-resolving it here would be a time-of-check/time-of-use gap.
    const buffer = await readFile(validation.canonicalPath);

    const service = resolve<AttachmentStorageService>('AttachmentStorageService');
    const attachment = service.store(buffer, validation.filename, validation.mimeType, sessionId);

    return NextResponse.json({
      id: attachment.id,
      name: attachment.name,
      size: Number(attachment.size),
      mimeType: attachment.mimeType,
      path: attachment.path,
      createdAt: attachment.createdAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: HTTP_INTERNAL_ERROR });
  }
}
