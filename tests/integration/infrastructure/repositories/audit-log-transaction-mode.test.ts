/**
 * Audit-Log Transaction Mode Integration Tests
 *
 * Four repository methods append to a JSON audit log: SELECT the log, push an
 * entry, UPDATE the row. A DEFERRED transaction takes its read snapshot before
 * the write lock, so a concurrent writer turns the whole thing into
 * SQLITE_BUSY_SNAPSHOT — see read-modify-write-transactions.test.ts for that
 * failure in isolation.
 *
 * Whether a transaction ran deferred or immediate leaves no trace in a
 * successful result, so it is asserted directly here. Each method is called
 * with an id that does not exist: the transaction still opens (the mode is
 * chosen at that moment) and then throws on the missing row, which keeps the
 * test free of fixtures it is not about.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createInMemoryDatabase,
  recordTransactionModes,
  type TransactionMode,
} from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteRiskExceptionRepository } from '@/infrastructure/repositories/aspm/sqlite-risk-exception-repository.js';
import { SQLiteRemediationCampaignRepository } from '@/infrastructure/repositories/aspm/sqlite-remediation-campaign-repository.js';
import { RiskExceptionStatus, CampaignStatus } from '@/domain/generated/output.js';
import type { RiskExceptionAuditEntry } from '@/application/ports/output/repositories/risk-exception-repository.interface.js';
import type { CampaignAuditEntry } from '@/application/ports/output/repositories/remediation-campaign-repository.interface.js';

const MISSING_ID = 'does-not-exist';

const riskAudit: RiskExceptionAuditEntry = {
  at: '2026-01-01T00:00:00.000Z',
  actor: 'tester',
  action: 'revoked',
};

const campaignAudit: CampaignAuditEntry = {
  at: '2026-01-01T00:00:00.000Z',
  actor: 'tester',
  action: 'created',
};

describe('audit-log appends run in an immediate transaction', () => {
  let db: Database.Database;
  let modes: TransactionMode[];
  let recorded: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    modes = [];
    recorded = recordTransactionModes(db, modes);
  });

  afterEach(() => {
    db.close();
  });

  it('RiskExceptionRepository.updateStatus', async () => {
    const repository = new SQLiteRiskExceptionRepository(recorded);

    await expect(
      repository.updateStatus(MISSING_ID, RiskExceptionStatus.Revoked, riskAudit)
    ).rejects.toThrow();

    expect(modes).toEqual(['immediate']);
  });

  it('RiskExceptionRepository.appendAuditEntry', async () => {
    const repository = new SQLiteRiskExceptionRepository(recorded);

    await expect(repository.appendAuditEntry(MISSING_ID, riskAudit)).rejects.toThrow();

    expect(modes).toEqual(['immediate']);
  });

  it('RemediationCampaignRepository.update', async () => {
    const repository = new SQLiteRemediationCampaignRepository(recorded);

    await expect(
      repository.update(MISSING_ID, { name: 'renamed' }, campaignAudit)
    ).rejects.toThrow();

    expect(modes).toEqual(['immediate']);
  });

  it('RemediationCampaignRepository.updateStatus', async () => {
    const repository = new SQLiteRemediationCampaignRepository(recorded);

    await expect(
      repository.updateStatus(MISSING_ID, CampaignStatus.Active, campaignAudit)
    ).rejects.toThrow();

    expect(modes).toEqual(['immediate']);
  });
});
