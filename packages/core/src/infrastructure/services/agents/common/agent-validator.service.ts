/**
 * Agent Validator Service
 *
 * Infrastructure implementation of the IAgentValidator port.
 * Checks if AI agent binaries are available on the system by
 * executing `<binary> --version` via subprocess.
 *
 * Uses constructor dependency injection for the command executor
 * to enable testability without mocking node:child_process directly.
 */

import { injectable, inject } from 'tsyringe';

import type { AgentType } from '../../../../domain/generated/output.js';
import type {
  IAgentValidator,
  AgentValidationResult,
} from '../../../../application/ports/output/agents/agent-validator.interface.js';

import { getAgentDescriptor } from '../../../../domain/shared/agent-catalog.js';

import type { ExecFunction } from './types.js';

/**
 * Service that validates agent tool availability on the system.
 *
 * Checks if the agent binary exists and is executable by running
 * `<binary> --version` and parsing the output.
 */
@injectable()
export class AgentValidatorService implements IAgentValidator {
  private readonly execFn: ExecFunction;

  /**
   * @param execFn - Command executor function (injectable for testing).
   *   Uses execFile semantics (no shell) to prevent command injection.
   */
  constructor(@inject('ExecFunction') execFn: ExecFunction) {
    this.execFn = execFn;
  }

  /**
   * Check if the specified agent tool is available on the system.
   *
   * @param agentType - The agent type to check
   * @returns Validation result with availability status and version
   */
  async isAvailable(agentType: AgentType): Promise<AgentValidationResult> {
    const descriptor = getAgentDescriptor(agentType);

    // Mock agent requires no binary — always available for local development.
    if (descriptor?.kind === 'mock') return { available: true, version: 'dev' };

    // SDK-based agents require no binary — always available (auth is checked at
    // execution time). Deriving this from the catalog rather than an inline list
    // is what stopped `llmproxy`, a fully supported agent, being reported as
    // "not supported yet" because someone forgot to extend the list.
    if (descriptor?.kind === 'sdk') return { available: true, version: 'sdk' };

    const binary = descriptor?.supported === true ? descriptor.binary : null;

    if (!binary) {
      return {
        available: false,
        error: `Agent type "${agentType}" is not supported yet`,
      };
    }

    try {
      const { stdout } = await this.execFn(binary, [...(descriptor?.versionArgs ?? ['--version'])]);
      const version = stdout.trim();

      return {
        available: true,
        version,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        available: false,
        error: `Binary "${binary}" not found or not executable: ${message}`,
      };
    }
  }
}
