/**
 * Compute Worktree Path
 *
 * Pure utility that computes the filesystem path for a feature's git worktree
 * given a repository path and branch name.
 *
 * Path format: ~/.shep/repos/<sha256-hash-prefix>/wt/<branch-slug>
 *
 * The slug rule lives in `domain/shared/worktree-slug.ts` because the path
 * is later interpolated into shell command templates — see that module for
 * why a branch name cannot be used as a directory name verbatim (C6).
 */

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { toWorktreeSlug } from '../../../domain/shared/worktree-slug';
import { getShepHomeDir } from '../filesystem/shep-directory.service';

/**
 * Compute the worktree path for a given repository and branch.
 *
 * @param repoPath - Absolute path to the repository
 * @param branch - Git branch name (slashes are replaced with hyphens; shell
 *                 metacharacters are removed by {@link toWorktreeSlug})
 * @returns Absolute path to the worktree directory under ~/.shep/repos/
 */
export function computeWorktreePath(repoPath: string, branch: string): string {
  // Normalize separators before hashing so C:\foo and C:/foo produce the same hash
  const normalizedRepoPath = repoPath.replace(/\\/g, '/');
  const repoHash = createHash('sha256').update(normalizedRepoPath).digest('hex').slice(0, 16);
  const slug = toWorktreeSlug(branch);
  return join(getShepHomeDir(), 'repos', repoHash, 'wt', slug).replace(/\\/g, '/');
}
