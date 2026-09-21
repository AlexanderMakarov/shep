import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicationCard } from '@/components/features/applications/application-card';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';
import { openDirectory } from '@/app/actions/open-directory';
import { toast } from 'sonner';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/turn-statuses-provider', () => ({ useTurnStatus: () => 'idle' }));
vi.mock('@/hooks/use-deploy-action', () => ({ useDeployAction: () => ({}) }));
vi.mock('@/app/actions/delete-application', () => ({ deleteApplication: vi.fn() }));
vi.mock('@/app/actions/open-directory', () => ({ openDirectory: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const app: ApplicationWithStatus = {
  id: 'weather',
  name: 'Weather Dashboard',
  slug: 'weather',
  description: 'Forecasts',
  repositoryPath: '/projects/weather',
  additionalPaths: [],
  status: ApplicationStatus.Active,
  effectiveStatus: 'building',
  setupComplete: false,
  bedrockEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Application card keyboard access', () => {
  it('offers a named link to the application while it is building', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ApplicationCard application={app} />
      </QueryClientProvider>
    );
    expect(screen.getByRole('link', { name: 'Weather Dashboard' })).toHaveAttribute(
      'href',
      '/application/weather'
    );
  });

  it('names the actions menu for the application it affects', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ApplicationCard application={app} />
      </QueryClientProvider>
    );
    const menu = screen.getByRole('button', { name: 'Actions for Weather Dashboard' });
    await userEvent.click(menu);
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('reports folder launcher failures instead of silently ignoring them', async () => {
    vi.mocked(openDirectory).mockResolvedValueOnce({ error: 'File manager unavailable' });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ApplicationCard application={app} />
      </QueryClientProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /^weather$/ }));
    expect(toast.error).toHaveBeenCalledWith('Could not open folder', {
      description: 'File manager unavailable',
    });
  });
});
