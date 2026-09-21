# Development Setup

Complete guide to setting up a development environment for Shep AI CLI.

## Prerequisites

### Required

| Tool    | Version | Purpose            |
| ------- | ------- | ------------------ |
| Node.js | 22+     | Runtime            |
| pnpm    | 10+     | Package management |
| Git     | 2.30+   | Version control    |

Node 22 is pinned in `.nvmrc` and enforced by `engines.node` (`>=22.0.0`); every CI
workflow runs on Node 22.

pnpm **10 or newer** is required by `engines.pnpm`; `packageManager` pins
`pnpm@10.33.0`. The minimum was raised from 8 to 10 to match the CI toolchain.

Install pnpm: `npm install -g pnpm@10` (or `corepack enable`, which picks up the
`packageManager` field automatically)

### Recommended

| Tool                         | Purpose                     |
| ---------------------------- | --------------------------- |
| VS Code                      | IDE with TypeScript support |
| SQLite Browser               | Database inspection         |
| Playwright VS Code Extension | E2E test debugging          |
| HTTPie/curl                  | API testing                 |

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/shep-ai/shep.git
cd shep
```

### 2. Install Dependencies

```bash
pnpm install
```

This installs all dependencies including dev dependencies.

If you previously built or exported Shep through Docker in the same checkout, do **not**
reuse the copied runtime bundle or Linux-built `node_modules` for local development.
Reset the workspace first:

```bash
pnpm reset:dev
```

That removes `node_modules`, `dist`, `web`, and Next.js build output, then reinstalls a
clean host-native dependency tree.

### 3. Verify Setup

```bash
# Run type check
pnpm typecheck

# Run tests
pnpm test

# Build the CLI (`pnpm build` is an alias for `pnpm build:cli`)
pnpm build

# Start Storybook (design system)
pnpm dev:storybook
```

## Project Structure

This is a pnpm monorepo. `pnpm-workspace.yaml` declares **four** workspaces: the
repository root (the CLI), `packages/core`, `src/presentation/web` and
`packages/electron`.

```
shep/
├── packages/
│   ├── core/src/             # @shepai/core — domain, application, infrastructure
│   │   ├── domain/           # Business logic (no deps)
│   │   │   ├── shared/
│   │   │   ├── value-objects/
│   │   │   ├── factories/
│   │   │   ├── aspm/
│   │   │   └── generated/    # TypeSpec output — DO NOT EDIT
│   │   ├── application/      # Use cases and ports
│   │   │   ├── use-cases/
│   │   │   ├── ports/
│   │   │   └── services/
│   │   └── infrastructure/   # External implementations
│   │       ├── di/           # tsyringe container (composition root)
│   │       ├── repositories/
│   │       ├── persistence/  # SQLite + umzug migrations
│   │       ├── adapters/
│   │       ├── templates/
│   │       └── services/     # incl. services/agents/ (executors, feature-agent)
│   └── electron/             # @shepai/electron — desktop shell
├── src/
│   └── presentation/     # UI layers
│       ├── cli/          # Commander-based CLI
│       ├── tui/          # @inquirer/prompts interactive wizards
│       └── web/          # @shepai/web — Next.js + shadcn/ui
│           ├── app/      # Next.js App Router
│           ├── components/
│           │   ├── ui/   # shadcn/ui components
│           │   └── ...   # Feature components
│           └── stories/  # Storybook stories
├── tsp/                  # TypeSpec domain models (source of truth)
├── translations/         # TUI/CLI i18n bundles
├── tests/
│   ├── unit/             # Vitest unit tests
│   ├── integration/      # Vitest integration tests
│   ├── e2e/              # cli/ + tui/ (Vitest) and web/ (Playwright)
│   └── helpers/          # Shared test utilities
├── docs/                 # Documentation
├── scripts/              # Build/dev scripts
├── .storybook/           # Storybook config
└── dist/                 # Build output
```

## IDE Configuration

### VS Code

Recommended extensions:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

Settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

Debug configuration (`.vscode/launch.json`):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug CLI",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/presentation/cli/index.ts",
      "runtimeArgs": ["--import", "tsx"],
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "--reporter=verbose"],
      "console": "integratedTerminal"
    }
  ]
}
```

## Development Commands

### Starting Development

```bash
# Run CLI directly (tsx)
pnpm dev:cli

# Start Web UI (same as `pnpm dev`)
pnpm dev:web

# Shortcut for local web development
pnpm dev

# Start Storybook (Design System)
pnpm dev:storybook
```

### Testing Locally

```bash
# Link package globally
pnpm link --global

# Now 'shep' command is available
shep --help

# Unlink when done
pnpm unlink --global @shepai/cli
```

### Database Development

Shep keeps a single SQLite database at `~/.shep/data` (`getShepDbPath()` in
`packages/core/src/infrastructure/services/filesystem/shep-directory.service.ts`).
Set `SHEP_HOME` to point the whole `~/.shep` tree somewhere else — handy for
running against a throwaway database.

Migrations run automatically (umzug) when the CLI bootstraps. To inspect the
database manually:

```bash
# Using sqlite3 CLI
sqlite3 ~/.shep/data

# Common queries
.tables
SELECT * FROM features;
```

## Working with Tests (TDD)

This project uses Test-Driven Development. See [tdd-guide.md](./tdd-guide.md) for the full TDD workflow.

### Running Tests

```bash
# TDD watch mode (recommended for development)
pnpm test:watch

# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:int

# E2E tests (Playwright)
pnpm test:e2e

# Specific file
pnpm test:single tests/unit/domain/entities/feature.test.ts
```

### Test Database

Tests use in-memory SQLite via `tests/helpers/database.helper.ts`:

```typescript
import { createInMemoryDatabase } from '@tests/helpers/database.helper';

const db = createInMemoryDatabase(); // pragmas already tuned for tests
// ...
db.close(); // the database disappears with the connection
```

## Debugging

### Enable Debug Logging

`DEBUG` is a plain on/off switch, **not** a namespace filter — the code checks
`!!process.env.DEBUG` (`deployment-logger.ts`) and `if (process.env.DEBUG)`
(`src/presentation/cli/ui/messages.ts`). Any truthy value works; use `DEBUG=1`.

```bash
# Verbose CLI messages + deployment service logging
# (dev server start/stop, port detection)
DEBUG=1 pnpm dev:cli

# Verbose SQLite: log every statement and umzug migration step
DEBUG_SQL=1 pnpm dev:cli
```

For web UI client-side debug logging, add to `src/presentation/web/.env.local`:

```bash
NEXT_PUBLIC_DEBUG=1
```

### Environment Variables

Shep has no config file — settings live in SQLite and are edited with
`shep settings …`. These are the environment variables you are likely to use
during development:

| Variable        | Effect                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SHEP_HOME`     | Overrides the `~/.shep` home directory (database, logs, worktree metadata). Useful for an isolated scratch instance.     |
| `DEBUG`         | Truthy → verbose CLI + deployment logging.                                                                              |
| `DEBUG_SQL`     | Truthy → log every SQLite statement and migration step.                                                                 |
| `SHEP_WEB_PORT` | **Internal, not an override.** The daemon writes the port it actually bound into this variable so the Next.js middleware can reject Host headers naming a different port (DNS-rebinding defence). |

> There is no `.shep/config.json`, and no `SHEP_PORT`, `SHEP_HOST`,
> `SHEP_API_KEY` or `SHEP_LOG_LEVEL`. If you find those in older notes, they
> never existed.

The web port is **not** set through the environment — pass `--port` to the
command that starts the server (`shep start --port <n>` or `shep ui --port <n>`).
The default is `4050` (`DEFAULT_PORT` in
`packages/core/src/infrastructure/services/port.service.ts`); if it is taken, the
CLI picks the next free port.

Four further variables gate non-localhost access to the web UI and are worth
knowing before you expose it: `SHEP_BIND_HOST`, `SHEP_ALLOW_PUBLIC_BIND`,
`SHEP_ALLOWED_HOSTS` and `SHEP_WEB_REQUIRE_TOKEN`.

Per-repository, Shep reads two optional files from `<repo>/.shep/`:
`dev.json` (dev-server run config) and `ownership.yaml` (ASPM ownership import).

### Inspect SQLite Database

```bash
# Using sqlite3 CLI
sqlite3 ~/.shep/data

# Common queries
.tables
SELECT * FROM features;
SELECT * FROM tasks WHERE feature_id = 'xxx';
```

## Common Issues

### Node Version Mismatch

```bash
# Check version — must be 22 or newer
node --version

# Use nvm to switch (reads .nvmrc, which pins 22)
nvm use
```

### Build Errors After Pull

```bash
# Clean install (removes dist, web, .next and node_modules, then reinstalls)
pnpm reset:dev

# Rebuild
pnpm build
```

### Tests Failing on CI But Not Locally

Check for:

- Environment variable differences
- File system timing issues
- Hardcoded paths

### SQLite Issues

```bash
# Rebuild native modules
pnpm rebuild better-sqlite3
```

### Playwright Issues

```bash
# Install browsers
pnpm exec playwright install --with-deps chromium

# Run the browser suite with the Playwright inspector
pnpm test:e2e:web --debug
```

---

## Maintaining This Document

**Update when:**

- Prerequisites change
- Project structure changes
- New tooling is adopted
- Common issues are discovered

**Related docs:**

- [testing.md](./testing.md) - Testing details
- [building.md](./building.md) - Build process
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Contribution flow
