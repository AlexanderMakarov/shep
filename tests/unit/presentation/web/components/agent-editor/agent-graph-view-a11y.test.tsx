/**
 * The xyflow canvas renders `role="application"`, which makes a screen reader
 * switch interaction mode. An unnamed application region gives the user no
 * explanation of what they just entered, so the region must be named — the
 * same treatment `features/aspm/asset-risk-graph` already applies.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentGraphView } from '@/components/agent-editor/agent-graph-view';

vi.mock('@/app/actions/agent-graph', () => ({
  saveAgentGraph: vi.fn(),
  resetAgentGraph: vi.fn(),
}));

const graph = {
  agentType: 'claude-code',
  nodes: [
    { id: 'analyze', label: 'Analyze' },
    { id: 'implement', label: 'Implement' },
  ],
  edges: [{ from: 'analyze', to: 'implement' }],
};

describe('AgentGraphView — named application region (A12)', () => {
  it('names the role="application" region', () => {
    render(<AgentGraphView graph={graph} />);

    const region = screen.getByRole('application');
    expect(region).toHaveAccessibleName();
    expect(region.getAttribute('aria-label')).toBeTruthy();
  });

  it('says what the region is, not just that it exists', () => {
    render(<AgentGraphView graph={graph} />);

    expect(screen.getByRole('application').getAttribute('aria-label')).toMatch(/graph/i);
  });
});
