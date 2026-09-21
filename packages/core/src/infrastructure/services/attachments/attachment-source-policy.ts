/**
 * Attachment source path policy.
 *
 * `POST /api/attachments/upload-from-path` copies a file named by the caller
 * into the attachment store, from where the preview route serves it back.
 * Without a base directory that is an arbitrary file read: the audit reached
 * `/etc/passwd`, `~/.ssh/id_rsa`, `~/.aws/credentials`, `~/.shep/data` and
 * `/proc/self/environ` through it.
 *
 * Five independent gates, all of which must pass:
 *
 *  1. The path is absolute and canonicalises (`realpath`, so symlinks are
 *     followed) to somewhere strictly inside an allowed root. The comparison
 *     appends `path.sep`, so `<root>-evil` is not `<root>`.
 *  2. The extension is on the allowlist. The check is `!ALLOWED.has(ext)`,
 *     NOT `ext && !ALLOWED.has(ext)` — an extensionless file is rejected.
 *  3. No path segment names a known credential store.
 *  4. The target is a regular file.
 *  5. Its size, taken from `stat` BEFORE any read, is within the cap.
 */

import { realpathSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, resolve, sep } from 'node:path';
import { isPathInsideAnyRoot, parseRootsList } from '../filesystem/path-containment';

/** Maximum attachment size, enforced from `stat` before the file is read. */
export const ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Colon/semicolon-separated extra roots an operator may attach from. */
export const ATTACHMENT_ROOTS_ENV = 'SHEP_ATTACHMENT_ROOTS';

/**
 * Directory names that hold credentials. A file inside one of these is never
 * an attachment, whatever its extension says — `~/.config/gh/hosts.yml` holds
 * a GitHub token and `.yml` is otherwise perfectly attachable.
 */
export const DENIED_DIRECTORY_SEGMENTS = [
  '.ssh',
  '.aws',
  '.gnupg',
  '.shep',
  '.docker',
  '.kube',
  '.npmrc.d',
  'gh',
] as const;

/** Extensions an attachment may have. */
export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
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
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.kt',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.toml',
  '.zip',
  '.tar',
  '.gz',
  '.log',
]);

/** Content types served back for the extensions we can name. */
export const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
};

/** Fallback content type when the extension is not in the map. */
export const DEFAULT_ATTACHMENT_MIME_TYPE = 'application/octet-stream';

/** Why a source path was refused. */
export const REJECTION = {
  NotAbsolute: 'not_absolute',
  OutsideAllowedRoots: 'outside_allowed_roots',
  ExtensionNotAllowed: 'extension_not_allowed',
  DeniedDirectory: 'denied_directory',
  NotARegularFile: 'not_a_regular_file',
  NotFound: 'not_found',
  TooLarge: 'too_large',
} as const;

export type RejectionReason = (typeof REJECTION)[keyof typeof REJECTION];

export type AttachmentSourceValidation =
  | {
      ok: true;
      canonicalPath: string;
      filename: string;
      mimeType: string;
      size: number;
    }
  | { ok: false; reason: RejectionReason; message: string };

/** Human-readable text for each rejection, safe to return to the caller. */
const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  [REJECTION.NotAbsolute]: 'Attachment path must be absolute.',
  [REJECTION.OutsideAllowedRoots]: `File is outside the directories Shep may read. Set ${ATTACHMENT_ROOTS_ENV} to allow more.`,
  [REJECTION.ExtensionNotAllowed]: 'File type is not allowed.',
  [REJECTION.DeniedDirectory]: 'Files in credential directories cannot be attached.',
  [REJECTION.NotARegularFile]: 'Attachment path is not a regular file.',
  [REJECTION.NotFound]: 'File not found or unreadable.',
  [REJECTION.TooLarge]: `File exceeds the ${ATTACHMENT_MAX_FILE_SIZE / 1024 / 1024} MB limit.`,
};

function reject(reason: RejectionReason): AttachmentSourceValidation {
  return { ok: false, reason, message: REJECTION_MESSAGES[reason] };
}

/**
 * The directories attachments may be read from: the user's home directory,
 * plus anything `SHEP_ATTACHMENT_ROOTS` names.
 */
export function resolveAttachmentRoots(homeDirectory: string): string[] {
  return [resolve(homeDirectory), ...parseRootsList(process.env[ATTACHMENT_ROOTS_ENV])];
}

function hasDeniedSegment(canonicalPath: string): boolean {
  const segments = canonicalPath.split(sep).map((segment) => segment.toLowerCase());
  // The basename is the file itself; only its ancestors are directories.
  return segments
    .slice(0, -1)
    .some((segment) => (DENIED_DIRECTORY_SEGMENTS as readonly string[]).includes(segment));
}

/**
 * Validate a caller-supplied attachment source path.
 *
 * Returns the canonical path, filename, mime type and size on success so the
 * caller reads exactly the file that was checked — never the original string,
 * which could resolve elsewhere on a second lookup.
 */
export function validateAttachmentSourcePath(
  requestedPath: string,
  roots: string[]
): AttachmentSourceValidation {
  if (!requestedPath || !isAbsolute(requestedPath)) {
    return reject(REJECTION.NotAbsolute);
  }

  let canonicalPath: string;
  let stats: ReturnType<typeof statSync>;
  try {
    // realpath first: a symlink inside the root pointing outside it must be
    // judged by its target, not by where the link happens to sit.
    canonicalPath = realpathSync(resolve(requestedPath));
    stats = statSync(canonicalPath);
  } catch {
    return reject(REJECTION.NotFound);
  }

  const canonicalRoots = roots.map((root) => {
    try {
      return realpathSync(resolve(root));
    } catch {
      return resolve(root);
    }
  });

  // `allowRootItself` is deliberately false: a root directory is not a file.
  if (!isPathInsideAnyRoot(canonicalPath, canonicalRoots)) {
    return reject(REJECTION.OutsideAllowedRoots);
  }

  if (hasDeniedSegment(canonicalPath)) {
    return reject(REJECTION.DeniedDirectory);
  }

  if (!stats.isFile()) {
    return reject(REJECTION.NotARegularFile);
  }

  const extension = extname(canonicalPath).toLowerCase();
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) {
    return reject(REJECTION.ExtensionNotAllowed);
  }

  // Size is taken from stat, so an oversized file is never read into memory.
  if (stats.size > ATTACHMENT_MAX_FILE_SIZE) {
    return reject(REJECTION.TooLarge);
  }

  return {
    ok: true,
    canonicalPath,
    filename: basename(canonicalPath),
    mimeType: ATTACHMENT_MIME_TYPES[extension] ?? DEFAULT_ATTACHMENT_MIME_TYPE,
    size: stats.size,
  };
}
