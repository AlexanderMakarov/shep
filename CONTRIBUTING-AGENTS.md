# Contributing Guidelines for AI Agents

Rules and guidelines for AI agents when contributing to this repository. Project skills live in `.cursor/skills/` (mirrored in `.claude/skills/`).

These rules apply to any agent, not a favoured few. The supported set is whatever `AGENT_CATALOG` in [`packages/core/src/domain/shared/agent-catalog.ts`](./packages/core/src/domain/shared/agent-catalog.ts) marks `supported: true` — twelve today: Claude Code, Kimi Code, Codex CLI, Copilot CLI, Cursor CLI (binary `cursor-agent`), Gemini CLI, Cline, OpenRouter, Together AI, Ollama, LLM Proxy, and the `dev` mock. Aider and Continue are catalogued but *Coming Soon* — no executor exists for either.

## Quick Reference

| Rule         | Requirement                                          |
| ------------ | ---------------------------------------------------- |
| **Specs**    | **Start ALL features with `/shep-kit:new-feature`**  |
| Commits      | Conventional Commits format, always                  |
| Type         | Required — `type-enum` is an error                   |
| Scope        | **Optional** — `scope-enum` is a warning (severity 1) |
| Co-author    | Include `Co-Authored-By` footer                      |
| TDD          | Write tests first (Red-Green-Refactor)               |
| Architecture | Follow Clean Architecture layers                     |
| Edits        | Read files before editing                            |

## Spec-Driven Development (MANDATORY)

**All feature work MUST begin with `/shep-kit:new-feature`.** No exceptions.

See [Spec-Driven Workflow](./docs/development/spec-driven-workflow.md) for complete details.

### Workflow

```
/shep-kit:new-feature → /shep-kit:research → /shep-kit:plan → /shep-kit:implement → /shep-kit:commit-pr
```

### Quick Commands

| Command                 | Purpose             | Output                            |
| ----------------------- | ------------------- | --------------------------------- |
| `/shep-kit:new-feature` | Start new feature   | Branch + `specs/NNN-name/spec.yaml` |
| `/shep-kit:research`    | Technical analysis  | `research.yaml`                   |
| `/shep-kit:plan`        | Implementation plan | `plan.yaml` + `tasks.yaml`        |
| `/shep-kit:implement`   | Execute the tasks   | Code + tests, phase by phase      |
| `/shep-kit:commit-pr`   | Commit and open PR  | Conventional commits + PR         |

### What the Agent Does

1. **Gathers minimal input** (feature name + one-liner)
2. **Creates branch** `feat/NNN-feature-name` from main
3. **Scaffolds spec directory** with templates
4. **Analyzes codebase** to infer affected areas, dependencies, size
5. **Proposes spec** for human review
6. **Commits** after approval

### Spec Directory Structure

```
specs/NNN-feature-name/
├── spec.yaml       # Requirements (filled by /new-feature)
├── research.yaml   # Technical decisions (filled by /research)
├── plan.yaml       # Architecture (filled by /plan)
├── tasks.yaml      # Task breakdown (filled by /plan)
├── feature.yaml    # Lifecycle + phase state (maintained by the feature agent)
├── evidence/       # Screenshots and command output (filled by /implement)
├── data-model.md   # Entity changes (if needed)
└── contracts/      # API specs (if needed)
```

**Edit the YAML only** — the sibling `.md` files are generated from it.

## Commit Rules

**ALWAYS use Conventional Commits. No exceptions.**

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types (Required)

| Type       | Description                                |
| ---------- | ------------------------------------------ |
| `feat`     | New feature or functionality               |
| `fix`      | Bug fix                                    |
| `docs`     | Documentation changes only                 |
| `style`    | Formatting, whitespace, no code change     |
| `refactor` | Code restructuring without behavior change |
| `test`     | Adding or updating tests                   |
| `chore`    | Maintenance, dependencies, build config    |
| `perf`     | Performance improvements                   |
| `ci`       | CI/CD configuration changes                |

### Scope (Optional)

If you give a scope, it must be one of these fifteen — the `scope-enum` list in `commitlint.config.mjs`. Anything else is a **warning**, not an error, and `.github/workflows/pr-check.yml` sets `requireScope: false`, so a scopeless commit is valid.

| Scope        | Area                                                        |
| ------------ | ----------------------------------------------------------- |
| `specs`      | Feature specifications (shep-kit)                            |
| `shep-kit`   | Shep-kit skills and workflow                                 |
| `cli`        | CLI commands and presentation                                |
| `tui`        | Terminal UI components                                       |
| `web`        | Web UI (Next.js)                                             |
| `api`        | API layer                                                    |
| `domain`     | Domain entities and services                                 |
| `agents`     | AI agent system (LangGraph nodes, executors, prompts)        |
| `deployment` | Deployment configuration                                     |
| `tsp`        | TypeSpec models                                              |
| `deps`       | Dependencies                                                 |
| `config`     | Configuration files                                          |
| `dx`         | Developer experience                                         |
| `release`    | Release related                                              |
| `ci`         | CI/CD workflows                                              |

**There is no `application`, `infra`, `db`, `tests`, `readme`, `architecture` or `e2e` scope.** `build` and `docs` are *types*, never scopes — write `docs(cli)`, not `fix(docs)`. Use-case and port changes go under `domain`; persistence and infrastructure changes usually go under `domain` or `config`; test-only changes use the `test` **type**.

### Examples

```bash
# Features
feat(cli): add interactive wizard for new features
feat(agents): implement repository analysis caching
feat(web): add dark mode toggle

# Fixes
fix(cli): resolve config path on Windows
fix(domain): handle concurrent write conflicts
fix(tui): correct keyboard navigation in menus

# Documentation (`docs` is the TYPE — the scope names the area)
docs(cli): update installation instructions
docs(agents): add agent system diagrams

# Refactoring (note: refactor publishes a PATCH release)
refactor(domain): extract validation logic to value objects
refactor(api): simplify repository implementations

# Tests
test(domain): add Feature entity edge cases
test(web): cover onboarding flow

# Chores
chore(deps): update vitest to v1.0
chore(config): optimize bundle size

# No scope is fine too
fix: handle empty worktree path
```

### Commit Rules

1. **Type is mandatory** - Every commit must start with a valid type (`type-enum`, severity 2)
2. **Scope is optional** - Include one when it clarifies the change; an unknown or missing scope is a warning (`scope-enum`, severity 1), and `pr-check.yml` sets `requireScope: false`
3. **Description must be imperative** - Use "add" not "added" or "adds"
4. **Case is not enforced** - `commitlint.config.mjs` sets `'subject-case': [0]`, disabling the rule. Sentence case, lowercase and mixed all pass, and acronyms may stay uppercase
5. **No period at the end** - `subject-full-stop` is an error
6. **Keep it concise** - Subject ≤ 72 characters, whole header ≤ 100
7. **Body for details** - Use the body for explaining "why" if needed; body and footer lines are capped at 100 characters

### Breaking Changes

For breaking changes, add `!` after the scope and explain in the footer:

```
feat(api)!: change response format for tasks endpoint

BREAKING CHANGE: Task responses now include nested actionItems array
instead of flat structure. Update clients accordingly.
```

## Co-Author Attribution

Always include the Shep Bot co-author footer when committing:

```
feat(cli): add status command

Co-Authored-By: Shep Bot <shep-agent@users.noreply.github.com>
```

Do NOT use any other Co-Authored-By trailer (e.g. Claude, Anthropic). All commits must be attributed to Shep Bot.

This is also enforced mechanically: the `.husky/prepare-commit-msg` hook strips any `Co-Authored-By: Claude … <noreply@anthropic.com>` trailer and appends the Shep Bot trailer if it is missing. Your commit message **will be rewritten** — write it correctly rather than relying on the hook.

## Code Guidelines

### Before Editing

1. **Always read files first** - Never edit a file you haven't read
2. **Understand context** - Read related files to understand patterns
3. **Check existing tests** - Understand expected behavior

### Architecture Rules

Follow Clean Architecture - dependencies point inward:

```
Presentation → Application → Domain ← Infrastructure
```

| Layer          | Can Import          | Cannot Import                |
| -------------- | ------------------- | ---------------------------- |
| Domain         | Nothing             | Any other layer              |
| Application    | Domain              | Infrastructure, Presentation |
| Infrastructure | Application, Domain | Presentation                 |
| Presentation   | Application, Domain | Infrastructure — except to resolve the DI container |

The last row is the honest rule: `src/presentation/` is the composition root, so it does import `infrastructure/di/container.js`. That is the only sanctioned reason. Business logic still goes through a use case, and **`application/` and `domain/` never import infrastructure at all** — define a port under `packages/core/src/application/ports/output/` instead.

### File Locations

The first three layers live in `packages/core/src/`; presentation lives in `src/presentation/`.

| What             | Where                                                                     |
| ---------------- | ------------------------------------------------------------------------- |
| Domain entities  | Authored in `tsp/`, generated to `packages/core/src/domain/generated/output.ts` (never edit) |
| Domain helpers   | `packages/core/src/domain/shared/`                                        |
| Value objects    | `packages/core/src/domain/value-objects/`                                 |
| Use cases        | `packages/core/src/application/use-cases/`                                |
| Port interfaces  | `packages/core/src/application/ports/output/`                             |
| Repositories     | `packages/core/src/infrastructure/repositories/`                          |
| Persistence      | `packages/core/src/infrastructure/persistence/sqlite/` (+ `migrations/`)  |
| Agent executors  | `packages/core/src/infrastructure/services/agents/common/executors/`      |
| Agent nodes      | `packages/core/src/infrastructure/services/agents/feature-agent/nodes/`   |
| CLI commands     | `src/presentation/cli/commands/`                                          |
| Web components   | `src/presentation/web/components/`                                        |

There is no `infrastructure/agents/` directory and no `langgraph/`, `graphs/` or `tools/` directory — agent code lives under `infrastructure/services/agents/`.

### Testing (TDD Required)

Follow Red-Green-Refactor:

1. **RED** - Write a failing test first
2. **GREEN** - Write minimal code to pass
3. **REFACTOR** - Improve while keeping tests green

```bash
pnpm test:watch          # TDD mode (vitest watch)
pnpm test:unit           # Unit tests only — the fast inner loop
pnpm test                # unit + integration, THEN the e2e suite (builds the CLI; slow)
pnpm test:single <path>  # Single file
pnpm test:unit -t "name" # Filter by test name — vitest has no --grep
```

## Documentation Rules

### Cross-Reference Validation

Before modifying documentation, validate consistency across:

- `README.md` - User-facing overview
- `CLAUDE.md` - AI agent reference
- `AGENTS.md` - Agent system details
- `docs/` - Detailed documentation

### Updating Documentation

When changing code that affects documentation:

1. Update `CLAUDE.md` if architecture/patterns change
2. Update `docs/api/` if interfaces change
3. Update `docs/concepts/` if domain models change
4. Run `/cross-validate-artifacts` to check consistency

## Pull Request Guidelines

### Title Format

Use conventional commit format:

```
feat(scope): description of change
```

### Description Template

```markdown
## Summary

Brief description of changes

## Changes

- Change 1
- Change 2

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] E2E tests pass (if applicable)

## Documentation

- [ ] CLAUDE.md updated (if needed)
- [ ] Related docs updated
```

## Prohibited Actions

1. **Never commit secrets** - No API keys, tokens, passwords
2. **Never skip tests** - All tests must pass before commit
3. **Never force push to main** - Unless explicitly authorized
4. **Never modify without reading** - Always read files first
5. **Never ignore lint errors** - Fix all linting issues

## Useful Commands

```bash
# Development
pnpm dev              # Start the web dev server
pnpm dev:cli <cmd>    # Run the CLI from source (tsx) — no global install needed
pnpm build            # Build the CLI only
pnpm build:release    # Build CLI + web (what CI packages)
pnpm typecheck        # Type checking
pnpm validate         # lint:fix + format + typecheck + tsp:compile

# Testing
pnpm test             # unit + integration + e2e
pnpm test:unit        # Unit tests only
pnpm test:watch       # TDD mode
pnpm test:e2e         # E2E tests

# Quality
pnpm lint             # Check linting
pnpm lint:fix         # Fix lint issues
pnpm format           # Format code
```

---

## Maintaining This Document

**Update when:**

- Commit conventions change
- New scopes are added
- Architecture patterns evolve
- New prohibited actions identified

**Related docs:**

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Human contributor guidelines
- [CLAUDE.md](./CLAUDE.md) - AI agent codebase reference
- [docs/development/](./docs/development/) - Development guides
