import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClusterNode } from '@/components/common/cluster-node/cluster-node';
import type { ClusterNodeData } from '@/components/common/cluster-node/cluster-node-config';
import { ClusterStatus } from '@shepai/core/domain/generated/output';

// Mock @xyflow/react — ClusterNode only needs Handle and Position.
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}-${position}`} />
  ),
  Position: { Left: 'left', Right: 'right' },
}));

// Mock radix-ui tooltip — render trigger children directly, hide content to avoid DOM noise
vi.mock('radix-ui', () => ({
  Tooltip: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Trigger: ({ children }: { children: React.ReactNode; [key: string]: unknown }) => (
      <>{children}</>
    ),
    Content: ({ children }: { children: React.ReactNode }) => (
      <div role="tooltip" hidden>
        {children}
      </div>
    ),
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Arrow: () => null,
  },
  Slot: {
    Root: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const defaultData: ClusterNodeData = {
  id: 'cluster-1',
  name: 'prod-eu-west',
  status: ClusterStatus.Ready,
  linkedRepoCount: 2,
  linkedAppCount: 3,
};

function renderClusterNode(dataOverrides?: Partial<ClusterNodeData>) {
  return render(<ClusterNode data={{ ...defaultData, ...dataOverrides }} />);
}

describe('ClusterNode keyboard activation (P0-3)', () => {
  it('exposes the cluster name — not the card — as the activatable control', () => {
    renderClusterNode({ onClick: vi.fn() });

    const title = screen.getByRole('button', { name: 'prod-eu-west' });
    expect(title).toBe(screen.getByTestId('cluster-node-name'));
    expect(title).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('cluster-node-card')).not.toHaveAttribute('role', 'button');
  });

  it('gives the title a visible focus indicator', () => {
    renderClusterNode({ onClick: vi.fn() });

    expect(screen.getByTestId('cluster-node-name').className).toMatch(/focus-visible:/);
  });

  it('never nests a real button inside an element with role="button"', () => {
    const { container } = renderClusterNode({ onClick: vi.fn(), onDelete: vi.fn() });

    const nested = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.parentElement?.closest('[role="button"]')
    );
    expect(nested).toEqual([]);
  });

  it('opens the cluster on Enter', () => {
    const onClick = vi.fn();
    renderClusterNode({ onClick });

    fireEvent.keyDown(screen.getByTestId('cluster-node-name'), { key: 'Enter' });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('opens the cluster on Space', () => {
    const onClick = vi.fn();
    renderClusterNode({ onClick });

    fireEvent.keyDown(screen.getByTestId('cluster-node-name'), { key: ' ' });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ignores other keys', () => {
    const onClick = vi.fn();
    renderClusterNode({ onClick });

    fireEvent.keyDown(screen.getByTestId('cluster-node-name'), { key: 'a' });

    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the mouse path — clicking the card still opens it once', () => {
    const onClick = vi.fn();
    renderClusterNode({ onClick });

    fireEvent.click(screen.getByTestId('cluster-node-card'));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not open the cluster when the delete button is clicked', () => {
    const onClick = vi.fn();
    renderClusterNode({ onClick, onDelete: vi.fn() });

    fireEvent.click(screen.getByTestId('cluster-node-delete-button'));

    expect(onClick).not.toHaveBeenCalled();
  });
});
