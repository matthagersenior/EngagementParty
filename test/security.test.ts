import { describe, expect, it } from 'vitest';
import { assertAllowedOrigin, generateEditToken, hashEditToken, OriginError, readBearerToken, withSecurityHeaders } from '../src/security';

function base64UrlBytes(token: string): Uint8Array {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(token.length / 4) * 4, '=');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

describe('edit token security', () => {
  it('generates distinct 32-byte base64url tokens', () => {
    const one = generateEditToken();
    const two = generateEditToken();
    expect(one).not.toBe(two);
    expect(base64UrlBytes(one)).toHaveLength(32);
    expect(one).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes tokens to lowercase SHA-256 hex', async () => {
    expect(await hashEditToken('secret')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('parses strict bearer tokens', () => {
    expect(readBearerToken(new Request('https://example.com', { headers: { Authorization: 'Bearer abc_DEF-123' } }))).toBe('abc_DEF-123');
    expect(readBearerToken(new Request('https://example.com', { headers: { Authorization: 'Basic abc' } }))).toBeNull();
  });
});

describe('request security', () => {
  it('rejects mismatched Origin on state-changing requests', () => {
    const request = new Request('https://party.example/api/rsvps', { method: 'POST', headers: { Origin: 'https://evil.example' } });
    expect(() => assertAllowedOrigin(request)).toThrow(OriginError);
  });

  it('allows matching origin and reads', () => {
    expect(() => assertAllowedOrigin(new Request('https://party.example/api/rsvps', { method: 'POST', headers: { Origin: 'https://party.example' } }))).not.toThrow();
    expect(() => assertAllowedOrigin(new Request('https://party.example/api/rsvps', { method: 'GET', headers: { Origin: 'https://evil.example' } }))).not.toThrow();
  });

  it('adds required response security headers', () => {
    const response = withSecurityHeaders(new Response('ok'));
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });
});
