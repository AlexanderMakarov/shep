# Working with LangGraph Agents

> **Implementation Status**
>
> The **FeatureAgent LangGraph graph** is implemented at `packages/core/src/infrastructure/services/agents/feature-agent/`. This guide covers the LangGraph concepts and the patterns this repository actually uses. Where a section describes something Shep does not do yet, it says so.
>
> See [AGENTS.md](../../AGENTS.md#current-implementation) for the full current implementation details.

---

## LangGraph Agent System

Guide to understanding and extending Shep's LangGraph-based agent system.

## Overview

Shep uses [LangGraph](https://www.langchain.com/langgraph) for agent orchestration. LangGraph
provides:

- **StateGraph**: Type-safe workflow definitions
- **Nodes**: Functions that process and update state
- **Edges**: Connections between nodes (direct or conditional)
- **Checkpoints**: Durable execution with persistence
- **Interrupts**: Human-in-the-loop pauses that survive a restart

Only `@langchain/core`, `@langchain/langgraph` and `@langchain/langgraph-checkpoint-sqlite` are
dependencies. **Shep does not depend on a model SDK such as `@langchain/anthropic`**, and nodes
never construct a model client — see [Nodes](#nodes) below.

## Where Things Live

| Concern               | Path                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------- |
| Feature agent graph   | `packages/core/src/infrastructure/services/agents/feature-agent/feature-agent-graph.ts` |
| Graph state           | `.../feature-agent/state.ts`                                                            |
| Nodes                 | `.../feature-agent/nodes/*.node.ts`                                                     |
| Shared node machinery | `.../feature-agent/nodes/node-helpers.ts`                                               |
| Prompt builders       | `.../feature-agent/nodes/prompts/`                                                      |
| Output schemas        | `.../feature-agent/nodes/schemas/`                                                      |
| Agent executors       | `.../agents/common/executors/`                                                          |
| Checkpointer factory  | `.../agents/common/checkpointer.ts`                                                     |
| Agent registry        | `.../agents/common/agent-registry.service.ts`                                           |

Other graphs live beside the feature agent: `fast-feature-agent-graph.ts`,
`exploration-agent-graph.ts`, and the `cluster-agent/`, `supervisor-agent/`, `dev-server-agent/`
and `analyze-repo/` directories.

## Quick Start

### Running the Graph

```typescript
import { createFeatureAgentGraph } from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';

// `executor` is an IAgentExecutor resolved from the configured agent —
// never constructed directly in graph or node code.
const graph = createFeatureAgentGraph({ executor }, createCheckpointer(dbPath));

const result = await graph.invoke(
  {
    featureId: 'feat-123',
    repositoryPath: '/path/to/repo',
    worktreePath: '/path/to/worktree',
    specDir: '/path/to/repo/specs/001-add-oauth',
  },
  { configurable: { thread_id: 'feat-123' } }
);

console.log(result.currentNode); // last node that ran
console.log(result.messages); // accumulated per-node log lines
```

`createFeatureAgentGraph(depsOrExecutor, checkpointer?)` accepts either a
`FeatureAgentGraphDeps` object or — for backwards compatibility — a bare `IAgentExecutor`. The
deps object carries the executor plus optional `selectProjectMemory`, `mergeNodeDeps` and
`extractMemoryDeps`. The merge and post-merge nodes are only wired into the graph when their deps
are supplied.

A `thread_id` is required: it is the key the checkpointer uses, and it is what makes resume after
an interrupt possible.

### Streaming Execution

```typescript
const stream = await graph.stream(input, { configurable: { thread_id: 'feat-123' } });

for await (const chunk of stream) {
  // Each chunk is keyed by node name and holds that node's state update.
  for (const [nodeName, update] of Object.entries(chunk)) {
    console.log(nodeName, update);
  }
}
```

## Core Concepts

### State

State is a typed object passed through the graph. Shep defines it once, in `state.ts`, as a
LangGraph annotation:

```typescript
import { Annotation } from '@langchain/langgraph';

export const FeatureAgentAnnotation = Annotation.Root({
  // Primitive channels
  featureId: Annotation<string>,
  repositoryPath: Annotation<string>,
  specDir: Annotation<string>,
  worktreePath: Annotation<string>,
  currentNode: Annotation<string>,

  // Channels with an explicit reducer and default
  error: Annotation<string | null>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => null,
  }),

  // Append-only channel
  messages: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type FeatureAgentState = typeof FeatureAgentAnnotation.State;
```

**Reducers**: define how a channel merges an update. Without a reducer the new value replaces the
old one. `messages` uses an append reducer so every node contributes a line; most scalar channels
use `(_prev, next) => next` or "keep the previous value when the update is undefined".

Note the naming: the annotation is `FeatureAgentAnnotation` and the derived type is
`FeatureAgentState`. There is no `FeatureState` or `FeatureStateType`.

### Nodes

A node is an async function that receives the current state and returns a **partial** state
update. In Shep, node modules do not export the function directly — they export a **factory** that
receives the executor:

```typescript
// nodes/analyze.node.ts
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { executeNode, type MemorySelector } from './node-helpers.js';
import { buildAnalyzePrompt } from './prompts/analyze.prompt.js';

export function createAnalyzeNode(executor: IAgentExecutor, selectMemory?: MemorySelector) {
  return executeNode('analyze', executor, buildAnalyzePrompt, selectMemory);
}
```

This is the single most important convention in the agent code:

- A node **never** constructs or chooses a model client. It receives an `IAgentExecutor`, which
  was resolved from the user's configured agent. That is what keeps Shep agent-agnostic.
- A node's own content is a **prompt builder** — `(state) => string` — living in `nodes/prompts/`.
- `executeNode(nodeName, executor, buildPrompt, selectMemory?)` in `nodes/node-helpers.ts`
  supplies everything else: lifecycle updates, phase timing, resume handling, the security
  pre-check, retry classification, and the approval interrupt.

Nodes that are not a straight prompt run — `validate`, `repair`, `merge`, `evidence` — still
follow the factory shape, for example
`createValidateNode(filename, schema, successorPhase?)`.

### Edges

**Direct edges**: always go from A to B.

```typescript
graph.addEdge('analyze', 'validate_spec_analyze');
```

**Conditional edges**: choose the destination from state. Shep builds these with small named
factories so the routing rule is testable on its own:

```typescript
graph.addConditionalEdges(
  'validate_spec_analyze',
  routeValidation('requirements', 'repair_spec_analyze', 'analyze')
);
```

`routeValidation(successNode, repairNode, producerNode?, maxRetries = 3)` sends a clean validation
forward and a failing one to the repair node. Once `maxRetries` repair attempts are exhausted it
clears the producer's recorded completion — so a later resume re-runs the producer from scratch
rather than skipping it — and throws.

### Tools

Shep does **not** use LangChain's `tool()` / `bindTools()` API. The agent already has its own
tools: Shep shells out to the configured coding agent through `IAgentExecutor`, and that agent
reads and writes files, runs commands, and talks to git on its own. Nodes communicate with it via
prompts and read the YAML files it produces.

If you are looking for the process-level helpers instead, `agents/common/executors/process-stream.ts`
exports `createLineAccumulator()` and `killProcessTree()`.

## Building a Graph

### Step 1: Define State

```typescript
// state.ts
import { Annotation } from '@langchain/langgraph';

export const MyWorkflowAnnotation = Annotation.Root({
  input: Annotation<string>,
  intermediate: Annotation<string | null>,
  output: Annotation<string | null>,
});

export type MyWorkflowState = typeof MyWorkflowAnnotation.State;
```

### Step 2: Create Nodes

```typescript
// nodes/process.node.ts
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { MyWorkflowState } from '../state.js';

export function createProcessNode(executor: IAgentExecutor) {
  return async (state: MyWorkflowState): Promise<Partial<MyWorkflowState>> => {
    const { result } = await executor.execute(buildProcessPrompt(state));
    return { intermediate: result };
  };
}
```

### Step 3: Build the Graph

```typescript
// my-workflow-graph.ts
import { StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';
import { MyWorkflowAnnotation } from './state.js';
import { createProcessNode } from './nodes/process.node.js';
import { createFinalizeNode } from './nodes/finalize.node.js';

export function createMyWorkflowGraph(
  deps: { executor: IAgentExecutor },
  checkpointer?: BaseCheckpointSaver
) {
  return new StateGraph(MyWorkflowAnnotation)
    .addNode('process', createProcessNode(deps.executor))
    .addNode('finalize', createFinalizeNode(deps.executor))
    .addEdge(START, 'process')
    .addEdge('process', 'finalize')
    .addEdge('finalize', END)
    .compile({ checkpointer });
}
```

To make the graph runnable via `shep run <agent-name>`, register it in
`agents/common/agent-registry.service.ts`. Registration is **lazy** — an `importFn` plus the
`factoryExport` name — so the CLI does not pay the `@langchain/langgraph` import cost on every
invocation.

## Patterns

### The Feature Agent's Shape

The feature agent is a linear SDLC pipeline with a validate/repair loop after every
YAML-producing node:

```
analyze → validate → requirements → validate → research → validate → plan → validate
        → implement (+ evidence sub-agent) → merge → extract_memory
```

Each validate node receives its **successor** phase name, so on resume it can skip validation only
when the successor already completed — proving that validation had passed. Checking the producer
instead would wrongly skip validation when the producer succeeded but validation failed.

### Looping Until a Condition

```typescript
graph.addConditionalEdges(
  'validate_research',
  routeValidation('plan', 'repair_research', 'research')
);
graph.addEdge('repair_research', 'validate_research');
```

The repair node feeds straight back into validation, which is the loop.

### Human-in-the-Loop

There is exactly **one** `interrupt()` call in the feature agent's execution path, inside
`executeNode` in `nodes/node-helpers.ts`, and it fires _after_ the node's work is done:

```typescript
if (shouldInterrupt(nodeName, state.approvalGates)) {
  interrupt({
    node: nodeName,
    result: result.result.slice(0, 500),
    message: `Node "${nodeName}" completed. Approve to continue.`,
  });
}
```

`shouldInterrupt` consults the feature's approval gates: `requirements` pauses unless
`allowPrd`, `plan` unless `allowPlan`, `merge` unless `allowMerge`. Every other node runs straight
through.

Resuming is a `Command`:

```typescript
import { Command } from '@langchain/langgraph';

await graph.invoke(new Command({ resume: { approved: true } }), {
  configurable: { thread_id: 'feat-123' },
});
```

On resume LangGraph re-enters the node function from the top. `executeNode` handles this by
returning early when the phase is already recorded as complete, rather than calling `interrupt()`
a second time. A rejection sets `_needsReexecution`, and a conditional edge routes back to the
node for a clean re-run.

### Supervisor Pattern

Shep has a real supervisor graph at
`packages/core/src/infrastructure/services/agents/supervisor-agent/supervisor-graph.ts`, which
evaluates gate decisions against a configured policy. Read that rather than copying a generic
supervisor sketch.

## Testing Agents

### Unit Testing Nodes

Node tests live under `tests/unit/infrastructure/services/agents/feature-agent/nodes/`. Because a
node is a factory over `IAgentExecutor`, the test supplies a stub executor — no network, no model:

```typescript
// tests/unit/infrastructure/services/agents/feature-agent/nodes/analyze.node.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createAnalyzeNode } from '@/infrastructure/services/agents/feature-agent/nodes/analyze.node.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as never,
    execute: vi.fn().mockResolvedValue({ result: 'analysis output' }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

describe('createAnalyzeNode', () => {
  it('runs the analyze prompt through the injected executor', async () => {
    const executor = createMockExecutor();
    const node = createAnalyzeNode(executor);

    const result = await node(baseState());

    expect(executor.execute).toHaveBeenCalled();
    expect(result.currentNode).toBe('analyze');
  });
});
```

`executeNode` touches the filesystem (spec files, completed-phase bookkeeping) and the settings
service, so real node tests mock `node-helpers.js`'s `readSpecFile` and build a full
`FeatureAgentState` fixture. `nodes/repair.node.test.ts` is a good template to copy.

### Integration Testing Graphs

Graph tests live at `tests/unit/infrastructure/services/agents/langgraph/`. They compile the real
graph against a mock executor and an in-memory checkpointer:

```typescript
import { describe, it, expect } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { createFeatureAgentGraph } from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';

describe('createFeatureAgentGraph', () => {
  it('should run every node', async () => {
    const graph = createFeatureAgentGraph(mockExecutor, new MemorySaver());

    const result = await graph.invoke(
      {
        featureId: 'feat-123',
        repositoryPath: '/test/repo',
        worktreePath: '/test/repo',
        specDir: '/test/repo/specs/001-test-feature',
      },
      { configurable: { thread_id: 'test-thread-1' } }
    );

    expect(result.currentNode).toBe('implement');
    expect(result.messages).toContainEqual(expect.stringContaining('[analyze]'));
  });
});
```

Run them with `pnpm test:unit`, or narrow with `pnpm test:unit -t "createFeatureAgentGraph"`.

## Debugging

### Enable Verbose Logging

`DEBUG` is a plain truthy check, not a namespace filter:

```bash
DEBUG=1 shep feat new "Add dark mode"
```

Per-feature agent logs are written under `~/.shep/logs/`, and `shep feat logs <id> --follow` tails
them.

### Inspect State at Each Step

```typescript
const stream = await graph.stream(input, { configurable: { thread_id: 'feat-123' } });

for await (const chunk of stream) {
  for (const [nodeName, update] of Object.entries(chunk)) {
    console.log('=== Node:', nodeName, '===');
    console.log('State keys:', Object.keys(update ?? {}));
  }
}
```

The checkpointer also holds the full history: `graph.getState(config)` returns the latest
checkpoint and `graph.getStateHistory(config)` walks backwards through them.

## Best Practices

### 1. Never Choose a Model in a Node

Agent resolution flows through `IAgentExecutorProvider`. A node that imports a provider SDK, names
a model, or branches on agent type is wrong — that decision belongs to the user's settings and the
executor factory.

### 2. Keep Nodes Focused

Each node should do one thing well. Prefer a prompt builder plus `executeNode` over a bespoke node
body; reach for a custom body only when the node is not a single prompt run.

### 3. Use Conditional Edges for Branching

Extract the routing rule into a named function so it can be unit-tested without compiling a graph:

```typescript
graph.addConditionalEdges(
  'validate_plan_tasks',
  routeValidation('implement', 'repair_plan_tasks', 'plan')
);
```

### 4. Let Failures Throw

`executeNode` re-throws LangGraph control-flow exceptions (`isGraphBubbleUp`) untouched, and throws
on genuine errors so LangGraph does **not** checkpoint the node as completed. Swallowing an error
and returning a state update would make a failed phase look finished, and resume would skip it.

### 5. Type Everything

```typescript
export type FeatureAgentState = typeof FeatureAgentAnnotation.State;

export function createMyNode(executor: IAgentExecutor) {
  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    // TypeScript catches invalid state updates
  };
}
```

---

## Maintaining This Document

**Update when:**

- LangGraph API changes
- New patterns are adopted
- The feature-agent graph gains or loses nodes
- New examples are added

**Related docs:**

- [AGENTS.md](../../AGENTS.md) - Agent reference
- [../architecture/agent-system.md](../architecture/agent-system.md) - Full architecture
- [../development/adding-agent-nodes.md](../development/adding-agent-nodes.md) - Adding a LangGraph node
- [../development/adding-agent-types.md](../development/adding-agent-types.md) - Adding an agent provider
