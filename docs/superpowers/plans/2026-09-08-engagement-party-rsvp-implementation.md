# Engagement Party RSVP App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a mobile-first Cloudflare Worker + D1 engagement-party RSVP app with household/group submissions, per-person attendance, secure guest editing, a Cloudflare Access-protected admin dashboard, and CSV export.

**Architecture:** One TypeScript Cloudflare Worker handles JSON APIs and delegates non-API requests to Workers Static Assets in `public/`. D1 stores one household row plus related guest rows. Public edit access uses a 32-byte random bearer token whose SHA-256 hash is the only token material persisted. The admin UI and every `/api/admin/*` route are protected by Cloudflare Access in production.

**Tech Stack:** TypeScript, Cloudflare Workers, Workers Static Assets, Cloudflare D1, Wrangler, Vitest, `@cloudflare/vitest-pool-workers`, vanilla HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-08-engagement-party-rsvp-design.md`

## Global Constraints

- Worker name: `engagement-party`.
- Worker entry point: `src/index.ts`.
- Workers compatibility date: `2026-09-08`.
- Static asset directory: `public/`, bound as `ASSETS`.
- D1 binding name: `DB`.
- Public routes: `/`, `/edit`, `/api/rsvps`, `/api/rsvps/edit`.
- Protected production routes: `/admin*` and `/api/admin/*` through Cloudflare Access.
- Each household/group contains 1–50 named people.
- Attendance values are exactly `attending`, `not_attending`, or `unsure`.
- Edit tokens are 32 random bytes encoded base64url; only lowercase-hex SHA-256 hashes are stored.
- Private edit URLs use `/edit#token=<token>` and send the token only through `Authorization: Bearer <token>`.
- Same-origin API only; no permissive CORS.
- State-changing requests reject a mismatched `Origin` header.
- Security headers include `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and a restrictive CSP.
- No guest accounts, public RSVP directory, meal choices, seating charts, payments, photos, or multi-event support in v1.

## Planned Files

- `package.json` — scripts and dev dependencies.
- `tsconfig.json` — strict Worker TypeScript config.
- `wrangler.jsonc` — Worker/static-assets/D1 config using the real D1 ID returned by Cloudflare.
- `vitest.config.ts` — Workers test-pool config.
- `migrations/0001_initial.sql` — D1 schema.
- `src/types.ts` — bindings and domain types.
- `src/validation.ts` — input normalization/validation.
- `src/security.ts` — token helpers, bearer parsing, origin guard, headers.
- `src/db.ts` — D1 persistence/query functions.
- `src/csv.ts` — safe CSV generation.
- `src/admin.ts` — admin stats/list/update/export handlers.
- `src/index.ts` — route dispatch and static-asset fallback.
- `public/index.html`, `public/rsvp.js` — public RSVP form.
- `public/edit.html`, `public/edit.js` — private guest editing.
- `public/admin.html`, `public/admin.js` — organizer dashboard.
- `public/styles.css` — shared mobile-first styles.
- `test/validation.test.ts`, `test/security.test.ts`, `test/api.test.ts`, `test/csv.test.ts` — automated tests.
- `README.md` — local/deploy/Access/QR instructions.

---

### Task 1: Create Cloudflare D1 resource and scaffold the Worker

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
- Produces `Env { DB: D1Database; ASSETS: Fetcher }`.
- Produces a Worker `fetch(request, env)` entry point.
- Produces a real D1 database named `engagement-party-db` and records its returned ID directly in `wrangler.jsonc`.

- [ ] **Step 1: Initialize npm metadata**

Create `package.json`:

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

Run `npm install`. Expected: `package-lock.json` is created and install exits successfully.

- [ ] **Step 2: Verify Cloudflare authentication and create D1**

Run:

```bash
npx wrangler whoami
npx wrangler d1 create engagement-party-db
```

Use the exact `database_id` returned by the second command in the next step. Do not invent or reuse an ID from another project.

- [ ] **Step 3: Create Worker configuration with the returned D1 ID**

Create `wrangler.jsonc` with:

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
      "database_id": "<the exact ID printed by `wrangler d1 create engagement-party-db`>",
      "migrations_dir": "migrations"
    }
  ]
}
```

The angle-bracket instruction above is documentation for the implementer, not literal file content; the committed file must contain the actual Cloudflare ID.

- [ ] **Step 4: Add strict TypeScript configuration**

Create `tsconfig.json`:

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

- [ ] **Step 5: Add D1 schema**

Create `migrations/0001_initial.sql`:

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

- [ ] **Step 6: Configure Workers Vitest**

Create `vitest.config.ts`:

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { d1Databases: ['DB'] }
      }
    }
  }
});
```

- [ ] **Step 7: Create bindings and route shell**

`src/types.ts`:

```ts
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export type Attendance = 'attending' | 'not_attending' | 'unsure';
```

`src/index.ts` initially returns JSON `404` for unknown `/api/*` paths and delegates all other requests to `env.ASSETS.fetch(request)`.

- [ ] **Step 8: Create simple semantic HTML shells**

Create valid HTML pages whose headings are exactly:
- `/index.html`: `Engagement Party RSVP`
- `/edit.html`: `Update your RSVP`
- `/admin.html`: `Engagement Party Responses`

Each page loads `/styles.css`.

- [ ] **Step 9: Verify and commit**

Run:

```bash
npm run typecheck
npm test
```

Expected: no TypeScript errors and no Vitest configuration error.

Commit:

```bash
git add package.json package-lock.json tsconfig.json wrangler.jsonc vitest.config.ts migrations src public
git commit -m "chore: scaffold engagement party worker"
```

---

### Task 2: Implement RSVP domain types and exact validation

**Files:**
- Modify: `src/types.ts`
- Create: `src/validation.ts`
- Create: `test/validation.test.ts`

**Interfaces:**
- Produces `GuestInput`, `RsvpInput`, `ValidationError`.
- Produces `validateRsvpInput(value: unknown): RsvpInput`.

- [ ] **Step 1: Write failing tests**

Cover valid multi-person input, zero people, 51 people, invalid attendance, required help/bring details, null normalization when help/bring is false, every maximum length from the spec, and practical email validation.

Representative assertion:

```ts
expect(() => validateRsvpInput({ ...valid, people: [] })).toThrow(ValidationError);
```

- [ ] **Step 2: Run RED**

Run `npm test -- test/validation.test.ts`. Expected: failure because the validator does not exist.

- [ ] **Step 3: Define exact domain types**

Add:

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

- [ ] **Step 4: Implement exact validation**

`ValidationError` exposes `fieldErrors: Record<string,string>` and message `Validation failed`. Enforce all approved limits: contact/person names 120; address lines 160; city/state 100; postal 32; phone 40; email 254; help/bring 1000; comments 2000; 1–50 people; exactly three attendance values; trimmed required fields; practical email rule from the spec.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
npm test -- test/validation.test.ts
npm run typecheck
```

Commit `feat: validate RSVP submissions`.

---

### Task 3: Implement token security, origin guard, and response headers

**Files:**
- Create: `src/security.ts`
- Create: `test/security.test.ts`

**Interfaces:**
- `generateEditToken(): string`
- `hashEditToken(token: string): Promise<string>`
- `readBearerToken(request: Request): string | null`
- `assertAllowedOrigin(request: Request): void`
- `withSecurityHeaders(response: Response): Response`

- [ ] **Step 1: Write failing tests**

Verify 32 decoded token bytes, token uniqueness, 64-char lowercase hash, strict bearer parsing, mismatched-origin rejection, matching-origin acceptance, and required headers.

- [ ] **Step 2: Run RED**

Run `npm test -- test/security.test.ts`.

- [ ] **Step 3: Implement token helpers**

Use `crypto.getRandomValues(new Uint8Array(32))`, base64url without padding, and `crypto.subtle.digest('SHA-256', ...)`.

- [ ] **Step 4: Implement origin and headers**

For `POST`, `PUT`, `PATCH`, and `DELETE`, reject a present `Origin` that differs from `new URL(request.url).origin`. Set:

```text
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
```

- [ ] **Step 5: Run GREEN and commit**

Run `npm test -- test/security.test.ts && npm run typecheck` and commit `feat: secure RSVP edit tokens and requests`.

---

### Task 4: Implement D1 persistence and public create/edit API

**Files:**
- Create: `src/db.ts`
- Create: `test/api.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- `createHousehold(db, input, editTokenHash)`
- `getHouseholdByTokenHash(db, hash)`
- `updateHouseholdByTokenHash(db, hash, input)`
- `POST /api/rsvps`
- `GET /api/rsvps/edit`
- `PUT /api/rsvps/edit`

- [ ] **Step 1: Apply migration to local test D1**

Run `npm run db:migrate:local`. Expected: `0001_initial.sql` applies successfully.

- [ ] **Step 2: Write failing creation tests**

Submit two people with different attendance states. Assert `201`, returned `editUrl` begins `/edit#token=`, one household and two guest rows exist, attendance is independent, raw token is absent from D1, and stored token hash matches lowercase 64-char SHA-256 form.

- [ ] **Step 3: Implement atomic creation**

Use UUIDs from `crypto.randomUUID()`, ISO timestamps, parameterized D1 prepared statements, and one `DB.batch()` containing the household insert plus ordered guest inserts.

- [ ] **Step 4: Implement `POST /api/rsvps`**

Sequence: origin guard → JSON parse → validation → token generation/hash → D1 batch → `201 { editUrl }`. Map malformed/validation input to `400`; unexpected failures to generic `500 { error: 'Unable to save RSVP' }`.

- [ ] **Step 5: Write failing private-load isolation tests**

Create two households. Verify token A loads only A, token B loads only B, and missing/random tokens return the same generic `404` response.

- [ ] **Step 6: Implement `GET /api/rsvps/edit`**

Read bearer token, hash it, fetch the matching household plus ordered people, and never return `edit_token_hash`.

- [ ] **Step 7: Write failing edit-update tests**

Change contact fields, change attendance, remove one person, add another. Assert the edit token remains valid and the write is atomic.

- [ ] **Step 8: Implement `PUT /api/rsvps/edit`**

Origin guard + validation. Batch household update, delete existing people, insert replacement people. Preserve `created_at` and `edit_token_hash`; update `updated_at`.

- [ ] **Step 9: Verify and commit**

Run `npm test -- test/api.test.ts && npm run typecheck` and commit `feat: add RSVP create and private edit APIs`.

---

### Task 5: Build the public mobile RSVP form

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Create: `public/rsvp.js`

**Interfaces:**
- Consumes `POST /api/rsvps`.
- Saves the raw token under localStorage key `engagementPartyEditToken`.

- [ ] **Step 1: Build semantic sections**

Create Contact, People in your group/family, Help with preparations, Bring something, and Notes sections with explicit labels, `autocomplete`, `type="email"`, and `type="tel"` where applicable.

- [ ] **Step 2: Build repeatable person controls**

Start with one row. `Add another person` appends without altering existing values. Removal works while at least one row remains. Each row captures name plus attendance.

- [ ] **Step 3: Build conditional help/bring controls**

Yes reveals and requires its details field. No hides it and sends `null`.

- [ ] **Step 4: Submit safely**

Serialize the exact `RsvpInput` shape, disable duplicate submit while in flight, map server `fieldErrors` to accessible inline messages, and preserve all values on recoverable failures.

- [ ] **Step 5: Build success/edit-link behavior**

Store the token from the returned fragment URL. Show confirmation, a `Copy private edit link` button using `location.origin + editUrl`, and a privacy warning.

- [ ] **Step 6: Build repeat-scan behavior**

If localStorage has a token, show `Update your RSVP` linking to `/edit#token=<stored-token>` and `Submit another household/group`.

- [ ] **Step 7: Mobile/accessibility QA**

Use 44px+ tap targets, 16px+ inputs, visible focus states, single-column phone layout, and non-color-only status messages. Verify no entered person values disappear when adding/removing another row.

- [ ] **Step 8: Commit**

Commit `feat: build mobile household RSVP form`.

---

### Task 6: Build the private guest edit page

**Files:**
- Modify: `public/edit.html`
- Create: `public/edit.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes `GET /api/rsvps/edit` and `PUT /api/rsvps/edit` with bearer token.

- [ ] **Step 1: Build loading, invalid-link, form, and success states**

The form mirrors the public form fields and person controls.

- [ ] **Step 2: Read token from fragment**

Use:

```js
const token = new URLSearchParams(location.hash.slice(1)).get('token') || localStorage.getItem('engagementPartyEditToken');
```

If absent, show the generic invalid-link state and make no API request.

- [ ] **Step 3: Load and populate the RSVP**

Call `GET /api/rsvps/edit` with `Authorization: Bearer ${token}` and populate all fields/people.

- [ ] **Step 4: Submit edits**

Call `PUT /api/rsvps/edit` with the same bearer token and normalized payload. Preserve form values on recoverable errors and show `Your RSVP has been updated` on success.

- [ ] **Step 5: Manual isolation check and commit**

Random fragments must show only the generic invalid-link state. Commit `feat: add private RSVP editing`.

---

### Task 7: Implement admin stats, search/filter, editing, and CSV APIs

**Files:**
- Create: `src/admin.ts`
- Create: `src/csv.ts`
- Create: `test/csv.test.ts`
- Modify: `src/db.ts`
- Modify: `src/index.ts`
- Modify: `test/api.test.ts`

**Interfaces:**
- `GET /api/admin/stats`
- `GET /api/admin/rsvps?search=&attendance=&help=&bring=`
- `PUT /api/admin/rsvps/:id`
- `GET /api/admin/export.csv`

- [ ] **Step 1: Write failing stats tests**

Seed mixed households and assert households, people, attending, not-attending, unsure, willing-to-help, and willing-to-bring counts.

- [ ] **Step 2: Implement stats query**

Return:

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

- [ ] **Step 3: Write failing search/filter tests**

Cover primary contact name, individual guest name, email, phone, attendance, help, and bring filters. Results include ordered `people` and exclude token hashes.

- [ ] **Step 4: Implement parameterized list/search/filter queries**

Bind `%search%` as a value; never interpolate user search text into SQL. Constrain filter values before querying.

- [ ] **Step 5: Write failing admin-update test and implement update**

Reuse `validateRsvpInput`; batch household update + guest replacement by household ID without modifying edit-token hash.

- [ ] **Step 6: Write failing CSV tests**

Assert exactly one row per person, repeated household fields, correct comma/quote/newline escaping, and no token fields.

- [ ] **Step 7: Implement safe CSV**

Use the approved columns in order. Before CSV quoting, prefix cells whose first character is `=`, `+`, `-`, or `@` with `'` to reduce spreadsheet-formula injection risk.

- [ ] **Step 8: Wire export response**

Set `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="engagement-party-rsvps.csv"`.

- [ ] **Step 9: Verify and commit**

Run `npm test -- test/api.test.ts test/csv.test.ts && npm run typecheck` and commit `feat: add organizer RSVP management APIs`.

---

### Task 8: Build the organizer dashboard

**Files:**
- Modify: `public/admin.html`
- Create: `public/admin.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes all `/api/admin/*` endpoints.
- Relies on Cloudflare Access for organizer authentication in production.

- [ ] **Step 1: Render seven summary metrics**

Households, total people, attending, not attending, unsure, willing to help, willing to bring.

- [ ] **Step 2: Add search and filters**

Search text plus attendance, help, and bring filters. Debounce text input and refetch data.

- [ ] **Step 3: Render expandable household cards**

Show contact info, complete address, timestamps, people/attendance, help details, bring details, and comments. Put user content into DOM with `textContent`, never `innerHTML`.

- [ ] **Step 4: Add organizer editing**

Edit the same household/person fields and submit to `PUT /api/admin/rsvps/:id`; refetch list and stats after success.

- [ ] **Step 5: Add CSV download**

Navigate to `/api/admin/export.csv` using the authenticated browser session.

- [ ] **Step 6: Mobile QA and commit**

Verify stacked cards, wrapping long text, non-overflowing controls, and usable filters on phone width. Commit `feat: build organizer RSVP dashboard`.

---

### Task 9: Centralize routing/error behavior and finish regression coverage

**Files:**
- Modify: `src/index.ts`
- Modify: `test/api.test.ts`
- Modify: `test/security.test.ts`

**Interfaces:**
- All Worker responses receive security headers.
- Unsupported API methods return `405`.
- Unknown API paths return JSON `404`.
- Non-API paths delegate to static assets.

- [ ] **Step 1: Add failing regression tests**

Cover malformed JSON `400`, unsupported method `405`, unknown API `404`, generic `500`, mismatched origin rejection, security headers, and absence of database/stack details in public failures.

- [ ] **Step 2: Implement centralized routing/error mapping**

Route by method + pathname. Keep public and admin namespaces separate. Do not add any public household list/search endpoint.

- [ ] **Step 3: Apply security headers to API and static asset responses**

Wrap both generated API responses and `env.ASSETS.fetch(request)` responses.

- [ ] **Step 4: Full automated verification and commit**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass and typecheck is clean. Commit `test: harden worker routing and security`.

---

### Task 10: Apply production D1 migration and deploy Worker

**Files:**
- Create/Modify: `README.md`

**Interfaces:**
- Produces the live Worker URL and production D1 schema.

- [ ] **Step 1: Apply remote migration**

Run `npm run db:migrate:remote`. Expected: `0001_initial.sql` applies successfully to `engagement-party-db`.

- [ ] **Step 2: Deploy**

Run `npm run deploy`. Record the exact deployed Worker URL printed by Wrangler.

- [ ] **Step 3: Smoke-test public routes**

Verify `/` and `/edit` load successfully and a real test household can submit and edit.

- [ ] **Step 4: Document deployment**

`README.md` must contain install, test, local dev, D1 migration, deploy, Access configuration, PII warning, and the exact production root URL.

- [ ] **Step 5: Commit**

Commit `docs: add Cloudflare deployment instructions`.

---

### Task 11: Configure and verify Cloudflare Access protection

**Files:**
- Modify: `README.md` with exact Access path policy used.

**Interfaces:**
- Protects `/admin*` and `/api/admin/*` while leaving public RSVP/edit routes open.

- [ ] **Step 1: Create self-hosted Access coverage**

For the production hostname, configure Access path coverage for both `/admin*` and `/api/admin/*`. Add an Allow policy containing only organizer email address(es) approved by the user.

- [ ] **Step 2: Verify signed-out behavior**

In a private browser session:
- `/` loads without Access login.
- `/edit` loads without Access login.
- `/admin` requires Access authentication.
- `/api/admin/stats` requires Access authentication.

Admin protection is incomplete unless both the visible dashboard and the admin API are blocked when signed out.

- [ ] **Step 3: Verify authenticated behavior**

Authenticate as an approved organizer and confirm stats, list, edits, and CSV export work.

- [ ] **Step 4: Record policy and commit**

Record the deployed hostname and protected path families in `README.md`. Commit `docs: record admin Access protection`.

---

### Task 12: Production acceptance QA and QR readiness

**Files:**
- Modify: `README.md` with final acceptance evidence.

**Interfaces:**
- Confirms all nine acceptance criteria in the approved spec.

- [ ] **Step 1: Run clean automated gates**

```bash
npm ci
npm test
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 2: Test a real multi-person RSVP**

Submit at least three named people with mixed attendance states. Verify help/bring conditional details and copy the private edit link.

- [ ] **Step 3: Test repeat scan/root revisit**

Return to `/` on the same device and verify `Update your RSVP` opens the correct household.

- [ ] **Step 4: Test cross-device private editing**

Open the private link in a different browser/device, change attendance, and verify the dashboard updates.

- [ ] **Step 5: Test privacy boundary**

Signed out, verify admin UI/API are blocked, random edit tokens return the same generic not-found state, and no public list/search endpoint exists.

- [ ] **Step 6: Test organizer workflows**

Verify dashboard totals, text search, all filters, household expansion, organizer edits, and CSV download.

- [ ] **Step 7: Test mobile layout**

Verify Android and iPhone-class viewport behavior: no horizontal overflow, usable add/remove controls, readable labels, visible validation, successful submit, and successful edit.

- [ ] **Step 8: Mark the exact production URL QR-ready**

Record the verified URL in `README.md` only after every acceptance check passes. That exact root URL is the value to encode in the engagement-party QR code.

- [ ] **Step 9: Final commit and verification**

Commit `chore: record production RSVP readiness`, confirm the repository is clean, and verify the deployed commit is the same commit that passed acceptance QA.
