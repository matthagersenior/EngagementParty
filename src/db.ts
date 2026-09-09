import type { AdminStats, Attendance, D1Database, HouseholdRecord, RsvpInput } from './types';

interface HouseholdRow {
  id: string;
  primary_contact_name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state_region: string;
  postal_code: string;
  phone: string;
  email: string;
  willing_to_help: number;
  help_details: string | null;
  willing_to_bring: number;
  bring_details: string | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
}

interface GuestRow {
  id: string;
  full_name: string;
  attendance: Attendance;
  sort_order: number;
}

const HOUSEHOLD_COLUMNS = `
  id, primary_contact_name, address_line1, address_line2, city, state_region,
  postal_code, phone, email, willing_to_help, help_details, willing_to_bring,
  bring_details, comments, created_at, updated_at
`;

function householdValues(input: RsvpInput): unknown[] {
  return [
    input.primaryContactName,
    input.addressLine1,
    input.addressLine2,
    input.city,
    input.stateRegion,
    input.postalCode,
    input.phone,
    input.email,
    input.willingToHelp ? 1 : 0,
    input.helpDetails,
    input.willingToBring ? 1 : 0,
    input.bringDetails,
    input.comments,
  ];
}

async function peopleForHousehold(db: D1Database, householdId: string): Promise<HouseholdRecord['people']> {
  const result = await db
    .prepare('SELECT id, full_name, attendance, sort_order FROM guests WHERE household_id = ? ORDER BY sort_order, id')
    .bind(householdId)
    .all<GuestRow>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    attendance: row.attendance,
    sortOrder: row.sort_order,
  }));
}

async function hydrate(db: D1Database, row: HouseholdRow | null): Promise<HouseholdRecord | null> {
  if (!row) return null;
  return {
    id: row.id,
    primaryContactName: row.primary_contact_name,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    stateRegion: row.state_region,
    postalCode: row.postal_code,
    phone: row.phone,
    email: row.email,
    willingToHelp: row.willing_to_help === 1,
    helpDetails: row.help_details,
    willingToBring: row.willing_to_bring === 1,
    bringDetails: row.bring_details,
    comments: row.comments,
    people: await peopleForHousehold(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createHousehold(db: D1Database, input: RsvpInput, editTokenHash: string): Promise<HouseholdRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements = [
    db.prepare(`INSERT INTO households (
      id, primary_contact_name, address_line1, address_line2, city, state_region, postal_code,
      phone, email, willing_to_help, help_details, willing_to_bring, bring_details, comments,
      edit_token_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, ...householdValues(input), editTokenHash, now, now),
    ...input.people.map((person, index) =>
      db.prepare('INSERT INTO guests (id, household_id, full_name, attendance, sort_order) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, person.fullName, person.attendance, index),
    ),
  ];
  await db.batch(statements);
  const created = await getHouseholdById(db, id);
  if (!created) throw new Error('Created household could not be loaded');
  return created;
}

export async function getHouseholdByTokenHash(db: D1Database, hash: string): Promise<HouseholdRecord | null> {
  const row = await db.prepare(`SELECT ${HOUSEHOLD_COLUMNS} FROM households WHERE edit_token_hash = ?`).bind(hash).first<HouseholdRow>();
  return hydrate(db, row);
}

export async function getHouseholdById(db: D1Database, id: string): Promise<HouseholdRecord | null> {
  const row = await db.prepare(`SELECT ${HOUSEHOLD_COLUMNS} FROM households WHERE id = ?`).bind(id).first<HouseholdRow>();
  return hydrate(db, row);
}

async function updateHousehold(db: D1Database, id: string, input: RsvpInput): Promise<HouseholdRecord | null> {
  const existing = await getHouseholdById(db, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const statements = [
    db.prepare(`UPDATE households SET
      primary_contact_name = ?, address_line1 = ?, address_line2 = ?, city = ?, state_region = ?,
      postal_code = ?, phone = ?, email = ?, willing_to_help = ?, help_details = ?, willing_to_bring = ?,
      bring_details = ?, comments = ?, updated_at = ? WHERE id = ?`)
      .bind(...householdValues(input), now, id),
    db.prepare('DELETE FROM guests WHERE household_id = ?').bind(id),
    ...input.people.map((person, index) =>
      db.prepare('INSERT INTO guests (id, household_id, full_name, attendance, sort_order) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, person.fullName, person.attendance, index),
    ),
  ];
  await db.batch(statements);
  return getHouseholdById(db, id);
}

export async function updateHouseholdByTokenHash(db: D1Database, hash: string, input: RsvpInput): Promise<HouseholdRecord | null> {
  const existing = await db.prepare('SELECT id FROM households WHERE edit_token_hash = ?').bind(hash).first<{ id: string }>();
  return existing ? updateHousehold(db, existing.id, input) : null;
}

export async function updateHouseholdById(db: D1Database, id: string, input: RsvpInput): Promise<HouseholdRecord | null> {
  return updateHousehold(db, id, input);
}

export interface AdminListFilters {
  query?: string;
  attendance?: Attendance;
  willingToHelp?: boolean;
  willingToBring?: boolean;
}

export async function listHouseholds(db: D1Database, filters: AdminListFilters): Promise<HouseholdRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.query) {
    const q = `%${filters.query.toLowerCase()}%`;
    where.push(`(LOWER(primary_contact_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(phone) LIKE ? OR EXISTS (
      SELECT 1 FROM guests g WHERE g.household_id = households.id AND LOWER(g.full_name) LIKE ?
    ))`);
    params.push(q, q, q, q);
  }
  if (filters.attendance) {
    where.push('EXISTS (SELECT 1 FROM guests g WHERE g.household_id = households.id AND g.attendance = ?)');
    params.push(filters.attendance);
  }
  if (filters.willingToHelp !== undefined) {
    where.push('willing_to_help = ?');
    params.push(filters.willingToHelp ? 1 : 0);
  }
  if (filters.willingToBring !== undefined) {
    where.push('willing_to_bring = ?');
    params.push(filters.willingToBring ? 1 : 0);
  }
  const sql = `SELECT ${HOUSEHOLD_COLUMNS} FROM households ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC`;
  const result = await db.prepare(sql).bind(...params).all<HouseholdRow>();
  const households: HouseholdRecord[] = [];
  for (const row of result.results ?? []) {
    const record = await hydrate(db, row);
    if (record) households.push(record);
  }
  return households;
}

export async function getAdminStats(db: D1Database): Promise<AdminStats> {
  const households = await db.prepare(`SELECT
    COUNT(*) AS households,
    COALESCE(SUM(willing_to_help), 0) AS willing_to_help,
    COALESCE(SUM(willing_to_bring), 0) AS willing_to_bring
    FROM households`).first<{ households: number; willing_to_help: number; willing_to_bring: number }>();
  const people = await db.prepare(`SELECT
    COUNT(*) AS people,
    COALESCE(SUM(CASE WHEN attendance = 'attending' THEN 1 ELSE 0 END), 0) AS attending,
    COALESCE(SUM(CASE WHEN attendance = 'not_attending' THEN 1 ELSE 0 END), 0) AS not_attending,
    COALESCE(SUM(CASE WHEN attendance = 'unsure' THEN 1 ELSE 0 END), 0) AS unsure
    FROM guests`).first<{ people: number; attending: number; not_attending: number; unsure: number }>();
  return {
    households: Number(households?.households ?? 0),
    people: Number(people?.people ?? 0),
    attending: Number(people?.attending ?? 0),
    notAttending: Number(people?.not_attending ?? 0),
    unsure: Number(people?.unsure ?? 0),
    willingToHelp: Number(households?.willing_to_help ?? 0),
    willingToBring: Number(households?.willing_to_bring ?? 0),
  };
}

export async function allCsvRows(db: D1Database): Promise<Array<Record<string, unknown>>> {
  const result = await db.prepare(`SELECT
    h.id AS household_id, h.primary_contact_name, h.address_line1, h.address_line2, h.city,
    h.state_region, h.postal_code, h.phone, h.email, g.full_name AS person_name, g.attendance,
    h.willing_to_help, h.help_details, h.willing_to_bring, h.bring_details, h.comments,
    h.created_at, h.updated_at
    FROM households h JOIN guests g ON g.household_id = h.id
    ORDER BY h.primary_contact_name COLLATE NOCASE, g.sort_order, g.full_name COLLATE NOCASE`).all<Record<string, unknown>>();
  return result.results ?? [];
}
