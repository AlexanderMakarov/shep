/**
 * Resume Application Workflow Use Case
 *
 * Resumes an interrupted application-creation workflow by:
 * 1. Resetting any `interrupted` steps back to `pending`
 * 2. Walking remaining steps: for each pending step, send its prompt
 *    to the agent, wait for the turn to complete, mark it done.
 *
 * When boot failed before any `workflow_steps` rows were created (common when
 * interactive session create throws), Resume re-enters `RunWorkflowUseCase`
 * instead of silently returning — otherwise the UI "Retry" appears to do nothing
 * and daemon.log stays empty.
 *
 * The agent SDK session is resumed (same conversation context) because
 * the session service looks up the previous `agentSessionId` from the DB.
 */

import { injectable, inject } from 'tsyringe';
import {
  ApplicationStatus,
  WorkflowStepStatus,
  type WorkflowStep,
} from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IWorkflowStepRepository } from '../../ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveSessionRepository } from '../../ports/output/repositories/interactive-session-repository.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import { RunWorkflowUseCase } from '../workflows/run-workflow.use-case.js';
import { featureIdForApplication } from '../../../domain/shared/feature-id.js';
import { APPLICATION_CREATION_WORKFLOW } from './application-creation.workflow.js';

export interface ResumeApplicationWorkflowInput {
  applicationId: string;
}

@injectable()
export class ResumeApplicationWorkflowUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IWorkflowStepRepository')
    private readonly stepRepo: IWorkflowStepRepository,
    @inject('IInteractiveSessionService')
    private readonly session: IInteractiveSessionService,
    @inject('SendInteractiveMessageUseCase')
    private readonly sendMessage: SendInteractiveMessageUseCase,
    @inject('IInteractiveSessionRepository')
    private readonly sessionRepo: IInteractiveSessionRepository,
    // Class token — NOT the string 'RunWorkflowUseCase', which was stolen by
    // scheduled-workflows DI for RunScheduledWorkflowUseCase.
    @inject(RunWorkflowUseCase)
    private readonly runWorkflow: RunWorkflowUseCase,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: ResumeApplicationWorkflowInput): Promise<void> {
    const app = await this.appRepo.findById(input.applicationId);
    if (!app) throw new Error(`Application ${input.applicationId} not found`);

    const featureId = featureIdForApplication(app.id);

    // Clear stale Error from a prior failed boot so the UI does not keep
    // showing "failed" while the retry is actually running.
    if (app.status === ApplicationStatus.Error) {
      await this.appRepo.update(app.id, { status: ApplicationStatus.Active });
    } else if (app.status === ApplicationStatus.Idle) {
      await this.appRepo.update(app.id, { status: ApplicationStatus.Active });
    }

    const steps = await this.stepRepo.listByFeature(featureId);

    // Boot never got far enough to seed workflow_steps — re-enter the full
    // orchestrator rather than no-op (which looked like a successful Retry).
    if (steps.length === 0) {
      if (app.setupComplete) {
        this.logger.info('[resume-application] no steps and setup already complete', {
          applicationId: app.id,
          featureId,
        });
        return;
      }
      this.logger.warn(
        `[resume-application] no workflow steps for ${featureId}; re-running application-creation workflow`,
        { applicationId: app.id, agentType: app.agentType }
      );
      await this.runWorkflow.execute({
        featureId,
        worktreePath: app.repositoryPath,
        workflow: APPLICATION_CREATION_WORKFLOW,
        model: app.modelOverride,
        agentType: app.agentType,
        visibleFirstMessage: app.description,
      });
      const agentSessionId = await this.sessionRepo.findLatestAgentSessionIdForFeature(featureId);
      await this.appRepo.update(app.id, {
        setupComplete: true,
        ...(agentSessionId ? { agentSessionId } : {}),
      });
      return;
    }

    // Reset interrupted steps back to pending
    for (const step of steps) {
      if (step.status === WorkflowStepStatus.interrupted) {
        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.pending);
        this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
      }
    }

    // Walk steps — skip done ones, execute pending ones sequentially
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const definition = APPLICATION_CREATION_WORKFLOW.steps[i];
      if (!definition) break;

      // Refresh status (might have been reset above)
      const current = await this.stepRepo.findById(step.id);
      if (!current) break;
      if (current.status === WorkflowStepStatus.done) continue;
      if (current.status !== WorkflowStepStatus.pending) break;

      // Mark running
      await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.running);
      this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
      this.session.setActiveStep(featureId, step.id);

      const turnDone = this.session.waitForTurnDone(featureId);

      try {
        await this.sendMessage.execute({
          featureId,
          content: definition.prompt,
          worktreePath: app.repositoryPath,
          model: app.modelOverride,
          agentType: app.agentType,
        });
        await turnDone;

        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.done, {
          summary: definition.title,
        });
        this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(`[resume-application] step failed: ${errorMessage}`, {
          applicationId: app.id,
          featureId,
          stepId: step.id,
          error: errorMessage,
        });
        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.failed, {
          error: errorMessage,
        });
        this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
        return;
      } finally {
        this.session.clearActiveStep(featureId);
      }
    }

    // All remaining steps completed — mark setup as done and persist session ID
    const agentSessionId = await this.sessionRepo.findLatestAgentSessionIdForFeature(featureId);
    await this.appRepo.update(app.id, {
      setupComplete: true,
      ...(agentSessionId ? { agentSessionId } : {}),
    });
  }

  private async refreshStep(stepId: string): Promise<WorkflowStep> {
    const row = await this.stepRepo.findById(stepId);
    if (!row) throw new Error(`Workflow step ${stepId} vanished`);
    return row;
  }
}
