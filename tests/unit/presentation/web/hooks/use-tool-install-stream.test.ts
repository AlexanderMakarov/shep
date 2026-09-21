import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useToolInstallStream } from '@/hooks/use-tool-install-stream';

/**
 * The hook POSTs rather than opening an `EventSource`, because installation
 * runs the tool's shell command and a GET with a side effect is reachable
 * from any page the operator visits via `<img src=…>`.
 */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('useToolInstallStream', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('starts in idle state', () => {
    globalThis.fetch = vi.fn();
    const { result } = renderHook(() => useToolInstallStream('tmux'));

    expect(result.current.status).toBe('idle');
    expect(result.current.logs).toEqual([]);
    expect(result.current.result).toBeNull();
  });

  it('POSTs to the install endpoint on startInstall', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useToolInstallStream('tmux'));

    act(() => {
      result.current.startInstall();
    });

    expect(result.current.status).toBe('streaming');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tools/tmux/install/stream',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('appends log lines from streamed data events', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(sseResponse(['data: Installing tmux...\n\n', 'data: Done.\n\n']));

    const { result } = renderHook(() => useToolInstallStream('tmux'));

    act(() => {
      result.current.startInstall();
    });

    await waitFor(() => {
      expect(result.current.logs).toEqual(['Installing tmux...', 'Done.']);
    });
  });

  it('transitions to done on the done event', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          `event: done\ndata: ${JSON.stringify({ status: 'available', toolName: 'tmux' })}\n\n`,
        ])
      );

    const { result } = renderHook(() => useToolInstallStream('tmux'));

    act(() => {
      result.current.startInstall();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });
    expect(result.current.result).toEqual({ status: 'available', toolName: 'tmux' });
  });

  it('surfaces an install refusal as an error without logging it as output', async () => {
    // What the autoInstall guard returns for e.g. `docker`.
    const refusal = {
      status: 'error',
      toolName: 'docker',
      errorMessage: 'Docker does not support automated installation.',
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(sseResponse([`event: done\ndata: ${JSON.stringify(refusal)}\n\n`]));

    const { result } = renderHook(() => useToolInstallStream('docker'));

    act(() => {
      result.current.startInstall();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.result).toEqual(refusal);
    expect(result.current.logs).toEqual([]);
  });

  it('transitions to error when the request is refused', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));

    const { result } = renderHook(() => useToolInstallStream('tmux'));

    act(() => {
      result.current.startInstall();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
  });

  it('aborts the request on unmount', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    const { result, unmount } = renderHook(() => useToolInstallStream('tmux'));

    act(() => {
      result.current.startInstall();
    });
    unmount();

    expect(abortSpy).toHaveBeenCalled();
  });
});
