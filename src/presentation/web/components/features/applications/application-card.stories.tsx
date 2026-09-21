import type { Meta, StoryObj } from '@storybook/react';
import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApplicationCard } from './application-card';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';

const baseApp: ApplicationWithStatus = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'My Weather App',
  slug: 'my-weather-app',
  description: 'A weather dashboard that shows real-time forecasts with interactive maps',
  repositoryPath: '/home/user/projects/weather-app',
  additionalPaths: [],
  status: ApplicationStatus.Idle,
  setupComplete: true,
  bedrockEnabled: false,
  effectiveStatus: 'ready',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const meta: Meta<typeof ApplicationCard> = {
  title: 'Features/ApplicationCard',
  component: ApplicationCard,
  parameters: {
    layout: 'padded',
    backgrounds: { default: 'canvas' },
  },
  decorators: [
    (Story) => {
      const client = useMemo(
        () => new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }),
        []
      );
      return (
        <QueryClientProvider client={client}>
          <DeploymentStatusProvider initialDeployments={[]}>
            <TooltipProvider>
              <div style={{ maxWidth: 360 }}>
                <Story />
              </div>
            </TooltipProvider>
          </DeploymentStatusProvider>
        </QueryClientProvider>
      );
    },
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { application: baseApp },
};

export const Active: Story = {
  args: {
    application: {
      ...baseApp,
      status: ApplicationStatus.Active,
      effectiveStatus: 'building',
      name: 'Running App',
    },
  },
};

export const ErrorState: Story = {
  args: {
    application: {
      ...baseApp,
      status: ApplicationStatus.Error,
      effectiveStatus: 'failed',
      name: 'Broken App',
    },
  },
};

export const LongDescription: Story = {
  args: {
    application: {
      ...baseApp,
      name: 'Enterprise Resource Planning Dashboard',
      description:
        'A comprehensive enterprise resource planning system with inventory management, order tracking, customer relationship management, and financial reporting modules.',
    },
  },
};

export const MultipleRepos: Story = {
  args: {
    application: {
      ...baseApp,
      additionalPaths: ['/home/user/projects/shared-lib', '/home/user/projects/api'],
    },
  },
};

export const Interrupted: Story = {
  args: {
    application: { ...baseApp, effectiveStatus: 'interrupted', name: 'Interrupted App' },
  },
};

export const Failed: Story = {
  args: {
    application: { ...baseApp, effectiveStatus: 'failed', name: 'Failed App' },
  },
};
