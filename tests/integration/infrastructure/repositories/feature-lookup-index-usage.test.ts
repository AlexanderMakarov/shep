/**
 * Lookup Index Integration Tests
 *
 * `findByBranch` and `findBySlug` wrapped `repository_path` in
 * `REPLACE(repository_path, '\', '/')`, which makes an expression out of an
 * indexed column and so makes `idx_features_repo` unusable; with no index on
 * `branch` either, EXPLAIN QUERY PLAN reported `SCAN features` — every row,
 * every lookup. `activity_log` had an index on `work_item_id` but none that
 * carried `created_at`, so every read sorted through a TEMP B-TREE.
 *
 * The plans are read from the repositories' OWN prepared SQL, captured through
 * a proxy, so a test cannot pass against a query the repository does not run.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import { SQLiteActivityLogRepository } from '@/infrastructure/repositories/sqlite-activity-log.repository.js';
import type { Feature, ActivityEntry } from '@/domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';

const WINDOWS_PATH = 'C:\\Users\\dev\\project';
const POSIX_PATH = 'C:/Users/dev/project';

interface QueryPlanRow {
  detail: string;
}

/** Records the SQL a repository prepares, so the plan is read off the real query. */
function capturePreparedSql(db: Database.Database, sink: string[]): Database.Database {
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'prepare') {
        return (sql: string) => {
          sink.push(sql);
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Database.Database;
}

/**
 * The query plan SQLite chooses for a statement.
 *
 * better-sqlite3 still requires a value per placeholder even for an EXPLAIN,
 * and the plan does not depend on what those values are, so empty strings are
 * bound for however many the statement declares.
 */
function planFor(db: Database.Database, sql: string): string {
  const placeholderCount = (sql.match(/\?/g) ?? []).length;
  const rows = db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...Array.from({ length: placeholderCount }, () => '')) as QueryPlanRow[];
  return rows.map((r) => r.detail).join(' | ');
}

function makeFeature(overrides?: Partial<Feature>): Feature {
  const id = `feat-${randomUUID()}`;
  return {
    id,
    name: id,
    slug: id,
    description: '',
    userQuery: '',
    repositoryPath: POSIX_PATH,
    branch: `feat/${id}`,
    lifecycle: SdlcLifecycle.Pending,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('feature and activity-log lookups', () => {
  let db: Database.Database;
  let sql: string[];
  let repository: SQLiteFeatureRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    sql = [];
    repository = new SQLiteFeatureRepository(capturePreparedSql(db, sql));
  });

  afterEach(() => {
    db.close();
  });

  describe('findByBranch', () => {
    it('searches on branch and repository rather than every non-deleted row', async () => {
      await repository.findByBranch('feat/x', POSIX_PATH);

      const plan = planFor(db, sql[0]);
      expect(plan).not.toContain('SCAN features');
      // Naming the index and the columns matters: `deleted_at IS NULL` alone
      // also reports "USING INDEX", while visiting every live feature.
      expect(plan).toContain('idx_features_branch_repo');
      expect(plan).toContain('branch=?');
      expect(plan).toContain('repository_path=?');
    });

    it('finds a feature whose path was given with Windows separators', async () => {
      await repository.create(makeFeature({ branch: 'feat/win', repositoryPath: WINDOWS_PATH }));

      const found = await repository.findByBranch('feat/win', WINDOWS_PATH);

      expect(found?.branch).toBe('feat/win');
      // Stored in one canonical form, so the same row answers either spelling.
      expect(found?.repositoryPath).toBe(POSIX_PATH);
      expect(await repository.findByBranch('feat/win', POSIX_PATH)).not.toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('uses both columns of the slug index, not just the slug', async () => {
      await repository.findBySlug('some-slug', POSIX_PATH);

      const plan = planFor(db, sql[0]);
      expect(plan).not.toContain('SCAN features');
      expect(plan).toContain('idx_features_slug');
      // Wrapping repository_path in REPLACE() left this half of the composite
      // index unusable.
      expect(plan).toContain('repository_path=?');
    });

    it('finds a feature whose path was given with Windows separators', async () => {
      await repository.create(makeFeature({ slug: 'win-slug', repositoryPath: WINDOWS_PATH }));

      expect(await repository.findBySlug('win-slug', WINDOWS_PATH)).not.toBeNull();
      expect(await repository.findBySlug('win-slug', POSIX_PATH)).not.toBeNull();
    });
  });

  describe('list filtered by repository', () => {
    it('matches a Windows-separator filter against the stored path', async () => {
      await repository.create(makeFeature({ repositoryPath: WINDOWS_PATH }));

      const listed = await repository.list({ repositoryPath: WINDOWS_PATH });

      expect(listed).toHaveLength(1);
    });
  });

  describe('activity log', () => {
    it('reads a work item history without sorting through a temp b-tree', async () => {
      const activitySql: string[] = [];
      const activityRepo = new SQLiteActivityLogRepository(capturePreparedSql(db, activitySql));

      await activityRepo.listByWorkItem('work-1');

      const plan = planFor(db, activitySql[0]);
      expect(plan).not.toContain('TEMP B-TREE');
      expect(plan).toContain('idx_activity_log_work_item_created');
    });

    it('still returns entries oldest first', async () => {
      // activity_log.work_item_id references work_items, which in turn
      // references a project and a state. None of that chain bears on the
      // ordering under test, so it is not built here.
      db.pragma('foreign_keys = OFF');
      const activityRepo = new SQLiteActivityLogRepository(db);
      const entry = (id: string, createdAt: Date): ActivityEntry => ({
        id,
        workItemId: 'work-1',
        fieldName: 'status',
        actorId: 'user-1',
        createdAt,
        updatedAt: createdAt,
      });
      await activityRepo.create(entry('second', new Date('2026-01-02T00:00:00Z')));
      await activityRepo.create(entry('first', new Date('2026-01-01T00:00:00Z')));

      const listed = await activityRepo.listByWorkItem('work-1');

      expect(listed.map((e) => e.id)).toEqual(['first', 'second']);
      db.pragma('foreign_keys = ON');
    });
  });
});
