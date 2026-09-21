/**
 * Atomic Start-Claim Integration Tests
 *
 * Admission used to be `listQueued()` / `getRunningCount()` followed by an
 * unconditional `UPDATE ... WHERE id = ?` and then a spawn. Two processes —
 * the daemon sweep and a CLI dashboard load, or a finishing worker that also
 * triggers the drain — could both read the same queued feature and both
 * "admit" it, putting TWO detached workers in ONE git worktree against one
 * agent run and one log file, with the parallelism cap silently exceeded.
 *
 * These tests run TWO CONNECTIONS against ONE database file, because that is
 * the only arrangement in which the race exists at all.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createFileDatabase } from '../../../helpers/database.helper.js';
import { removeDirWithRetry } from '../../../helpers/remove-dir.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import type { Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
import {
  RUNNING_LIFECYCLES,
  UNLIMITED_PARALLEL_FEATURES,
} from '@/domain/shared/parallel-feature-limit.js';

const RUNNING = [...RUNNING_LIFECYCLES];
const CLAIM_AT = new Date('2026-02-02T00:00:00Z');

function makeFeature(id: string, overrides?: Partial<Feature>): Feature {
  return {
    id,
    name: id,
    slug: id,
    description: '',
    userQuery: '',
    repositoryPath: '/repo',
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

describe('SQLiteFeatureRepository.claimForStart', () => {
  let dir: string;
  let daemonDb: Database.Database;
  let cliDb: Database.Database;
  let daemon: SQLiteFeatureRepository;
  let cli: SQLiteFeatureRepository;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'shep-claim-'));
    const dbPath = join(dir, 'data');
    daemonDb = createFileDatabase(dbPath);
    await runSQLiteMigrations(daemonDb);
    cliDb = createFileDatabase(dbPath);
    daemon = new SQLiteFeatureRepository(daemonDb);
    cli = new SQLiteFeatureRepository(cliDb);
  });

  afterEach(() => {
    daemonDb.close();
    cliDb.close();
    removeDirWithRetry(dir);
  });

  it('lets exactly one of two processes claim the same queued feature', async () => {
    await daemon.create(makeFeature('f1', { queuedAt: new Date('2026-01-01T00:00:00Z') }));

    const results = await Promise.all([
      daemon.claimForStart({
        featureId: 'f1',
        targetLifecycle: SdlcLifecycle.Requirements,
        updatedAt: CLAIM_AT,
        requireQueued: true,
      }),
      cli.claimForStart({
        featureId: 'f1',
        targetLifecycle: SdlcLifecycle.Requirements,
        updatedAt: CLAIM_AT,
        requireQueued: true,
      }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('clears the queue marker and applies the target lifecycle when it wins', async () => {
    await daemon.create(makeFeature('f1', { queuedAt: new Date('2026-01-01T00:00:00Z') }));

    const won = await daemon.claimForStart({
      featureId: 'f1',
      targetLifecycle: SdlcLifecycle.Implementation,
      updatedAt: CLAIM_AT,
      requireQueued: true,
    });

    expect(won).toBe(true);
    const claimed = await cli.findById('f1');
    expect(claimed?.lifecycle).toBe(SdlcLifecycle.Implementation);
    expect(claimed?.queuedAt).toBeUndefined();
    expect(claimed?.updatedAt.getTime()).toBe(CLAIM_AT.getTime());
  });

  it('refuses a feature that is no longer queued', async () => {
    await daemon.create(makeFeature('f1'));

    const won = await daemon.claimForStart({
      featureId: 'f1',
      targetLifecycle: SdlcLifecycle.Requirements,
      updatedAt: CLAIM_AT,
      requireQueued: true,
    });

    expect(won).toBe(false);
  });

  it('refuses a feature that has left the expected lifecycle', async () => {
    await daemon.create(makeFeature('f1', { lifecycle: SdlcLifecycle.Requirements }));

    const won = await daemon.claimForStart({
      featureId: 'f1',
      targetLifecycle: SdlcLifecycle.Requirements,
      updatedAt: CLAIM_AT,
      requireLifecycle: SdlcLifecycle.Pending,
    });

    expect(won).toBe(false);
  });

  it('refuses a soft-deleted feature', async () => {
    await daemon.create(makeFeature('f1', { queuedAt: new Date('2026-01-01T00:00:00Z') }));
    await daemon.softDelete('f1');

    const won = await daemon.claimForStart({
      featureId: 'f1',
      targetLifecycle: SdlcLifecycle.Requirements,
      updatedAt: CLAIM_AT,
      requireQueued: true,
    });

    expect(won).toBe(false);
  });

  describe('capacity enforced inside the write', () => {
    beforeEach(async () => {
      // Two features already running against a limit of 3.
      await daemon.create(makeFeature('running-1', { lifecycle: SdlcLifecycle.Implementation }));
      await daemon.create(makeFeature('running-2', { lifecycle: SdlcLifecycle.Requirements }));
    });

    it('admits one of two racing starts when only one slot is left', async () => {
      await daemon.create(makeFeature('a'));
      await daemon.create(makeFeature('b'));

      const results = await Promise.all([
        daemon.claimForStart({
          featureId: 'a',
          targetLifecycle: SdlcLifecycle.Requirements,
          updatedAt: CLAIM_AT,
          requireLifecycle: SdlcLifecycle.Pending,
          capacity: { limit: 3, runningLifecycles: RUNNING },
        }),
        cli.claimForStart({
          featureId: 'b',
          targetLifecycle: SdlcLifecycle.Requirements,
          updatedAt: CLAIM_AT,
          requireLifecycle: SdlcLifecycle.Pending,
          capacity: { limit: 3, runningLifecycles: RUNNING },
        }),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await daemon.countByLifecycles(RUNNING)).toBe(3);
    });

    it('refuses the claim once the cap is reached', async () => {
      await daemon.create(makeFeature('third', { lifecycle: SdlcLifecycle.Planning }));
      await daemon.create(makeFeature('a'));

      const won = await daemon.claimForStart({
        featureId: 'a',
        targetLifecycle: SdlcLifecycle.Requirements,
        updatedAt: CLAIM_AT,
        requireLifecycle: SdlcLifecycle.Pending,
        capacity: { limit: 3, runningLifecycles: RUNNING },
      });

      expect(won).toBe(false);
      expect((await daemon.findById('a'))?.lifecycle).toBe(SdlcLifecycle.Pending);
    });

    it('ignores the cap when the limit is unlimited', async () => {
      await daemon.create(makeFeature('third', { lifecycle: SdlcLifecycle.Planning }));
      await daemon.create(makeFeature('a'));

      const won = await daemon.claimForStart({
        featureId: 'a',
        targetLifecycle: SdlcLifecycle.Requirements,
        updatedAt: CLAIM_AT,
        requireLifecycle: SdlcLifecycle.Pending,
        capacity: { limit: UNLIMITED_PARALLEL_FEATURES, runningLifecycles: RUNNING },
      });

      expect(won).toBe(true);
    });

    it('claims when nothing can occupy a slot, rather than emitting an empty IN ()', async () => {
      await daemon.create(makeFeature('a'));

      const won = await daemon.claimForStart({
        featureId: 'a',
        targetLifecycle: SdlcLifecycle.Requirements,
        updatedAt: CLAIM_AT,
        requireLifecycle: SdlcLifecycle.Pending,
        capacity: { limit: 1, runningLifecycles: [] },
      });

      expect(won).toBe(true);
    });

    it('does not count soft-deleted features against the cap', async () => {
      await daemon.create(makeFeature('third', { lifecycle: SdlcLifecycle.Planning }));
      await daemon.softDelete('third');
      await daemon.create(makeFeature('a'));

      const won = await daemon.claimForStart({
        featureId: 'a',
        targetLifecycle: SdlcLifecycle.Requirements,
        updatedAt: CLAIM_AT,
        requireLifecycle: SdlcLifecycle.Pending,
        capacity: { limit: 3, runningLifecycles: RUNNING },
      });

      expect(won).toBe(true);
    });
  });
});
