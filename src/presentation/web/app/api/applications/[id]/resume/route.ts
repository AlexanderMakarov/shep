/**
 * Resume an interrupted application workflow.
 *
 * POST /api/applications/:id/resume
 *
 * Resets interrupted steps to pending and re-runs the workflow
 * from where it left off. The agent SDK session is resumed with
 * the same conversation context.
 *
 * Awaits the use case so failures become HTTP 500 + daemon.log lines
 * instead of fire-and-forget silent drops.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ResumeApplicationWorkflowUseCase } from '@shepai/core/application/use-cases/applications/resume-application-workflow.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<ResumeApplicationWorkflowUseCase>('ResumeApplicationWorkflowUseCase');
    await useCase.execute({ applicationId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/applications/:id/resume]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
