import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { DrawerActionBar } from './drawer-action-bar';

const meta: Meta<typeof DrawerActionBar> = {
  title: 'Drawers/Base/DrawerActionBar',
  component: DrawerActionBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    onApprove: fn().mockName('onApprove'),
    approveLabel: 'Approve',
  },
  decorators: [
    (Story) => (
      <div className="w-[400px] rounded-md border">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DrawerActionBar>;

/** Default — approve-only button (no reject input). */
export const Default: Story = {};

/**
 * Two-button bar: Reject and Approve are separate controls with fixed labels.
 * Neither one's meaning changes with hover position or held modifier keys, and
 * Reject stays disabled until there is feedback to send.
 */
export const WithReject: Story = {
  args: {
    onReject: fn().mockName('onReject'),
    approveLabel: 'Approve',
  },
};

/** Processing state — all controls disabled, approve marked `aria-busy`. */
export const Processing: Story = {
  args: {
    onReject: fn().mockName('onReject'),
    approveLabel: 'Approve',
    isProcessing: true,
  },
};

/** Rejecting state — all controls disabled. */
export const Rejecting: Story = {
  args: {
    onReject: fn().mockName('onReject'),
    approveLabel: 'Approve',
    isRejecting: true,
  },
};

/** Custom revision placeholder. */
export const WithRevisionInput: Story = {
  args: {
    onReject: fn().mockName('onReject'),
    approveLabel: 'Approve Plan',
    revisionPlaceholder: 'Ask AI to revise the plan...',
  },
};

/** Long approve label — e.g. "Approve Requirements" from PRD review. */
export const LongApproveLabel: Story = {
  args: {
    onReject: fn().mockName('onReject'),
    approveLabel: 'Approve Requirements',
  },
};

/**
 * Irreversible approve — clicking Approve opens a confirmation that NAMES the
 * branch and PR being merged, so the user confirms against the right target.
 */
export const WithApproveConfirmation: Story = {
  args: {
    onReject: fn().mockName('onReject'),
    approveLabel: 'Approve Merge',
    revisionPlaceholder: 'Ask AI to revise before merging...',
    approveConfirm: {
      title: 'Approve merge?',
      description: 'This merges feat/login into main via PR #42. This cannot be undone.',
      confirmLabel: 'Approve Merge',
    },
  },
};

/** Warning variant — used when the pull request reports merge conflicts. */
export const WarningVariant: Story = {
  args: {
    onReject: fn().mockName('onReject'),
    approveLabel: 'Approve Merge',
    approveVariant: 'warning',
    approveConfirm: {
      title: 'Approve merge?',
      description:
        'This merges feat/login into main via PR #42. GitHub reports merge conflicts on this pull request. This cannot be undone.',
      confirmLabel: 'Approve Merge',
    },
  },
};
