import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequestListener } from '@/infrastructure/services/http-request-listener.js';

function connection(overrides: Partial<ServerResponse> = {}) {
  return {
    req: { aborted: false } as IncomingMessage,
    res: {
      destroyed: false,
      headersSent: false,
      statusCode: 200,
      end: vi.fn(),
      destroy: vi.fn(),
      ...overrides,
    } as unknown as ServerResponse,
  };
}

describe('HTTP request listener', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['sync', 'async'])(
    'responds with a generic 500 when the request handler fails (%s)',
    async (mode) => {
      const error = new Error('internal route failure');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const handler = vi.fn(() => {
        if (mode === 'sync') throw error;
        return Promise.reject(error);
      });
      const { req, res } = connection();
      createRequestListener(handler)(req, res);
      await vi.waitFor(() => expect(res.end).toHaveBeenCalledWith('Internal Server Error'));
      expect(res.statusCode).toBe(500);
      expect(handler).toHaveBeenCalledOnce();
    }
  );

  it('handles a disconnected request without an unhandled rejection or another write', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { req, res } = connection({ destroyed: true });
    const handler = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('aborted'), { code: 'ECONNRESET' }));
    createRequestListener(handler)(req, res);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
    expect(res.destroy).not.toHaveBeenCalled();
  });

  it('closes a partially streamed response without writing a second header or body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { req, res } = connection({ headersSent: true });
    createRequestListener(() => Promise.reject(new Error('stream failed')))(req, res);
    await vi.waitFor(() => expect(res.destroy).toHaveBeenCalledOnce());
    expect(res.end).not.toHaveBeenCalled();
  });

  it('passes a successful request through', async () => {
    const { req, res } = connection();
    createRequestListener(async (_req, response) => {
      response.end('ok');
    })(req, res);
    await vi.waitFor(() => expect(res.end).toHaveBeenCalledWith('ok'));
    expect(res.statusCode).toBe(200);
  });
});
