import { handleAdminRequest } from './admin';
import { createHousehold, getHouseholdByTokenHash, updateHouseholdByTokenHash } from './db';
import { assertAllowedOrigin, generateEditToken, hashEditToken, OriginError, readBearerToken, withSecurityHeaders } from './security';
import type { Env } from './types';
import { ValidationError, validateRsvpInput } from './validation';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError({ form: 'Request body must be valid JSON.' });
  }
}

async function publicApi(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (pathname === '/api/rsvps') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const input = validateRsvpInput(await parseJson(request));
    const token = generateEditToken();
    const hash = await hashEditToken(token);
    await createHousehold(env.DB, input, hash);
    return json({ editUrl: `/edit#token=${encodeURIComponent(token)}` }, 201);
  }

  if (pathname === '/api/rsvps/edit') {
    if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
    const token = readBearerToken(request);
    if (!token) return json({ error: 'Not found' }, 404);
    const hash = await hashEditToken(token);
    if (request.method === 'GET') {
      const household = await getHouseholdByTokenHash(env.DB, hash);
      return household ? json({ household }) : json({ error: 'Not found' }, 404);
    }
    const updated = await updateHouseholdByTokenHash(env.DB, hash, validateRsvpInput(await parseJson(request)));
    return updated ? json({ household: updated }) : json({ error: 'Not found' }, 404);
  }

  return null;
}

async function asset(env: Env, request: Request, pathname?: string): Promise<Response> {
  const url = new URL(request.url);
  if (pathname) url.pathname = pathname;
  const assetRequest = new Request(url.toString(), { method: request.method, headers: request.headers });
  return withSecurityHeaders(await env.ASSETS.fetch(assetRequest));
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  try {
    assertAllowedOrigin(request);

    const admin = await handleAdminRequest(request, env, url.pathname);
    if (admin) return withSecurityHeaders(admin);

    const api = await publicApi(request, env, url.pathname);
    if (api) return withSecurityHeaders(api);

    if (url.pathname.startsWith('/api/')) return withSecurityHeaders(json({ error: 'Not found' }, 404));
    if (!['GET', 'HEAD'].includes(request.method)) return withSecurityHeaders(json({ error: 'Method not allowed' }, 405));
    if (url.pathname === '/') return asset(env, request, '/index.html');
    if (url.pathname === '/edit') return asset(env, request, '/edit.html');
    if (url.pathname === '/admin' || url.pathname === '/admin/') return asset(env, request, '/admin.html');
    return asset(env, request);
  } catch (error) {
    if (error instanceof ValidationError) return withSecurityHeaders(json({ error: error.message, fieldErrors: error.fieldErrors }, 400));
    if (error instanceof OriginError) return withSecurityHeaders(json({ error: 'Request origin not allowed' }, 403));
    console.error('Unhandled request error', error);
    return withSecurityHeaders(json({ error: 'Something went wrong. Please try again.' }, 500));
  }
}

export default { fetch: handle };
