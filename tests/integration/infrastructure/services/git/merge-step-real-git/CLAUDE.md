# Merge Step Real-Git Integration Tests

Integration tests for `createMergeNode` using real git repositories in isolated temp directories.

## Test Matrix

| Test                        | push  | openPr | allowMerge | remote | Expected     | Status   |
| --------------------------- | ----- | ------ | ---------- | ------ | ------------ | -------- |
| commit-only-with-gate       | false | false  | false      | yes    | interrupt    | GREEN    |
| local-merge-no-push         | false | false  | true       | yes    | local merge  | GREEN    |
| push-no-pr-merge            | true  | false  | true       | yes    | push + merge | GREEN    |
| push-pr-with-gate           | true  | true   | false      | yes    | interrupt    | GREEN    |
| push-pr-auto-merge          | true  | true   | true       | yes    | PR merge     | GREEN    |
| no-remote-override-merge    | true  | true   | true       | no     | local merge  | GREEN    |
| no-remote-local-merge       | false | false  | true       | no     | local merge  | GREEN    |
| undefined-gates-silent-skip | -     | -      | undefined  | yes    | no merge     | GREEN    |

## Merge confirmation

Local merges are verified against local Git refs before cleanup. PR merges are
confirmed against GitHub's remote PR state because the local base can be stale.
A successful `gh pr merge` command may only enqueue the PR; the service rejects
unconfirmed completion and preserves the branch and worktree. The PR tests cover
both queued and completed remote merges, including a deliberately stale local base.

## File Map

| File                  | Contents                                            |
| --------------------- | --------------------------------------------------- |
| `setup.ts`            | Git harness, exec adapters, deps/state factories    |
| `helpers.ts`          | `assertMergeLanded`, `assertMergeNotLanded`         |
| `fixtures.ts`         | `FAKE_PR_URL`, `makeMockExecutor`                   |
| `smoke.test.ts`       | Infrastructure smoke tests (harness, exec, specDir) |
| `gate-tests.test.ts`  | Interrupt tests (allowMerge=false)                  |
| `local-merge.test.ts` | Local merge and verification regressions            |
| `push-merge.test.ts`  | Push and local merge regression                 |
| `pr-merge.test.ts`    | Queued and confirmed remote PR merges                     |
| `skip-merge.test.ts`  | No-merge path (approvalGates=undefined)             |

## Adding a Test

1. Pick or create the test file matching your scenario category.
2. Import shared setup from `./setup.js`, helpers from `./helpers.js`, constants from `./fixtures.js`.
3. Follow the existing `beforeAll`/`afterAll`/`afterEach` pattern for settings init and cleanup.
4. Use `createGitHarness()` for remote scenarios, `createLocalOnlyHarness()` for no-remote.
5. Run: `pnpm test:int -- tests/integration/infrastructure/services/git/merge-step-real-git/`
