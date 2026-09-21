/**
 * The composer used to *look* disabled (`pointer-events-none opacity-50` on
 * the Root) while still sending on Enter, because `disabled` was never
 * forwarded to the input — a pointer-events trick blocks the mouse, not the
 * keyboard, and tells assistive technology nothing.
 *
 * It also rendered a stop button that only cleared local streaming state.
 * The stop button must call the real stop handler and report its in-flight
 * state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ThreadMessageLike } from '@assistant-ui/react';
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatComposer } from '@/components/features/chat/ChatComposer';

/** Send goes through an async composer pipeline — give it a tick to land. */
const SEND_SETTLE_MS = 50;

const onNew = vi.fn();

function Harness({
  disabled = false,
  isRunning = false,
  onStop,
  isStopping = false,
}: {
  disabled?: boolean;
  isRunning?: boolean;
  onStop?: () => void;
  isStopping?: boolean;
}) {
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    convertMessage: (msg: ThreadMessageLike) => msg,
    isRunning,
    onNew,
    onCancel: async () => undefined,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TooltipProvider>
        <ChatComposer
          disabled={disabled}
          onStop={onStop}
          isStopping={isStopping}
          attachments={[]}
          isDragOver={false}
          uploadError={null}
          onDragEnter={vi.fn()}
          onDragLeave={vi.fn()}
          onDragOver={vi.fn()}
          onDrop={vi.fn()}
          onPaste={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onNotesChange={vi.fn()}
          onPickFiles={vi.fn()}
        />
      </TooltipProvider>
    </AssistantRuntimeProvider>
  );
}

beforeEach(() => {
  onNew.mockClear();
});

describe('ChatComposer — disabled state', () => {
  it('forwards disabled to the input so assistive tech reports it', () => {
    render(<Harness disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('leaves the input enabled when not disabled', () => {
    render(<Harness />);
    expect(screen.getByRole('textbox')).toBeEnabled();
  });

  it('does not send on Enter while disabled', async () => {
    const { rerender } = render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ship it' } });

    rerender(<Harness disabled />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: false });
    await new Promise((resolve) => setTimeout(resolve, SEND_SETTLE_MS));
    expect(onNew).not.toHaveBeenCalled();

    // Sanity check: the same keystroke DOES send once re-enabled, so the
    // assertion above proves the disabled gate, not a broken harness.
    rerender(<Harness />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: false });
    await waitFor(() => expect(onNew).toHaveBeenCalledTimes(1));
  });

  it('does not block the keyboard with pointer-events alone', () => {
    const { container } = render(<Harness disabled />);
    const form = container.querySelector('form');
    expect(form?.className).not.toContain('pointer-events-none');
  });
});

describe('ChatComposer — stop button', () => {
  it('calls the real stop handler when the agent is running', () => {
    const onStop = vi.fn();
    render(<Harness isRunning onStop={onStop} />);

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('disables the stop button while the stop request is in flight', () => {
    const onStop = vi.fn();
    render(<Harness isRunning onStop={onStop} isStopping />);

    const stop = screen.getByRole('button', { name: /stop/i });
    expect(stop).toBeDisabled();
    fireEvent.click(stop);
    expect(onStop).not.toHaveBeenCalled();
  });

  it('shows no stop button while the agent is idle', () => {
    render(<Harness onStop={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument();
  });
});
