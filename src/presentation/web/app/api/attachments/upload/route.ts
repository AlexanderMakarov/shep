/**
 * POST /api/attachments/upload
 *
 * Multipart upload into the pending-attachment store.
 *
 * `sessionId` names a directory (`pending-<sessionId>`), so it is validated
 * as a single safe path segment before the storage service sees it. The
 * extension check is `!ALLOWED.has(ext)`, not `ext && !ALLOWED.has(ext)` —
 * the latter let an extensionless filename through unconditionally.
 */

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_FILE_SIZE,
  DEFAULT_ATTACHMENT_MIME_TYPE,
} from '@shepai/core/infrastructure/services/attachments/attachment-source-policy';
import { isValidAttachmentSessionId } from '@shepai/core/infrastructure/services/attachments/attachment-identifier';
import type { AttachmentStorageService } from '@shepai/core/infrastructure/services/attachment-storage.service';

const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_INTERNAL_ERROR = 500;
const BYTES_PER_MB = 1024 * 1024;

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sessionId = formData.get('sessionId') as string | null;

    if (!file || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields: file, sessionId' },
        { status: HTTP_BAD_REQUEST }
      );
    }

    if (!isValidAttachmentSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: HTTP_BAD_REQUEST });
    }

    // Validate file size
    if (file.size > ATTACHMENT_MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File "${file.name}" exceeds ${ATTACHMENT_MAX_FILE_SIZE / BYTES_PER_MB} MB limit (${(file.size / BYTES_PER_MB).toFixed(1)} MB)`,
        },
        { status: HTTP_PAYLOAD_TOO_LARGE }
      );
    }

    // Validate extension — an absent extension is NOT a pass.
    const ext = getExtension(file.name);
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type "${ext || file.name}" is not allowed` },
        { status: HTTP_BAD_REQUEST }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const service = resolve<AttachmentStorageService>('AttachmentStorageService');
    const attachment = service.store(
      buffer,
      file.name,
      file.type || DEFAULT_ATTACHMENT_MIME_TYPE,
      sessionId
    );

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
