'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ToolInstallationStatus } from '@shepai/core/domain/generated/output';

export type InstallStreamStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface UseToolInstallStreamResult {
  logs: string[];
  status: InstallStreamStatus;
  result: ToolInstallationStatus | null;
  startInstall: () => void;
}

/** SSE field prefixes emitted by the install route. */
const DATA_PREFIX = 'data: ';
const DONE_EVENT_LINE = 'event: done';

/**
 * Drive a tool installation and collect its streamed output.
 *
 * Uses `fetch` with POST rather than `EventSource`. Installation runs the
 * catalogue's shell command, so it must not be reachable by a GET — as a GET
 * it needed no CSRF token and no preflight, and a foreign page's `<img>` tag
 * was enough to trigger it. `EventSource` can only issue GETs, so the stream
 * is read from the response body instead (same shape as `use-cli-upgrade`).
 */
export function useToolInstallStream(toolId: string): UseToolInstallStreamResult {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<InstallStreamStatus>('idle');
  const [result, setResult] = useState<ToolInstallationStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const startInstall = useCallback(() => {
    cleanup();
    setLogs([]);
    setResult(null);
    setStatus('streaming');

    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const response = await fetch(`/api/tools/${toolId}/install/stream`, {
          method: 'POST',
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setStatus('error');
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let expectingDonePayload = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith(DONE_EVENT_LINE)) {
              expectingDonePayload = true;
              continue;
            }
            if (!line.startsWith(DATA_PREFIX)) continue;

            const payload = line.slice(DATA_PREFIX.length);
            if (expectingDonePayload) {
              expectingDonePayload = false;
              const installResult = JSON.parse(payload) as ToolInstallationStatus;
              setResult(installResult);
              setStatus(installResult.status === 'error' ? 'error' : 'done');
              continue;
            }
            setLogs((previous) => [...previous, payload]);
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('error');
      } finally {
        abortRef.current = null;
      }
    })();
  }, [toolId, cleanup]);

  return { logs, status, result, startInstall };
}
