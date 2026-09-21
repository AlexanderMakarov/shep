import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import type { ILogger } from '../../application/ports/output/services/logger.interface.js';
import { ConsoleLogger } from './logging/console-logger.js';

type AsyncRequestHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

/** Node does not observe promises returned by request listeners. */
export function createRequestListener(
  handle: AsyncRequestHandler,
  logger: Pick<ILogger, 'error'> = new ConsoleLogger()
): RequestListener {
  return (req, res) => {
    void Promise.resolve()
      .then(() => handle(req, res))
      .catch((error: unknown) => {
        // Navigating away can abort an in-flight response. The socket is already
        // gone; neither a second response nor an uncaught rejection is useful.
        if (req.aborted || res.destroyed) return;
        logger.error('[WebServer] Request failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.statusCode = 500;
        res.end('Internal Server Error');
      });
  };
}
