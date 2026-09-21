import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openShepDb } from './collaboration-flag';

/** Unique fixtures only; never alter the running user's settings or existing rows. */
export function seedUiExperience() {
  const db = openShepDb();
  const prefix = `ui-e2e-${randomUUID().slice(0, 8)}`;
  const repositoryPath = mkdtempSync(join(tmpdir(), 'shep-ui-experience-'));
  const standalonePath = mkdtempSync(join(tmpdir(), 'shep-ui-standalone-'));
  execFileSync('git', ['init', '-b', 'ui-review'], { cwd: repositoryPath, stdio: 'ignore' });
  writeFileSync(join(repositoryPath, 'README.md'), '# Browser review fixture\n');
  const now = Date.now();
  const identifierPrefix = randomUUID().slice(0, 5).toUpperCase();
  const ids = {
    application: `${prefix}-app`,
    repository: `${prefix}-repo`,
    standaloneRepository: `${prefix}-standalone-repo`,
    feature: `${prefix}-feature`,
    project: `${prefix}-project`,
    state: `${prefix}-state`,
    item: `${prefix}-item`,
  };
  function insert(table: string, values: Record<string, string | number>) {
    const keys = Object.keys(values);
    db.prepare(
      `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
    ).run(...Object.values(values));
  }
  db.transaction(() => {
    // A repository without an application renders RepositoryNode. Seeding only
    // application-backed repos missed its scaled toolbar targets in isolation.
    insert('repositories', {
      id: ids.standaloneRepository,
      name: 'UI review standalone repository',
      path: standalonePath,
      created_at: now,
      updated_at: now,
    });
    insert('applications', {
      id: ids.application,
      name: 'UI review application',
      slug: ids.application,
      description: 'Isolated browser fixture',
      repository_path: repositoryPath,
      agent_type: 'dev',
      status: 'Idle',
      setup_complete: 1,
      created_at: now,
      updated_at: now,
    });
    insert('repositories', {
      id: ids.repository,
      name: 'UI review repository',
      path: repositoryPath,
      created_at: now,
      updated_at: now,
    });
    insert('features', {
      id: ids.feature,
      name: 'Review accessibility',
      slug: ids.feature,
      description: 'Browser review fixture',
      repository_path: repositoryPath,
      repository_id: ids.repository,
      branch: 'ui-review',
      lifecycle: 'Requirements',
      application_id: ids.application,
      created_at: now,
      updated_at: now,
    });
    insert('pm_projects', {
      id: ids.project,
      name: 'UI review project',
      slug: ids.project,
      identifier_prefix: identifierPrefix,
      work_item_counter: 1,
      created_at: now,
      updated_at: now,
    });
    insert('work_item_states', {
      id: ids.state,
      project_id: ids.project,
      name: 'Backlog',
      color: '#2563eb',
      display_order: 0,
      state_group: 'backlog',
      is_default: 1,
      created_at: now,
      updated_at: now,
    });
    insert('work_items', {
      id: ids.item,
      project_id: ids.project,
      sequence_id: 1,
      identifier_prefix: identifierPrefix,
      title: 'Review keyboard access',
      description: 'Check both themes',
      state_id: ids.state,
      priority: 'High',
      created_at: now,
      updated_at: now,
    });
  })();
  return {
    ids,
    cleanup() {
      db.transaction(() => {
        for (const [table, id] of [
          ['work_items', ids.item],
          ['work_item_states', ids.state],
          ['pm_projects', ids.project],
          ['features', ids.feature],
          ['repositories', ids.repository],
          ['repositories', ids.standaloneRepository],
          ['applications', ids.application],
        ]) {
          db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        }
      })();
      db.close();
      rmSync(repositoryPath, { recursive: true, force: true });
      rmSync(standalonePath, { recursive: true, force: true });
    },
  };
}
