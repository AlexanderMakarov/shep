import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ListApplicationsUseCase } from '@/application/use-cases/applications/list-applications.use-case';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface';
import type { IWorkflowStepRepository } from '@/application/ports/output/repositories/workflow-step-repository.interface';
import { ApplicationStatus, type Application } from '@/domain/generated/output';

function setup(status: ApplicationStatus) {
  const app: Application = {
    id: 'app',
    name: 'Weather',
    slug: 'weather',
    description: 'Forecasts',
    repositoryPath: '/projects/weather',
    additionalPaths: [],
    status,
    setupComplete: true,
    bedrockEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const appRepository = { list: vi.fn().mockResolvedValue([app]) };
  const stepRepository = { listByFeature: vi.fn().mockResolvedValue([]) };
  return {
    useCase: new ListApplicationsUseCase(
      appRepository as unknown as IApplicationRepository,
      stepRepository as unknown as IWorkflowStepRepository
    ),
    stepRepository,
  };
}

describe('Application readiness after setup', () => {
  it('keeps an application error visible after setup has completed', async () => {
    const { useCase, stepRepository } = setup(ApplicationStatus.Error);
    const apps = await useCase.execute();
    expect(apps[0].effectiveStatus).toBe('failed');
    expect(stepRepository.listByFeature).not.toHaveBeenCalled();
  });

  it('returns healthy completed applications without querying setup steps', async () => {
    const { useCase, stepRepository } = setup(ApplicationStatus.Idle);
    expect((await useCase.execute())[0].effectiveStatus).toBe('ready');
    expect(stepRepository.listByFeature).not.toHaveBeenCalled();
  });
});
