/**
 * Cloudflare Tunnel Service
 *
 * Manages a `cloudflared` quick-tunnel that exposes ONLY the webhook
 * API routes to the public internet via a random *.trycloudflare.com
 * subdomain.
 *
 * Uses the `cloudflared` npm package which handles binary installation
 * and provides a typed Tunnel API — no need for the user to install
 * cloudflared separately.
 *
 * Security: A lightweight proxy HTTP server is started on a random port
 * that only forwards requests whose NORMALIZED path is one of
 * ALLOWED_WEBHOOK_ROUTES. The tunnel connects to this proxy, not the main
 * app server. Everything else returns 404.
 *
 * The normalization is load-bearing, not decoration. A `startsWith` prefix
 * test was bypassable two ways at once: `/api/webhooks/../terminal` passes
 * the prefix test, Node's http.request forwards the dot-segments verbatim,
 * and Next.js resolves them during route matching — so the public
 * *.trycloudflare.com URL was an unauthenticated front door to every route
 * in the app. `/api/webhooks-admin/x` passed the same test by sharing a
 * prefix without sharing a path segment. So: decode percent-encoding first,
 * normalize the dot-segments ourselves, match an EXACT route, and forward
 * the normalized path rather than whatever arrived on the request line.
 */

import { createServer, request as httpRequest } from 'node:http';
import { posix } from 'node:path';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type {
  ITunnelService,
  TunnelUrlChangeHandler,
} from '../../../application/ports/output/services/tunnel-service.interface.js';

const TAG = '[CloudflareTunnel]';
const STARTUP_TIMEOUT_MS = 30_000;

/**
 * The exact routes reachable through the public tunnel.
 *
 * Only the GitHub receiver belongs here: it is the single URL shep registers
 * with GitHub (`webhook-manager.service.ts` builds `<publicUrl>/api/webhooks/github`)
 * and the only one an outside party ever needs to POST to. The remaining
 * `/api/webhooks/*` routes — status, deliveries, repos/enable, repos/disable,
 * repos/status — are called by the local web UI over localhost; publishing
 * them would hand anyone who learns the tunnel URL the delivery history,
 * every registered repository path, and a webhook registration endpoint.
 */
const ALLOWED_WEBHOOK_ROUTES: readonly string[] = ['/api/webhooks/github'];

/** Origin used only to parse a request target into path + query. */
const REQUEST_TARGET_BASE = 'http://tunnel.invalid';

export interface CloudflareTunnelDeps {
  createTunnel: (origin: string) => TunnelLike | Promise<TunnelLike>;
}

export interface TunnelLike {
  on(event: 'url', handler: (url: string) => void): void;
  on(
    event: 'connected',
    handler: (connection: { id: string; ip: string; location: string }) => void
  ): void;
  on(event: 'error', handler: (error: Error) => void): void;
  on(event: 'exit', handler: (code: number | null, signal: string | null) => void): void;
  once(event: string, handler: (...args: unknown[]) => void): void;
  stop(): void;
}

async function defaultCreateTunnel(origin: string): Promise<TunnelLike> {
  const { Tunnel } = await import('cloudflared');
  return Tunnel.quick(origin);
}

const defaultDeps: CloudflareTunnelDeps = {
  createTunnel: defaultCreateTunnel,
};

export class CloudflareTunnelService implements ITunnelService {
  private tunnel: TunnelLike | null = null;
  private proxyServer: Server | null = null;
  private publicUrl: string | null = null;
  private readonly urlChangeHandlers: TunnelUrlChangeHandler[] = [];
  private readonly deps: CloudflareTunnelDeps;

  constructor(deps: Partial<CloudflareTunnelDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async start(localPort: number): Promise<string> {
    if (this.tunnel) {
      throw new Error(`${TAG} Tunnel already running at ${this.publicUrl}`);
    }

    // Start a proxy server that only forwards webhook routes
    const proxyPort = await this.startProxyServer(localPort);

    let tunnel: TunnelLike;
    try {
      tunnel = await Promise.resolve(this.deps.createTunnel(`http://localhost:${proxyPort}`));
    } catch (err) {
      this.stopProxyServer();
      throw new Error(`${TAG} Failed to create tunnel: ${(err as Error).message}`);
    }

    this.tunnel = tunnel;

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopTunnel();
        reject(new Error(`${TAG} Timed out waiting for tunnel URL (${STARTUP_TIMEOUT_MS}ms)`));
      }, STARTUP_TIMEOUT_MS);

      tunnel.on('url', (url: string) => {
        if (!this.publicUrl) {
          // First URL — startup complete
          this.publicUrl = url;
          clearTimeout(timeout);
          // eslint-disable-next-line no-console
          console.log(
            `${TAG} Tunnel ready: ${url} ` +
              `(proxying ${ALLOWED_WEBHOOK_ROUTES.join(', ')} to port ${localPort})`
          );
          resolve(url);
        } else if (url !== this.publicUrl) {
          // URL changed — reconnection with new subdomain
          const oldUrl = this.publicUrl;
          this.publicUrl = url;
          // eslint-disable-next-line no-console
          console.log(`${TAG} Tunnel URL changed: ${oldUrl} -> ${url}`);
          this.notifyUrlChange(url);
        }
      });

      tunnel.on('error', (err: Error) => {
        clearTimeout(timeout);
        this.tunnel = null;
        this.publicUrl = null;
        this.stopProxyServer();
        reject(new Error(`${TAG} Failed to start tunnel: ${err.message}`));
      });

      tunnel.on('exit', (code: number | null) => {
        clearTimeout(timeout);
        if (this.tunnel === tunnel) {
          this.tunnel = null;
          const wasRunning = this.publicUrl !== null;
          this.publicUrl = null;
          this.stopProxyServer();

          if (wasRunning) {
            // eslint-disable-next-line no-console
            console.log(`${TAG} Tunnel process exited (code ${code})`);
          } else {
            reject(new Error(`${TAG} cloudflared exited with code ${code} before producing a URL`));
          }
        }
      });
    });
  }

  async stop(): Promise<void> {
    this.stopTunnel();
    this.publicUrl = null;
  }

  getPublicUrl(): string | null {
    return this.publicUrl;
  }

  onUrlChange(handler: TunnelUrlChangeHandler): void {
    this.urlChangeHandlers.push(handler);
  }

  isRunning(): boolean {
    return this.tunnel !== null && this.publicUrl !== null;
  }

  /**
   * Start a lightweight HTTP proxy on a random port that only forwards
   * requests whose normalized path is in ALLOWED_WEBHOOK_ROUTES.
   * Everything else gets a 404.
   */
  private startProxyServer(targetPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const forwardPath = resolveAllowedPath(req.url ?? '');

        if (forwardPath === null) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }

        // Proxy the request to the main app, forwarding the path we matched
        // on — never the raw request target.
        const proxyReq = httpRequest(
          {
            hostname: 'localhost',
            port: targetPort,
            path: forwardPath,
            method: req.method,
            headers: req.headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );

        proxyReq.on('error', (err) => {
          // eslint-disable-next-line no-console
          console.warn(`${TAG} Proxy error: ${err.message}`);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify({ error: 'Bad gateway' }));
        });

        req.pipe(proxyReq);
      });

      // Listen on port 0 = OS assigns a random available port
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          this.proxyServer = server;
          // eslint-disable-next-line no-console
          console.log(`${TAG} Webhook proxy listening on port ${addr.port}`);
          resolve(addr.port);
        } else {
          server.close();
          reject(new Error(`${TAG} Failed to start proxy server`));
        }
      });

      server.on('error', (err) => {
        reject(new Error(`${TAG} Proxy server error: ${err.message}`));
      });
    });
  }

  private stopProxyServer(): void {
    if (this.proxyServer) {
      this.proxyServer.close();
      this.proxyServer = null;
    }
  }

  private stopTunnel(): void {
    if (this.tunnel) {
      const tunnel = this.tunnel;
      this.tunnel = null;

      try {
        tunnel.stop();
      } catch {
        // Tunnel already stopped
      }
    }

    this.stopProxyServer();
  }

  private notifyUrlChange(newUrl: string): void {
    for (const handler of this.urlChangeHandlers) {
      try {
        const result = handler(newUrl);
        if (result instanceof Promise) {
          result.catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(`${TAG} URL change handler failed:`, err);
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`${TAG} URL change handler threw:`, err);
      }
    }
  }
}

/**
 * Resolve a raw request target to the canonical path we are willing to
 * forward, or `null` when it is not an allowlisted route.
 *
 * Order matters: percent-decode BEFORE normalizing, because `%2e%2e` and
 * `..%2f` are the encoded spellings of the same traversal and a normalize
 * that runs first would leave them untouched. Backslashes are folded to
 * forward slashes first as well — they are an ordinary character to
 * `posix.normalize` but a separator to some routers.
 *
 * A path that decodes to something still containing `%` (double encoding)
 * simply fails the exact match, which is the correct answer.
 */
export function resolveAllowedPath(requestTarget: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(requestTarget, REQUEST_TARGET_BASE);
  } catch {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(parsed.pathname);
  } catch {
    // Malformed percent-encoding — not a route we can reason about.
    return null;
  }

  const normalized = posix.normalize(decoded.replace(/\\/g, '/'));
  const withoutTrailingSlash =
    normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;

  if (!ALLOWED_WEBHOOK_ROUTES.includes(withoutTrailingSlash)) return null;

  return `${withoutTrailingSlash}${parsed.search}`;
}
