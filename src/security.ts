export class OriginError extends Error {
  constructor() {
    super('Origin not allowed');
    this.name = 'OriginError';
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function generateEditToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashEditToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function readBearerToken(request: Request): string | null {
  const value = request.headers.get('Authorization');
  if (!value) return null;
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(value);
  return match?.[1] ?? null;
}

export function assertAllowedOrigin(request: Request): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get('Origin');
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new OriginError();
}

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
