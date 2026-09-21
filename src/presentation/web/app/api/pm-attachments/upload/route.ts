/**
 * POST /api/pm-attachments/upload
 *
 * Multipart upload attached to a project-management work item.
 *
 * `workItemId` names a directory (`attachments/pm/<workItemId>`), so it is
 * validated as a single safe path segment BEFORE anything is written. The
 * original order was the other way round — the file landed on disk first and
 * the work item was only checked afterwards, so a traversing id had already
 * created and populated a directory by the time it was rejected. The file is
 * also removed again if the use case declines the upload, so a rejected
 * request leaves nothing behind.
 */

import { NextResponse } from 'next/server';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { resolve } from '@/lib/server-container';
import { isValidWorkItemId } from '@shepai/core/infrastructure/services/attachments/attachment-identifier';
import type { UploadAttachmentUseCase } from '@shepai/core/application/use-cases/pm-attachments/upload-attachment.use-case';
import { getShepHomeDir } from '@shepai/core/infrastructure/services/filesystem/shep-directory.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const BYTES_PER_MB = 1024 * 1024;
const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_INTERNAL_ERROR = 500;
const DEFAULT_MIME_TYPE = 'application/octet-stream';

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.zip',
  '.tar',
  '.gz',
  '.log',
]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, '')
    .replace(/[^\w.\-() ]/g, '_')
    .replace(/^\./, '_');
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const workItemId = formData.get('workItemId') as string | null;

    if (!file || !workItemId) {
      return NextResponse.json(
        { error: 'Missing required fields: file, workItemId' },
        { status: HTTP_BAD_REQUEST }
      );
    }

    if (!isValidWorkItemId(workItemId)) {
      return NextResponse.json({ error: 'Invalid workItemId' }, { status: HTTP_BAD_REQUEST });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File "${file.name}" exceeds ${MAX_FILE_SIZE / BYTES_PER_MB} MB limit (${(file.size / BYTES_PER_MB).toFixed(1)} MB)`,
        },
        { status: HTTP_PAYLOAD_TOO_LARGE }
      );
    }

    // An absent extension is NOT a pass.
    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type "${ext || file.name}" is not allowed` },
        { status: HTTP_BAD_REQUEST }
      );
    }

    const storageDir = join(getShepHomeDir(), 'attachments', 'pm', workItemId);
    await mkdir(storageDir, { recursive: true });

    const safeName = sanitizeFilename(file.name);
    const storagePath = join(storageDir, `${Date.now()}-${safeName}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    const useCase = resolve<UploadAttachmentUseCase>('UploadAttachmentUseCase');
    const result = await useCase.execute({
      workItemId,
      filename: file.name,
      mimeType: file.type || DEFAULT_MIME_TYPE,
      fileSize: file.size,
      storagePath,
    });

    if (!result.ok) {
      // The record was refused, so the bytes must not survive it.
      await rm(storagePath, { force: true });
      return NextResponse.json({ error: result.error }, { status: HTTP_BAD_REQUEST });
    }

    return NextResponse.json({
      id: result.attachment.id,
      filename: result.attachment.filename,
      mimeType: result.attachment.mimeType,
      fileSize: result.attachment.fileSize,
      createdAt: result.attachment.createdAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: HTTP_INTERNAL_ERROR });
  }
}
