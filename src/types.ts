export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
  error?: string;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  ASSETS: AssetFetcher;
}

export type Attendance = 'attending' | 'not_attending' | 'unsure';

export interface GuestInput {
  fullName: string;
  attendance: Attendance;
}

export interface RsvpInput {
  primaryContactName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateRegion: string;
  postalCode: string;
  phone: string;
  email: string;
  willingToHelp: boolean;
  helpDetails: string | null;
  willingToBring: boolean;
  bringDetails: string | null;
  comments: string | null;
  people: GuestInput[];
}

export interface GuestRecord extends GuestInput {
  id: string;
  sortOrder: number;
}

export interface HouseholdRecord extends RsvpInput {
  id: string;
  people: GuestRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminStats {
  households: number;
  people: number;
  attending: number;
  notAttending: number;
  unsure: number;
  willingToHelp: number;
  willingToBring: number;
}
