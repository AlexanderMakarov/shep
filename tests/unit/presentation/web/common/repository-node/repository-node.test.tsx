import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider, ReactFlow } from '@xyflow/react';

vi.mock('@/hooks/use-turn-statuses', () => ({
  useTurnStatus: () => 'idle',
  useTurnStatusSync: vi.fn(),
}));
import { RepositoryNode } from '@/components/common/repository-node';
import type { RepositoryNodeData, RepositoryNodeType } from '@/components/common/repository-node';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

const nodeTypes = { repositoryNode: RepositoryNode };

const defaultData: RepositoryNodeData = {
  name: 'shep-ai/shep',
};

function renderRepositoryNode(dataOverrides?: Partial<RepositoryNodeData>) {
  const data = { ...defaultData, ...dataOverrides };
  const nodes: RepositoryNodeType[] = [
    { id: 'test-node', type: 'repositoryNode', position: { x: 0, y: 0 }, data },
  ];
  return render(
    <ReactFlowProvider>
      <ReactFlow nodes={nodes} nodeTypes={nodeTypes} proOptions={{ hideAttribution: true }} />
    </ReactFlowProvider>
  );
}

describe('RepositoryNode', () => {
  it('renders repository name', () => {
    renderRepositoryNode({ name: 'shep-ai/shep' });
    expect(screen.getByText('shep-ai/shep')).toBeInTheDocument();
  });

  it('renders GitHub icon', () => {
    const { container } = renderRepositoryNode();
    const svg = container.querySelector('svg.lucide-github');
    expect(svg).toBeInTheDocument();
  });

  it('does not render add button when onAdd is not provided', () => {
    renderRepositoryNode();
    expect(screen.queryByTestId('repository-node-add-button')).not.toBeInTheDocument();
  });

  it('renders add button when onAdd is provided', () => {
    renderRepositoryNode({ onAdd: () => undefined });
    expect(screen.getByTestId('repository-node-add-button')).toBeInTheDocument();
  });

  it('add button fires onAdd callback', () => {
    const onAdd = vi.fn();
    renderRepositoryNode({ onAdd });
    const addButton = screen.getByTestId('repository-node-add-button');
    fireEvent.click(addButton);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('renders Handle components when showHandles is true', () => {
    const { container } = renderRepositoryNode({ showHandles: true });
    const handles = container.querySelectorAll('.react-flow__handle');
    expect(handles.length).toBeGreaterThanOrEqual(1);
  });

  it('renders source handle when onAdd is provided', () => {
    const { container } = renderRepositoryNode({ onAdd: () => undefined });
    const sourceHandle = container.querySelector('.react-flow__handle-right');
    expect(sourceHandle).toBeInTheDocument();
  });
});

describe('RepositoryNode keyboard activation (P0-3)', () => {
  it('exposes the repository name — not the card — as the activatable control', () => {
    // Queried by test id, not by accessible name: React Flow leaves an
    // unmeasured node at `visibility: hidden`, which jsdom never resolves, so
    // name computation reports the whole card as hidden.
    renderRepositoryNode({ name: 'shep-ai/shep', onClick: vi.fn() });

    const title = screen.getByTestId('repository-node-name');
    expect(title).toHaveAttribute('role', 'button');
    expect(title).toHaveAttribute('tabindex', '0');
    expect(title).toHaveTextContent('shep-ai/shep');
    expect(screen.getByTestId('repository-node-card')).not.toHaveAttribute('role', 'button');
    expect(screen.getByTestId('repository-node-card')).not.toHaveAttribute('tabindex');
  });

  it('gives the title a visible focus indicator', () => {
    renderRepositoryNode({ onClick: vi.fn() });

    expect(screen.getByTestId('repository-node-name').className).toMatch(/focus-visible:/);
  });

  it('never nests a real button inside an element with role="button"', () => {
    const { container } = renderRepositoryNode({
      onClick: vi.fn(),
      onAdd: vi.fn(),
      id: 'repo-1',
      onDelete: vi.fn(),
    });

    const nested = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.parentElement?.closest('[role="button"]')
    );
    expect(nested).toEqual([]);
  });

  it('opens the repository on Enter', () => {
    const onClick = vi.fn();
    renderRepositoryNode({ onClick });

    fireEvent.keyDown(screen.getByTestId('repository-node-name'), { key: 'Enter' });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('opens the repository on Space', () => {
    const onClick = vi.fn();
    renderRepositoryNode({ onClick });

    fireEvent.keyDown(screen.getByTestId('repository-node-name'), { key: ' ' });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ignores other keys', () => {
    const onClick = vi.fn();
    renderRepositoryNode({ onClick });

    fireEvent.keyDown(screen.getByTestId('repository-node-name'), { key: 'a' });

    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the mouse path — clicking the card still opens it once', () => {
    const onClick = vi.fn();
    renderRepositoryNode({ onClick });

    fireEvent.click(screen.getByTestId('repository-node-card'));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not open the repository when an inner button is clicked', () => {
    const onClick = vi.fn();
    renderRepositoryNode({ onClick, onAdd: vi.fn() });

    fireEvent.click(screen.getByTestId('repository-node-add-button'));

    expect(onClick).not.toHaveBeenCalled();
  });
});
