/**
 * Check Agent Auth Use Case
 *
 * Reports the install + auth status of the currently selected AI coding
 * agent. Used by the onboarding empty state to drive the "Ready / Not
 * installed / Needs auth" checklist.
 *
 * Owns:
 *  - Reading the active agent type from settings
 *  - Mapping agent type → user-facing label, tool id, binary name
 *  - Looking up tool installation status via ListToolsUseCase
 *  - Delegating credential detection to IAgentAuthDetectorService
 *
 * Presentation-agnostic: callable from CLI, TUI, and Web identically.
 * The shape returned mirrors what the web UI consumes today; CLI/TUI may
 * project a subset.
 */

import { injectable, inject } from 'tsyringe';

import type { AgentType } from '../../../domain/generated/output.js';
import { getAgentDescriptor } from '../../../domain/shared/agent-catalog.js';
import type { IAgentAuthDetectorService } from '../../ports/output/services/agent-auth-detector.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { ListToolsUseCase } from '../tools/list-tools.use-case.js';

export interface CheckAgentAuthResult {
  /** Raw agent type string (matches AgentType enum values, or 'unknown'). */
  agentType: string;
  /** Whether the CLI tool binary is installed. */
  installed: boolean;
  /** Whether credentials / auth appear valid. */
  authenticated: boolean;
  /** Human-readable label for the agent (e.g. "Claude Code"). */
  label: string;
  /** CLI binary name (e.g. "claude", "gemini"). */
  binaryName: string | null;
  /** Shell command to install the tool, resolved for the current platform. */
  installCommand: string | null;
  /** Hint to show the user when not authenticated (typically the binary name). */
  authCommand: string | null;
}

const UNKNOWN_RESULT: CheckAgentAuthResult = {
  agentType: 'unknown',
  installed: false,
  authenticated: false,
  label: 'Unknown',
  binaryName: null,
  installCommand: null,
  authCommand: null,
};

@injectable()
export class CheckAgentAuthUseCase {
  constructor(
    @inject(ListToolsUseCase) private readonly listToolsUseCase: ListToolsUseCase,
    @inject('IAgentAuthDetectorService')
    private readonly authDetector: IAgentAuthDetectorService,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(): Promise<CheckAgentAuthResult> {
    let agentType: string;
    try {
      const settings = await this.settingsRepository.load();
      if (settings === null) {
        return UNKNOWN_RESULT;
      }
      agentType = settings.agent.type;
    } catch {
      return UNKNOWN_RESULT;
    }

    // Facts about each agent come from the single domain catalog. The table
    // that used to live here silently omitted codex-cli and llmproxy, so users
    // on either agent were told their agent was "Unknown / not installed".
    const metadata = getAgentDescriptor(agentType);
    if (!metadata?.supported) {
      return { ...UNKNOWN_RESULT, agentType };
    }

    // Agents with no installable tool (the demo mock, SDK providers) — ready.
    if (!metadata.toolId) {
      return {
        agentType,
        installed: true,
        authenticated: true,
        label: metadata.label,
        binaryName: metadata.binary,
        installCommand: null,
        authCommand: null,
      };
    }

    // Resolve installation status from the tool catalogue.
    let installed = false;
    let installCommand: string | null = null;
    try {
      const tools = await this.listToolsUseCase.execute();
      const tool = tools.find((t) => t.id === metadata.toolId);
      installed = tool?.status.status === 'available';
      installCommand = tool?.installCommand ?? null;
    } catch {
      installed = false;
    }

    if (!installed) {
      return {
        agentType,
        installed: false,
        authenticated: false,
        label: metadata.label,
        binaryName: metadata.binary,
        installCommand,
        authCommand: metadata.binary ? `Install ${metadata.label} first` : null,
      };
    }

    // Tool is installed — defer credential detection to the platform adapter.
    const authenticated = await this.authDetector.isAuthenticated(
      agentType as AgentType,
      metadata.binary
    );

    return {
      agentType,
      installed: true,
      authenticated,
      label: metadata.label,
      binaryName: metadata.binary,
      installCommand,
      authCommand: authenticated ? null : metadata.binary,
    };
  }
}
