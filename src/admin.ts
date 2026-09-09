import { allCsvRows, getAdminStats, listHouseholds, updateHouseholdById } from './db';
import { renderCsv } from './csv';
import type { Attendance, Env } from './types';
import { ValidationError, validateRsvpInput } from './validation';

const ALLOWED_ATTENDANCE = new Set<Attendance>(['attending', 'not_attending', 'unsure']);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function handleAdminRequest(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (pathname === '/api/admin/stats') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    return json(await getAdminStats(env.DB));
  }

  if (pathname === '/api/admin/rsvps') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const url = new URL(request.url);
    const attendanceRaw = url.searchParams.get('attendance');
    if (attendanceRaw && !ALLOWED_ATTENDANCE.has(attendanceRaw as Attendance)) {
      return json({ error: 'Invalid attendance filter' }, 400);
    }
    const booleanParam = (key: string): boolean | undefined => {
      const value = url.searchParams.get(key);
      if (value === null || value === '') return undefined;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new Error(`Invalid ${key} filter`);
    };
    try {
      const records = await listHouseholds(env.DB, {
        query: url.searchParams.get('q')?.trim() || undefined,
        attendance: attendanceRaw as Attendance | undefined,
        willingToHelp: booleanParam('help'),
        willingToBring: booleanParam('bring'),
      });
      return json({ households: records });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid ')) return json({ error: error.message }, 400);
      throw error;
    }
  }

  if (pathname === '/api/admin/export.csv') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const csv = renderCsv(await allCsvRows(env.DB));
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="engagement-party-rsvps.csv"',
        'cache-control': 'no-store',
      },
    });
  }

  const match = /^\/api\/admin\/rsvps\/([0-9a-f-]+)$/i.exec(pathname);
  if (match) {
    if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    try {
      const updated = await updateHouseholdById(env.DB, match[1], validateRsvpInput(input));
      return updated ? json({ household: updated }) : json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof ValidationError) return json({ error: error.message, fieldErrors: error.fieldErrors }, 400);
      throw error;
    }
  }

  return null;
}
