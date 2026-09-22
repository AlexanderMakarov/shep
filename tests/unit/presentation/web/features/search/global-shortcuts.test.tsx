import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/actions/global-search', () => ({
  globalSearch: vi.fn().mockResolvedValue({ results: [] }),
}));
vi.mock('@/hooks/turn-statuses-provider', () => ({ useTurnStatus: () => 'idle' }));
vi.mock('@/hooks/fab-layout-context', () => ({ useFabLayout: () => ({ swapPosition: false }) }));
vi.mock('@/hooks/sidebar-features-context', () => ({
  useSidebarFeaturesContext: () => ({ hasRepositories: true }),
}));
vi.mock('@/components/features/chat/ChatTab', () => ({
  ChatTab: () => <button type="button">Chat action</button>,
}));

import { GlobalChatPopup } from '@/components/features/chat/ChatSheet';
import { GlobalSearchDialog } from '@/components/features/search/global-search-dialog';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';

function SidebarState() {
  const { open } = useSidebar();
  return <output data-testid="sidebar-state">{open ? 'open' : 'closed'}</output>;
}

function renderShortcuts() {
  render(
    <SidebarProvider defaultOpen>
      <SidebarState />
      <GlobalSearchDialog />
      <GlobalChatPopup />
    </SidebarProvider>
  );
}

function expectNoShortcutUi() {
  expect(screen.queryByTestId('global-search-dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: /shep chat/i })).not.toBeInTheDocument();
  expect(screen.getByTestId('sidebar-state')).toHaveTextContent('open');
}

const primaryModifiers = [
  { name: 'Command', metaKey: true, ctrlKey: false },
  { name: 'Control', metaKey: false, ctrlKey: true },
];
const shortcuts = [
  { name: 'search', key: 'k', shiftKey: false },
  { name: 'chat', key: 'k', shiftKey: true },
  { name: 'sidebar', key: 'b', shiftKey: false },
];

beforeEach(() => {
  vi.mocked(localStorage.getItem).mockReturnValue(null);
});

describe.each(primaryModifiers)('$name global shortcuts', (modifier) => {
  it.each(['k', 'K'])('opens only search for an unshifted %s', (key) => {
    renderShortcuts();
    fireEvent.keyDown(document, { ...modifier, key });
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /shep chat/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('open');
    fireEvent.keyDown(document, { ...modifier, key });
    expectNoShortcutUi();
  });

  it.each(['k', 'K'])('opens only chat for a shifted %s', (key) => {
    renderShortcuts();
    fireEvent.keyDown(document, { ...modifier, key, shiftKey: true });
    expect(screen.queryByTestId('global-search-dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /shep chat/i })).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('open');
    fireEvent.keyDown(document, { ...modifier, key, shiftKey: true });
    expectNoShortcutUi();
  });

  it('keeps the shifted sidebar chord available to the browser', () => {
    renderShortcuts();
    const event = createEvent.keyDown(document, { ...modifier, key: 'b', shiftKey: true });
    fireEvent(document, event);
    expectNoShortcutUi();
    expect(event.defaultPrevented).toBe(false);
  });

  it('maximizes chat without opening search', () => {
    renderShortcuts();
    fireEvent.keyDown(document, { ...modifier, key: 'M', shiftKey: true });
    expect(screen.getByRole('dialog', { name: /shep chat/i })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.queryByTestId('global-search-dialog')).not.toBeInTheDocument();
  });

  for (const shortcut of shortcuts) {
    it(`does not toggle ${shortcut.name} repeatedly while its key is held`, () => {
      renderShortcuts();
      fireEvent.keyDown(document, { ...modifier, ...shortcut });
      const repeat = createEvent.keyDown(document, { ...modifier, ...shortcut, repeat: true });
      fireEvent(document, repeat);
      expect(repeat.defaultPrevented).toBe(true);
      if (shortcut.name === 'search') {
        expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
      } else if (shortcut.name === 'chat') {
        expect(screen.queryByTestId('global-search-dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: /shep chat/i })).toBeInTheDocument();
      } else {
        expect(screen.getByTestId('sidebar-state')).toHaveTextContent('closed');
      }
    });

    it(`does not capture an Alt-modified ${shortcut.name} chord`, () => {
      renderShortcuts();
      const event = createEvent.keyDown(document, { ...modifier, ...shortcut, altKey: true });
      fireEvent(document, event);
      expectNoShortcutUi();
      expect(event.defaultPrevented).toBe(false);
    });

    it(`respects an already handled ${shortcut.name} chord`, () => {
      renderShortcuts();
      const event = createEvent.keyDown(document, { ...modifier, ...shortcut });
      event.preventDefault();
      fireEvent(document, event);
      expectNoShortcutUi();
    });
  }
});
