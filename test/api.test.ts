import { beforeEach, describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';

const origin = 'https://party.example';
const valid = {
  primaryContactName: 'Alex Morgan', addressLine1: '123 Main St', addressLine2: '', city: 'St. Louis',
  stateRegion: 'MO', postalCode: '63101', phone: '314-555-0100', email: 'alex@example.com',
  willingToHelp: true, helpDetails: 'Decorations', willingToBring: true, bringDetails: 'Ice', comments: 'Hello',
  people: [
    { fullName: 'Alex Morgan', attendance: 'attending' },
    { fullName: 'Jordan Morgan', attendance: 'not_attending' },
  ],
};

async function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method)) headers.set('Origin', origin);
  return exports.default.fetch(`${origin}${path}`, { ...init, headers });
}

async function create(payload = valid) {
  const response = await call('/api/rsvps', { method: 'POST', body: JSON.stringify(payload) });
  expect(response.status).toBe(201);
  const body = await response.json() as { editUrl: string };
  const token = decodeURIComponent(new URL(body.editUrl, origin).hash.replace(/^#token=/, ''));
  return { token, body };
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM guests'),
    env.DB.prepare('DELETE FROM households'),
  ]);
});

describe('public RSVP API', () => {
  it('creates a household with independent attendance and stores only the token hash', async () => {
    const { token, body } = await create();
    expect(body.editUrl).toMatch(/^\/edit#token=/);
    const household = await env.DB.prepare('SELECT edit_token_hash FROM households').first<{ edit_token_hash: string }>();
    expect(household?.edit_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(household?.edit_token_hash).not.toContain(token);
    const guests = await env.DB.prepare('SELECT attendance FROM guests ORDER BY sort_order').all<{ attendance: string }>();
    expect(guests.results?.map((row) => row.attendance)).toEqual(['attending', 'not_attending']);
  });

  it('loads and updates only the household identified by the bearer token', async () => {
    const first = await create();
    const second = await create({ ...valid, primaryContactName: 'Second Family', email: 'second@example.com' });
    const loaded = await call('/api/rsvps/edit', { headers: { Authorization: `Bearer ${first.token}` } });
    expect((await loaded.json() as any).household.primaryContactName).toBe('Alex Morgan');

    const update = await call('/api/rsvps/edit', {
      method: 'PUT', headers: { Authorization: `Bearer ${first.token}` },
      body: JSON.stringify({ ...valid, primaryContactName: 'Updated Family', people: [{ fullName: 'Alex Morgan', attendance: 'unsure' }] }),
    });
    expect(update.status).toBe(200);

    const secondLoaded = await call('/api/rsvps/edit', { headers: { Authorization: `Bearer ${second.token}` } });
    expect((await secondLoaded.json() as any).household.primaryContactName).toBe('Second Family');
  });

  it('returns a generic 404 for missing or invalid edit tokens', async () => {
    expect((await call('/api/rsvps/edit')).status).toBe(404);
    expect((await call('/api/rsvps/edit', { headers: { Authorization: 'Bearer not-a-real-token' } })).status).toBe(404);
  });

  it('rejects cross-origin mutation requests', async () => {
    const response = await exports.default.fetch(`${origin}/api/rsvps`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify(valid),
    });
    expect(response.status).toBe(403);
  });
});

describe('admin API', () => {
  it('calculates stats, searches people, and updates a response', async () => {
    await create();
    const stats = await call('/api/admin/stats');
    expect(await stats.json()).toMatchObject({ households: 1, people: 2, attending: 1, notAttending: 1, unsure: 0, willingToHelp: 1, willingToBring: 1 });

    const search = await call('/api/admin/rsvps?q=Jordan');
    const searchBody = await search.json() as any;
    expect(searchBody.households).toHaveLength(1);
    const id = searchBody.households[0].id;

    const update = await call(`/api/admin/rsvps/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...valid, willingToHelp: false, helpDetails: '', people: [{ fullName: 'Alex Morgan', attendance: 'attending' }] }),
    });
    expect(update.status).toBe(200);
    const statsAfter = await call('/api/admin/stats');
    expect(await statsAfter.json()).toMatchObject({ households: 1, people: 1, willingToHelp: 0 });
  });

  it('exports one CSV row per person and excludes edit-token data', async () => {
    await create();
    const response = await call('/api/admin/export.csv');
    expect(response.headers.get('content-type')).toContain('text/csv');
    const csv = await response.text();
    expect(csv).toContain('"Alex Morgan"');
    expect(csv).toContain('"Jordan Morgan"');
    expect(csv).not.toContain('edit_token');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3);
  });
});
