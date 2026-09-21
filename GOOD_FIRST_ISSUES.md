# Good First Issues

> ## ⚠️ This file currently curates nothing
>
> **Every one of the fifteen buckets below is empty.** They are kept as a routing table: each one links to a live GitHub search for that lane and difficulty, and that search — not this file — is the authoritative list of what is available right now.
>
> **Start here instead:** [open issues labelled `good first issue`](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
>
> The last curated batch was #615–#625, and all eleven are closed: 6 merged (#616, #617, **#618**, #619, #620, #622), 2 deleted (#615, #623), 3 closed as not planned (#621, #624, #625). Nothing has replaced them.

This page groups work by **lane** (the part of the system you'll touch) and by **difficulty** (`goodFirst` is the easiest tier). If nothing in the tracker looks like a fit, open a [feature request](./.github/ISSUE_TEMPLATE/feature-request.yml) for something you'd like to build, or a [Good First Issue](./.github/ISSUE_TEMPLATE/good-first-issue.yml) for something a future contributor could pick up.

### How this list is (and isn't) maintained

- **Nothing regenerates this Markdown file.** Refreshing the buckets below is a manual maintainer job, and it has not happened since the batch above closed.
- **`.github/workflows/generate-good-first-issues.yml` does not write this file.** It runs an agent that scans the codebase and current AI trends and opens up to ten **new GitHub issues** per run via `gh issue create`. It never commits or pushes. It is also **disabled by default** — its `schedule:` trigger is commented out, so it only runs on a manual `workflow_dispatch` from the Actions tab.
- **Inbound issues are still groomed automatically.** `.github/workflows/label-by-lane.yml` fires on `issues: [opened]` and runs `shep contributors groom-issue`, which classifies the lane, proposes acceptance criteria, and suggests labels — so the `lane:*` and `difficulty:*` labels the searches below rely on do get applied.

Net effect: trust the tracker links, not the bullet lists.

---

## How to claim

1. Comment `/claim` on the issue (or just say "I'd like to take this") so we don't double-assign
2. Run `pnpm dev:cli doctor` to verify your environment
3. Open a PR using the [PR template](./.github/PULL_REQUEST_TEMPLATE.md)

Grooming is automatic and does not need a manual step: `groom-issue` is a GitHub Actions entry point that takes **no options** — no `--number`. It reads the issue from `$GITHUB_EVENT_PATH` and the repo slug from `$GITHUB_REPOSITORY`. To re-run it by hand against a saved event payload:

```bash
GITHUB_EVENT_PATH=event.json GITHUB_REPOSITORY=shep-ai/shep pnpm dev:cli contributors groom-issue
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full flow.

---

## docs lane

*Documentation, READMEs, JSDoc, contributor docs, lessons.*

### goodFirst

- _No curated issues right now_ — #615 was deleted; #616 merged via #632. [Browse open `lane:docs` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Adocs%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — [Browse open `lane:docs` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Adocs%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — [Browse open `lane:docs` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Adocs%22+label%3A%22difficulty%3Amedium%22).

---

## agents lane

*Agent prompts, supervisor flow, agent-agnostic plumbing under `tsp/agents/`, `packages/core/src/application/use-cases/agents/`, `packages/core/src/infrastructure/services/agents/`.*

### goodFirst

- _No curated issues right now_ — #618 merged via #631. [Browse open `lane:agents` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aagents%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — #617 merged via #627. [Browse open `lane:agents` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aagents%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — [Browse open `lane:agents` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aagents%22+label%3A%22difficulty%3Amedium%22).

---

## ui lane

*Web dashboard under `src/presentation/web/`, Storybook stories, Playwright e2e.*

### goodFirst

- _No curated issues right now_ — #619 merged via #633; #620 merged via #635. [Browse open `lane:ui` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aui%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — #621 closed as not planned. [Browse open `lane:ui` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aui%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — [Browse open `lane:ui` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aui%22+label%3A%22difficulty%3Amedium%22).

---

## cli lane

*Commander commands, terminal UX, structured output under `src/presentation/cli/`.*

### goodFirst

- _No curated issues right now_ — #622 merged via #630. [Browse open `lane:cli` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Acli%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — #623 was deleted. [Browse open `lane:cli` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Acli%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — [Browse open `lane:cli` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Acli%22+label%3A%22difficulty%3Amedium%22).

---

## infra lane

*SQLite, ports/adapters, queues, schedulers, GitHub plumbing under `packages/core/src/infrastructure/`.*

### goodFirst

- _No curated issues right now_ — [Browse open `lane:infra` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Ainfra%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — #624 closed as not planned. [Browse open `lane:infra` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Ainfra%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — #625 closed as not planned. [Browse open `lane:infra` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Ainfra%22+label%3A%22difficulty%3Amedium%22).

---

## The list is empty — now what?

An empty page here does not mean there is nothing to do; it means nobody has curated this Markdown file lately. Three reliable next steps:

1. Search the live tracker for [open `good first issue` labels](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — anything there is fair game, and it is kept current by the repo itself rather than by hand.
2. Drop into [Discord](https://discord.gg/ES6tdVFfur) and ask "what should I work on?" — a maintainer will route you.
3. Open a [Good First Issue](./.github/ISSUE_TEMPLATE/good-first-issue.yml) yourself if you spot something a future contributor could pick up. The issue templates collect lane, difficulty and acceptance criteria, and `label-by-lane.yml` grooms it on open.

Re-curating this file is itself a good first issue in the **docs** lane.

---

## Related

- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute
- [ROADMAP.md](./ROADMAP.md) — what's shipping next
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 10-minute tour of the codebase
