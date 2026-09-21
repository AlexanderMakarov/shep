# Testing Guide

Comprehensive guide to testing in Shep AI CLI.

## Testing Philosophy

We follow **Test-Driven Development (TDD)**:

1. **Write the test first** - Define expected behavior before implementation
2. **Red-Green-Refactor** - Fail → Pass → Improve
3. **Test behavior, not implementation** - Focus on what, not how
4. **Fast feedback loops** - Use watch mode during development

See [tdd-guide.md](./tdd-guide.md) for the complete TDD workflow with Clean Architecture.

## Test Structure

```
tests/
├── unit/                    # Fast, isolated tests (Vitest)
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── presentation/
├── integration/             # Tests with real dependencies (Vitest)
├── e2e/
│   ├── cli/                 # CLI command tests (Vitest)
│   ├── tui/                 # Terminal UI tests (Vitest)
│   └── web/                 # Web UI tests (Playwright)
├── manual/                  # Opt-in suite (vitest.config.manual.mjs)
├── fixtures/                # Test data
├── scripts/                 # Script-runner tests
└── helpers/                 # Test utilities
    ├── database.helper.ts   # In-memory SQLite helpers
    ├── cli/                 # CLI invocation helpers
    └── *.mock.ts            # Port doubles
```

## Test Frameworks

| Framework      | Purpose                    | Location                                |
| -------------- | -------------------------- | --------------------------------------- |
| **Vitest**     | Unit, integration, CLI/TUI | `tests/unit/`, `tests/integration/`, `tests/e2e/cli/`, `tests/e2e/tui/` |
| **Playwright** | Browser E2E tests          | `tests/e2e/web/`                        |
| **Storybook**  | Component visual testing   | colocated `*.stories.tsx` under `src/presentation/web/` |

Only the **web** E2E suite uses Playwright. `tests/e2e/cli` and `tests/e2e/tui`
are Vitest suites that drive the built CLI.

## Running Tests

### TDD Watch Mode (Primary Workflow)

```bash
# Start TDD session - tests rerun on file changes
pnpm test:watch
```

### All Tests

```bash
pnpm test
```

`test` is a **compound** script:
`vitest run tests/unit tests/integration --passWithNoTests && pnpm run test:e2e`.
Because of that, extra arguments appended to `pnpm test` do not reach the first
Vitest invocation — always target a specific script when you want to pass flags.

### By Layer

```bash
# Unit tests only (fast)
pnpm test:unit

# Integration tests only
pnpm test:int

# Everything end-to-end: builds the CLI, runs tests/e2e, then the web suite
pnpm test:e2e

# Individual E2E suites
pnpm test:e2e:cli       # builds the CLI, runs tests/e2e/cli against dist
pnpm test:e2e:tui       # tests/e2e/tui
pnpm test:e2e:web       # playwright test
pnpm test:e2e:scripts   # tests/e2e/cli/script-runner.test.ts

# Opt-in manual suite (separate Vitest config)
pnpm test:manual
```

### Single File

```bash
pnpm test:single tests/unit/domain/entities/feature.test.ts
```

`test:single` is plain `vitest run`, so it accepts any path filter or Vitest flag.

### By Pattern

Vitest has **no `--grep`**. Filter by test name with `-t` /
`--testNamePattern`, on a script that is a single Vitest invocation:

```bash
# Every test whose describe/it name matches "Feature"
pnpm test:unit -t "Feature"

# Or against an arbitrary path
pnpm test:single tests/unit -t "Feature"
```

### With Coverage

The Vitest config enables the `v8` coverage provider (`text`, `json` and `html`
reporters) but sets **no thresholds** and there is no `test:coverage` script. Run
it ad hoc:

```bash
pnpm test:unit --coverage
```

## Writing Tests

### Unit Tests

For domain logic with no external dependencies:

```typescript
// tests/unit/domain/entities/feature.test.ts
import { describe, it, expect } from 'vitest';
import { Feature } from '@/domain/entities/feature';
import { SdlcLifecycle } from '@/domain/value-objects/sdlc-lifecycle';

describe('Feature', () => {
  describe('lifecycle transitions', () => {
    it('should allow transition from Requirements to Plan', () => {
      const feature = Feature.create({
        name: 'Test Feature',
        description: 'Description',
        repoPath: '/test/repo',
      });

      expect(feature.canTransitionTo(SdlcLifecycle.Plan)).toBe(true);
    });

    it('should not allow skipping Plan phase', () => {
      const feature = Feature.create({
        name: 'Test Feature',
        description: 'Description',
        repoPath: '/test/repo',
      });

      expect(feature.canTransitionTo(SdlcLifecycle.Implementation)).toBe(false);
    });

    it('should throw on invalid transition', () => {
      const feature = Feature.create({
        name: 'Test Feature',
        description: 'Description',
        repoPath: '/test/repo',
      });

      expect(() => {
        feature.transitionTo(SdlcLifecycle.Implementation);
      }).toThrow('Invalid lifecycle transition');
    });
  });
});
```

### Integration Tests

For repository implementations with real database:

```typescript
// tests/integration/repositories/feature-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { SqliteFeatureRepository } from '@/infrastructure/repositories/sqlite/feature.repository';
import { Feature } from '@/domain/entities/feature';
import { createInMemoryDatabase } from '@tests/helpers/database.helper';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations';

describe('SqliteFeatureRepository', () => {
  let db: Database;
  let repository: SqliteFeatureRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repository = new SqliteFeatureRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('save and findById', () => {
    it('should persist and retrieve a feature', async () => {
      const feature = Feature.create({
        name: 'Test Feature',
        description: 'Description',
        repoPath: '/test/repo',
      });

      await repository.save(feature);
      const retrieved = await repository.findById(feature.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Test Feature');
      expect(retrieved?.lifecycle).toBe(feature.lifecycle);
    });
  });

  describe('findByRepoPath', () => {
    it('should return features for specific repo', async () => {
      const feature1 = Feature.create({
        name: 'Feature 1',
        description: 'Desc',
        repoPath: '/repo/a',
      });
      const feature2 = Feature.create({
        name: 'Feature 2',
        description: 'Desc',
        repoPath: '/repo/b',
      });

      await repository.save(feature1);
      await repository.save(feature2);

      const features = await repository.findByRepoPath('/repo/a');

      expect(features).toHaveLength(1);
      expect(features[0].name).toBe('Feature 1');
    });
  });
});
```

### E2E Tests

#### CLI Command Tests

CLI E2E tests are Vitest suites that shell out to the CLI. `pnpm test:e2e:cli`
builds first and sets `SHEP_E2E_USE_DIST=1` so the tests exercise `dist/`, not the
TypeScript sources. Point `SHEP_HOME` at a temp directory so a test never touches
your real `~/.shep`.

```typescript
// tests/e2e/cli/settings-init.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('shep settings init', () => {
  let shepHome: string;

  beforeAll(() => {
    shepHome = mkdtempSync(join(tmpdir(), 'shep-e2e-'));
  });

  afterAll(() => {
    rmSync(shepHome, { recursive: true, force: true });
  });

  it('resets settings to defaults', () => {
    const result = execSync('pnpm dev:cli settings init --force', {
      env: { ...process.env, SHEP_HOME: shepHome },
      encoding: 'utf8',
    });

    expect(result).toContain('Settings');
  });
});
```

> There is no `shep init`. Global settings are (re)initialised with
> `shep settings init` (`--force` skips the confirmation prompt); features are
> created with `shep feat new <description>`.

#### Web UI Tests (Playwright)

```typescript
// tests/e2e/web/feature-workflow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Feature Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should create a new feature', async ({ page }) => {
    // Navigate to features
    await page.click('[data-testid="nav-features"]');

    // Click create button
    await page.click('[data-testid="create-feature-btn"]');

    // Fill form
    await page.fill('[data-testid="feature-name"]', 'User Authentication');
    await page.fill('[data-testid="feature-description"]', 'Add login functionality');

    // Submit
    await page.click('[data-testid="submit-feature"]');

    // Verify creation
    await expect(page.locator('[data-testid="feature-card"]')).toContainText('User Authentication');
    await expect(page.locator('[data-testid="lifecycle-badge"]')).toContainText('Requirements');
  });

  test('should transition feature through lifecycle', async ({ page }) => {
    // Start with existing feature
    await page.goto('/features/test-feature-id');

    // Verify initial state
    await expect(page.locator('[data-testid="lifecycle-badge"]')).toContainText('Requirements');

    // Complete requirements and move to Plan
    await page.click('[data-testid="complete-requirements-btn"]');
    await page.click('[data-testid="confirm-transition"]');

    // Verify transition
    await expect(page.locator('[data-testid="lifecycle-badge"]')).toContainText('Plan');
  });

  test('should display chat interface for requirements gathering', async ({ page }) => {
    await page.goto('/features/test-feature-id/requirements');

    // Verify chat components
    await expect(page.locator('[data-testid="chat-messages"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();

    // Send a message
    await page.fill('[data-testid="chat-input"]', 'I need user authentication with OAuth');
    await page.click('[data-testid="send-message"]');

    // Verify message appears
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('OAuth');
  });
});
```

### Storybook Component Tests

Visual and interaction testing for UI components:

```typescript
// src/presentation/web/stories/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@/components/ui/button';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// All variants
export const Default: Story = {
  args: {
    children: 'Button',
    variant: 'default',
  },
};

export const Destructive: Story = {
  args: {
    children: 'Delete',
    variant: 'destructive',
  },
};

export const Outline: Story = {
  args: {
    children: 'Outline',
    variant: 'outline',
  },
};

// Interactive test
export const WithInteraction: Story = {
  args: {
    children: 'Click me',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');

    await userEvent.click(button);
    await expect(button).toHaveFocus();
  },
};

// Loading state
export const Loading: Story = {
  args: {
    children: 'Loading...',
    disabled: true,
  },
};
```

```typescript
// src/presentation/web/stories/FeatureCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { FeatureCard } from '@/components/features/FeatureCard';
import { SdlcLifecycle } from '@/domain/value-objects/sdlc-lifecycle';

const meta: Meta<typeof FeatureCard> = {
  title: 'Features/FeatureCard',
  component: FeatureCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Requirements: Story = {
  args: {
    feature: {
      id: 'feat_1',
      name: 'User Authentication',
      description: 'Implement OAuth2 login flow',
      lifecycle: SdlcLifecycle.Requirements,
      taskCount: 0,
      completedTasks: 0,
    },
  },
};

export const InProgress: Story = {
  args: {
    feature: {
      id: 'feat_2',
      name: 'Dashboard Redesign',
      description: 'Modernize the main dashboard',
      lifecycle: SdlcLifecycle.Implementation,
      taskCount: 5,
      completedTasks: 2,
    },
  },
};

export const Completed: Story = {
  args: {
    feature: {
      id: 'feat_3',
      name: 'API Rate Limiting',
      description: 'Add rate limiting to all endpoints',
      lifecycle: SdlcLifecycle.Maintenance,
      taskCount: 3,
      completedTasks: 3,
    },
  },
};
```

## Test Utilities

### Factories

Create test entities consistently:

```typescript
// e.g. tests/helpers/feature.factory.ts
import { Feature } from '@/domain/entities/feature';
import { Task } from '@/domain/entities/task';

export function createFeature(overrides: Partial<FeatureProps> = {}): Feature {
  return Feature.create({
    name: 'Test Feature',
    description: 'Test Description',
    repoPath: '/test/repo',
    ...overrides,
  });
}

export function createTask(overrides: Partial<TaskProps> = {}): Task {
  return new Task({
    featureId: 'feat_123',
    title: 'Test Task',
    description: 'Task description',
    dependsOn: [],
    ...overrides,
  });
}
```

### Mocks

Mock external dependencies:

```typescript
// e.g. tests/helpers/feature-repository.mock.ts
import { vi } from 'vitest';
import type { ILLMClient } from '@/infrastructure/services/llm-client';

export function createMockLLMClient(): ILLMClient {
  return {
    complete: vi.fn().mockResolvedValue({
      content: 'Mock response',
    }),
    chat: vi.fn().mockResolvedValue({
      content: 'Mock chat response',
    }),
  };
}

export function createMockFeatureRepository(): IFeatureRepository {
  const features = new Map<string, Feature>();

  return {
    findById: vi.fn((id) => Promise.resolve(features.get(id) ?? null)),
    findByRepoPath: vi.fn(() => Promise.resolve(Array.from(features.values()))),
    save: vi.fn((feature) => {
      features.set(feature.id, feature);
      return Promise.resolve();
    }),
    delete: vi.fn((id) => {
      features.delete(id);
      return Promise.resolve();
    }),
  };
}
```

### Test Database

In-memory SQLite, from `tests/helpers/database.helper.ts`:

```typescript
import { createInMemoryDatabase } from '@tests/helpers/database.helper';

const db = createInMemoryDatabase();
// journal_mode=MEMORY, synchronous=OFF, foreign_keys=ON are already set
db.close(); // the database is destroyed with the connection
```

Set `DEBUG_SQL=1` to have the helper log every statement it executes.

## Testing Patterns

### Testing Use Cases

```typescript
describe('CreatePlanUseCase', () => {
  it('should create plan from requirements', async () => {
    // Arrange
    const featureRepo = createMockFeatureRepository();
    const planningAgent = createMockPlanningAgent();
    const feature = createFeature({ lifecycle: SdlcLifecycle.Requirements });
    await featureRepo.save(feature);

    const useCase = new CreatePlanUseCase(featureRepo, planningAgent);

    // Act
    const result = await useCase.execute(feature.id);

    // Assert
    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Plan);
    expect(result.plan.tasks).toHaveLength(3);
    expect(featureRepo.save).toHaveBeenCalled();
  });
});
```

### Testing Agents

```typescript
describe('RepositoryAnalysisAgent', () => {
  it('should analyze repository structure', async () => {
    const agent = new RepositoryAnalysisAgent();
    const context = createTestAgentContext();

    await agent.initialize(context);

    const result = await agent.execute({
      id: 'task_1',
      type: 'analyze',
      payload: { repoPath: fixtureRepoPath },
    });

    expect(result.status).toBe('success');
    expect(result.data.summary).toBeDefined();
  });
});
```

## Coverage Targets

No coverage threshold is enforced anywhere — `vitest.config.ts` configures the
`v8` provider but sets no `thresholds`, and CI does not run coverage. These are
review guidelines, not gates:

| Layer          | Target Coverage |
| -------------- | --------------- |
| Domain         | 90%             |
| Application    | 85%             |
| Infrastructure | 75%             |
| Presentation   | 60%             |

## Continuous Integration

All test jobs live in the single
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) workflow, which runs
on pushes and pull requests targeting `main` and `develop`, on Node 22 with pnpm
and a frozen lockfile. The test-related jobs are:

| Job                          | Runs                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| **Unit Tests** (ubuntu, windows) | `pnpm tsp:compile`, then `test:unit` and `test:int`               |
| **E2E CLI** (ubuntu, windows)    | `pnpm build:release`, then `test:e2e:cli`                         |
| **E2E (TUI)**                | `pnpm build:release`, then `test:e2e:tui`                            |
| **E2E (Web)**                | `pnpm build:release`, `playwright install --with-deps chromium`, then `test:e2e:web` |
| **Storybook Build**          | `pnpm check:stories`, then `pnpm build:storybook`                    |

`check:stories` exists because `build:storybook` catches a *broken* story but by
construction cannot detect a *missing* one — and every web component is required
to have a colocated `.stories.tsx`.

A separate scheduled workflow,
[`shep-e2e.yml`](../../.github/workflows/shep-e2e.yml), exercises the full
`feat new → feat ls → feat show` lifecycle hourly across platforms and agents.

Mirror CI locally before pushing:

```bash
pnpm lint && pnpm format:check
pnpm typecheck
pnpm test:unit && pnpm test:int
pnpm build
```

---

## Maintaining This Document

**Update when:**

- Testing framework changes
- Coverage requirements change
- New testing patterns emerge
- Test utilities are added

**Related docs:**

- [setup.md](./setup.md) - Development setup
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - PR requirements
