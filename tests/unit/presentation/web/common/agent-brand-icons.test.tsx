import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getAgentTypeIcon } from '@/components/common/feature-node/agent-type-icons';
import { getEditorTypeIcon } from '@/components/common/editor-type-icons';

describe('shared brand icons', () => {
  it('respects decorative semantics when the adjacent text names the agent', () => {
    const Icon = getAgentTypeIcon('codex-cli');
    render(<Icon aria-hidden style={{ width: 40, height: 40 }} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { hidden: true })).toHaveStyle({
      width: '40px',
      height: '40px',
    });
  });

  it('keeps local agent and editor artwork independent of the image optimizer', () => {
    const AgentIcon = getAgentTypeIcon('cursor');
    const EditorIcon = getEditorTypeIcon('cursor');
    render(
      <>
        <AgentIcon />
        <EditorIcon />
      </>
    );

    for (const icon of screen.getAllByRole('img')) {
      expect(icon.getAttribute('src')).toMatch(/^\/icons\//);
      expect(icon.getAttribute('src')).not.toContain('/_next/image');
    }
  });
});
