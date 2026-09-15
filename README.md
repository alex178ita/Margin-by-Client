# Weekly Hours — Kleecks

A single-page, login-free dashboard showing how many hours each active Kleecks
employee logged in a given week, split into five columns plus the total, with
anyone below 40 hours in red and everyone at or above in green.

| Column | Source | Rule |
| --- | --- | --- |
| Projects | Zoho People timesheet | Project name does **not** start with `_`, `::` or a dash. Presales (`=`) counts here. |
| Internal projects | Zoho People timesheet | Project name starts with `_` or `::` |
| Service projects | Zoho People timesheet | Project name starts with `-`, `--`, `---` or an en/em dash (meetings, admin, training, ticket handling…) |
| Absence | Zoho People — Leave | Approved leave only (holiday, permesso, sick leave, 104, CIG…), spread over the working days it covers at 8h/day |
| Sprints | Zoho Sprints — Timesheets | Only logs native to Sprints; anything pushed there from Zoho Projects is dropped |

**Why a single source for the first three columns.** Zoho People and Zoho
Projects are in sync: every Projects time log also lands in the People
timesheet, and People additionally holds the service projects that only exist
there. Reading People alone therefore covers everything exactly once — verified
against Projects over June–September 2026, where People ≥ Projects for every
person and the extra hours are all People-only projects.

Everything is read from **Zoho Analytics** (workspace *Global Reports*,
`86612000000004001`), which is where all three platforms are already
consolidated.

## How it refreshes

Zoho consolidates the timesheet on Monday morning, so a Vercel cron hits
`/api/refresh` every **Monday at 12:00 UTC** (14:00 Europe/Rome in summer,
13:00 in winter). That endpoint drops the cache and pre-warms the week the
dashboard opens on. Outside that, any week is re-read from Zoho at most once
every six hours.

The dashboard opens on the **last completed week** and the selector goes back
26 weeks; the week in progress is available at the top of the list, flagged as
such.

## Setup

1. Create the GitHub repo and push this folder.
2. In Vercel (team **Kleecks BI**) import the repo as a new project.
3. Add the environment variables from `.env.example` (Production + Preview).
4. Deploy. The cron is declared in `vercel.json` and registers itself on the
   first production deployment.

### Zoho credentials

The app talks to Zoho over REST with its own OAuth refresh token — no MCP
connectors involved. One scope is enough:

```
ZohoAnalytics.data.read
```

The client used by *Margin by Client* already has that scope, so its refresh
token can be reused. After changing `ZOHO_REFRESH_TOKEN` on Vercel, **redeploy
and wait a few minutes**: warm functions keep the old access token in memory
for up to an hour and Analytics answers `8535 INVALID_OAUTHTOKEN` in the
meantime even when the new token is fine.

If the account sits on the `.com` data centre rather than `.eu`, change
`ZOHO_ACCOUNTS_DOMAIN` and `ZOHO_ANALYTICS_DOMAIN` together.

## Local development

```bash
cp .env.example .env.local   # fill in the three OAuth values
npm install
npm run dev
```

## Things worth knowing

- **Who appears.** Every employee with `Employee status = Active` in Zoho
  People and a `@kleecks.com` address, including those who logged nothing —
  a zero row in red is the point of the report. `admin@` and `digitalop@` are
  filtered out as system accounts.
- **The 40h threshold is fixed** for everyone. A week containing a public
  holiday shows a banner naming it, but the colour rule does not change.
- **Absence allocation.** A leave record spanning several weeks (say 7–31
  August) is spread evenly across the working days it covers — public holidays
  and weekends excluded — and only the share falling inside the selected week
  is counted.
- **People matching across platforms** is by e-mail address, which is the only
  key shared by Zoho People and Zoho Sprints. External Sprints users without a
  `@kleecks.com` address are excluded.
- Clicking a row opens the per-project breakdown for that person and week;
  *Download CSV* exports the table as shown.

## Checks

```bash
npm run verify
```

Runs two suites with no network access: `scripts/verify.ts` covers the pure
logic (prefix classification, ISO weeks, Italian public holidays, Zoho date
literals, leave allocation, CSV parsing) and `scripts/verify-pipeline.ts` runs
the whole aggregation against `scripts/fixtures.ts` — real rows pulled from Zoho
Analytics for the week 07–13 Sep 2026 — and asserts the resulting table
person by person.

## Layout

```
app/
  page.tsx              server component: resolves the week, renders the dashboard
  api/refresh/route.ts  cron endpoint (cache drop + warm-up)
components/
  Dashboard.tsx         table, sorting, filter, drawer, CSV export
lib/
  zoho.ts               OAuth refresh + Analytics bulk SQL API + CSV parser
  report.ts             the four queries, classification and aggregation
  dates.ts              ISO weeks, Italian public holidays, Zoho date formats
```
