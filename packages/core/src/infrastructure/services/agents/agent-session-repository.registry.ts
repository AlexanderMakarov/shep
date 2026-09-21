/**
 * AgentSessionRepositoryRegistry
 *
 * Resolves the correct IAgentSessionRepository implementation for a given
 * AgentType via per-provider tsyringe tokens.
 *
 * Token scheme: "IAgentSessionRepository:<agentType>"
 * Example: "IAgentSessionRepository:claude-code" → ClaudeCodeSessionRepository
 *
 * Infrastructure-layer adapter that implements the application-layer
 * IAgentSessionRepositoryRegistry port. Use cases inject the port via
 * the 'IAgentSessionRepositoryRegistry' string token — they never see
 * this concrete class or the tsyringe container.
 *
 * Adding a new provider requires only registering a new token in the
 * container. A provider with no registered token degrades to an unsupported
 * stub rather than throwing: only five of the fourteen agent types have a real
 * session-listing implementation, and "this agent cannot list sessions" is a
 * state the use case already handles, whereas an unresolved-token error is not.
 */

import { injectable } from 'tsyringe';
import { container } from 'tsyringe';
import type { AgentType } from '../../../domain/generated/output.js';
import type { IAgentSessionRepository } from '../../../application/ports/output/agents/agent-session-repository.interface.js';
import type { IAgentSessionRepositoryRegistry } from '../../../application/ports/output/agents/agent-session-repository-registry.interface.js';
import { StubSessionRepository } from './sessions/stub-session.repository.js';

@injectable()
export class AgentSessionRepositoryRegistry implements IAgentSessionRepositoryRegistry {
  /**
   * Resolve the session repository for the given agent type.
   *
   * @param agentType - The agent type to resolve a repository for
   * @returns The IAgentSessionRepository implementation for the agent type
   */
  getRepository(agentType: AgentType): IAgentSessionRepository {
    try {
      return container.resolve<IAgentSessionRepository>(`IAgentSessionRepository:${agentType}`);
    } catch {
      return new StubSessionRepository(agentType);
    }
  }
}
