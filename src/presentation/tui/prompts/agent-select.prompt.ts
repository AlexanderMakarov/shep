/**
 * Agent Select Prompt Configuration
 *
 * Configuration for the @inquirer/select prompt that lets users
 * choose their AI coding agent.
 */

import { listAgentDescriptors } from '@shepai/core/domain/shared/agent-catalog.js';
import { getTuiI18n } from '../i18n.js';
import { shepTheme } from '../themes/shep.theme.js';

/**
 * Creates the @inquirer/select configuration for selecting an AI coding agent.
 *
 * The list is derived from the domain agent catalog rather than hand-written,
 * so a newly supported agent appears here automatically. The previous
 * hand-maintained list had silently omitted `llmproxy`, leaving a fully
 * supported agent unreachable from `shep settings`.
 *
 * Active agents are selectable. Agents not yet implemented are shown
 * as disabled with a "Coming Soon" badge.
 */
export function createAgentSelectConfig() {
  const t = getTuiI18n().t;
  const choiceKey = (key: string, field: string) =>
    `tui:prompts.selectAgent.choices.${key}.${field}`;

  return {
    message: t('tui:prompts.selectAgent.message'),
    choices: listAgentDescriptors().map((descriptor) => {
      // Fall back to the catalog's own text when a locale has not caught up,
      // so a missing translation never hides a working agent.
      const nameKey = choiceKey(descriptor.i18nKey, 'name');
      const name = t(nameKey, { defaultValue: descriptor.label });

      if (!descriptor.supported) {
        return {
          name,
          value: descriptor.type,
          disabled: t(choiceKey(descriptor.i18nKey, 'disabled'), {
            defaultValue: '(Coming Soon)',
          }),
        };
      }

      return {
        name,
        value: descriptor.type,
        description: t(choiceKey(descriptor.i18nKey, 'description'), {
          defaultValue: descriptor.description,
        }),
      };
    }),
    theme: shepTheme,
  };
}
