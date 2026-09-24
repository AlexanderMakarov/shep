# Data Model

No new TypeSpec entities or SQLite tables for this feature.

## Existing contracts reused

| Type | Location | Role |
| ---- | -------- | ---- |
| `IInteractiveAgentExecutor` | `application/ports/output/agents/interactive-agent-executor.interface.ts` | create/resume session |
| `InteractiveAgentSessionHandle` | same | send / stream / close / abort |
| `InteractiveAgentEvent` | same | UI stream events |
| `AgentType.Cursor` | TypeSpec / generated | factory branch key |

## Session identity

Cursor chat ids come from `cursor-agent create-chat` (UUID string). Persisted as
the interactive session's `agentSessionId` by existing bootstrap/persistence code.
