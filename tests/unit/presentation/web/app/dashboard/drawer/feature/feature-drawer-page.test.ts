// @vitest-environment node

/**
 * The feature drawer slot used to wrap its whole body — resolve → findById
 * → getSettings → buildFeatureNodeData → computeDrawerView — in a single
 * `catch { return null }`. Any failure in any of those steps therefore
 * produced an empty drawer: the URL changed, nothing opened, no toast, no
 * log, nothing in the console. Only "this feature does not exist" is an
 * expected outcome here; everything else must reach the route's error
 * boundary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFeatureById = vi.fn();
const mockFindAgentRunById = vi.fn();
const mockGetSettings = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'IFeatureRepository') return { findById: mockFindFeatureById };
    if (token === 'IAgentRunRepository') return { findById: mockFindAgentRunById };
    throw new Error(`Unknown token: ${token}`);
  },
}));

vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  getSettings: () => mockGetSettings(),
}));

const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404');
const notFound = vi.fn(() => {
  throw NOT_FOUND;
});
vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
}));

vi.mock('@/app/build-feature-node-data', () => ({
  buildFeatureNodeData: vi.fn(() => ({ id: 'feat-1' })),
}));

const mockComputeDrawerView = vi.fn();
vi.mock('@/components/common/control-center-drawer/drawer-view', () => ({
  computeDrawerView: (...args: unknown[]) => mockComputeDrawerView(...args),
}));

const FEATURE_DRAWER_MARKER = Symbol('FeatureDrawerClient');
vi.mock('@/components/common/control-center-drawer/feature-drawer-client', () => ({
  FeatureDrawerClient: Object.assign(() => null, { __marker: FEATURE_DRAWER_MARKER }),
}));

const { default: FeatureDrawerPage } = await import(
  '../../../../../../../../src/presentation/web/app/(dashboard)/@drawer/feature/[featureId]/page'
);

function params(featureId: string) {
  return { params: Promise.resolve({ featureId }) };
}

describe('FeatureDrawerPage (server component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockReturnValue({
      workflow: { enableEvidence: true, commitEvidence: false, ciWatchEnabled: false },
      interactiveAgent: { enabled: true },
    });
    mockFindAgentRunById.mockResolvedValue(null);
    mockComputeDrawerView.mockReturnValue({ kind: 'feature' });
  });

  it('renders the drawer for an existing feature', async () => {
    mockFindFeatureById.mockResolvedValue({ id: 'feat-1', agentRunId: undefined });

    const element = (await FeatureDrawerPage(params('feat-1'))) as {
      type: { __marker?: symbol };
      props: Record<string, unknown>;
    };

    expect(element.type.__marker).toBe(FEATURE_DRAWER_MARKER);
    expect(element.props.interactiveAgentEnabled).toBe(true);
  });

  it('calls notFound() when the feature does not exist', async () => {
    mockFindFeatureById.mockResolvedValue(null);

    await expect(FeatureDrawerPage(params('missing'))).rejects.toBe(NOT_FOUND);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('propagates a repository failure instead of opening an empty drawer', async () => {
    const boom = new Error('database is locked');
    mockFindFeatureById.mockRejectedValue(boom);

    await expect(FeatureDrawerPage(params('feat-1'))).rejects.toBe(boom);
  });

  it('propagates a settings failure instead of opening an empty drawer', async () => {
    mockFindFeatureById.mockResolvedValue({ id: 'feat-1', agentRunId: undefined });
    const boom = new Error('settings file corrupt');
    mockGetSettings.mockImplementation(() => {
      throw boom;
    });

    await expect(FeatureDrawerPage(params('feat-1'))).rejects.toBe(boom);
  });
});
