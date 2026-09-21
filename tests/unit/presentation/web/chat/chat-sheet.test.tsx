/**
 * The global chat popup is a hand-rolled overlay: it had no dialog role, no
 * accessible name, no Escape, no focus management, and — because it stays
 * mounted after the first open — it kept leaking into the accessibility tree
 * and the tab order while "closed".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@/hooks/turn-statuses-provider', () => ({
  useTurnStatus: () => 'idle',
}));
vi.mock('@/hooks/fab-layout-context', () => ({
  useFabLayout: () => ({ swapPosition: false }),
}));
vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ state: 'expanded' }),
}));
vi.mock('@/hooks/sidebar-features-context', () => ({
  useSidebarFeaturesContext: () => ({ hasRepositories: true }),
}));
vi.mock('@/components/features/chat/ChatTab', () => ({
  ChatTab: () => (
    <div>
      <button type="button">chat action</button>
    </div>
  ),
}));

import { GlobalChatPopup } from '@/components/features/chat/ChatSheet';

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: /shep chat/i }));
  return screen.getByRole('dialog');
}

beforeEach(() => {
  vi.mocked(localStorage.getItem).mockReturnValue(null);
});

describe('GlobalChatPopup — dialog semantics', () => {
  it('names the launcher so it is reachable by role', () => {
    render(<GlobalChatPopup />);
    expect(screen.getByRole('button', { name: /shep chat/i })).toBeInTheDocument();
  });

  it('exposes the panel as a named dialog once opened', () => {
    render(<GlobalChatPopup />);
    const dialog = openPanel();
    expect(dialog).toHaveAccessibleName(/shep chat/i);
  });

  it('closes on Escape', () => {
    render(<GlobalChatPopup />);
    openPanel();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the closed panel out of the accessibility tree and tab order', () => {
    const { container } = render(<GlobalChatPopup />);
    openPanel();
    fireEvent.keyDown(document, { key: 'Escape' });

    // The panel stays mounted (it keeps its chat state) — but it must not be
    // reachable while closed.
    const panel = container.querySelector('[data-slot="global-chat-panel"]');
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
  });

  it('restores focus to the launcher when it closes', () => {
    render(<GlobalChatPopup />);
    const fab = screen.getByRole('button', { name: /shep chat/i });
    fab.focus();
    openPanel();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(fab);
  });
});

describe('GlobalChatPopup — focus containment while maximized', () => {
  it('wraps Tab from the last control back to the first', () => {
    render(<GlobalChatPopup />);
    const dialog = openPanel();
    // Maximize: the panel now covers the page, so it is genuinely modal.
    fireEvent.click(within(dialog).getByRole('button', { name: /maximize/i }));

    const focusables = Array.from(
      screen.getByRole('dialog').querySelectorAll<HTMLElement>('button, textarea, [href]')
    );
    const last = focusables[focusables.length - 1];
    last.focus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);
  });

  it('wraps Shift+Tab from the first control back to the last', () => {
    render(<GlobalChatPopup />);
    const dialog = openPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: /maximize/i }));

    const focusables = Array.from(
      screen.getByRole('dialog').querySelectorAll<HTMLElement>('button, textarea, [href]')
    );
    focusables[0].focus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it('marks the maximized panel modal and the floating panel non-modal', () => {
    render(<GlobalChatPopup />);
    const dialog = openPanel();
    expect(dialog).toHaveAttribute('aria-modal', 'false');

    fireEvent.click(within(dialog).getByRole('button', { name: /maximize/i }));
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
