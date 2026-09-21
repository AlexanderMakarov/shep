# CI/CD Pipeline

Automated build, test, and release pipeline using GitHub Actions.

## Pipeline Overview

```
Push/PR to main or develop:
┌──────────┬───────────┬────────────┬───────────┬───────────┬───────────┬───────────┐
│   Lint   │ Typecheck │ Unit Tests │  E2E CLI  │  E2E TUI  │  E2E Web  │ Storybook │
└──────────┴───────────┴────────────┴───────────┴───────────┴───────────┴───────────┘
┌──────────┬─────────┬──────────────────┐
│ Gitleaks │ Semgrep │ Security Enforce │
└──────────┴─────────┴──────────────────┘
                            (all run in parallel)

On PR only:
┌──────────────────────────────────────────────────────────────────────┐
│  PR Check  │  commitlint over the PR range + PR-title check         │
└──────────────────────────────────────────────────────────────────────┘

On push to main only (after ALL jobs pass, including security):
┌───────────┐
│  Release  │  → npm publish + GitHub release + `v<version>` tag
└───────────┘

On published GitHub Release (created by Release) or manual dispatch:
┌────────────────┐
│ Docker Publish │  → build image + push to ghcr.io
└────────────────┘
```

## Jobs

### Parallel Jobs (All Branches)

All of these live in `ci.yml` and run on Node 22.

| Job                       | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| **Lint & Format**         | `pnpm lint`, `pnpm format:check`, `pnpm tsp:compile`                        |
| **Type Check**            | `pnpm generate`, fails if the regenerated output differs from what is committed, then `pnpm typecheck` |
| **Unit Tests**            | `pnpm tsp:compile`, then `test:unit` + `test:int` (ubuntu + windows matrix) |
| **E2E CLI**               | `pnpm build:release`, then `test:e2e:cli` (ubuntu + windows matrix)         |
| **E2E (TUI)**             | `pnpm build:release`, then `test:e2e:tui`                                   |
| **E2E (Web)**             | `pnpm build:release`, Playwright chromium install, then `test:e2e:web`      |
| **Storybook Build**       | `pnpm check:stories`, then `pnpm build:storybook`                           |
| **Electron**              | Desktop installers for macOS/Windows/Linux (matrix), uploaded as artifacts  |
| **Electron Apps-Only**    | Second matrix building the `apps-only` shell variant                        |

> **Note:** Docker images are not built in the CI matrix. They are published by
> the separate [`docker-publish.yml`](../../.github/workflows/docker-publish.yml)
> workflow, which fires on the **published GitHub Release** — deliberately not on
> the `v*` tag push (see [Docker Images](#docker-images)).

### Security Jobs (All Branches)

Security scanners run in parallel and **block releases on main**:

| Scanner               | Tool                                                            | Severity Filter |
| --------------------- | --------------------------------------------------------------- | --------------- |
| **Gitleaks**          | Secret detection (API keys, passwords, tokens)                  | All findings    |
| **Semgrep**           | SAST rules (`p/typescript`, `p/javascript`, `p/security-audit`) | All findings    |
| **Security Enforce**  | `pnpm dev:cli security enforce --output json` — supply-chain/governance posture | Gates release |

> **Note:** Gitleaks uses the CLI directly (not gitleaks-action) because the GitHub Action requires a paid license for organizations.

A fourth job, **Security Summary**, depends on Gitleaks and Semgrep. It is not a
scanner: it runs only on pull requests and only when one of those two failed, and
posts (or updates) a single tagged PR comment summarising which scanner failed.

### PR Check Job (PRs Only)

[`pr-check.yml`](../../.github/workflows/pr-check.yml) runs on
`pull_request: [opened, synchronize, reopened, edited]` and does two things:

- runs **commitlint** over the PR's commit range
- validates the **PR title** with `amannn/action-semantic-pull-request@v5`, with
  `requireScope: false` — a scope is optional

### Claude Code (On Demand)

[`claude.yml`](../../.github/workflows/claude.yml) is **not** an automatic PR
reviewer. It is an on-demand responder: it triggers on `issue_comment`,
`pull_request_review_comment`, `pull_request_review` and `issues`, and its job
only runs when the comment, review or issue body/title contains **`@claude`**.
It then runs `anthropics/claude-code-action@v1`, which carries out whatever the
mentioning comment asked for.

**Required Secret:** `CLAUDE_CODE_OAUTH_TOKEN` (org-level)

### Release Job (Main Only)

Runs after **all parallel jobs pass, including security scanners**. Uses [semantic-release](https://semantic-release.gitbook.io/) to:

1. **Analyze commits** - Determine version bump from conventional commits
2. **Generate changelog** - Create release notes from commits
3. **Update CHANGELOG.md** - Append new release section
4. **Publish to npm** - `@shepai/cli` package
5. **Create GitHub release** - With changelog as release notes (triggers `Docker Publish`)
6. **Commit changes** - `chore(release): <version> [skip ci]`
7. **Push `v<version>` tag** - versioned tag pointing at the release commit

Docker images are built and pushed by the separate
[`docker-publish.yml`](../../.github/workflows/docker-publish.yml) workflow,
which fires on the **published GitHub Release** (and can be run manually via
workflow dispatch). It is deliberately NOT triggered by the `v*` tag push:
semantic-release tags the `chore(release): … [skip ci]` commit, and GitHub
Actions skips workflows for tags pointing at a `[skip ci]` commit. The
`release` event is immune to `[skip ci]`, so it fires reliably.

## Docker Images

### Registry

Images are published to GitHub Container Registry (ghcr.io):

```
ghcr.io/shep-ai/shep
```

### Tagging Strategy

| Trigger                      | Tags                                                    |
| ---------------------------- | ------------------------------------------------------- |
| Published Release (`v*` tag) | `latest`, `1.2.3`, `1.2`, `1`, `sha-<full-commit-sha>` |
| Manual dispatch (main)       | `latest`, `sha-<full-commit-sha>`                       |

Tags come from `docker/metadata-action@v5` (`type=semver` ×3, `type=sha` with a
`sha-` prefix and full format, plus `latest` on the default branch or a `v*` tag).

### Pull & Run

```bash
# Latest stable
docker pull ghcr.io/shep-ai/shep:latest
docker run ghcr.io/shep-ai/shep --version

# Specific version
docker pull ghcr.io/shep-ai/shep:v1.0.0

# Specific commit (for testing)
docker pull ghcr.io/shep-ai/shep:sha-abc123...
```

### Image Details

- **Base**: `node:22-alpine` (~180MB)
- **Final size**: ~185MB
- **User**: Non-root `shep` (UID 1001)
- **Entrypoint**: `node dist/src/presentation/cli/index.js`

## Release Process

### Automatic Releases

Releases are fully automated based on [Conventional Commits](https://www.conventionalcommits.org/):

| Commit Type       | Version Bump  | Example                                     |
| ----------------- | ------------- | ------------------------------------------- |
| `feat:`           | Minor (0.X.0) | `feat(cli): add analyze command`            |
| `fix:`            | Patch (0.0.X) | `fix(agents): resolve memory leak`          |
| `perf:`           | Patch         | `perf(db): optimize query performance`      |
| `refactor:`       | Patch         | `refactor(domain): simplify state management` |
| `BREAKING CHANGE` | Major (X.0.0) | Footer in commit message                    |

Commits that **don't** trigger releases:

- `docs:`, `style:`, `test:`, `build:`, `ci:`, `chore:`

### Manual Release (Not Recommended)

If needed, you can trigger a release manually:

```bash
# Ensure you're on main with latest changes
git checkout main && git pull

# Run semantic-release in dry-run mode first
npx semantic-release --dry-run

# If satisfied, run actual release (requires NPM_TOKEN)
NPM_TOKEN=xxx GITHUB_TOKEN=xxx npx semantic-release
```

## Configuration Files

| File                                  | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `.github/workflows/ci.yml`            | Main CI/CD workflow (lint, typecheck, tests, storybook, electron, security, release) — `push`/`pull_request` on `main` and `develop` |
| `.github/workflows/pr-check.yml`      | commitlint over the PR range + PR-title check — `pull_request` |
| `.github/workflows/claude.yml`        | On-demand Claude Code responder — `issue_comment`, `pull_request_review_comment`, `pull_request_review`, `issues`, gated on an `@claude` mention |
| `.github/workflows/docker-publish.yml`| Build & push the image to ghcr.io — `release: [published]` + `workflow_dispatch` |
| `.github/workflows/deploy.yml`        | Bumps `core.pin` in the `shep-ai/shep-cloud` repo to the new CLI SHA — `push` to `main` |
| `.github/workflows/shep-e2e.yml`      | Full `feat new → feat ls → feat show` lifecycle across platforms/agents — hourly `schedule` + `workflow_dispatch` |
| `.github/workflows/agent-request.yml` | Free-form "describe a fix, get a PR" agent run — `workflow_dispatch` only |
| `.github/workflows/label-by-lane.yml` | Runs `shep contributors groom-issue` to label new issues — `issues: [opened]` |
| `.github/workflows/welcome-first-time-contributor.yml` | Runs `shep contributors welcome-pr` — `pull_request: [opened]` (on open, **not** on merge) |
| `.github/workflows/generate-good-first-issues.yml` | Good-first-issue generation — **schedule disabled**; `workflow_dispatch` only |
| `release.config.mjs`                  | semantic-release plugins and settings                |
| `Dockerfile`                          | Multi-stage build for production image               |
| `.dockerignore`                       | Files excluded from Docker build context             |
| `commitlint.config.mjs`               | Commit message validation rules                      |

## Limitations & Considerations

### Docker Builds

- The image is **never** built on a PR — `docker-publish.yml` only runs on a
  published release or a manual dispatch. A Dockerfile change therefore is not
  exercised by CI until it is on `main` and released.
- The one build that does run uses `docker/build-push-action@v6` with
  `cache-from: type=gha` / `cache-to: type=gha,mode=max`, on top of the
  multi-stage Dockerfile.

### Concurrency

`ci.yml` groups runs by workflow + ref with
`cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`:

- PRs and `develop` cancel their own in-flight runs
- `main` runs are never cancelled
- The Release job is skipped for commits whose message contains `[skip ci]`,
  which is how semantic-release's own release commit avoids re-triggering it

### Required Secrets

| Secret                    | Purpose                               | Where to Set         |
| ------------------------- | ------------------------------------- | -------------------- |
| `GITHUB_TOKEN`            | Automatic, provided by GitHub Actions | Built-in             |
| `NPM_TOKEN`               | Publishing to npm registry            | Repository secrets   |
| `RELEASE_TOKEN`           | PAT used by semantic-release to create the release, and by `docker-publish.yml` to push to ghcr.io (`GITHUB_TOKEN` 403s on the first org package publish) | Repository secrets |
| `CLAUDE_CODE_OAUTH_TOKEN` | `@claude` responder + agent-request workflow | Organization secrets |
| `CURSOR_API_KEY`          | Cursor agent in the scheduled `shep-e2e` run | Repository secrets |
| `SHEP_CLOUD_PAT`          | `deploy.yml` push to the `shep-cloud` repo | Repository secrets |
| `SLACK_WEBHOOK`           | semantic-release Slack release notification | Repository secrets |

### Branch Protection

Recommended settings for `main`:

- Require status checks: `Lint & Format`, `Type Check`, `Unit Tests (…)`, all E2E jobs, `Storybook Build`, and the `Gitleaks` / `Semgrep` / `Security Enforce` jobs
- Require branches to be up to date
- Require linear history (optional, for cleaner git log)

## Troubleshooting

### Release Not Triggered

1. Check commit messages follow conventional format
2. Ensure push is to `main` branch
3. Verify commit doesn't contain `[skip ci]`
4. Check if commit type triggers a release (see table above)

### Docker Build Fails

1. Check `.dockerignore` isn't excluding required files
2. Verify `pnpm-lock.yaml` is committed
3. Check Node.js version matches `package.json` engines

### npm Publish Fails

1. Verify `NPM_TOKEN` secret is set and valid
2. Check package name isn't taken on npm
3. Ensure version in `package.json` wasn't manually bumped

## Local Testing

### Test Docker Build

```bash
docker build -t shep-cli .
docker run shep-cli --version
```

### Test Release (Dry Run)

```bash
npx semantic-release --dry-run
```

### Validate Commit Messages

```bash
echo "feat(cli): add new command" | npx commitlint
```

---

## Maintaining This Document

**Update when:**

- CI/CD workflow changes
- New jobs are added
- Docker configuration changes
- Release process modifications

**Related files:**

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [.github/workflows/pr-check.yml](../../.github/workflows/pr-check.yml)
- [.github/workflows/claude.yml](../../.github/workflows/claude.yml)
- [release.config.mjs](../../release.config.mjs)
- [Dockerfile](../../Dockerfile)
