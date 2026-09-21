import { NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  isPathInsideAnyRoot,
  parseRootsList,
} from '@shepai/core/infrastructure/services/filesystem/path-containment';

/** Extra directories an operator allows the folder picker to browse. */
const DIRECTORY_ROOTS_ENV = 'SHEP_DIRECTORY_ROOTS';

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: true;
  updatedAt: string;
}

/**
 * Directories the folder picker may enumerate: the user's home directory
 * plus anything `SHEP_DIRECTORY_ROOTS` names.
 *
 * `path.isAbsolute` was the only check, which enables rather than restricts —
 * `?path=/&showHidden=true` walked everything the daemon could read, and that
 * listing is what makes an arbitrary file read or a traversal write aimable.
 */
function browsableRoots(): string[] {
  return [path.resolve(homedir()), ...parseRootsList(process.env[DIRECTORY_ROOTS_ENV])];
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const rawPath = url.searchParams.get('path') ?? homedir();
  const showHidden = url.searchParams.get('showHidden') === 'true';

  if (!path.isAbsolute(rawPath)) {
    return NextResponse.json({ error: 'Path must be absolute' }, { status: HTTP_BAD_REQUEST });
  }

  const resolvedPath = path.resolve(rawPath);

  // `allowRootItself` so the picker can open the home directory; the
  // separator-terminated prefix means `<root>-evil` is not `<root>`.
  if (!isPathInsideAnyRoot(resolvedPath, browsableRoots(), true)) {
    return NextResponse.json(
      {
        error: `Path is outside the browsable directories. Set ${DIRECTORY_ROOTS_ENV} to add more.`,
      },
      { status: HTTP_FORBIDDEN }
    );
  }

  try {
    const dirStat = await stat(resolvedPath);
    if (!dirStat.isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory' }, { status: HTTP_BAD_REQUEST });
    }
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Directory not found' }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Failed to access path';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const dirents = await readdir(resolvedPath, { withFileTypes: true });

    const entries: DirectoryEntry[] = [];

    const entryPromises = dirents.map(async (dirent) => {
      if (!showHidden && dirent.name.startsWith('.')) {
        return null;
      }

      const entryPath = path.join(resolvedPath, dirent.name);

      try {
        if (dirent.isDirectory()) {
          const entryStat = await stat(entryPath);
          return {
            name: dirent.name,
            path: entryPath,
            isDirectory: true as const,
            updatedAt: entryStat.mtime.toISOString(),
          };
        }

        if (dirent.isSymbolicLink()) {
          const entryStat = await stat(entryPath);
          if (entryStat.isDirectory()) {
            return {
              name: dirent.name,
              path: entryPath,
              isDirectory: true as const,
              updatedAt: entryStat.mtime.toISOString(),
            };
          }
        }
      } catch {
        // Skip inaccessible entries (permission denied, broken symlinks)
      }

      return null;
    });

    const results = await Promise.all(entryPromises);
    for (const result of results) {
      if (result !== null) {
        entries.push(result);
      }
    }

    return NextResponse.json({ entries, currentPath: resolvedPath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to read directory';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
