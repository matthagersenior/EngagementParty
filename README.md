# Engagement Party RSVP

A mobile-first engagement-party RSVP web app designed to open from a QR code. It supports household/group submissions, attendance per person, shared offers to help or bring items, private guest edit links, and an organizer dashboard.

## Stack

- Cloudflare Worker
- Workers Static Assets
- Cloudflare D1
- Cloudflare Access for organizer-only routes
- TypeScript
- Vanilla HTML/CSS/JavaScript
- Vitest with the Cloudflare Workers Vitest plugin

## Guest flow

1. Guest scans the event QR code and opens `/`.
2. They enter one primary contact plus any number of named people in the household/group, up to 50.
3. Attendance is selected separately for every person.
4. Help/bring answers are stored once for the household/group.
5. After submission, the app returns a private edit link.
6. The edit token is stored locally on that browser so revisiting the public QR page can offer **Update your RSVP**.
7. The raw token is never stored in D1; only its SHA-256 hash is persisted.

## Organizer flow

`/admin` shows totals, search/filter controls, expandable household responses, organizer editing, and CSV export.

**Important:** `/admin*` and `/api/admin/*` contain personally identifiable information and must be protected by Cloudflare Access before the production URL is shared.

## Local setup

Prerequisites: Node.js 22+ and a Cloudflare account.

```bash
npm install
npm run typecheck
npm test
```

Create a D1 database once:

```bash
npx wrangler d1 create engagement-party-db
```

Copy the returned database ID into `wrangler.jsonc`, replacing `REPLACE_AFTER_D1_CREATION`.

Apply the migration locally:

```bash
npm run db:migrate:local
```

Start the Worker:

```bash
npm run dev
```

## Production deployment

### 1. Create D1

Create a D1 database named `engagement-party-db` in the Cloudflare dashboard or with:

```bash
npx wrangler d1 create engagement-party-db
```

Record its database ID.

### 2. Configure GitHub Actions secrets

In the GitHub repository, add these Actions secrets:

- `CLOUDFLARE_API_TOKEN` — a token allowed to deploy Workers and manage the target D1 database.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID.
- `CLOUDFLARE_D1_DATABASE_ID` — the database ID created above.

The repository intentionally keeps a placeholder database ID in `wrangler.jsonc`. The manual deploy workflow replaces that placeholder only inside the CI runner before applying migrations and deploying.

### 3. Run the deploy workflow

Open **Actions → Deploy Engagement Party → Run workflow**.

The workflow performs:

1. dependency install;
2. typecheck;
3. automated tests;
4. D1 migration;
5. Worker + static asset deployment.

Do not treat the QR code as final until this workflow is green and the production URL has passed the manual checks below.

## Cloudflare Access setup

Cloudflare Access sits in front of the Worker; it is not implemented as a fake password inside the app.

For the production hostname — including a `workers.dev` hostname if you use it — create Access protection for both route families:

- `/admin*`
- `/api/admin/*`

Because these are two disjoint path families, the safest dashboard configuration is **two self-hosted Access applications using the same Allow policy** unless your account UI lets one application list both paths. Do not protect `/*`, `/`, `/edit`, or `/api/rsvps*`, because guests must be able to RSVP without authenticating.

For each admin Access application:

1. Go to **Zero Trust → Access → Applications**.
2. Add a **Self-hosted** application.
3. Choose the production hostname and the path above.
4. Create an **Allow** policy containing only the organizer email address(es) you approve.
5. Leave the application deny-by-default for everyone else.
6. Verify a signed-out/private browser is prompted for Access authentication on the admin path.

### Required production checks

Before distributing the QR code:

- `/` opens without Access authentication.
- `/edit` opens without Access authentication.
- `POST /api/rsvps` works from the public form.
- `/admin` requires Access authentication.
- `/api/admin/stats` requires Access authentication when opened directly in a signed-out browser.
- `/api/admin/export.csv` requires Access authentication.

Protecting only the visible admin page is **not sufficient**. The admin API routes must be behind Access too.

## QR code

Once the production URL is final, create the event QR code using the exact public root URL, for example:

```text
https://party.example.com/
```

Do not encode an `/admin` URL or a private guest edit link into the public QR code.

## Data model

### `households`

Stores the primary contact, mailing address, phone, email, shared help/bring answers, notes, token hash, and timestamps.

### `guests`

Stores each named person and that person's individual attendance status.

This is intentionally not a plus-one model.

## Security notes

- Private edit tokens are 32 random bytes encoded base64url.
- Only lowercase SHA-256 token hashes are stored in D1.
- Edit tokens are placed in the URL fragment (`/edit#token=...`) so the raw token is not sent in the initial page request path.
- The browser sends edit tokens to the API only as an `Authorization: Bearer ...` header.
- State-changing API calls reject a mismatched `Origin` header.
- API routes are same-origin only; no permissive CORS headers are enabled.
- Security headers include a restrictive Content Security Policy, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.
- CSV export neutralizes spreadsheet-formula prefixes in guest-provided cells.
- Public APIs do not provide lookup by name, email, address, or phone.

## Manual mobile QA

Test on at least one Android browser and one iPhone-class viewport/device:

1. Open from the QR code.
2. Add three or more people to one family/group.
3. Choose different attendance values for different people.
4. Toggle helper and bring-item answers and enter details.
5. Submit successfully.
6. Copy the private edit link.
7. Re-open the public QR page on the same device and use **Update your RSVP**.
8. Open the private edit link on another device/browser and update the correct household.
9. Confirm invalid edit links show only the generic not-found state.
10. Confirm admin search, filters, edits, totals, and CSV export.
11. Confirm signed-out access to both admin route families is blocked by Cloudflare Access.

## Commands

```bash
npm run dev
npm run typecheck
npm test
npm run db:migrate:local
npm run db:migrate:remote
npm run deploy
```
