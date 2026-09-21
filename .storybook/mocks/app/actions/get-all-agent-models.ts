import { getModelMeta } from '@/lib/model-metadata';
// Relative rather than an `@shepai/core` specifier: Storybook's vite config
// aliases only the `@/…` web paths, and domain/ is plain TypeScript with no
// runtime dependencies, so a direct path resolves in every consumer.
import { listAgentDescriptors } from '../../../../packages/core/src/domain/shared/agent-catalog';

/**
 * Storybook stand-in for the real server action, which needs the DI container.
 *
 * The model lists are derived from the domain agent catalog rather than copied,
 * so a story can never show a different set of agents or models than the app.
 * This file used to be a fourth hand-maintained copy and had already drifted.
 */
export async function getAllAgentModels() {
  return listAgentDescriptors()
    .filter((descriptor) => descriptor.supported && descriptor.models.length > 0)
    .map((descriptor) => ({
      agentType: descriptor.type as string,
      label: descriptor.label,
      models: descriptor.models.map((id) => ({ id, ...getModelMeta(id) })),
    }));
}
