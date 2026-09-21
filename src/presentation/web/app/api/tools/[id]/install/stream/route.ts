/**
 * POST /api/tools/[id]/install/stream
 *
 * Runs a tool installation and streams its output back as SSE.
 *
 * This is POST, not GET, on purpose. Installation runs the catalogue's shell
 * command for the tool — several are `curl … | bash` — so it is a
 * state-changing operation. As a GET it needed no CSRF token, no preflight
 * and no readable response, which made
 * `<img src="http://localhost:4050/api/tools/<id>/install/stream">` on any
 * page the operator visited a remote code execution primitive. POST puts it
 * behind the middleware's Origin check; the `autoInstall` gate in
 * `InstallToolUseCase` is the second lock.
 */

import { resolve } from '@/lib/server-container';
import type { InstallToolUseCase } from '@shepai/core/application/use-cases/tools/install-tool.use-case';

// Force dynamic — SSE streams must never be statically optimized or cached
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const useCase = resolve<InstallToolUseCase>('InstallToolUseCase');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const status = await useCase.execute(id, (chunk: string) => {
          controller.enqueue(encoder.encode(`data: ${chunk.replace(/\n/g, '\ndata: ')}\n\n`));
        });
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(status)}\n\n`));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Installation failed';
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({ status: 'error', toolName: id, errorMessage: message })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
