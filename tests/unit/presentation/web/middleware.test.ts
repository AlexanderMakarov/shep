// @vitest-environment node

/**
 * Unit tests — Next.js middleware wiring.
 *
 * `request-guard.test.ts` owns the policy decisions. This file proves the
 * middleware translates a real `NextRequest` into that policy correctly and
 * emits the right response: a denial with no CORS headers, or a pass-through
 * that hands the browser an httpOnly, SameSite=Strict session cookie.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  TOKEN_HEADER_NAME,
  WEB_PORT_ENV,
  ALLOWED_HOSTS_ENV,
  REQUIRE_TOKEN_FOR_PAGES_ENV,
} from '@/lib/request-guard';

const TOKEN = 'f'.repeat(64);
const PORT = 4050;

vi.mock(
  '@shepai/core/infrastructure/services/web-auth/web-auth-token.service',
  async (): Promise<Record<string, unknown>> => {
    const actual = await vi.importActual<Record<string, unknown>>(
      '@shepai/core/infrastructure/services/web-auth/web-auth-token.service'
    );
    return { ...actual, getOrCreateWebAuthToken: () => TOKEN };
  }
);

interface RequestInitLike {
  method?: string;
  host?: string;
  origin?: string;
  secFetchSite?: string;
  cookie?: string;
  authorization?: string;
  headerToken?: string;
  search?: string;
}

function makeNextRequest(pathname: string, init: RequestInitLike = {}): NextRequest {
  const host = init.host ?? `localhost:${PORT}`;
  const headers = new Headers({ host });
  if (init.origin) headers.set('origin', init.origin);
  if (init.secFetchSite) headers.set('sec-fetch-site', init.secFetchSite);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.authorization) headers.set('authorization', init.authorization);
  if (init.headerToken) headers.set(TOKEN_HEADER_NAME, init.headerToken);

  return new NextRequest(`http://${host}${pathname}${init.search ?? ''}`, {
    method: init.method ?? 'GET',
    headers,
  });
}

describe('control-center middleware', () => {
  let middleware: (request: NextRequest) => Response;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const key of [WEB_PORT_ENV, ALLOWED_HOSTS_ENV, REQUIRE_TOKEN_FOR_PAGES_ENV]) {
      savedEnv[key] = process.env[key];
    }
    process.env[WEB_PORT_ENV] = String(PORT);
    delete process.env[ALLOWED_HOSTS_ENV];
    delete process.env[REQUIRE_TOKEN_FOR_PAGES_ENV];

    vi.resetModules();
    const mod = await import('../../../../src/presentation/web/middleware.js');
    middleware = mod.middleware;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('blocks the drive-by install GET that ran `curl | bash`', () => {
    const response = middleware(
      makeNextRequest('/api/tools/docker/install/stream', { secFetchSite: 'cross-site' })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('blocks an unauthenticated PTY creation', () => {
    const response = middleware(makeNextRequest('/api/terminal', { method: 'POST' }));

    expect(response.status).toBe(401);
  });

  it('blocks a cross-origin POST that carries the session cookie', () => {
    const response = middleware(
      makeNextRequest('/api/terminal', {
        method: 'POST',
        origin: 'https://evil.example',
        cookie: `${SESSION_COOKIE_NAME}=${TOKEN}`,
      })
    );

    expect(response.status).toBe(403);
  });

  it('blocks a rebound Host', () => {
    const response = middleware(
      makeNextRequest('/api/tools', {
        host: 'rebind.attacker.example',
        cookie: `${SESSION_COOKIE_NAME}=${TOKEN}`,
      })
    );

    expect(response.status).toBe(403);
  });

  it('lets the real UI through', () => {
    const response = middleware(
      makeNextRequest('/api/terminal', {
        method: 'POST',
        origin: `http://localhost:${PORT}`,
        secFetchSite: 'same-origin',
        cookie: `${SESSION_COOKIE_NAME}=${TOKEN}`,
      })
    );

    expect(response.status).toBe(200);
  });

  it('lets a bearer-token client through', () => {
    const response = middleware(
      makeNextRequest('/api/terminal', { method: 'POST', authorization: `Bearer ${TOKEN}` })
    );

    expect(response.status).toBe(200);
  });

  it('hands a page load an httpOnly SameSite=Strict session cookie', () => {
    const response = middleware(makeNextRequest('/settings'));
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=${TOKEN}`);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=strict');
    expect(setCookie.toLowerCase()).toContain('path=/');
  });

  it('does not re-issue the cookie when the browser already has it', () => {
    const response = middleware(
      makeNextRequest('/settings', { cookie: `${SESSION_COOKIE_NAME}=${TOKEN}` })
    );

    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('lets the GitHub webhook through from the tunnel host', () => {
    const response = middleware(
      makeNextRequest('/api/webhooks/github', { method: 'POST', host: 'x.trycloudflare.com' })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it(`honours ${ALLOWED_HOSTS_ENV} for reverse-proxy deployments`, async () => {
    process.env[ALLOWED_HOSTS_ENV] = 'runner.shep.internal';
    vi.resetModules();
    const { middleware: reloaded } = await import('../../../../src/presentation/web/middleware.js');

    const response = reloaded(
      makeNextRequest('/api/tools', {
        host: 'runner.shep.internal',
        cookie: `${SESSION_COOKIE_NAME}=${TOKEN}`,
      })
    );

    expect(response.status).toBe(200);
  });

  it('accepts a tokenised page URL in strict mode', async () => {
    process.env[REQUIRE_TOKEN_FOR_PAGES_ENV] = '1';
    vi.resetModules();
    const { middleware: reloaded } = await import('../../../../src/presentation/web/middleware.js');

    expect(reloaded(makeNextRequest('/settings')).status).toBe(401);
    expect(reloaded(makeNextRequest('/settings', { search: `?token=${TOKEN}` })).status).toBe(200);
  });

  it('fails CLOSED when the token store is unreadable', async () => {
    vi.resetModules();
    vi.doMock('@shepai/core/infrastructure/services/web-auth/web-auth-token.service', () => ({
      getOrCreateWebAuthToken: () => {
        throw new Error('EACCES: permission denied');
      },
      timingSafeTokenEquals: () => false,
    }));

    const { middleware: broken } = await import('../../../../src/presentation/web/middleware.js');
    const response = broken(makeNextRequest('/api/terminal', { method: 'POST' }));

    // Not a 200: a gate that cannot run must never fall through to the route.
    expect(response.status).toBe(503);
    vi.doUnmock('@shepai/core/infrastructure/services/web-auth/web-auth-token.service');
  });

  it('returns a JSON denial body naming the reason', async () => {
    const response = middleware(makeNextRequest('/api/tools'));
    const body = (await response.json()) as { error: string; reason: string };

    expect(body.reason).toBe('missing_or_invalid_token');
    expect(typeof body.error).toBe('string');
  });
});
