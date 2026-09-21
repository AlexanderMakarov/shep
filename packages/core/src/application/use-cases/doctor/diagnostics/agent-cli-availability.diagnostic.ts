/**
 * AgentCliAvailabilityDiagnostic
 *
 * Reports whether at least one supported agent CLI is authenticated. Shep
 * needs at least one available agent to drive any feature flow; this check
 * warns rather than fails so a contributor can still run `shep doctor` itself
 * before signing in to any provider.
 *
 * The probe list is derived from the domain agent catalog. It used to be
 * hand-written and had drifted: it probed `cursor` (the desktop editor) rather
 * than `cursor-agent`, and `gh` rather than `copilot`, so `shep doctor` gave
 * the wrong answer for two agents and did not know about the rest.
 */

import { inject, injectable } from 'tsyringe';

import { AgentType, DiagnosticStatus } from '../../../../domain/generated/output.js';
import { listAgentDescriptors } from '../../../../domain/shared/agent-catalog.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import type { IAgentAuthDetectorService } from '../../../ports/output/services/agent-auth-detector.interface.js';

interface AgentProbe {
  type: AgentType;
  binary: string | null;
  label: string;
}

/**
 * Every supported CLI agent, from the catalog.
 *
 * Claude Code passes `binary: null` because its auth detector inspects the
 * credential store rather than shelling out to the binary.
 */
const AGENT_PROBES: readonly AgentProbe[] = listAgentDescriptors()
  .filter((descriptor) => descriptor.supported && descriptor.kind === 'cli')
  .map((descriptor) => ({
    type: descriptor.type,
    binary: descriptor.type === AgentType.ClaudeCode ? null : descriptor.binary,
    label: descriptor.label,
  }));

/** Labels for the warning message, so it cannot drift from the probe list. */
const PROBE_LABELS = AGENT_PROBES.map((probe) => probe.label).join(' / ');

@injectable()
export class AgentCliAvailabilityDiagnostic implements IDiagnostic {
  readonly name = 'agent-cli-availability';

  constructor(
    @inject('IAgentAuthDetectorService')
    private readonly authDetector: IAgentAuthDetectorService
  ) {}

  async run(): Promise<DiagnosticResult> {
    const settled = await Promise.all(
      AGENT_PROBES.map(async (probe) => ({
        probe,
        ok: await this.authDetector.isAuthenticated(probe.type, probe.binary).catch(() => false),
      }))
    );
    const authed = settled.filter((s) => s.ok).map((s) => s.probe.label);
    if (authed.length === 0) {
      return {
        name: this.name,
        status: DiagnosticStatus.Warn,
        detail: `No agent CLI is authenticated (${PROBE_LABELS})`,
        fixHint: 'Sign in to at least one agent (e.g. `claude auth login` or `gh auth login`)',
      };
    }
    return {
      name: this.name,
      status: DiagnosticStatus.Ok,
      detail: `Authenticated agents: ${authed.join(', ')}`,
    };
  }
}
