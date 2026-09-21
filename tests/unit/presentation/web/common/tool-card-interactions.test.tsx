import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolItem } from '@shepai/core/application/use-cases/tools/list-tools.use-case';

vi.mock('@/components/features/tools/tool-detail-drawer', () => ({
  ToolDetailDrawer: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Tool details</div> : null,
}));

import { ToolCard } from '@/components/features/tools/tool-card';

const tool = {
  id: 'vscode',
  name: 'VS Code',
  summary: 'Code editor',
  tags: ['ide'],
  iconUrl: '/missing-tool.svg',
  status: { status: 'available' },
  openDirectory: 'code {directory}',
  autoInstall: false,
} as ToolItem;

afterEach(() => vi.unstubAllGlobals());

describe('tool card interactions', () => {
  it('opens details from a named keyboard-accessible control', async () => {
    render(<ToolCard tool={tool} />);
    const control = screen.getByRole('button', { name: 'VS Code' });
    control.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('replaces a failed external image with a usable fallback', () => {
    render(<ToolCard tool={tool} />);
    const image = screen.getByAltText('');
    fireEvent.error(image);
    expect(image).not.toBeInTheDocument();
  });

  it('reports launch failures and permits retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ error: 'Could not launch editor' }) });
    vi.stubGlobal('fetch', fetch);
    render(<ToolCard tool={tool} />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch VS Code' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not launch editor')
    );
    expect(screen.getByRole('button', { name: 'Launch VS Code' })).not.toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
