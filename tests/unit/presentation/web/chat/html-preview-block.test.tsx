/**
 * The fullscreen HTML preview was a hand-rolled `createPortal` lightbox at
 * `z-[9999]`: no dialog role, no accessible name, no Escape, no focus
 * management, and a click-anywhere backdrop. It now goes through the
 * project's dialog primitive.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HtmlPreviewBlock } from '@/components/assistant-ui/thread';

const CODE = '<html><body><h1>Hello</h1></body></html>';

function openFullscreen() {
  fireEvent.click(screen.getByRole('button', { name: /fullscreen/i }));
}

beforeEach(() => {
  render(<HtmlPreviewBlock code={CODE} language="html" />);
});

describe('HtmlPreviewBlock — fullscreen preview', () => {
  it('opens as a dialog with an accessible name', () => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openFullscreen();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName(/preview/i);
  });

  it('closes on Escape', () => {
    openFullscreen();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers a labelled close control', () => {
    openFullscreen();
    const close = screen.getByRole('button', { name: /close/i });

    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('still switches between preview and code inside the dialog', () => {
    openFullscreen();
    const dialog = screen.getByRole('dialog');

    // The dialog is modal, so the inline block's own tabs are hidden from
    // the accessibility tree while it is open — this is the dialog's Code tab.
    fireEvent.click(screen.getByRole('button', { name: /^code$/i }));
    expect(dialog.textContent).toContain('<h1>Hello</h1>');
  });
});
