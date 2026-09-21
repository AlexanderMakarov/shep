import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGroups = [
  {
    agentType: 'claude-code',
    label: 'Claude Code',
    models: [
      { id: 'opus-4', displayName: 'Opus 4', description: 'Most capable' },
      { id: 'sonnet-4', displayName: 'Sonnet 4', description: 'Fast' },
    ],
  },
  {
    agentType: 'dev',
    label: 'Demo',
    models: [],
  },
];

vi.mock('@/app/actions/get-all-agent-models', () => ({
  getAllAgentModels: vi.fn(),
}));

vi.mock('@/app/actions/update-agent-and-model', () => ({
  updateAgentAndModel: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

vi.mock('@/components/common/feature-node/agent-type-icons', () => ({
  getAgentTypeIcon: () => {
    function MockIcon(props: Record<string, unknown>) {
      return <span data-testid="agent-icon" {...props} />;
    }
    return MockIcon;
  },
}));

vi.mock('@/lib/model-metadata', () => ({
  getModelMeta: (id: string) => ({
    displayName: id,
    description: `Description for ${id}`,
  }),
}));

vi.mock('next/image', () => ({
  default: function MockImage(props: Record<string, unknown>) {
    return <img {...props} />;
  },
}));

import { toast } from 'sonner';
import { getAllAgentModels } from '@/app/actions/get-all-agent-models';
import { updateAgentAndModel } from '@/app/actions/update-agent-and-model';
import { WelcomeAgentSetup } from '@/components/features/control-center/welcome-agent-setup';

const mockedGetAllAgentModels = vi.mocked(getAllAgentModels);
const mockedUpdateAgentAndModel = vi.mocked(updateAgentAndModel);
const mockedToastError = vi.mocked(toast.error);

describe('WelcomeAgentSetup', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAllAgentModels.mockResolvedValue(mockGroups);
    mockedUpdateAgentAndModel.mockResolvedValue({ ok: true });
  });

  it('announces agent loading to assistive technology', () => {
    mockedGetAllAgentModels.mockReturnValueOnce(
      new Promise(() => {
        /* Keep the loading state pending. */
      })
    );
    render(<WelcomeAgentSetup onComplete={onComplete} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading agents');
  });

  it('moves keyboard focus to the new step heading', async () => {
    render(<WelcomeAgentSetup onComplete={onComplete} />);
    await userEvent.click(await screen.findByTestId('agent-option-claude-code'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Choose your agent' })).toHaveFocus()
    );
  });

  it('renders agent list after loading', async () => {
    render(<WelcomeAgentSetup onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByTestId('agent-list')).toBeInTheDocument();
    });

    expect(screen.getByTestId('agent-option-claude-code')).toBeInTheDocument();
    expect(screen.getByTestId('agent-option-dev')).toBeInTheDocument();
  });

  it('shows model list after selecting an agent with models', async () => {
    const user = userEvent.setup();
    render(<WelcomeAgentSetup onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByTestId('agent-option-claude-code')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('agent-option-claude-code'));

    await waitFor(() => {
      expect(screen.getByTestId('model-list')).toBeInTheDocument();
    });
  });

  it('auto-completes for agents without models', async () => {
    const user = userEvent.setup();
    render(<WelcomeAgentSetup onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByTestId('agent-option-dev')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('agent-option-dev'));

    // Saves immediately and calls onComplete (no tool check step)
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('completes after selecting agent and model', async () => {
    const user = userEvent.setup();
    render(<WelcomeAgentSetup onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByTestId('agent-option-claude-code')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('agent-option-claude-code'));

    await waitFor(() => {
      expect(screen.getByTestId('model-list')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('model-option-opus-4'));

    // Saves immediately and calls onComplete (no tool check step)
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('shows loading state initially', () => {
    render(<WelcomeAgentSetup onComplete={onComplete} />);
    expect(screen.getByText('Loading agents…')).toBeInTheDocument();
  });

  it('renders step indicator', async () => {
    render(<WelcomeAgentSetup onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByTestId('welcome-agent-setup')).toBeInTheDocument();
    });

    expect(screen.getByText('Choose your agent')).toBeInTheDocument();
  });

  describe('load failure', () => {
    it('renders a distinct error state when the agent catalog cannot be loaded', async () => {
      mockedGetAllAgentModels.mockRejectedValueOnce(new Error('boom'));

      render(<WelcomeAgentSetup onComplete={onComplete} />);

      await waitFor(() => {
        expect(screen.getByTestId('welcome-agent-setup-error')).toBeInTheDocument();
      });

      // The dead-screen defect: an error must never be rendered as an empty grid
      expect(screen.queryByTestId('agent-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('welcome-agent-setup-empty')).not.toBeInTheDocument();
      expect(screen.getByTestId('welcome-agent-setup-retry')).toBeInTheDocument();
    });

    it('re-runs the fetch and recovers when Retry is pressed', async () => {
      const user = userEvent.setup();
      mockedGetAllAgentModels.mockRejectedValueOnce(new Error('boom'));

      render(<WelcomeAgentSetup onComplete={onComplete} />);

      await waitFor(() => {
        expect(screen.getByTestId('welcome-agent-setup-retry')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('welcome-agent-setup-retry'));

      await waitFor(() => {
        expect(screen.getByTestId('agent-list')).toBeInTheDocument();
      });
      expect(mockedGetAllAgentModels).toHaveBeenCalledTimes(2);
    });
  });

  describe('no agents installed', () => {
    it('renders a distinct empty state with install guidance and a re-check control', async () => {
      mockedGetAllAgentModels.mockResolvedValueOnce([]);

      render(<WelcomeAgentSetup onComplete={onComplete} />);

      await waitFor(() => {
        expect(screen.getByTestId('welcome-agent-setup-empty')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('welcome-agent-setup-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('welcome-agent-setup-retry')).toBeInTheDocument();
    });

    it('never renders an agent grid with zero columns', async () => {
      mockedGetAllAgentModels.mockResolvedValueOnce([]);

      const { container } = render(<WelcomeAgentSetup onComplete={onComplete} />);

      await waitFor(() => {
        expect(screen.getByTestId('welcome-agent-setup-empty')).toBeInTheDocument();
      });

      expect(container.innerHTML).not.toContain('repeat(0');
    });

    it('re-checks for agents when the empty state control is pressed', async () => {
      const user = userEvent.setup();
      mockedGetAllAgentModels.mockResolvedValueOnce([]);

      render(<WelcomeAgentSetup onComplete={onComplete} />);

      await waitFor(() => {
        expect(screen.getByTestId('welcome-agent-setup-retry')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('welcome-agent-setup-retry'));

      await waitFor(() => {
        expect(screen.getByTestId('agent-option-claude-code')).toBeInTheDocument();
      });
    });
  });

  describe('agent grid columns', () => {
    it('clamps the column count to at most four', async () => {
      mockedGetAllAgentModels.mockResolvedValueOnce(
        Array.from({ length: 6 }, (_, i) => ({
          agentType: `agent-${i}`,
          label: `Agent ${i}`,
          models: [],
        }))
      );

      render(<WelcomeAgentSetup onComplete={onComplete} />);

      const list = await screen.findByTestId('agent-list');
      expect(list).toHaveStyle({ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' });
    });
  });

  describe('failed save', () => {
    it('surfaces a toast instead of failing silently when the save rejects', async () => {
      const user = userEvent.setup();
      mockedUpdateAgentAndModel.mockRejectedValueOnce(new Error('network down'));

      render(<WelcomeAgentSetup onComplete={onComplete} />);

      await waitFor(() => {
        expect(screen.getByTestId('agent-option-dev')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('agent-option-dev'));

      await waitFor(() => {
        expect(mockedToastError).toHaveBeenCalled();
      });
      expect(onComplete).not.toHaveBeenCalled();
      // The wizard stays usable after a failed save
      expect(screen.getByTestId('agent-option-dev')).not.toBeDisabled();
    });

    it('surfaces a toast when the action reports a failure result', async () => {
      const user = userEvent.setup();
      mockedUpdateAgentAndModel.mockResolvedValueOnce({ ok: false, error: 'agent missing' });

      render(<WelcomeAgentSetup onComplete={onComplete} />);

      await waitFor(() => {
        expect(screen.getByTestId('agent-option-dev')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('agent-option-dev'));

      await waitFor(() => {
        expect(mockedToastError).toHaveBeenCalled();
      });
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('in-flight save', () => {
    it('marks the pending control busy and announces the save', async () => {
      const user = userEvent.setup();
      let release: (value: { ok: boolean }) => void = () => {
        /* replaced synchronously by the promise executor below */
      };
      mockedUpdateAgentAndModel.mockReturnValueOnce(
        new Promise<{ ok: boolean }>((resolve) => {
          release = resolve;
        })
      );

      render(<WelcomeAgentSetup onComplete={onComplete} />);

      await waitFor(() => {
        expect(screen.getByTestId('agent-option-dev')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('agent-option-dev'));

      await waitFor(() => {
        expect(screen.getByTestId('agent-option-dev')).toHaveAttribute('aria-busy', 'true');
      });
      expect(screen.getByTestId('welcome-agent-setup-saving')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(/saving/i);

      release({ ok: true });
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });
    });
  });
});
