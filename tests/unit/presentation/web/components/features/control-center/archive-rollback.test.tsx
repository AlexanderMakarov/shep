/**
 * Optimistic archive rollback.
 *
 * `handleArchiveFeature` flipped the node to `archived` optimistically and,
 * when the server rejected the archive, rolled back to a HARD-CODED
 * `state: 'done'`. Archiving a RUNNING feature and failing therefore
 * repainted it as Done — a state it was never in — and the canvas then
 * disagreed with the database until the next poll.
 *
 * The rollback must restore whatever the feature actually was.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Edge } from '@xyflow/react';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { FeatureNodeData } from '@/components/common/feature-node';
import { useControlCenterState } from '@/components/features/control-center/use-control-center-state';

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/control-center',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/agent-events-provider', () => ({
  useAgentEventsContext: () => ({
    events: [],
    lastEvent: null,
    connectionStatus: 'connected' as const,
  }),
}));

const stubUnsubscribe = () => {
  /* stub */
};
const deploymentStatusStub = {
  store: {
    hydrate: vi.fn(),
    getEntry: vi.fn(() => ({
      status: null,
      url: null,
      targetType: null,
      hydrated: false,
      deployLoading: false,
      stopLoading: false,
      deployError: null,
    })),
    update: vi.fn(),
    setStatus: vi.fn(),
    subscribe: vi.fn(() => stubUnsubscribe),
    subscribeAll: vi.fn(() => stubUnsubscribe),
  },
  deploy: vi.fn(),
  stop: vi.fn(),
  ensureHydrated: vi.fn(),
  staleTargetIds: new Set<string>(),
};
vi.mock('@/hooks/deployment-status-provider', () => ({
  useDeploymentStatusContext: () => deploymentStatusStub,
  useDeploymentStatusContextOptional: () => deploymentStatusStub,
}));

vi.mock('@/hooks/use-sound-action', () => ({
  useSoundAction: () => ({ play: vi.fn() }),
}));

const mockArchiveFeature = vi.fn();
vi.mock('@/app/actions/archive-feature', () => ({
  archiveFeature: (...args: unknown[]) => mockArchiveFeature(...args),
}));
vi.mock('@/app/actions/unarchive-feature', () => ({ unarchiveFeature: vi.fn() }));
vi.mock('@/app/actions/delete-feature', () => ({ deleteFeature: vi.fn() }));
vi.mock('@/app/actions/resume-feature', () => ({ resumeFeature: vi.fn() }));
vi.mock('@/app/actions/start-feature', () => ({ startFeature: vi.fn() }));
vi.mock('@/app/actions/stop-feature', () => ({ stopFeature: vi.fn() }));
vi.mock('@/app/actions/add-repository', () => ({ addRepository: vi.fn() }));
vi.mock('@/app/actions/delete-repository', () => ({ deleteRepository: vi.fn() }));
vi.mock('@/app/actions/delete-application', () => ({ deleteApplication: vi.fn() }));
vi.mock('@/app/actions/get-feature-metadata', () => ({ getFeatureMetadata: vi.fn() }));
vi.mock('@/app/actions/reparent-feature', () => ({ reparentFeature: vi.fn() }));

function featureNode(state: FeatureNodeData['state']): CanvasNodeType {
  return {
    id: 'feat-f1',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Checkout flow',
      featureId: 'f1',
      lifecycle: 'implementation',
      state,
      progress: 40,
      repositoryPath: '/home/me/shop',
      branch: 'feat/checkout',
    },
  } as CanvasNodeType;
}

function stateOf(nodes: CanvasNodeType[]): string | undefined {
  const node = nodes.find((n) => n.id === 'feat-f1');
  return node ? (node.data as FeatureNodeData).state : undefined;
}

const NO_EDGES: Edge[] = [];

describe('handleArchiveFeature rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores a RUNNING feature to running — not to done — when the archive fails', async () => {
    mockArchiveFeature.mockResolvedValue({ error: 'Agent is still running' });
    const { result } = renderHook(() => useControlCenterState([featureNode('running')], NO_EDGES));

    act(() => {
      result.current.handleArchiveFeature('f1');
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Agent is still running'));
    await waitFor(() => expect(stateOf(result.current.nodes)).toBe('running'));
  });

  it('restores a RUNNING feature to running when the archive action throws', async () => {
    mockArchiveFeature.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useControlCenterState([featureNode('running')], NO_EDGES));

    act(() => {
      result.current.handleArchiveFeature('f1');
    });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() => expect(stateOf(result.current.nodes)).toBe('running'));
  });

  it('restores a DONE feature to done when the archive fails', async () => {
    mockArchiveFeature.mockResolvedValue({ error: 'nope' });
    const { result } = renderHook(() => useControlCenterState([featureNode('done')], NO_EDGES));

    act(() => {
      result.current.handleArchiveFeature('f1');
    });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() => expect(stateOf(result.current.nodes)).toBe('done'));
  });

  it('leaves the feature archived when the archive succeeds', async () => {
    mockArchiveFeature.mockResolvedValue({});
    const { result } = renderHook(() => useControlCenterState([featureNode('running')], NO_EDGES));

    act(() => {
      result.current.handleArchiveFeature('f1');
    });

    await waitFor(() => expect(mockArchiveFeature).toHaveBeenCalledWith('f1'));
    expect(toastError).not.toHaveBeenCalled();
  });
});
