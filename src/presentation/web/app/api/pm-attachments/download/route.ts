/**
 * GET /api/pm-attachments/download
 *
 * Serves a stored project-management attachment.
 *
 * `storagePath` comes from a database row, not from the request, but the
 * upload route only ever writes it under `~/.shep/attachments/pm/<id>/`.
 * Anything outside that tree means the row did not come from the upload
 * route — a hand-edited database, or a traversal that landed before the
 * upload route validated its ids — and serving it anyway would turn that
 * into an arbitrary file read. The containment check is the backstop.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolve } from '@/lib/server-container';
import { isPathInsideRoot } from '@shepai/core/infrastructure/services/filesystem/path-containment';
import { getShepHomeDir } from '@shepai/core/infrastructure/services/filesystem/shep-directory.service';
import type { IPmAttachmentRepository } from '@shepai/core/application/ports/output/repositories/pm-attachment-repository.interface';

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;

/** The only directory pm attachments are ever written to. */
function pmAttachmentsRoot(): string {
  return join(getShepHomeDir(), 'attachments', 'pm');
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('id');

    if (!attachmentId) {
      return NextResponse.json({ error: 'Missing attachment id' }, { status: HTTP_BAD_REQUEST });
    }

    const repo = resolve<IPmAttachmentRepository>('IPmAttachmentRepository');
    const attachment = await repo.findById(attachmentId);

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: HTTP_NOT_FOUND });
    }

    if (!isPathInsideRoot(attachment.storagePath, pmAttachmentsRoot())) {
      return NextResponse.json({ error: 'Access denied' }, { status: HTTP_FORBIDDEN });
    }

    if (!existsSync(attachment.storagePath)) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: HTTP_NOT_FOUND });
    }

    const buffer = await readFile(attachment.storagePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `attachment; filename="${attachment.filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Download failed';
    return NextResponse.json({ error: message }, { status: HTTP_INTERNAL_ERROR });
  }
}
