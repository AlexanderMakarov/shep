/**
 * Storybook mock for the fleet batch-approval server action.
 *
 * Mirrors the real action's return shape but never touches the DI container.
 * `@shepai/core` is linked under `src/presentation/web/node_modules` only, so
 * this directory cannot resolve it — the result is spelled out inline rather
 * than imported from the use case, as the sibling `fleet-data.ts` mock does.
 */

interface BatchApproveFeaturesResponse {
  totalAttempted: number;
  approvedCount: number;
  approvedFeatureIds: string[];
  failedCount: number;
  failures: { featureId: string; reason: string }[];
  error?: string;
}

export async function batchApproveFeatures(
  input: { featureIds?: string[]; gateType?: string } = {}
): Promise<BatchApproveFeaturesResponse> {
  const featureIds = input.featureIds ?? [];
  return {
    totalAttempted: featureIds.length,
    approvedCount: featureIds.length,
    approvedFeatureIds: featureIds,
    failedCount: 0,
    failures: [],
  };
}
