import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeatureDrawerClient } from '@/components/common/control-center-drawer/feature-drawer-client';
import type { DrawerView } from '@/components/common/control-center-drawer/drawer-view';
import type { FeatureNodeData } from '@/components/common/feature-node';
// Imported (mocked) fetcher references so artifact-fetch assertions can match on
// the fetcher argument instead of brittle positional call indices.
import { getResearchArtifact } from '@/app/actions/get-research-artifact';
import { getFeatureArtifact } from '@/app/actions/get-feature-artifact';

const mockApproveFeature = vi.fn();
const mockGetFeatureArtifact = vi.fn();
const mockGetMergeReviewData = vi.fn();
const mockGetResearchArtifact = vi.fn();
const mockRejectFeature = vi.fn();
const mockResumeFeature = vi.fn();
const mockRouterPush = vi.fn();
const mockStartFeature = vi.fn();
const mockStopFeature = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockUpdateFeaturePinnedConfig = vi.fn();
const mockUseArtifactFetch = vi.fn((..._args: unknown[]) => false);
const mockRejectOutcome = vi.fn();

let mockPathname = '/feature/feat-1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname,
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    warning: vi.fn(),
  },
}));

vi.mock('@/app/actions/approve-feature', () => ({
  approveFeature: (...args: unknown[]) => mockApproveFeature(...args),
}));

vi.mock('@/app/actions/get-feature-artifact', () => ({
  getFeatureArtifact: (...args: unknown[]) => mockGetFeatureArtifact(...args),
}));

vi.mock('@/app/actions/get-merge-review-data', () => ({
  getMergeReviewData: (...args: unknown[]) => mockGetMergeReviewData(...args),
}));

vi.mock('@/app/actions/get-research-artifact', () => ({
  getResearchArtifact: (...args: unknown[]) => mockGetResearchArtifact(...args),
}));

vi.mock('@/app/actions/reject-feature', () => ({
  rejectFeature: (...args: unknown[]) => mockRejectFeature(...args),
}));

vi.mock('@/app/actions/resume-feature', () => ({
  resumeFeature: (...args: unknown[]) => mockResumeFeature(...args),
}));

vi.mock('@/app/actions/start-feature', () => ({
  startFeature: (...args: unknown[]) => mockStartFeature(...args),
}));

vi.mock('@/app/actions/stop-feature', () => ({
  stopFeature: (...args: unknown[]) => mockStopFeature(...args),
}));

vi.mock('@/app/actions/update-feature-pinned-config', () => ({
  updateFeaturePinnedConfig: (...args: unknown[]) => mockUpdateFeaturePinnedConfig(...args),
}));

vi.mock('@/hooks/feature-flags-context', () => ({
  useFeatureFlags: () => ({
    envDeploy: false,
  }),
}));

vi.mock('@/hooks/use-sound-action', () => ({
  useSoundAction: () => ({ play: vi.fn(), stop: vi.fn(), isPlaying: false }),
}));

vi.mock('@/hooks/drawer-close-guard', () => ({
  useGuardedDrawerClose: () => ({ attemptClose: vi.fn() }),
}));

vi.mock('@/hooks/use-deploy-action', () => ({
  useDeployAction: () => ({
    deploy: vi.fn(),
    stop: vi.fn(),
    deployLoading: false,
    stopLoading: false,
    deployError: null,
    status: null,
    url: null,
  }),
}));

vi.mock('@/hooks/agent-events-provider', () => ({
  useAgentEventsContext: () => ({ events: [] }),
}));

vi.mock('@/hooks/use-branch-sync-status', () => ({
  useBranchSyncStatus: () => ({
    data: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/common/base-drawer', () => ({
  BaseDrawer: ({
    open,
    children,
    modal: _modal,
    ...props
  }: {
    open: boolean;
    children: React.ReactNode;
    modal?: boolean;
    [key: string]: unknown;
  }) => (open ? <div {...props}>{children}</div> : null),
}));

vi.mock('@/components/common/deployment-status-badge', () => ({
  DeploymentStatusBadge: () => null,
}));

vi.mock('@/components/common/delete-feature-dialog', () => ({
  DeleteFeatureDialog: () => null,
}));

vi.mock('@/components/common/open-action-menu', () => ({
  OpenActionMenu: () => null,
}));

vi.mock('@/components/common/feature-drawer/use-feature-actions', () => ({
  useFeatureActions: () => ({
    rebaseOnMain: vi.fn(),
    rebaseLoading: false,
    rebaseError: null,
  }),
}));

vi.mock('@/components/common/feature-node/derive-feature-state', () => ({
  resolveSseEventUpdates: () => [],
}));

vi.mock('@/components/common/feature-drawer-tabs', () => ({
  FeatureDrawerTabs: (props: {
    featureId: string;
    featureNode: FeatureNodeData;
    onStart?: (featureId: string) => void;
    onRetry?: (featureId: string) => void;
    onStop?: (featureId: string) => void;
    onMergeApprove?: () => void;
    onMergeReject?: (
      feedback: string,
      attachments: never[]
    ) => void | { ok: boolean } | Promise<void | { ok: boolean; error?: string }>;
    continuationActionsDisabled?: boolean;
    pinnedConfig?: {
      agentType: string;
      modelId: string;
      saving?: boolean;
      error?: string | null;
      onSave: (agentType: string, modelId: string) => Promise<{ ok: boolean; error?: string }>;
    };
  }) => (
    <div data-testid="feature-drawer-tabs">
      <div data-testid="node-agent">{props.featureNode.agentType}</div>
      <div data-testid="node-model">{props.featureNode.modelId}</div>
      <div data-testid="node-state">{props.featureNode.state}</div>
      <button type="button" onClick={() => props.onStop?.(props.featureId)}>
        Stop agent
      </button>
      <button
        type="button"
        onClick={() => props.onMergeApprove?.()}
        disabled={props.continuationActionsDisabled}
      >
        Approve merge
      </button>
      <button
        type="button"
        onClick={() => {
          void (async () => {
            const outcome = await props.onMergeReject?.('needs work', []);
            mockRejectOutcome(outcome);
          })();
        }}
      >
        Reject merge
      </button>
      <div data-testid="selection-agent">{props.pinnedConfig?.agentType ?? ''}</div>
      <div data-testid="selection-model">{props.pinnedConfig?.modelId ?? ''}</div>
      <div data-testid="continuation-actions-disabled">
        {String(Boolean(props.continuationActionsDisabled))}
      </div>
      {props.pinnedConfig?.error ? <div>{props.pinnedConfig.error}</div> : null}
      {props.pinnedConfig ? (
        <button
          type="button"
          onClick={() => void props.pinnedConfig?.onSave('codex-cli', 'gpt-5.4')}
          disabled={props.pinnedConfig.saving}
        >
          Save pinned config
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => props.onStart?.(props.featureId)}
        disabled={props.continuationActionsDisabled}
      >
        Start feature
      </button>
      <button
        type="button"
        onClick={() => props.onRetry?.(props.featureId)}
        disabled={props.continuationActionsDisabled}
      >
        Retry feature
      </button>
    </div>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/common/control-center-drawer/use-artifact-fetch', () => ({
  useArtifactFetch: (featureId: string | null, ...rest: unknown[]) =>
    mockUseArtifactFetch(featureId, ...rest),
}));

vi.mock('@/components/common/control-center-drawer/use-drawer-sync', () => ({
  useDrawerSync: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const baseNode: FeatureNodeData = {
  name: 'Pinned Config Feature',
  featureId: 'feat-1',
  lifecycle: 'implementation',
  state: 'pending',
  progress: 0,
  repositoryPath: '/tmp/repo',
  branch: '',
  agentType: 'claude-code',
  modelId: 'claude-sonnet-4-6',
};

function createView(overrides: Partial<FeatureNodeData> = {}): DrawerView {
  return {
    type: 'feature',
    initialTab: 'overview',
    node: { ...baseNode, ...overrides },
  };
}

describe('FeatureDrawerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseArtifactFetch.mockReturnValue(false);
    mockPathname = '/feature/feat-1';
    mockApproveFeature.mockResolvedValue({ approved: true });
    mockGetFeatureArtifact.mockResolvedValue({});
    mockGetMergeReviewData.mockResolvedValue({});
    mockGetResearchArtifact.mockResolvedValue({});
    mockRejectFeature.mockResolvedValue({ rejected: true, iteration: 1 });
    mockResumeFeature.mockResolvedValue({});
    mockStartFeature.mockResolvedValue({});
    mockStopFeature.mockResolvedValue({ stopped: true });
    mockUpdateFeaturePinnedConfig.mockResolvedValue({ ok: true });
  });

  /* ---------------------------------------------------------------- */
  /*  P0-4 — approve must not be double-submittable                    */
  /* ---------------------------------------------------------------- */

  describe('merge approve in-flight guard (P0-4)', () => {
    const reviewView = () =>
      createView({ lifecycle: 'review', state: 'action-required', branch: 'feat/login' });

    it('fires approveFeature exactly once for two rapid clicks', async () => {
      const user = userEvent.setup();
      const deferred = createDeferred<{ approved: boolean; error?: string }>();
      mockApproveFeature.mockReturnValueOnce(deferred.promise);

      render(<FeatureDrawerClient view={reviewView()} />);

      const approve = screen.getByRole('button', { name: 'Approve merge' });
      await user.click(approve);

      await waitFor(() => {
        expect(screen.getByTestId('continuation-actions-disabled')).toHaveTextContent('true');
      });

      await user.click(screen.getByRole('button', { name: 'Approve merge' }));

      deferred.resolve({ approved: true });

      await waitFor(() => expect(mockApproveFeature).toHaveBeenCalledTimes(1));
    });

    it('clears the guard after a FAILED approve so the user can retry', async () => {
      const user = userEvent.setup();
      mockApproveFeature.mockResolvedValueOnce({ approved: false, error: 'Gate already closed' });

      render(<FeatureDrawerClient view={reviewView()} />);

      await user.click(screen.getByRole('button', { name: 'Approve merge' }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Gate already closed'));
      await waitFor(() => {
        expect(screen.getByTestId('continuation-actions-disabled')).toHaveTextContent('false');
      });
      expect(screen.getByRole('button', { name: 'Approve merge' })).toBeEnabled();
    });

    it('clears the guard when the approve action throws', async () => {
      const user = userEvent.setup();
      mockApproveFeature.mockRejectedValueOnce(new Error('boom'));

      render(<FeatureDrawerClient view={reviewView()} />);

      await user.click(screen.getByRole('button', { name: 'Approve merge' }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      await waitFor(() => {
        expect(screen.getByTestId('continuation-actions-disabled')).toHaveTextContent('false');
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /*  P0-4b — a failed reject must report its failure to the bar       */
  /* ---------------------------------------------------------------- */

  describe('reject outcome (P0-4b)', () => {
    it('reports ok:false so the action bar can keep the draft', async () => {
      const user = userEvent.setup();
      mockRejectFeature.mockResolvedValueOnce({ rejected: false, error: 'Agent run is gone' });

      render(
        <FeatureDrawerClient view={createView({ lifecycle: 'review', state: 'action-required' })} />
      );

      await user.click(screen.getByRole('button', { name: 'Reject merge' }));

      await waitFor(() =>
        expect(mockRejectOutcome).toHaveBeenCalledWith({ ok: false, error: 'Agent run is gone' })
      );
      expect(mockToastError).toHaveBeenCalledWith('Agent run is gone');
    });

    it('reports ok:true on success', async () => {
      const user = userEvent.setup();
      mockRejectFeature.mockResolvedValueOnce({ rejected: true, iteration: 2 });

      render(
        <FeatureDrawerClient view={createView({ lifecycle: 'review', state: 'action-required' })} />
      );

      await user.click(screen.getByRole('button', { name: 'Reject merge' }));

      await waitFor(() => expect(mockRejectOutcome).toHaveBeenCalledWith({ ok: true }));
    });
  });

  /* ---------------------------------------------------------------- */
  /*  P1 — the optimistic stop update must not lie                     */
  /* ---------------------------------------------------------------- */

  describe('stop agent (P1)', () => {
    it('does not paint an Error state after reporting success', async () => {
      const user = userEvent.setup();
      mockStopFeature.mockResolvedValueOnce({ stopped: true });

      render(<FeatureDrawerClient view={createView({ state: 'running' })} />);

      await user.click(screen.getByRole('button', { name: 'Stop agent' }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Agent stopped'));
      expect(screen.getByTestId('node-state')).not.toHaveTextContent('error');
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it('reports the real failure and claims no success when the stop fails', async () => {
      const user = userEvent.setup();
      mockStopFeature.mockResolvedValueOnce({
        stopped: false,
        error: 'No active agent run found for this feature',
      });

      render(<FeatureDrawerClient view={createView({ state: 'running' })} />);

      await user.click(screen.getByRole('button', { name: 'Stop agent' }));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('No active agent run found for this feature')
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(screen.getByTestId('node-state')).toHaveTextContent('running');
    });

    it('reports a thrown stop failure instead of crashing', async () => {
      const user = userEvent.setup();
      mockStopFeature.mockRejectedValueOnce(new Error('network down'));

      render(<FeatureDrawerClient view={createView({ state: 'running' })} />);

      await user.click(screen.getByRole('button', { name: 'Stop agent' }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to stop agent'));
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  it('blocks continuation actions while the pinned config save is in flight and patches local node data after success', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{ ok: boolean; error?: string }>();
    mockUpdateFeaturePinnedConfig.mockReturnValueOnce(deferred.promise);

    render(<FeatureDrawerClient view={createView()} />);

    expect(screen.getByTestId('node-agent')).toHaveTextContent('claude-code');
    expect(screen.getByTestId('node-model')).toHaveTextContent('claude-sonnet-4-6');

    await user.click(screen.getByRole('button', { name: 'Save pinned config' }));

    await waitFor(() => {
      expect(screen.getByTestId('selection-agent')).toHaveTextContent('codex-cli');
      expect(screen.getByTestId('selection-model')).toHaveTextContent('gpt-5.4');
      expect(screen.getByRole('button', { name: 'Start feature' })).toBeDisabled();
      expect(screen.getByTestId('continuation-actions-disabled')).toHaveTextContent('true');
    });

    await user.click(screen.getByRole('button', { name: 'Start feature' }));
    expect(mockStartFeature).not.toHaveBeenCalled();

    deferred.resolve({ ok: true });

    await waitFor(() => {
      expect(screen.getByTestId('node-agent')).toHaveTextContent('codex-cli');
      expect(screen.getByTestId('node-model')).toHaveTextContent('gpt-5.4');
      expect(screen.getByRole('button', { name: 'Start feature' })).toBeEnabled();
      expect(screen.getByTestId('continuation-actions-disabled')).toHaveTextContent('false');
    });

    expect(mockUpdateFeaturePinnedConfig).toHaveBeenCalledWith('feat-1', 'codex-cli', 'gpt-5.4');
  });

  // Collect the featureIds passed to useArtifactFetch grouped by fetcher, so
  // assertions match on the fetcher (stable) rather than positional call index.
  function artifactFetchIds(): { techIds: unknown[]; productIds: unknown[] } {
    const calls = mockUseArtifactFetch.mock.calls;
    return {
      techIds: calls.filter((c) => c[1] === getResearchArtifact).map((c) => c[0]),
      productIds: calls.filter((c) => c[1] === getFeatureArtifact).map((c) => c[0]),
    };
  }

  describe('tech/product artifact fetch lifecycle gating', () => {
    /**
     * Regression test for: Tech Decisions and Product tabs empty in review/maintain.
     * techFeatureId must be set (non-null) for implementation, review, and maintain
     * so that useArtifactFetch actually fires for all phases where the tabs are visible.
     */
    it.each([
      ['implementation', 'running'],
      ['review', 'action-required'],
      ['maintain', 'done'],
    ] as const)(
      'fetches tech/product artifacts when lifecycle=%s (tabs are visible)',
      (lifecycle, state) => {
        mockUseArtifactFetch.mockReturnValue(false);

        render(<FeatureDrawerClient view={createView({ lifecycle, state })} />);

        // Match calls by their fetcher argument (not positional index) so the
        // assertion survives reordering/adding artifact fetches. Tech decisions
        // use getResearchArtifact; product uses getFeatureArtifact (shared with
        // the PRD fetch, which is null in these phases).
        const { techIds, productIds } = artifactFetchIds();
        expect(techIds).toContain('feat-1'); // tech featureId must not be null
        expect(productIds).toContain('feat-1'); // product featureId must not be null
      }
    );

    it.each([
      ['implementation', 'running'],
      ['review', 'action-required'],
      ['maintain', 'done'],
    ] as const)(
      'does not fetch tech/product artifacts for fast-mode features when lifecycle=%s',
      (lifecycle, state) => {
        mockUseArtifactFetch.mockReturnValue(false);

        render(<FeatureDrawerClient view={createView({ lifecycle, state, fastMode: true })} />);

        const { techIds, productIds } = artifactFetchIds();
        // fast-mode: tech/product fetches must never receive a featureId.
        expect(techIds.every((id) => id === null)).toBe(true);
        expect(productIds.every((id) => id === null)).toBe(true);
      }
    );

    it('does not fetch tech/product artifacts for early phases (requirements/research)', () => {
      for (const lifecycle of ['requirements', 'research'] as const) {
        mockUseArtifactFetch.mockClear();
        mockUseArtifactFetch.mockReturnValue(false);

        const { unmount } = render(
          <FeatureDrawerClient view={createView({ lifecycle, state: 'running' })} />
        );

        const { techIds, productIds } = artifactFetchIds();
        // early phase: tech/product fetches must never receive a featureId.
        expect(techIds.every((id) => id === null)).toBe(true);
        expect(productIds.every((id) => id === null)).toBe(true);
        unmount();
      }
    });
  });

  it('rolls back to the last saved pinned config and shows the save error when persistence fails', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{ ok: boolean; error?: string }>();
    mockUpdateFeaturePinnedConfig.mockReturnValueOnce(deferred.promise);

    render(<FeatureDrawerClient view={createView()} />);

    await user.click(screen.getByRole('button', { name: 'Save pinned config' }));

    await waitFor(() => {
      expect(screen.getByTestId('selection-agent')).toHaveTextContent('codex-cli');
      expect(screen.getByTestId('selection-model')).toHaveTextContent('gpt-5.4');
    });

    deferred.resolve({ ok: false, error: 'Could not save pinned config' });

    await waitFor(() => {
      expect(screen.getByTestId('node-agent')).toHaveTextContent('claude-code');
      expect(screen.getByTestId('node-model')).toHaveTextContent('claude-sonnet-4-6');
      expect(screen.getByTestId('selection-agent')).toHaveTextContent('claude-code');
      expect(screen.getByTestId('selection-model')).toHaveTextContent('claude-sonnet-4-6');
      expect(screen.getByText('Could not save pinned config')).toBeInTheDocument();
    });

    expect(mockToastError).toHaveBeenCalledWith('Could not save pinned config');
  });

  it('does not fetch tech artifacts for fast-mode implementation features', () => {
    render(
      <FeatureDrawerClient
        view={createView({
          lifecycle: 'implementation',
          state: 'running',
          fastMode: true,
          specPath: '/tmp/repo/specs/feat-1',
        })}
      />
    );

    const latestCycle = mockUseArtifactFetch.mock.calls.slice(-4);
    expect(latestCycle).toHaveLength(4);
    expect(latestCycle[1]?.[0]).toBeNull();
    expect(latestCycle[2]?.[0]).toBeNull();
  });

  it('fetches tech artifacts for spec-mode implementation features with a spec path', () => {
    render(
      <FeatureDrawerClient
        view={createView({
          lifecycle: 'implementation',
          state: 'running',
          fastMode: false,
          specPath: '/tmp/repo/specs/feat-1',
        })}
      />
    );

    const latestCycle = mockUseArtifactFetch.mock.calls.slice(-4);
    expect(latestCycle).toHaveLength(4);
    expect(latestCycle[1]?.[0]).toBe('feat-1');
    expect(latestCycle[2]?.[0]).toBe('feat-1');
  });
});
