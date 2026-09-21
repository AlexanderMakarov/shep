# Architecture (10-minute tour)

This is the orientation map. It's deliberately short and points you at the deep docs in [`docs/architecture/`](./docs/architecture/) when you want more.

If you only read one section, read **The Four Layers**. Everything else in Shep follows from those rules.

---

## The Big Picture

Shep is a TypeScript / Node.js SDLC platform that runs AI agents in parallel git worktrees. The codebase is a pnpm workspace with **four packages** (`pnpm-workspace.yaml`): the root CLI package, `packages/core/` (the platform), `src/presentation/web/` (the Next.js dashboard) and `packages/electron/` (the desktop shell).

```
shep/
├── tsp/                          # TypeSpec — domain models live here
├── packages/
│   ├── core/src/
│   │   ├── domain/               # ← inner-most; no external deps
│   │   ├── application/          # ← use cases + output ports
│   │   └── infrastructure/       # ← adapters: SQLite, agents, GitHub, fs
│   └── electron/                 # ← desktop shell (mac / win / linux builds)
└── src/presentation/             # ← CLI, TUI, Web (Next.js; its own workspace)
```

Dependencies point inward only: presentation depends on application, application depends on domain, infrastructure depends on application's port interfaces. `domain/` and `application/` never import from `infrastructure/`. Presentation is the composition root, so it may resolve concrete services from the DI container — but only to reach a use case; business logic never lives in a command or component.

---

## The Four Layers

### 1. Domain — `tsp/` and `packages/core/src/domain/`

Pure business logic and types. **Authored in TypeSpec**, generated into TypeScript at `packages/core/src/domain/generated/output.ts`. Hand-edited code in `domain/` is rare and never depends on anything outside the layer.

If a concept is part of the language you'd use in a planning meeting (Feature, Contributor, Lane, RecognitionEvent), it lives here.

→ Deep dive: [docs/architecture/clean-architecture.md § Domain](./docs/architecture/clean-architecture.md)
→ TypeSpec primer: [docs/development/typespec-guide.md](./docs/development/typespec-guide.md)
→ Domain field listings: [docs/api/domain-models.md](./docs/api/domain-models.md)

### 2. Application — `packages/core/src/application/`

Use cases (one class per file under `application/use-cases/`) and output port interfaces (`application/ports/output/`). Use cases orchestrate domain logic and call external systems through ports. They never import from `infrastructure/`.

If you find yourself writing `if/else` business logic in a CLI command or React component, that logic belongs in a use case here.

→ Deep dive: [docs/architecture/clean-architecture.md § Application](./docs/architecture/clean-architecture.md)
→ Implementation patterns: [docs/development/implementation-guide.md](./docs/development/implementation-guide.md)
→ Repository pattern + DI: [docs/architecture/repository-pattern.md](./docs/architecture/repository-pattern.md)

### 3. Infrastructure — `packages/core/src/infrastructure/`

Adapters: SQLite repositories (`infrastructure/persistence/sqlite/`), agent executors (`infrastructure/services/agents/common/executors/`), GitHub services, file-system utilities, Discord client, scheduling. Each adapter implements an output port from `application/ports/output/`.

This is the only layer allowed to import third-party SDKs (`@octokit/rest`, `better-sqlite3`, agent provider SDKs). DI wiring lives in `infrastructure/di/`.

→ Deep dive: [docs/architecture/clean-architecture.md § Infrastructure](./docs/architecture/clean-architecture.md)
→ Repository pattern: [docs/architecture/repository-pattern.md](./docs/architecture/repository-pattern.md)
→ Settings service walkthrough: [docs/architecture/settings-service.md](./docs/architecture/settings-service.md)

### 4. Presentation — `src/presentation/`

The surfaces you actually interact with: a Commander-based CLI (`cli/`), an Ink-based TUI (`tui/`), and a Next.js dashboard (`web/`). Presentation files are **thin** — they handle UI, input, formatting, and routing. All business logic flows through use cases.

→ CLI architecture: [docs/cli/architecture.md](./docs/cli/architecture.md)
→ TUI architecture: [docs/tui/architecture.md](./docs/tui/architecture.md)
→ Web UI architecture: [docs/ui/architecture.md](./docs/ui/architecture.md)

---

## Cross-Cutting Concerns

### Agents

Every LLM call goes through `IAgentExecutorProvider`, which reads the user's choice from settings at call time. No component hardcodes an agent. Twelve agents are supported — Claude Code, Kimi Code, Codex CLI, Copilot CLI, Cursor CLI, Gemini CLI, Cline, OpenRouter, Together AI, Ollama, LLM Proxy and the `dev` mock; Aider and Continue are listed but have no executor yet.

`packages/core/src/domain/shared/agent-catalog.ts` is the single source of truth for each agent's binary, tool id and model list, and is typed as a total `Record<AgentType, AgentDescriptor>` so a new enum member is a compile error until its row exists. Provider-specific code lives only in `packages/core/src/infrastructure/services/agents/common/executors/`.

→ [AGENTS.md](./AGENTS.md#settings-driven-agent-resolution-mandatory)
→ [docs/architecture/agent-system.md](./docs/architecture/agent-system.md)
→ [docs/development/adding-agent-types.md](./docs/development/adding-agent-types.md) — add a provider
→ [docs/development/adding-agent-nodes.md](./docs/development/adding-agent-nodes.md) — add a LangGraph node

### Supervision & approval gates

External side-effects (GitHub writes, Discord posts, recap publishes) flow through `ISupervisorAgent.evaluate(...)` before execution. The supervisor either auto-approves (configurable per side-effect kind) or pauses for a human.

→ [docs/architecture/supervision.md](./docs/architecture/supervision.md)

### Persistence

SQLite via `better-sqlite3`. Migrations live in `packages/core/src/infrastructure/persistence/sqlite/migrations/` and are run by `umzug`. Each migration owns one table and is idempotent (`CREATE TABLE IF NOT EXISTS`).

→ [docs/architecture/repository-pattern.md](./docs/architecture/repository-pattern.md)

### Settings

A typed key/value store backed by SQLite, exposed through `ISettingsService`. Per-user, per-repo, and per-feature scopes are layered.

→ [docs/architecture/settings-service.md](./docs/architecture/settings-service.md)

---

## Where Things Go

A quick lookup when you're not sure which layer something belongs in:

| You want to… | It lives in… |
| ------------ | ------------ |
| Add a new domain concept (entity, enum, value object) | `tsp/` → regenerate `domain/generated/output.ts` |
| Add a new business operation | `application/use-cases/<group>/<verb-noun>.use-case.ts` |
| Talk to GitHub, Discord, the file system, SQLite, an LLM | New port in `application/ports/output/`, adapter in `infrastructure/` |
| Add a CLI command | `src/presentation/cli/commands/<name>.command.ts` (calls a use case) |
| Add a web component | `src/presentation/web/components/<group>/<Name>.tsx` + colocated `.stories.tsx` |
| Schedule something on a cron | Register on Shep's in-process scheduler (NOT GitHub Actions) |
| React to a webhook | `.github/workflows/<event>.yml` invoking a CLI subcommand |

---

## Mandatory Rules (skim before your first PR)

Read [CLAUDE.md](./CLAUDE.md) for the canonical list. The first group is checked mechanically —
by CI, commitlint, or the compiler — so breaking one turns your PR red. The second group is a
review convention the codebase does not yet fully satisfy: treat it as the direction of travel,
and don't add to the debt.

**Checked mechanically:**

- **Tests pass**: unit, integration and E2E all run in CI, on Linux and Windows. (TDD itself —
  failing test first, then implementation, then refactor — is a review expectation; what CI
  checks is that the tests exist and are green.)
- **TypeSpec-first**: domain concepts in `tsp/`, never in raw TS strings — CI re-runs
  `pnpm generate` and fails if the generated output isn't committed
- **`application/` never imports `infrastructure/`**: an ESLint `no-restricted-imports` rule
  makes it an error, and `pnpm lint` runs with `--max-warnings 0`. `domain/` is clean by the
  same convention. Presentation is the composition root and *does* import infrastructure to
  resolve the DI container — that is expected; putting business logic there is not.
- **Storybook stories**: every web component ships with `.stories.tsx` — the Storybook Build job
  runs `check:stories`
- **Conventional commits**: `type(scope): subject`, validated by commitlint in the `commit-msg`
  hook and again on the PR. Scope is a **warning**, not an error, and `requireScope: false` on
  the PR title check. Subject **case is not enforced** (`'subject-case': [0]`) — just keep it
  under 72 characters with no trailing period.

**Conventions (aspirational, not enforced):**

- **Agent resolution**: every LLM call goes through `IAgentExecutorProvider`; no component
  names an agent. Nothing lints this — it is caught in review.
- **No singletons outside DI bootstrap**: inject by string token. A handful of module-level
  accessors survive in infrastructure bootstrapping (`getSettings()`, `getShepHomeDir()`); never
  call them from a use case.
- **File length**: ~300 lines is the point at which a file probably does too much. It is a
  smell, not a gate — no ESLint `max-lines` rule exists, and a few hundred files are currently
  over it. Don't make a long file longer; split it while you're in there.

---

## Where to Go Next

- 🌱 [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md) — pick something to ship
- 🗺️ [ROADMAP.md](./ROADMAP.md) — what's coming
- 📝 [CONTRIBUTING.md](./CONTRIBUTING.md) — full contributor guide
- 🧠 [docs/architecture/overview.md](./docs/architecture/overview.md) — extended architecture overview
- 🤖 [AGENTS.md](./AGENTS.md) — agent resolution rules
- 🧪 [docs/development/tdd-guide.md](./docs/development/tdd-guide.md) — TDD rhythm
