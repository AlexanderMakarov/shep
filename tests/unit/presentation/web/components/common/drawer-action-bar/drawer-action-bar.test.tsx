import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrawerActionBar } from '@/components/common/drawer-action-bar';

/* ------------------------------------------------------------------ */
/*  Mock useSoundAction                                                */
/* ------------------------------------------------------------------ */

const mockApprovePlay = vi.fn();

vi.mock('@/hooks/use-sound-action', () => ({
  useSoundAction: vi.fn((action: string) => {
    if (action === 'approve') return { play: mockApprovePlay, stop: vi.fn(), isPlaying: false };
    return { play: vi.fn(), stop: vi.fn(), isPlaying: false };
  }),
}));

/* ------------------------------------------------------------------ */
/*  Mock sonner                                                        */
/* ------------------------------------------------------------------ */

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    warning: vi.fn(),
  },
}));

describe('DrawerActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays approve sound when approve button is clicked (no onReject)', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(<DrawerActionBar onApprove={onApprove} approveLabel="Approve" />);

    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(mockApprovePlay).toHaveBeenCalledOnce();
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('limits textarea height to 35dvh to prevent unbounded growth', () => {
    render(<DrawerActionBar onApprove={vi.fn()} approveLabel="Approve" onReject={vi.fn()} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea.className).toContain('max-h-[35dvh]');
    expect(textarea.className).toContain('overflow-y-auto');
  });

  /* ---------------------------------------------------------------- */
  /*  P0-4 — two unambiguous buttons, no meaning flip                  */
  /* ---------------------------------------------------------------- */

  describe('split Reject / Approve controls (P0-4)', () => {
    it('renders two separate buttons whose accessible names never merge', () => {
      render(
        <DrawerActionBar onApprove={vi.fn()} approveLabel="Approve Merge" onReject={vi.fn()} />
      );

      const reject = screen.getByTestId('drawer-action-reject');
      const approve = screen.getByTestId('drawer-action-approve');

      expect(reject).not.toBe(approve);
      // The old single control's accessible name was literally "Reject Approve Merge".
      expect(reject).toHaveAccessibleName('Reject');
      expect(approve).toHaveAccessibleName('Approve Merge');
    });

    it('keeps both accessible names stable when the user types feedback', async () => {
      render(
        <DrawerActionBar onApprove={vi.fn()} approveLabel="Approve Merge" onReject={vi.fn()} />
      );

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'needs changes' } });

      await waitFor(() => {
        expect(screen.getByTestId('drawer-action-reject')).toHaveAccessibleName('Reject');
      });
      expect(screen.getByTestId('drawer-action-approve')).toHaveAccessibleName('Approve Merge');
    });

    it('approve stays approve when the textarea has text (no hover/modifier flip)', () => {
      const onApprove = vi.fn();
      const onReject = vi.fn();
      render(
        <DrawerActionBar onApprove={onApprove} approveLabel="Approve Merge" onReject={onReject} />
      );

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'some feedback' } });
      fireEvent.click(screen.getByTestId('drawer-action-approve'));

      expect(onApprove).toHaveBeenCalledOnce();
      expect(onReject).not.toHaveBeenCalled();
    });

    it('reject stays reject when the textarea is empty (button disabled, nothing fires)', () => {
      const onApprove = vi.fn();
      const onReject = vi.fn();
      render(
        <DrawerActionBar onApprove={onApprove} approveLabel="Approve Merge" onReject={onReject} />
      );

      const reject = screen.getByTestId('drawer-action-reject');
      expect(reject).toBeDisabled();

      fireEvent.click(reject);
      expect(onReject).not.toHaveBeenCalled();
      expect(onApprove).not.toHaveBeenCalled();
    });

    it('rejects with the typed feedback when the reject button is clicked', async () => {
      const user = userEvent.setup();
      const onReject = vi.fn();
      render(<DrawerActionBar onApprove={vi.fn()} approveLabel="Approve" onReject={onReject} />);

      await user.type(screen.getByRole('textbox'), 'please revise this');
      await user.click(screen.getByTestId('drawer-action-reject'));

      expect(onReject).toHaveBeenCalledWith('please revise this', []);
    });

    it('approves from the keyboard without any mouse position (Ctrl+Shift+Enter)', () => {
      const onApprove = vi.fn();
      render(<DrawerActionBar onApprove={onApprove} approveLabel="Approve" onReject={vi.fn()} />);

      fireEvent.keyDown(screen.getByRole('textbox'), {
        key: 'Enter',
        ctrlKey: true,
        shiftKey: true,
      });

      expect(onApprove).toHaveBeenCalledOnce();
    });

    it('rejects from the keyboard with Ctrl+Enter', () => {
      const onReject = vi.fn();
      render(<DrawerActionBar onApprove={vi.fn()} approveLabel="Approve" onReject={onReject} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'fix the copy' } });
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(onReject).toHaveBeenCalledWith('fix the copy', []);
    });

    it('disables all controls when isProcessing is true', () => {
      render(
        <DrawerActionBar
          onApprove={vi.fn()}
          approveLabel="Approve"
          onReject={vi.fn()}
          isProcessing
        />
      );

      expect(screen.getByRole('textbox')).toBeDisabled();
      expect(screen.getByTestId('drawer-action-reject')).toBeDisabled();
      expect(screen.getByTestId('drawer-action-approve')).toBeDisabled();
      expect(mockApprovePlay).not.toHaveBeenCalled();
    });

    it('marks the approve control aria-busy while an approval is in flight', () => {
      const { rerender } = render(
        <DrawerActionBar onApprove={vi.fn()} approveLabel="Approve" onReject={vi.fn()} />
      );

      expect(screen.getByTestId('drawer-action-approve')).toHaveAttribute('aria-busy', 'false');

      rerender(
        <DrawerActionBar
          onApprove={vi.fn()}
          approveLabel="Approve"
          onReject={vi.fn()}
          isProcessing
        />
      );

      expect(screen.getByTestId('drawer-action-approve')).toHaveAttribute('aria-busy', 'true');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  P0-4 — confirmation dialog naming the target                     */
  /* ---------------------------------------------------------------- */

  describe('approve confirmation (P0-4)', () => {
    const confirm = {
      title: 'Merge this branch?',
      description: 'Merging feat/login into main (PR #42). This cannot be undone.',
      confirmLabel: 'Merge',
    };

    it('does not approve on the first click — it opens a dialog naming the target', () => {
      const onApprove = vi.fn();
      render(
        <DrawerActionBar
          onApprove={onApprove}
          approveLabel="Approve Merge"
          onReject={vi.fn()}
          approveConfirm={confirm}
        />
      );

      fireEvent.click(screen.getByTestId('drawer-action-approve'));

      expect(onApprove).not.toHaveBeenCalled();
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveTextContent('Merge this branch?');
      expect(dialog).toHaveTextContent('feat/login');
      expect(dialog).toHaveTextContent('main');
      expect(dialog).toHaveTextContent('PR #42');
    });

    it('approves once the dialog action is confirmed', async () => {
      const onApprove = vi.fn();
      render(
        <DrawerActionBar
          onApprove={onApprove}
          approveLabel="Approve Merge"
          onReject={vi.fn()}
          approveConfirm={confirm}
        />
      );

      fireEvent.click(screen.getByTestId('drawer-action-approve'));
      fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

      await waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
      expect(mockApprovePlay).toHaveBeenCalledOnce();
    });

    it('does not approve when the dialog is cancelled', async () => {
      const onApprove = vi.fn();
      render(
        <DrawerActionBar
          onApprove={onApprove}
          approveLabel="Approve Merge"
          onReject={vi.fn()}
          approveConfirm={confirm}
        />
      );

      fireEvent.click(screen.getByTestId('drawer-action-approve'));
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(onApprove).not.toHaveBeenCalled();
    });

    it('routes the keyboard accelerator through the same dialog', () => {
      const onApprove = vi.fn();
      render(
        <DrawerActionBar
          onApprove={onApprove}
          approveLabel="Approve Merge"
          onReject={vi.fn()}
          approveConfirm={confirm}
        />
      );

      fireEvent.keyDown(screen.getByRole('textbox'), {
        key: 'Enter',
        ctrlKey: true,
        shiftKey: true,
      });

      expect(onApprove).not.toHaveBeenCalled();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  P0-4b — a failed reject must not destroy the user's work         */
  /* ---------------------------------------------------------------- */

  describe('failed reject preserves the draft (P0-4b)', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('keeps the typed feedback and reports the failure when onReject reports !ok', async () => {
      const onReject = vi.fn().mockResolvedValue({ ok: false, error: 'Agent run is gone' });
      render(
        <DrawerActionBar
          onApprove={vi.fn()}
          approveLabel="Approve"
          onReject={onReject}
          revisionPlaceholder="Ask AI to revise..."
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'this is my long feedback' } });
      fireEvent.click(screen.getByTestId('drawer-action-reject'));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Agent run is gone'));
      expect(textarea).toHaveValue('this is my long feedback');
    });

    it('keeps the typed feedback when onReject throws', async () => {
      const onReject = vi.fn().mockRejectedValue(new Error('network down'));
      render(<DrawerActionBar onApprove={vi.fn()} approveLabel="Approve" onReject={onReject} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'keep me' } });
      fireEvent.click(screen.getByTestId('drawer-action-reject'));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('network down'));
      expect(textarea).toHaveValue('keep me');
    });

    it('clears the form only after a successful reject', async () => {
      const onReject = vi.fn().mockResolvedValue({ ok: true });
      render(<DrawerActionBar onApprove={vi.fn()} approveLabel="Approve" onReject={onReject} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'ship it differently' } });
      fireEvent.click(screen.getByTestId('drawer-action-reject'));

      await waitFor(() => expect(textarea).toHaveValue(''));
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it('preserves uploaded attachments when the reject fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'notes.txt',
          size: 1024,
          mimeType: 'text/plain',
          path: '/tmp/uploads/notes.txt',
        }),
      }) as unknown as typeof globalThis.fetch;

      const onReject = vi.fn().mockResolvedValue({ ok: false, error: 'rejected failed' });
      render(<DrawerActionBar onApprove={vi.fn()} approveLabel="Approve" onReject={onReject} />);

      const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
      fireEvent.drop(screen.getByRole('region'), { dataTransfer: { files: [file] } });

      await waitFor(() => expect(screen.getByText('notes.txt')).toBeInTheDocument());

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'see the diagram' } });
      fireEvent.click(screen.getByTestId('drawer-action-reject'));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(screen.getByText('notes.txt')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveValue('see the diagram');
    });
  });
});
