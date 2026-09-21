/**
 * Cloudflare Tunnel Service Unit Tests
 *
 * Tests for tunnel lifecycle management, URL detection,
 * URL change notifications, and webhook-only proxy filtering.
 *
 * TDD Phase: GREEN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { CloudflareTunnelService } from '@/infrastructure/services/tunnel/cloudflare-tunnel.service.js';
import type { TunnelLike } from '@/infrastructure/services/tunnel/cloudflare-tunnel.service.js';

function createMockTunnel() {
  const emitter = new EventEmitter() as EventEmitter & TunnelLike;
  (emitter as EventEmitter & TunnelLike & { stop: () => void }).stop = vi.fn();
  return emitter as EventEmitter & TunnelLike & { stop: ReturnType<typeof vi.fn> };
}

/**
 * Emit an event on the next macrotask tick.
 * Required because `start()` uses `await` internally, so event listeners
 * aren't attached until after the microtask queue drains.
 */
function emitNext(emitter: EventEmitter, event: string, ...args: unknown[]): void {
  setTimeout(() => emitter.emit(event, ...args), 0);
}

/**
 * Helper: make an HTTP request and return status + body.
 */
function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

/** Reassemble an HTTP/1.1 chunked body into its payload. */
function dechunk(rawBody: string): string {
  let rest = rawBody;
  let out = '';
  for (;;) {
    const lineEnd = rest.indexOf('\r\n');
    if (lineEnd === -1) return out;
    const size = parseInt(rest.slice(0, lineEnd), 16);
    if (!Number.isFinite(size) || size === 0) return out;
    out += rest.slice(lineEnd + 2, lineEnd + 2 + size);
    rest = rest.slice(lineEnd + 2 + size + 2);
  }
}

/**
 * Send a request with a VERBATIM request target, bypassing the WHATWG URL
 * normalization that `http.get` applies client-side.
 *
 * This matters for the traversal tests: a browser or `http.get` collapses
 * `/api/webhooks/../terminal` to `/terminal` before it leaves the process, so
 * neither can reproduce the bypass. cloudflared forwards whatever bytes the
 * attacker put on the request line, and `req.url` carries them unchanged.
 */
function httpRawGet(port: number, rawTarget: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`GET ${rawTarget} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let raw = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => (raw += chunk));
    socket.on('error', reject);
    socket.on('end', () => {
      const statusMatch = /^HTTP\/1\.1 (\d{3})/.exec(raw);
      const separator = raw.indexOf('\r\n\r\n');
      const head = separator === -1 ? raw : raw.slice(0, separator);
      const rawBody = separator === -1 ? '' : raw.slice(separator + 4);
      resolve({
        status: statusMatch ? parseInt(statusMatch[1], 10) : 0,
        body: /transfer-encoding:\s*chunked/i.test(head) ? dechunk(rawBody) : rawBody,
      });
    });
  });
}

describe('CloudflareTunnelService', () => {
  let service: CloudflareTunnelService;
  let mockCreateTunnel: (origin: string) => TunnelLike;
  let mockTunnel: ReturnType<typeof createMockTunnel>;
  let capturedOrigin: string | null;

  beforeEach(() => {
    capturedOrigin = null;
    mockTunnel = createMockTunnel();
    mockCreateTunnel = vi.fn((origin: string) => {
      capturedOrigin = origin;
      return mockTunnel;
    }) as unknown as (origin: string) => TunnelLike;
    service = new CloudflareTunnelService({ createTunnel: mockCreateTunnel });
  });

  afterEach(async () => {
    await service.stop();
  });

  describe('start', () => {
    it('should create a tunnel pointing to the proxy port, not the app port', async () => {
      emitNext(mockTunnel, 'url', 'https://test-abc123.trycloudflare.com');

      await service.start(3000);

      // The tunnel should connect to the proxy port, not 3000
      expect(capturedOrigin).toMatch(/^http:\/\/localhost:\d+$/);
      expect(capturedOrigin).not.toBe('http://localhost:3000');
    });

    it('should resolve with tunnel URL from url event', async () => {
      emitNext(mockTunnel, 'url', 'https://my-tunnel-url.trycloudflare.com');

      const url = await service.start(4050);
      expect(url).toBe('https://my-tunnel-url.trycloudflare.com');
    });

    it('should reject if tunnel emits an error', async () => {
      emitNext(mockTunnel, 'error', new Error('tunnel failed'));

      await expect(service.start(3000)).rejects.toThrow('Failed to start tunnel');
    });

    it('should reject if tunnel exits before emitting URL', async () => {
      emitNext(mockTunnel, 'exit', 1, null);

      await expect(service.start(3000)).rejects.toThrow('exited with code 1');
    });

    it('should throw if tunnel is already running', async () => {
      emitNext(mockTunnel, 'url', 'https://first.trycloudflare.com');
      await service.start(3000);

      await expect(service.start(3000)).rejects.toThrow('already running');
    });

    it('should report isRunning correctly', async () => {
      expect(service.isRunning()).toBe(false);

      emitNext(mockTunnel, 'url', 'https://test.trycloudflare.com');
      await service.start(3000);

      expect(service.isRunning()).toBe(true);
      expect(service.getPublicUrl()).toBe('https://test.trycloudflare.com');
    });

    it('should reject if createTunnel throws', async () => {
      const failingService = new CloudflareTunnelService({
        createTunnel: () => {
          throw new Error('binary not found');
        },
      });

      await expect(failingService.start(3000)).rejects.toThrow('Failed to create tunnel');
    });
  });

  describe('webhook-only proxy', () => {
    let targetServer: http.Server;
    let targetPort: number;

    beforeEach(async () => {
      // Start a simple target server that echoes paths
      targetServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ path: req.url, method: req.method }));
      });

      await new Promise<void>((resolve) => {
        targetServer.listen(0, '127.0.0.1', () => {
          const addr = targetServer.address();
          targetPort = (addr as { port: number }).port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await service.stop();
      await new Promise<void>((resolve) => targetServer.close(() => resolve()));
    });

    it('should forward /api/webhooks/github to the main app', async () => {
      emitNext(mockTunnel, 'url', 'https://test.trycloudflare.com');
      await service.start(targetPort);

      // Extract the proxy port from the captured origin
      const proxyPort = parseInt(capturedOrigin!.split(':').pop()!, 10);
      const result = await httpGet(proxyPort, '/api/webhooks/github');

      expect(result.status).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.path).toBe('/api/webhooks/github');
    });

    // `/api/webhooks/status` is read by the local web UI over localhost and is
    // deliberately NOT part of the public allowlist: it returns the tunnel URL,
    // every registered repository path and the delivery history. The tunnel
    // exists so GitHub can POST deliveries, nothing more (C2).
    it('should block /api/webhooks/status with 404', async () => {
      emitNext(mockTunnel, 'url', 'https://test.trycloudflare.com');
      await service.start(targetPort);

      const proxyPort = parseInt(capturedOrigin!.split(':').pop()!, 10);
      const result = await httpGet(proxyPort, '/api/webhooks/status');

      expect(result.status).toBe(404);
    });

    it('should block non-webhook paths with 404', async () => {
      emitNext(mockTunnel, 'url', 'https://test.trycloudflare.com');
      await service.start(targetPort);

      const proxyPort = parseInt(capturedOrigin!.split(':').pop()!, 10);
      const result = await httpGet(proxyPort, '/');

      expect(result.status).toBe(404);
    });

    it('should block /api/agent-events with 404', async () => {
      emitNext(mockTunnel, 'url', 'https://test.trycloudflare.com');
      await service.start(targetPort);

      const proxyPort = parseInt(capturedOrigin!.split(':').pop()!, 10);
      const result = await httpGet(proxyPort, '/api/agent-events');

      expect(result.status).toBe(404);
    });

    it('should block /_next paths with 404', async () => {
      emitNext(mockTunnel, 'url', 'https://test.trycloudflare.com');
      await service.start(targetPort);

      const proxyPort = parseInt(capturedOrigin!.split(':').pop()!, 10);
      const result = await httpGet(proxyPort, '/_next/static/chunks/main.js');

      expect(result.status).toBe(404);
    });

    /**
     * C2 — the prefix check (`url.startsWith('/api/webhooks')`) was bypassable.
     * Node's http.request forwards dot-segments verbatim and Next.js resolves
     * them during route matching, so `/api/webhooks/../terminal` reached
     * `/terminal`. The proxy must decode, normalize, and match an EXACT route.
     */
    describe('path allowlist bypass', () => {
      async function startAndGet(path: string): Promise<{ status: number; body: string }> {
        emitNext(mockTunnel, 'url', 'https://test.trycloudflare.com');
        await service.start(targetPort);
        const proxyPort = parseInt(capturedOrigin!.split(':').pop()!, 10);
        return httpRawGet(proxyPort, path);
      }

      it('should block a raw dot-segment traversal out of the webhook prefix', async () => {
        const result = await startAndGet('/api/webhooks/../terminal');

        expect(result.status).toBe(404);
      });

      it('should block a percent-encoded dot-segment traversal', async () => {
        const result = await startAndGet('/api/webhooks/%2e%2e/terminal');

        expect(result.status).toBe(404);
      });

      it('should block an encoded-separator traversal', async () => {
        const result = await startAndGet('/api/webhooks/..%2fterminal');

        expect(result.status).toBe(404);
      });

      it('should block a sibling route that merely shares the prefix', async () => {
        const result = await startAndGet('/api/webhooks-admin/terminal');

        expect(result.status).toBe(404);
      });

      it('should block an unknown route under the webhook prefix', async () => {
        const result = await startAndGet('/api/webhooks/github/../../terminal');

        expect(result.status).toBe(404);
      });

      it('should block local-only webhook management routes', async () => {
        // Only the GitHub receiver needs to be reachable from the public
        // internet; status/deliveries/repos/* are called by the local web UI
        // over localhost and leak webhook history and repository paths.
        const result = await startAndGet('/api/webhooks/repos/enable');

        expect(result.status).toBe(404);
      });

      it('should forward the allowlisted receiver with a normalized path', async () => {
        const result = await startAndGet('/api/webhooks/github');

        expect(result.status).toBe(200);
        expect(JSON.parse(result.body).path).toBe('/api/webhooks/github');
      });

      it('should preserve the query string on an allowlisted route', async () => {
        const result = await startAndGet('/api/webhooks/github?attempt=2');

        expect(result.status).toBe(200);
        expect(JSON.parse(result.body).path).toBe('/api/webhooks/github?attempt=2');
      });
    });
  });

  describe('URL change detection', () => {
    it('should notify handlers when URL changes', async () => {
      const handler = vi.fn();
      service.onUrlChange(handler);

      emitNext(mockTunnel, 'url', 'https://first-url.trycloudflare.com');
      await service.start(3000);

      // Simulate reconnection with new URL
      mockTunnel.emit('url', 'https://second-url.trycloudflare.com');

      expect(handler).toHaveBeenCalledWith('https://second-url.trycloudflare.com');
      expect(service.getPublicUrl()).toBe('https://second-url.trycloudflare.com');
    });

    it('should not notify when same URL is emitted', async () => {
      const handler = vi.fn();
      service.onUrlChange(handler);

      emitNext(mockTunnel, 'url', 'https://same-url.trycloudflare.com');
      await service.start(3000);

      // Emit same URL again
      mockTunnel.emit('url', 'https://same-url.trycloudflare.com');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle async URL change handlers gracefully', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('handler error'));
      service.onUrlChange(handler);

      emitNext(mockTunnel, 'url', 'https://first.trycloudflare.com');
      await service.start(3000);

      // Should not throw even if handler rejects
      mockTunnel.emit('url', 'https://second.trycloudflare.com');

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the tunnel, proxy, and clear URL', async () => {
      emitNext(mockTunnel, 'url', 'https://test.trycloudflare.com');
      await service.start(3000);

      await service.stop();

      expect(mockTunnel.stop).toHaveBeenCalled();
      expect(service.isRunning()).toBe(false);
      expect(service.getPublicUrl()).toBeNull();
    });

    it('should be safe to call stop when not running', async () => {
      await expect(service.stop()).resolves.toBeUndefined();
    });
  });
});
