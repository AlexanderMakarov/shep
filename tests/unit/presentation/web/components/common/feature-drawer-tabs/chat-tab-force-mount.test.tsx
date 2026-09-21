/**
 * P2 — switching away from the chat tab must not destroy the draft.
 *
 * `TabsContent` renders `present && children` (Radix), so an inactive panel
 * loses its CHILDREN — and with them every piece of component state the chat
 * surface holds: the unsent draft, staged attachments, and the per-conversation
 * model override. Coming back to the tab remounts `ChatTab` from scratch, so
 * the user's typing is gone with no warning and nothing to undo.
 *
 * `components/ui/tabs.tsx` supports `forceMount` (paired with
 * `data-[state=inactive]:hidden`, so an inactive panel is hidden from sight,
 * from assistive tech and from the tab order). These tests pin the CALL SITE
 * actually opting in, because the primitive supporting it changes nothing on
 * its own.
 *
 * The chat surface is mocked with a component that keeps a draft in local
 * state and counts its own mounts — that is the thing being preserved, so
 * asserting on state survival is the honest test. Asserting only that the DOM
 * node exists would pass even if React had thrown the state away.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FeatureDrawerTabs } from '@/components/common/feature-drawer-tabs/feature-drawer-tabs';
import type { FeatureDrawerTabsProps } from '@/components/common/feature-drawer-tabs/feature-drawer-tabs';
import type { FeatureNodeData } from '@/components/common/feature-node';

const mockPathname = '/feature/f1';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

/** Counts mounts across the whole test, reset in `beforeEach`. */
const chatMountCount = { current: 0 };

/**
 * Stands in for the real chat surface. It holds a draft in `useState`, which
 * is exactly the state the defect destroys, and bumps a mount counter so an
 * unmount/remount cycle is observable even if the draft happened to be empty.
 */
vi.mock('@/components/features/chat/ChatTab', () => ({
  ChatTab: () => {
    const [draft, setDraft] = useState('');
    // Runs on every mount; a remount is what we are trying to prevent.
    useState(() => {
      chatMountCount.current += 1;
      return null;
    });
    return (
      <div data-testid="chat-tab">
        <label htmlFor="chat-draft">Draft</label>
        <input id="chat-draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </div>
    );
  },
}));

vi.mock('@/app/actions/get-feature-phase-timings', () => ({
  getFeaturePhaseTimings: vi.fn().mockResolvedValue({ timings: [], rejectionFeedback: [] }),
}));

vi.mock('@/app/actions/get-feature-plan', () => ({
  getFeaturePlan: vi.fn().mockResolvedValue({ plan: null }),
}));

vi.mock('@/app/actions/bedrock.action', () => ({
  enableBedrockForTarget: vi.fn().mockResolvedValue({ ok: false }),
  syncBedrockForTarget: vi.fn().mockResolvedValue({ ok: false }),
  shipBedrockForTarget: vi.fn().mockResolvedValue({ ok: false }),
  getBedrockMemorySnapshot: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/hooks/use-feature-logs', () => ({
  useFeatureLogs: () => ({ content: '', isConnected: false, error: null }),
}));

vi.mock('@/hooks/use-sound-action', () => ({
  useSoundAction: vi.fn(() => ({ play: vi.fn(), stop: vi.fn(), isPlaying: false })),
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

const featureNode: FeatureNodeData = {
  name: 'Test Feature',
  description: 'A test feature',
  featureId: '#f1',
  lifecycle: 'implementation',
  state: 'running',
  progress: 50,
  repositoryPath: '/home/user/repo',
  branch: 'feat/test',
  hasPlan: true,
  hasAgentRun: true,
};

function renderTabs() {
  const props: FeatureDrawerTabsProps = {
    featureNode,
    featureId: '#f1',
    interactiveAgentEnabled: true,
  };
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <FeatureDrawerTabs {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  chatMountCount.current = 0;
});

describe('FeatureDrawerTabs — chat panel stays mounted (P2)', () => {
  it('keeps an unsent draft when the user switches to another tab and back', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    await user.type(screen.getByLabelText('Draft'), 'half-written question');
    expect(screen.getByLabelText('Draft')).toHaveValue('half-written question');

    // Go look at something else, then come back — the classic way to lose it.
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.click(screen.getByRole('tab', { name: 'Chat' }));

    expect(screen.getByLabelText('Draft')).toHaveValue('half-written question');
  });

  it('never remounts the chat surface, so attachments and model override survive too', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    const mountsAfterFirstVisit = chatMountCount.current;
    expect(mountsAfterFirstVisit).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.click(screen.getByRole('tab', { name: 'Chat' }));

    expect(chatMountCount.current).toBe(mountsAfterFirstVisit);
  });

  it('hides the still-mounted chat panel from sight and from assistive tech while inactive', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    await user.click(screen.getByRole('tab', { name: 'Overview' }));

    // Still in the DOM — that is the point — but it must not be perceivable.
    // The hiding is `data-[state=inactive]:hidden`, i.e. `display: none`, which
    // removes it from sight, from the a11y tree and from the tab order in one
    // step. We assert the class and the state rather than `toBeVisible()`,
    // because jsdom never runs Tailwind: no stylesheet is compiled here, so a
    // computed-visibility check would fail for a reason that has nothing to do
    // with the product. The class↔`display:none` mapping is Tailwind's own and
    // is covered at the primitive level in tabs.test.tsx.
    const panel = screen.getByTestId('chat-tab').closest('[role="tabpanel"]');
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('data-state', 'inactive');
    expect(panel).toHaveClass('data-[state=inactive]:hidden');
  });

  it('does not mount the chat runtime until the user actually opens the tab', async () => {
    const user = userEvent.setup();
    renderTabs();

    // Opening a drawer must not start a chat runtime on its own. Mounting every
    // chat surface eagerly would open a connection per drawer for users who
    // never touch chat — the same cost the Log tab deliberately avoids by
    // subscribing only while it is active.
    expect(chatMountCount.current).toBe(0);
    expect(screen.queryByTestId('chat-tab')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(chatMountCount.current).toBe(1);
  });
});
