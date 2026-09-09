PRAGMA foreign_keys = ON;

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  primary_contact_name TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state_region TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  willing_to_help INTEGER NOT NULL DEFAULT 0 CHECK(willing_to_help IN (0,1)),
  help_details TEXT,
  willing_to_bring INTEGER NOT NULL DEFAULT 0 CHECK(willing_to_bring IN (0,1)),
  bring_details TEXT,
  comments TEXT,
  edit_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE guests (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  attendance TEXT NOT NULL CHECK(attendance IN ('attending','not_attending','unsure')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE INDEX idx_guests_household_id ON guests(household_id);
CREATE INDEX idx_guests_attendance ON guests(attendance);
