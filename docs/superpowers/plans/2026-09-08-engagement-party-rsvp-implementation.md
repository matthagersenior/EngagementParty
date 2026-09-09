# Engagement Party RSVP App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a mobile-first Cloudflare Worker + D1 engagement-party RSVP app with household/group submissions, per-person attendance, secure guest editing, a Cloudflare Access-protected admin dashboard, and CSV export.

**Architecture:** One TypeScript Cloudflare Worker handles JSON APIs and delegates non-API requests to Workers Static Assets in `public/`. D1 stores one household row plus related guest rows; public edit access uses a 32-byte random bearer token whose SHA-256 hash is the only token material stored in D1. The admin UI and every `/api/admin/*` route are designed to sit behind a path-scoped Cloudflare Access application in production.

**Tech Stack:** TypeScript, Cloudflare Workers, Workers Static Assets, Cloudflare D1, Wrangler, Vitest, `@cloudflare/vitest-pool-workers`, vanilla HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-08-engagement-party-rsvp-design.md`

## Global Constraints

- Worker name: `engagement-party`.
- Worker entry point: `src/index.ts`.
- Workers compatibility date: `2026-09-08`.
- Static asset directory: `public/`, bound as `ASSETS`.
- D1 binding name: `DB`.
- Public routes: `/`, `/edit`, `/api/rsvps`, `/api/rsvps/edit`.
- Protected production routes: `/admin*` and `/api/admin/*` via Cloudflare Access.
- One household/group submission contains 1–50 named people.
- Attendance values are exactly `attending`, `not_attending`, or `unsure`.
- Guest edit tokens are 32 random bytes encoded base64url; only lowercase hex SHA-256 hashes are persisted.
- Public edit URLs use `/edit#token=<token>`; JavaScript sends the raw token only in `Authorization: Bearer <token>`.
- Same-origin API only; do not add permissive CORS.
- State-changing requests reject a mismatched `Origin` header.
- Security headers include `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and a restrictive CSP.
- No guest accounts, meal choices, seating charts, payments, photos, or multi-event support in v1.

---

## File Structure

- `package.json` — scripts and development dependencies.
- `tsconfig.json` — strict TypeScript config for Workers.
- `wrangler.jsonc` — Worker, static asset, and D1 configuration.
- `vitest.config.ts` — Workers test-pool configuration.
- `migrations/0001_initial.sql` — households/guests schema and indexes.
- `src/types.ts` — shared Worker bindings and RSVP domain types.
- `src/validation.ts` — input normalization and exact validation rules.
- `src/security.ts` — token generation/hash, bearer parsing, origin guard, headers.
- `src/db.ts` — D1 household/guest persistence and query functions.
- `src/csv.ts` — CSV escaping and export generation.
- `src/admin.ts` — admin stats/list/update/export handlers.
- `src/index.ts` — route dispatch and static asset fallback.
- `public/index.html` — public RSVP form shell.
- `public/edit.html` — private edit shell.
- `public/admin.html` — organizer dashboard shell.
- `public/styles.css` — shared mobile-first presentation.
- `public/rsvp.js` — public form behavior and submission.
- `public/edit.js` — edit-token extraction, load, and update behavior.
- `public/admin.js` — stats, search/filter, editing, and CSV download.
- `test/validation.test.ts` — validation unit tests.
- `test/security.test.ts` — token/origin/security tests.
- `test/api.test.ts` — Worker integration tests against D1.
- `test/csv.test.ts` — CSV shape/escaping tests.
- `README.md` — local setup, D1 creation/migration, deploy, Access setup, QR instructions.

---

### Task 1: Scaffold the Worker and D1 schema

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.jsonc`
- Create: `vitest.config.ts`
- Create: `migrations/0001_initial.sql`
- Create: `src/types.ts`
- Create: `src/index.ts`
- Create: `public/index.html`
- Create: `public/edit.html`
- Create: `public/admin.html`
- Create: `public/styles.css`

**Interfaces:**
- Produces `Env` with `DB: D1Database` and `ASSETS: Fetcher`.
- Produces a Worker `fetch(request, env)` entry point that routes `/api/*` to API handling and all other requests to static assets.

- [ ] **Step 1: Create the package and scripts**

`package.json`:

```json
{
  "name": "engagement-party",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "deploy": "wrangler deploy",
    "db:migrate:local": "wrangler d1 migrations apply engagement-party-db --local",
    "db:migrate:remote": "wrangler d1 migrations apply engagement-party-db --remote"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "latest",
    "@cloudflare/workers-types": "latest",
    "typescript": "latest",
    "vitest": "latest",
    "wrangler": "latest"
  }
}
```

Run:

```bash
npm install
```

Expected: lockfile is created and install exits successfully.

- [ ] **Step 2: Add strict Worker TypeScript configuration**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "WebWorker"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Add Wrangler configuration**

`wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "engagement-party",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-08",
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "engagement-party-db",
      "database_id": "REPLACE_AFTER_D1_CREATION",
      "migrations_dir": "migrations"
    }
  ]
}
```

The implementation session must replace `REPLACE_AFTER_D1_CREATION` immediately after creating the actual D1 database; it must not be deployed with the placeholder value.

- [ ] **Step 4: Add the initial D1 migration**

`migrations/0001_initial.sql`:

```sql
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
```

- [ ] **Step 5: Add bindings/types and a minimal route shell**

`src/types.ts` must define:

```ts
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export type Attendance = 'attending' | 'not_attending' | 'unsure';
```

`src/index.ts` initially returns JSON 404 for unknown `/api/*` routes and delegates non-API requests to `env.ASSETS.fetch(request)`.

- [ ] **Step 6: Create simple static shells**

Create valid semantic HTML documents for `/`, `/edit`, and `/admin`; each loads `/styles.css`. `index.html` includes heading `Engagement Party RSVP`, `edit.html` includes `Update your RSVP`, and `admin.html` includes `Engagement Party Responses`.

- [ ] **Step 7: Verify scaffold**

Run:

```bash
npm run typecheck
npm test
```

Expected: typecheck succeeds; Vitest runs with zero/future tests without configuration errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json wrangler.jsonc vitest.config.ts migrations src public
git commit -m "chore: scaffold engagement party worker"
```

---

### Task 2: Implement exact RSVP normalization and validation

**Files:**
- Create: `src/validation.ts`
- Create: `test/validation.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Produces `RsvpInput`, `GuestInput`, `ValidationError` types.
- Produces `validateRsvpInput(value: unknown): RsvpInput` which either returns normalized input or throws `ValidationError` with field errors.

- [ ] **Step 1: Write failing validation tests**

Cover:
- valid household with two people and different attendance values;
- zero people rejected;
- 51 people rejected;
- invalid attendance rejected;
- `willing_to_help=true` requires help text;
- `willing_to_bring=true` requires bring text;
- false help/bring normalizes details to `null`;
- all maximum lengths from the spec;
- practical email validation.

Use a reusable valid fixture and explicit assertions such as:

```ts
expect(() => validateRsvpInput({ ...valid, people: [] })).toThrow(ValidationError);
```

- [ ] **Step 2: Run the tests and confirm RED**

```bash
npm test -- test/validation.test.ts
```

Expected: failures because `validateRsvpInput` is not implemented.

- [ ] **Step 3: Implement the validator**

Define:

```ts
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
```

`ValidationError` contains `fieldErrors: Record<string,string>` and returns a stable message `Validation failed`.

Implement helpers that trim strings, reject required blanks, enforce exact maximum lengths, validate booleans, and enforce the three attendance constants. Use the exact spec limits.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- test/validation.test.ts
npm run typecheck
```

Expected: all validation tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/validation.ts test/validation.test.ts
git commit -m "feat: validate RSVP submissions"
```

---

### Task 3: Implement token security and same-origin protections

**Files:**
- Create: `src/security.ts`
- Create: `test/security.test.ts`

**Interfaces:**
- Produces `generateEditToken(): string`.
- Produces `hashEditToken(token: string): Promise<string>`.
- Produces `readBearerToken(request: Request): string | null`.
- Produces `assertAllowedOrigin(request: Request): void` for state-changing requests.
- Produces `withSecurityHeaders(response: Response): Response`.

- [ ] **Step 1: Write failing tests**

Verify:
- generated tokens decode to 32 bytes;
- two generated tokens differ;
- SHA-256 output is 64 lowercase hex chars;
- bearer parsing accepts exactly `Bearer <token>`;
- mismatched `Origin` throws/rejects;
- matching `Origin` passes;
- security headers are present.

- [ ] **Step 2: Confirm RED**

```bash
npm test -- test/security.test.ts
```

- [ ] **Step 3: Implement token helpers**

Use `crypto.getRandomValues(new Uint8Array(32))`, base64url encoding without padding, and `crypto.subtle.digest('SHA-256', ...)`.

- [ ] **Step 4: Implement origin guard**

For `POST`, `PUT`, `PATCH`, and `DELETE`, compare `new URL(request.url).origin` against the `Origin` header when present. Throw a dedicated error on mismatch. Do not add CORS response headers.

- [ ] **Step 5: Implement security headers**

Set:

```text
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
```

- [ ] **Step 6: Verify GREEN and commit**

```bash
npm test -- test/security.test.ts
npm run typecheck
git add src/security.ts test/security.test.ts
git commit -m "feat: secure RSVP edit tokens and requests"
```

---

### Task 4: Implement D1 persistence and public create/edit APIs

**Files:**
- Create: `src/db.ts`
- Create: `test/api.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces `createHousehold(db, input, editTokenHash)` returning household ID and timestamps.
- Produces `getHouseholdByTokenHash(db, hash)` returning household plus ordered people without token hash.
- Produces `updateHouseholdByTokenHash(db, hash, input)`.
- Produces public routes `POST /api/rsvps`, `GET /api/rsvps/edit`, `PUT /api/rsvps/edit`.

- [ ] **Step 1: Configure Workers Vitest D1 testing**

Configure `vitest.config.ts` to use `defineWorkersConfig` and the migration directory so integration tests run against isolated D1 storage.

- [ ] **Step 2: Write failing create tests**

Test `POST /api/rsvps` with two people. Assert:
- status `201`;
- JSON contains `editUrl` beginning `/edit#token=`;
- household and two guest rows exist;
- person attendance is stored independently;
- raw token text does not appear anywhere in the household table;
- token hash is 64 lowercase hex chars.

- [ ] **Step 3: Implement create persistence**

Generate UUIDs with `crypto.randomUUID()`, timestamps with `new Date().toISOString()`, and use one D1 `batch()` containing household insert plus ordered guest inserts. Never interpolate user text into SQL.

- [ ] **Step 4: Implement `POST /api/rsvps`**

Flow:
1. `assertAllowedOrigin(request)`.
2. Parse JSON, returning `400` for malformed JSON.
3. `validateRsvpInput`.
4. Generate token and hash.
5. Persist batch.
6. Return `201` JSON `{ "editUrl": "/edit#token=<raw-token>" }`.
7. Map validation errors to `{ error: 'Validation failed', fieldErrors }`.
8. Map unexpected errors to generic `{ error: 'Unable to save RSVP' }` status `500`.

- [ ] **Step 5: Write failing edit-load isolation tests**

Create two households, then verify household A's bearer token returns only A and cannot access B. Missing/invalid bearer tokens must return the same generic `404` body.

- [ ] **Step 6: Implement `GET /api/rsvps/edit`**

Read bearer token, hash it, query by hash, and return only editable household fields and people. Never return `edit_token_hash`.

- [ ] **Step 7: Write failing edit-update tests**

Update contact data, change one person's attendance, remove a person, and add a new person. Assert update is atomic and the edit token continues working.

- [ ] **Step 8: Implement `PUT /api/rsvps/edit`**

Validate origin and payload. Use a D1 batch to update the household, delete existing people, and insert the new validated people list in order. Preserve `created_at` and edit-token hash; update only `updated_at`.

- [ ] **Step 9: Verify public API**

```bash
npm test -- test/api.test.ts
npm run typecheck
```

- [ ] **Step 10: Commit**

```bash
git add src/db.ts src/index.ts test/api.test.ts vitest.config.ts
git commit -m "feat: add RSVP create and private edit APIs"
```

---

### Task 5: Build the public mobile RSVP experience

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Create: `public/rsvp.js`

**Interfaces:**
- Consumes `POST /api/rsvps`.
- Stores raw token parsed from returned `editUrl` under localStorage key `engagementPartyEditToken`.
- Provides repeatable person rows with name + attendance.

- [ ] **Step 1: Build semantic form markup**

Sections: Contact, People in your group/family, Help with preparations, Bring something, Notes. Use explicit labels, `autocomplete` attributes, `type=email`, `type=tel`, and radio/select controls for attendance.

- [ ] **Step 2: Implement repeatable people UI**

Start with one person row. `Add another person` appends a row without mutating existing rows. Removal is allowed while at least one person remains. Each row has name and attendance.

- [ ] **Step 3: Implement conditional help/bring details**

Yes reveals the details field and marks it required; No hides it and clears it from the submission payload.

- [ ] **Step 4: Implement submit behavior**

Serialize form data to the exact `RsvpInput` JSON shape. Disable submit while in flight. On `400`, map `fieldErrors` to accessible inline error elements. On network/500 errors, keep all entered values intact.

- [ ] **Step 5: Implement success state and private link handling**

Parse the fragment token from returned `editUrl`, store it in localStorage, and render:
- confirmation message;
- `Copy private edit link` button using `location.origin + editUrl`;
- privacy warning.

- [ ] **Step 6: Implement repeat-scan banner**

On root page load, if localStorage contains the edit token, show `Update your RSVP` linking to `/edit#token=<token>` and `Submit another household/group`, which dismisses the banner without deleting the saved token.

- [ ] **Step 7: Make the form mobile-first**

Ensure minimum 44px tap targets, readable 16px+ inputs, single-column layout on phones, constrained readable width on larger screens, visible focus states, and non-color-only error/success cues.

- [ ] **Step 8: Manual local QA**

Run `npm run dev`; use a narrow browser viewport and verify add/remove, conditional fields, submit preservation, and success-link copy.

- [ ] **Step 9: Commit**

```bash
git add public/index.html public/styles.css public/rsvp.js
git commit -m "feat: build mobile household RSVP form"
```

---

### Task 6: Build the private guest edit page

**Files:**
- Modify: `public/edit.html`
- Create: `public/edit.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes `GET /api/rsvps/edit` and `PUT /api/rsvps/edit` with `Authorization: Bearer <token>`.
- Reads token only from `location.hash` or localStorage; never writes it into query parameters.

- [ ] **Step 1: Build edit shell and loading/error states**

Provide a loading message, generic invalid-link state, and the same editable field groups as the creation form.

- [ ] **Step 2: Read and validate the fragment token**

Use `URLSearchParams(location.hash.slice(1)).get('token')`. If absent, fall back to localStorage. If still absent, show a generic unavailable message and do not call the API.

- [ ] **Step 3: Load current RSVP**

Call `GET /api/rsvps/edit` with bearer authorization and populate every contact, person, help, bring, and comments field.

- [ ] **Step 4: Submit edits**

Call `PUT /api/rsvps/edit` with the same bearer token and validated UI payload. Preserve values on recoverable errors and show `Your RSVP has been updated` on success.

- [ ] **Step 5: Manual isolation check**

Confirm changing the fragment to a random token produces only the generic invalid-link state.

- [ ] **Step 6: Commit**

```bash
git add public/edit.html public/edit.js public/styles.css
git commit -m "feat: add private RSVP editing"
```

---

### Task 7: Implement admin data, stats, editing, and CSV APIs

**Files:**
- Create: `src/admin.ts`
- Create: `src/csv.ts`
- Create: `test/csv.test.ts`
- Modify: `src/db.ts`
- Modify: `src/index.ts`
- Modify: `test/api.test.ts`

**Interfaces:**
- Produces `GET /api/admin/stats`.
- Produces `GET /api/admin/rsvps?search=&attendance=&help=&bring=`.
- Produces `PUT /api/admin/rsvps/:id`.
- Produces `GET /api/admin/export.csv`.
- Produces `toCsv(rows): string` with RFC-style quoting for commas, quotes, and newlines.

- [ ] **Step 1: Write failing stats tests**

Seed multiple households with mixed attendance/help/bring states. Assert household count, total people, all three attendance totals, willing-to-help households, and willing-to-bring households.

- [ ] **Step 2: Implement stats query**

Use aggregate SQL; return numeric JSON properties:

```ts
{
  households: number,
  people: number,
  attending: number,
  notAttending: number,
  unsure: number,
  willingToHelp: number,
  willingToBring: number
}
```

- [ ] **Step 3: Write failing list/filter/search tests**

Test primary contact search, individual guest-name search, email/phone search, attendance filter, help filter, and bring filter. Returned household objects include ordered `people` arrays and never include token hashes.

- [ ] **Step 4: Implement admin list query**

Use parameterized SQL and constrained filter values. Avoid interpolating search text into SQL strings; use bound `%term%` patterns.

- [ ] **Step 5: Write failing admin-update test**

Update by household ID and verify the same validation rules as the guest edit API apply.

- [ ] **Step 6: Implement admin update**

Reuse `validateRsvpInput`; update household/people atomically by ID without changing the edit token hash.

- [ ] **Step 7: Write failing CSV tests**

Assert one row per person, repeated household fields, correct quote escaping, and absence of `edit_token_hash`, raw token, or any token column.

- [ ] **Step 8: Implement CSV generation**

Columns exactly match the approved spec. Prefix cells beginning with `=`, `+`, `-`, or `@` with a single quote before CSV encoding to reduce spreadsheet formula injection risk.

- [ ] **Step 9: Wire admin routes**

Return `text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="engagement-party-rsvps.csv"` for export.

- [ ] **Step 10: Verify and commit**

```bash
npm test -- test/api.test.ts test/csv.test.ts
npm run typecheck
git add src/admin.ts src/csv.ts src/db.ts src/index.ts test/api.test.ts test/csv.test.ts
git commit -m "feat: add organizer RSVP management APIs"
```

---

### Task 8: Build the organizer dashboard

**Files:**
- Modify: `public/admin.html`
- Create: `public/admin.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes all `/api/admin/*` endpoints.
- Assumes Cloudflare Access handles organizer authentication in production.

- [ ] **Step 1: Build dashboard summary cards**

Display all seven aggregate metrics with text labels.

- [ ] **Step 2: Add search and filters**

Controls: search text, attendance (`all`, three states), willing to help (`all`, `yes`, `no`), willing to bring (`all`, `yes`, `no`). Debounce search and refetch data.

- [ ] **Step 3: Render expandable household cards**

Each card shows primary contact, email/phone, address, timestamps, people and attendance, help/bring details, and comments. Escape by assigning user content through `textContent`, never `innerHTML`.

- [ ] **Step 4: Add organizer edit mode**

Reuse the same conceptual field structure as the guest form. Submit to `PUT /api/admin/rsvps/:id`, then refetch stats/list.

- [ ] **Step 5: Add CSV export action**

Link/button navigates to `/api/admin/export.csv` so the authenticated Access session downloads the file.

- [ ] **Step 6: Mobile QA**

Verify dashboard cards stack on phone widths, filters remain usable, long addresses/comments wrap, and edit controls do not overflow.

- [ ] **Step 7: Commit**

```bash
git add public/admin.html public/admin.js public/styles.css
git commit -m "feat: build organizer RSVP dashboard"
```

---

### Task 9: Finish route behavior, security headers, and regression tests

**Files:**
- Modify: `src/index.ts`
- Modify: `test/api.test.ts`
- Modify: `test/security.test.ts`

**Interfaces:**
- All responses pass through `withSecurityHeaders`.
- Unsupported API methods return `405`.
- Unknown API paths return JSON `404`.
- Non-API paths delegate to assets.

- [ ] **Step 1: Add failing regression tests**

Cover malformed JSON `400`, unsupported methods `405`, unknown API `404`, generic `500`, cross-origin state-changing rejection, response security headers, and no stack/database details in public errors.

- [ ] **Step 2: Implement centralized route/error handling**

Route explicitly by method + pathname. Keep public and admin route namespaces clear. Never create a public list/search route for households.

- [ ] **Step 3: Apply security headers to API and asset responses**

Wrap both API responses and `env.ASSETS.fetch()` responses with `withSecurityHeaders`.

- [ ] **Step 4: Run full verification**

```bash
npm test
npm run typecheck
```

Expected: all tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/api.test.ts test/security.test.ts
git commit -m "test: harden worker routing and security"
```

---

### Task 10: Create Cloudflare resources, deploy, and protect admin routes

**Files:**
- Modify: `wrangler.jsonc`
- Create/Modify: `README.md`

**Interfaces:**
- Produces the public production Worker URL.
- Produces a live D1 database with migration applied.
- Produces Cloudflare Access protection for `/admin*` and `/api/admin/*`.

- [ ] **Step 1: Authenticate Wrangler**

```bash
npx wrangler whoami
```

If not authenticated, complete `npx wrangler login`, then rerun `whoami` and confirm the intended Cloudflare account.

- [ ] **Step 2: Create D1 database**

```bash
npx wrangler d1 create engagement-party-db
```

Copy the returned `database_id` into `wrangler.jsonc` replacing `REPLACE_AFTER_D1_CREATION`.

- [ ] **Step 3: Apply remote migration**

```bash
npm run db:migrate:remote
```

Expected: `0001_initial.sql` applies successfully.

- [ ] **Step 4: Deploy Worker**

```bash
npm run deploy
```

Record the resulting `https://...workers.dev` hostname.

- [ ] **Step 5: Configure Cloudflare Access**

In Cloudflare Zero Trust, create self-hosted Access application coverage for the production hostname with paths covering both `/admin*` and `/api/admin/*`. Add an Allow policy restricted to the organizer email address(es) approved by the user. Do not include `/`, `/edit`, `/api/rsvps`, or `/api/rsvps/edit` in the protected path set.

- [ ] **Step 6: Verify Access boundary externally**

Using a signed-out/private browser session:
- `/` opens without Access login;
- `/edit` opens without Access login;
- `/admin` prompts for Access authentication;
- `/api/admin/stats` prompts/denies without Access authentication;
- public APIs remain reachable only for their intended operations.

Do not treat admin protection as complete until the API route itself is confirmed protected.

- [ ] **Step 7: Add deployment README**

Document install, tests, local dev, D1 create/migrate, deployment, Access path rules, and where to find the Worker URL. Include a warning that RSVP data contains PII and admin routes must remain behind Access.

- [ ] **Step 8: Commit**

```bash
git add wrangler.jsonc README.md
git commit -m "docs: add Cloudflare deployment and Access setup"
```

---

### Task 11: Production acceptance QA and final QR readiness

**Files:**
- Modify: `README.md` with final production URL and acceptance checklist evidence.

**Interfaces:**
- Confirms every acceptance criterion in the approved spec.

- [ ] **Step 1: Run automated gates from a clean install**

```bash
npm ci
npm test
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 2: Test a real multi-person RSVP**

On the deployed URL, submit a household with at least three people using different attendance states. Verify success and copy the private edit link.

- [ ] **Step 3: Test repeat-scan behavior**

Return to `/` on the same device/browser and verify `Update your RSVP` appears and opens the saved household.

- [ ] **Step 4: Test cross-device private edit link**

Open the copied edit link in another browser/device, update one person's status, and verify the admin dashboard reflects the change.

- [ ] **Step 5: Test organizer flows**

Authenticate through Cloudflare Access; verify stats, search, filters, household expansion, organizer edit, and CSV download.

- [ ] **Step 6: Test privacy boundary**

In a signed-out private session, verify admin UI/API remain blocked, random edit tokens return a generic not-found state, and there is no public response directory/search endpoint.

- [ ] **Step 7: Test mobile layout**

Verify on Android and an iPhone-class viewport: no horizontal overflow, usable add/remove controls, readable form labels, visible validation, and successful submission/editing.

- [ ] **Step 8: Record the production URL**

Add the exact deployed root URL to `README.md`. This is the URL that the final engagement-party QR code should encode.

- [ ] **Step 9: Final commit**

```bash
git add README.md
git commit -m "chore: record production RSVP readiness"
```

- [ ] **Step 10: Final verification**

Confirm the repository is clean and the deployed commit matches the verified commit. Only then mark the production URL as ready for QR-code distribution.
