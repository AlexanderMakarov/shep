# Adding a LangGraph Node to the Feature Agent

> **Scope**
>
> This guide is about adding a **node to the FeatureAgent LangGraph graph** — a new phase in the
> analyze → requirements → research → plan → implement → merge pipeline.
>
> It is **not** about adding a new agent provider (Claude Code, Kimi Code, Codex CLI…). For that
> see [adding-agent-types.md](./adding-agent-types.md).
>
> The graph lives at `packages/core/src/infrastructure/services/agents/feature-agent/`. There is no
> `infrastructure/agents/` directory and no `langgraph/`, `graphs/` or `tools/` directory — every
> path below is real and can be opened.
>
> See [AGENTS.md](../../AGENTS.md#current-implementation) for the wider implementation picture.

---

## Settings-Driven Agent Resolution (MANDATORY)

> **Before adding any node, understand this rule.** The agent executor used by any node, graph or
> worker is ALWAYS resolved from settings — `IAgentExecutorProvider.getExecutor()` or
> `AgentExecutorFactory.createExecutor()`, both driven by `settings.agent.type`. A node **receives**
> an `IAgentExecutor`; it never constructs one, never imports a provider SDK, and never names a
> model. See [AGENTS.md — Settings-Driven Agent Resolution](../../AGENTS.md#settings-driven-agent-resolution-mandatory).

Concretely, this is why every node in the tree is a **factory** that takes the executor as an
argument. If you find yourself writing `new ChatAnthropic(...)`, `new OpenAI(...)` or any other
model client inside a node, stop — that is the rule above being broken, and the package you would
need is not even a dependency of this repository.

---

## Anatomy of a node

A node is a function `(state: FeatureAgentState) => Promise<Partial<FeatureAgentState>>`, produced
by a factory that closes over its dependencies. The whole of `analyze.node.ts` is:

```typescript
// packages/core/src/infrastructure/services/agents/feature-agent/nodes/analyze.node.ts

import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { executeNode, type MemorySelector } from './node-helpers.js';
import { buildAnalyzePrompt } from './prompts/analyze.prompt.js';

/**
 * Creates the analyze node that explores the repository and writes
 * codebase analysis, complexity estimate, and affected areas to spec.yaml.
 */
export function createAnalyzeNode(executor: IAgentExecutor, selectMemory?: MemorySelector) {
  return executeNode('analyze', executor, buildAnalyzePrompt, selectMemory);
}
```

That is the shape to copy. Everything that is the same for every phase lives in
`executeNode`; the node file only says **what the phase is called** and **which prompt it sends**.

### What `executeNode` gives you

`nodes/node-helpers.ts`:

```typescript
export function executeNode(
  nodeName: string,
  executor: IAgentExecutor,
  buildPrompt: (state: FeatureAgentState, log: NodeLogger) => string,
  selectMemory?: MemorySelector
): (state: FeatureAgentState) => Promise<Partial<FeatureAgentState>>;
```

The returned function handles, in order:

| Concern                | What happens                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logging + log context   | `createNodeLogger(nodeName)`, `log.activate()` sets the phase so executor output inherits the prefix                                                                                |
| Heartbeat + lifecycle   | `reportNodeStart(nodeName)` and `await updateNodeLifecycle(nodeName)`                                                                                                               |
| Resume short-circuit    | If `getCompletedPhases(state.specDir)` already contains `nodeName`, the node returns early instead of re-running the agent (approved → continue; rejected → `_needsReexecution: true`) |
| Security pre-check      | `resolveEffectiveSecurityMode` + `checkSecurityDisposition`; `deny` throws `SecurityViolationError`, `approval_required` calls `interrupt()`                                        |
| Project-memory scoping  | `applyMemorySelection(state, nodeName, selectMemory)` narrows `state.projectMemory` to this phase before the prompt is built                                                        |
| Prompt assembly         | `buildResumeContext(state.resumeReason) + buildPrompt(stateForPrompt, log)`                                                                                                        |
| Executor options        | `buildExecutorOptions(state, undefined, nodeName)` — cwd (worktree, else repo), `maxTurns: 5000`, per-stage timeout, pinned model, MCP config path                                   |
| Phase timing            | `recordPhaseStart` / `recordPhaseEnd` with prompt, model, token usage, cost and exit code                                                                                          |
| Completion bookkeeping  | `removeSpecCommitsIfNeeded`, then `markPhaseComplete(state.specDir, nodeName, log)` **before** any interrupt                                                                        |
| Human-in-the-loop       | `shouldInterrupt(nodeName, state.approvalGates)` → the single `interrupt()` call in the execution path                                                                              |
| Errors                  | LangGraph control-flow errors (`isGraphBubbleUp`) are re-thrown untouched; anything else is logged, recorded as `exitCode: 'error'`, and re-thrown as `[nodeName] <message>`         |

Two consequences worth internalising:

1. **A failing node throws — it does not return `{ error }`.** That is deliberate: throwing stops
   LangGraph from checkpointing the node as completed, so a resume re-executes it from the top.
   Only the validate nodes put errors into state, because for them "invalid" is a normal outcome
   that routes to a repair node.
2. **Approval gates are not yours to implement.** `shouldInterrupt` already maps
   `requirements → allowPrd`, `plan → allowPlan`, `merge → allowMerge`. Other node names never
   interrupt. If your phase needs a gate, extend `shouldInterrupt` and the `ApprovalGates` model in
   TypeSpec — do not call `interrupt()` yourself from a node body.

### When `executeNode` is not enough

Some nodes do more than "send a prompt and mark the phase done" — they parse the agent's answer and
call a use case. Those take a deps object instead, and own their own try/catch. `extract-memory.node.ts`
is the model:

```typescript
export interface ExtractMemoryNodeDeps {
  executor: IAgentExecutor;
  recordProjectMemory: Pick<RecordProjectMemoryUseCase, 'execute'>;
}

export function createExtractMemoryNode(deps: ExtractMemoryNodeDeps) {
  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    const log = createNodeLogger(NODE_NAME);
    // ...
    const result = await deps.executor.execute(prompt, options);
    const { entries, failure } = parseMemoryEntries(result.result);
    // ...
  };
}
```

Note that the executor is still **injected**, and that the deps are typed structurally
(`Pick<UseCase, 'execute'>`) so tests can pass a stub without constructing the real use case.

---

## Step-by-step

### Step 1 — Declare your state channels

State is a LangGraph `Annotation.Root` in `state.ts`. The exported symbols are
`FeatureAgentAnnotation` (the annotation) and `FeatureAgentState` (the inferred state type) —
there is no `FeatureState` and no `FeatureStateType`.

```typescript
// packages/core/src/infrastructure/services/agents/feature-agent/state.ts

import { Annotation } from '@langchain/langgraph';

export const FeatureAgentAnnotation = Annotation.Root({
  featureId: Annotation<string>,
  repositoryPath: Annotation<string>,
  specDir: Annotation<string>,
  worktreePath: Annotation<string>,
  currentNode: Annotation<string>,
  error: Annotation<string | null>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => null,
  }),
  messages: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  // ...
});

export type FeatureAgentState = typeof FeatureAgentAnnotation.State;
```

Channel patterns actually used in the file:

| Pattern             | Reducer                                              | Example in `state.ts`                     |
| ------------------- | ---------------------------------------------------- | ----------------------------------------- |
| Bare value          | none (last write wins)                               | `featureId: Annotation<string>`           |
| Last-write-wins     | `(_prev, next) => next`                              | `validationRetries`, `lastValidationErrors` |
| Keep-unless-defined | `(prev, next) => (next !== undefined ? next : prev)` | `error`, `prUrl`, `prNumber`              |
| Coalescing          | `(_prev, next) => next ?? _prev`                     | `model`, `projectMemory`, `approvalGates` |
| Accumulating array  | `(prev, next) => [...prev, ...next]`                 | `messages`, `feedbackHistory`             |

Most nodes need **no new channel at all**: phase output goes into the spec YAML files under
`state.specDir`, and the next phase reads it back with `readSpecFile`. Add a channel only for
something the *graph* must branch on (a counter, a flag, a URL), not for the phase's artefact.

Channels prefixed with `_` (`_approvalAction`, `_rejectionFeedback`, `_needsReexecution`) are
control plumbing set by `Command({ update })` on resume — read them, do not repurpose them.

### Step 2 — Write the prompt builder

Prompt builders live in `nodes/prompts/` as `<phase>.prompt.ts` and export
`build<Phase>Prompt(state: FeatureAgentState): string`. They are pure string builders — no I/O
beyond `readSpecFile`, no executor.

```typescript
// packages/core/src/infrastructure/services/agents/feature-agent/nodes/prompts/analyze.prompt.ts

import { readSpecFile, buildCommitPushBlock } from '../node-helpers.js';
import { buildProjectMemorySection } from './project-memory-section.js';
import type { FeatureAgentState } from '../../state.js';

export function buildAnalyzePrompt(state: FeatureAgentState): string {
  const existingSpec = readSpecFile(state.specDir, 'spec.yaml');

  return `You are a senior software architect performing the ANALYSIS phase of feature development.

${buildProjectMemorySection(state)}## Your Task
...
## Output Instructions

Write your analysis to: ${state.specDir}/spec.yaml
`;
}
```

Conventions to keep:

- Start with `buildProjectMemorySection(state)` so the phase sees the repository's accumulated
  "Shep Brain" memory. It renders to an empty string when there is none.
- Tell the agent the **absolute path** of the YAML file it must write, built from `state.specDir`.
- Use `buildCommitPushBlock({...})` from `node-helpers.ts` rather than hand-writing git
  instructions — it honours the `commitSpecs` setting and appends `COMMIT_CO_AUTHOR`.
- Keep the prompt a template literal in its own file. Prompt tests
  (`tests/unit/.../nodes/prompts/*.test.ts`) assert on substrings, and a prompt hidden inside a node
  body cannot be tested that way.

### Step 3 — Add an output schema (YAML phases) or a parser (free-form phases)

There are two ways a phase's output is made trustworthy. Pick the one that matches.

**a) The phase writes a YAML artefact** → add a validator under `nodes/schemas/`, named
`<artefact>.schema.ts`, exporting `validateX(data: unknown): ValidationResult`. Build it from the
shared predicates in `nodes/schemas/validation.ts` (`requireString`, `requireInteger`,
`requireNonEmptyArray`, `requireArrayOfShape`) so error strings read consistently — the repair node
feeds them straight back to the agent.

```typescript
// packages/core/src/infrastructure/services/agents/feature-agent/nodes/schemas/research.schema.ts

export function validateResearch(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    errors.push('YAML parsed to null or non-object');
    return { valid: false, errors };
  }
  const d = data as Record<string, unknown>;
  requireString(d, 'name', errors);
  requireString(d, 'summary', errors);
  requireString(d, 'content', errors);
  // ...
  return { valid: errors.length === 0, errors };
}
```

**b) The phase returns structured data inside free-form agent text** → add a
`<phase>-output-parser.ts` next to the node (`evidence-output-parser.ts`,
`extract-memory-output-parser.ts`, `merge/merge-output-parser.ts` are the three that exist). Use
`extractFencedJsonArray` from `nodes/fenced-json.ts`, validate each record, and **distinguish
"nothing to report" from "could not read the answer"** — that is why the parsers return a `failure`
alongside the records:

```typescript
export interface ParsedEvidenceRecords {
  /** Valid Evidence records found. */
  records: Evidence[];
  /** Set only when no JSON array could be read from the output at all. */
  failure?: FencedJsonFailure;
}
```

### Step 4 — Create the node file

`nodes/<phase>.node.ts`, exporting `create<Phase>Node`:

```typescript
// packages/core/src/infrastructure/services/agents/feature-agent/nodes/my-phase.node.ts

import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { executeNode, type MemorySelector } from './node-helpers.js';
import { buildMyPhasePrompt } from './prompts/my-phase.prompt.js';

/**
 * Creates the my-phase node that <does X> and writes <artefact>.yaml.
 */
export function createMyPhaseNode(executor: IAgentExecutor, selectMemory?: MemorySelector) {
  return executeNode('my-phase', executor, buildMyPhasePrompt, selectMemory);
}
```

If the phase needs a per-stage timeout, add its node name to `STAGE_TIMEOUT_KEY` in
`node-helpers.ts` and the matching field to the `StageTimeouts` TypeSpec model; otherwise it gets
`DEFAULT_STAGE_TIMEOUT_MS` (30 minutes).

### Step 5 — Register the node on the graph

`feature-agent-graph.ts` builds the `StateGraph` over `FeatureAgentAnnotation` and calls each node
factory with the injected executor:

```typescript
// packages/core/src/infrastructure/services/agents/feature-agent/feature-agent-graph.ts

export interface FeatureAgentGraphDeps {
  executor: IAgentExecutor;
  mergeNodeDeps?: Omit<MergeNodeDeps, 'executor'>;
  extractMemoryDeps?: Omit<ExtractMemoryNodeDeps, 'executor'>;
  selectProjectMemory?: MemorySelector;
}

export function createFeatureAgentGraph(
  depsOrExecutor: FeatureAgentGraphDeps | IAgentExecutor,
  checkpointer?: BaseCheckpointSaver
) {
  const deps: FeatureAgentGraphDeps =
    'execute' in depsOrExecutor ? { executor: depsOrExecutor } : depsOrExecutor;
  const { executor, selectProjectMemory } = deps;

  const graph = new StateGraph(FeatureAgentAnnotation)
    // --- Producer nodes ---
    .addNode('analyze', createAnalyzeNode(executor, selectProjectMemory))
    .addNode('requirements', createRequirementsNode(executor, selectProjectMemory))
    .addNode('research', createResearchNode(executor, selectProjectMemory))
    .addNode('plan', createPlanNode(executor, selectProjectMemory))
    .addNode('implement', createImplementNode(executor, selectProjectMemory))
    // --- Validate nodes ---
    .addNode(
      'validate_spec_analyze',
      createValidateNode('spec.yaml', validateSpecAnalyze, 'requirements')
    )
    // --- Repair nodes ---
    .addNode('repair_spec_analyze', createRepairNode('spec.yaml', executor))
    // --- Edges ---
    .addEdge(START, 'analyze')
    .addEdge('analyze', 'validate_spec_analyze')
    .addConditionalEdges(
      'validate_spec_analyze',
      routeValidation('requirements', 'repair_spec_analyze', 'analyze')
    )
    .addEdge('repair_spec_analyze', 'validate_spec_analyze');
  // ...
}
```

The factory also accepts a bare `IAgentExecutor` as a legacy signature — `'execute' in depsOrExecutor`
is the discriminator. New call sites should pass `FeatureAgentGraphDeps`.

Nodes wired conditionally (merge, extract_memory) are added only when their deps are supplied, so a
graph built without `mergeNodeDeps` simply ends after `implement`. Follow that pattern if your node
depends on something the worker may not have.

### Step 6 — Wire the edges

Three edge kinds are in use.

**Direct edge** — always A → B:

```typescript
graph.addEdge('analyze', 'validate_spec_analyze');
graph.addEdge('repair_research', 'validate_research');
```

**Validation routing** — the `routeValidation(onPass, onRepair, onExhausted)` helper in
`feature-agent-graph.ts` sends a passing artefact forward, a failing one to its repair node, and a
repeatedly failing one back to the producer:

```typescript
.addConditionalEdges(
  'validate_research',
  routeValidation('plan', 'repair_research', 'research')
)
```

**Re-execution routing** — `routeReexecution(selfNode, nextNode)` handles resume after a rejected
approval gate. The node returned early with `_needsReexecution: true`; this edge routes back to it
for a fresh invocation, which is what avoids the stale-interrupt replay bug:

```typescript
.addConditionalEdges('plan', routeReexecution('plan', 'validate_plan_tasks'))
```

If your node sits behind an approval gate, it must be reached through `routeReexecution`, not a
direct edge.

### Step 7 — Write the tests (TDD — these come first)

Real locations in this repo:

| What you are testing | Where the test goes                                                             |
| -------------------- | ------------------------------------------------------------------------------- |
| A node               | `tests/unit/infrastructure/services/agents/feature-agent/nodes/<name>.node.test.ts` |
| A prompt builder     | `tests/unit/infrastructure/services/agents/feature-agent/nodes/prompts/<name>.prompt.test.ts` |
| A schema validator   | `tests/unit/infrastructure/services/agents/feature-agent/nodes/schemas/<name>.schema.test.ts` |
| An output parser     | `tests/unit/infrastructure/services/agents/feature-agent/nodes/<name>-output-parser.test.ts` |
| Graph wiring / flow  | `tests/unit/infrastructure/services/agents/langgraph/feature-agent-graph.test.ts` |

Note the split: **node, prompt, schema and parser tests live under `.../agents/feature-agent/nodes/`,
while graph-level tests live under `.../agents/langgraph/`.** Put a new test beside its neighbours
rather than inventing a third location.

Because the node factory takes the executor as an argument, a node test needs no module mocking —
pass a fake:

```typescript
const executor: IAgentExecutor = {
  agentType: 'dev' as AgentType,
  execute: vi.fn().mockResolvedValue({ result: 'ok' }),
  executeStream: vi.fn(),
  supportsFeature: () => false,
};

const node = createMyPhaseNode(executor);
const update = await node(state);

expect(update.currentNode).toBe('my-phase');
expect(executor.execute).toHaveBeenCalledWith(
  expect.stringContaining('my-phase'),
  expect.objectContaining({ cwd: state.worktreePath })
);
```

Run them with:

```bash
pnpm test:unit -t "my-phase"     # vitest filters by test NAME with -t; there is no --grep
pnpm test:unit                   # whole unit suite
pnpm typecheck
```

---

## File organisation

```
packages/core/src/infrastructure/services/agents/feature-agent/
├── state.ts                          # FeatureAgentAnnotation + FeatureAgentState
├── feature-agent-graph.ts            # createFeatureAgentGraph(deps, checkpointer?)
├── fast-feature-agent-graph.ts       # --fast variant
├── exploration-agent-graph.ts        # --explore variant
├── feature-agent-worker.ts           # detached worker entry point (builds the deps)
├── feature-agent-process.service.ts  # background process management
├── heartbeat.ts                      # reportNodeStart
├── log-context.ts                    # setCurrentPhase / getLogPrefix
├── phase-timing-context.ts           # recordPhaseStart / recordPhaseEnd
├── lifecycle-context.ts              # updateNodeLifecycle
└── nodes/
    ├── node-helpers.ts               # executeNode + every shared helper
    ├── node-helpers.adapter.ts       # INodeHelpers port adapter for use cases
    ├── analyze.node.ts
    ├── requirements.node.ts
    ├── research.node.ts
    ├── plan.node.ts
    ├── implement.node.ts
    ├── fast-implement.node.ts
    ├── evidence.node.ts
    ├── extract-memory.node.ts
    ├── validate.node.ts
    ├── repair.node.ts
    ├── fenced-json.ts                # extractFencedJsonArray
    ├── security-pre-check.ts
    ├── prompts/                       # build<Phase>Prompt builders
    ├── schemas/                       # validate<Artefact> + shared validation.ts
    └── merge/                         # merge.node.ts, merge-output-parser.ts, ci-*.ts
```

---

## Checklist

- [ ] New state channels (if any) added to `FeatureAgentAnnotation` with the right reducer
- [ ] Prompt builder added under `nodes/prompts/` as `build<Phase>Prompt(state)`
- [ ] Output schema under `nodes/schemas/` **or** an `-output-parser.ts` next to the node
- [ ] Node file exports `create<Phase>Node(executor, selectMemory?)` and receives — never
      constructs — its executor
- [ ] Node registered in `feature-agent-graph.ts` with `.addNode(...)` and reachable by an edge
- [ ] Gated nodes routed through `routeReexecution`; validated artefacts through `routeValidation`
- [ ] Per-stage timeout added to `STAGE_TIMEOUT_KEY` if the phase needs one
- [ ] Unit tests written first, in the locations listed in Step 7
- [ ] Graph-flow test updated in `tests/unit/.../langgraph/feature-agent-graph.test.ts`
- [ ] `pnpm test:unit` and `pnpm typecheck` green
- [ ] No provider SDK imported anywhere in `nodes/`

---

## Maintaining This Document

**Update when:**

- The node factory or `executeNode` contract changes
- New routing helpers are added to `feature-agent-graph.ts`
- Test directory conventions move
- LangGraph's API changes

**Related docs:**

- [adding-agent-types.md](./adding-agent-types.md) — adding a new agent **provider**
- [AGENTS.md](../../AGENTS.md) — agent reference
- [agent-system.md](../architecture/agent-system.md) — full agent architecture
- [langgraph-agents.md](../guides/langgraph-agents.md) — working with agents
- [tdd-guide.md](./tdd-guide.md) — TDD workflow
