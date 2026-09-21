/**
 * Security constraint fixtures shared by the CLI agent executor tests.
 *
 * Every CLI executor hardcodes a permissions bypass (`--yolo`, `--allow-all`,
 * `-y`, `--dangerously-skip-permissions`, `--sandbox danger-full-access`), so
 * each one has to refuse an enforced strict sandbox and warn under an advisory
 * one. The constraint object is identical in every such test — it lives here so
 * the six suites cannot drift apart.
 */

import type { SecurityMode } from '@/domain/generated/output.js';
import type {
  SecurityActionCategory,
  SecurityActionDisposition,
} from '@/domain/generated/output.js';
import type { SecurityConstraints } from '@/application/ports/output/agents/agent-executor.interface.js';

/** A policy demanding a strict sandbox, which no CLI executor can provide. */
export function strictConstraints(mode: SecurityMode): SecurityConstraints {
  return {
    mode,
    actionDispositions: {} as Record<SecurityActionCategory, SecurityActionDisposition>,
    sandboxLevel: 'strict',
  };
}
