# Runbook: moving Supabase from Mumbai to London

**Status:** Phases 1–7 complete 2026-08-02. Production is live on London.
**Phase 8 (deleting the old project) is still OUTSTANDING** — see the bottom of this file. Until it is done, the personal data still resides outside the UK and the transfer problem is not remediated.

## Why

The Supabase project (`tlcvarfbwrrzxlipkamp`) is hosted in **AWS ap-south-1, Mumbai** — confirmed by resolving the database host into `2406:da1a::/32`. BusinessOps is launching into NZ, Australia, the USA and the UK.

India has no UK adequacy decision, so storing UK customers' personal data there is a restricted transfer requiring an International Data Transfer Agreement and a transfer risk assessment. Moving to **London (`eu-west-2`)** removes the problem rather than papering over it: the UK and EU have mutual adequacy, and both NZ (privacy principle 12) and Australia (APP 8) permit offshore storage with comparable safeguards, which the UK clears easily.

Supabase **cannot change a project's region in place**. This is a new project plus a data move, which is why it is being done before launch rather than after.

Secondary benefit: Vercel functions currently default to US East while the database is in Mumbai — roughly 200ms per round trip, several times per page. Pinning both to London makes that hop local.

## Target project

Created 2026-08-02, ref `jqmngabpgdhpohlefeyt`. Region **confirmed as `eu-west-2` (London)** by resolving `db.jqmngabpgdhpohlefeyt.supabase.co` into `2a05:d01c::/32` and matching that prefix against AWS's published `ip-ranges.json`. Do not take the dashboard's word for it — this check is the one that matters, because region cannot be changed afterwards.

## Inventory to move (measured 2026-08-02)

| What | Count |
|---|---|
| auth users | **1** (`brendonjoy87@hotmail.com`) |
| table rows, 17 tables | 216 total |
| storage objects | 2 (1 expense receipt, 1 company logo) |
| `companies.job_seq` | **18**, prefix `JOB-` |

Largest tables: `job_audit_log` 88, `quote_line_items` 24, `quotes` 23, `invoices` 15, `jobs` 12, `customers` 11.

This is small enough that no `pg_dump`/`psql` install is needed. Everything moves through `@supabase/supabase-js`, which is already a dependency and is known to work against these projects — auth via the admin API, rows via PostgREST, files via the storage API. Lower footprint than installing a database server for a one-off job, and the whole thing is a reviewable script.

**Only one auth user** makes Phase 3 a single record rather than a bulk operation.

## Before starting

- Pick a quiet window. There is a short period where the old project is authoritative and the new one is being filled.
- Do **not** delete the old project until verification passes. It is the rollback.

## Phase 1 — Create the project *(Brendon)*

1. Supabase dashboard → New project.
2. **Region: London (eu-west-2).** This cannot be changed later.
3. Same organisation as the existing project.
4. Save the new project's URL, publishable key and secret key somewhere safe — they are needed in Phase 6.

Do not point anything at the new project yet.

## Phase 2 — Schema

Apply migrations `0001` … `0030` **in order** to the new project.

The schema is not dumped from the old project. Every migration is in `packages/db/migrations/`, so running them gives a schema that exactly matches git, with no drift carried across.

`0030_drop_timesheet_location_storage.sql` is included, so the staff location columns never exist in the new project at all.

> **Known friction:** migrations containing `GRANT` statements have historically tripped the browser-automation safety classifier, so these get pasted into the Supabase SQL editor by hand. Budget for that.

## Phase 3 — Auth users *(the critical step)*

`profiles.id` is a foreign key to `auth.users(id)`, and nine tables reference `profiles(id)` — timesheets, job assignments, pay rates, audit log, chat messages, invites, approvals. **User UUIDs must be preserved.** Creating fresh accounts would orphan all of it.

Approach, in order of preference:

1. **Recreate with explicit IDs.** `POST /auth/v1/admin/users` accepts an explicit `id`. Create each user in the new project with their original UUID and email, no password, then send a password reset. Preserves every relationship; costs one inconvenient email per user.
2. **Fallback:** dump and restore the `auth.users` rows directly, preserving password hashes. More fiddly, avoids the resets.

Verify option 1 actually accepts an explicit `id` on the current Supabase version *before* committing to it. If it silently assigns a new UUID, stop and use option 2.

Also carry across `platform_admins` (`user_id` references `auth.users` directly).

## Phase 4 — Table data

Restore data only — the schema already exists from Phase 2.

Foreign keys mean insertion order matters, or triggers must be disabled for the load. Either dump with `pg_dump --data-only` and restore with `session_replication_role = replica`, or insert in dependency order:

```
companies → profiles → customers → jobs → job_assignments
→ quotes → quote_line_items → invoices → invoice_line_items
→ cost_entries → expenses → job_files → timesheet_days
→ timesheet_entries → staff_pay_rates → job_audit_log
→ chat_messages → feedback/invites
```

Sequences: everything uses `gen_random_uuid()` except `companies.job_seq`, which drives job numbering. **Confirm `job_seq` carries across** or the next job created will reuse an existing number.

`pg_dump` / `psql` are not currently installed on the laptop.

## Phase 5 — Storage

Three buckets, created by migrations but with objects to copy:

| Bucket | Public | Notes |
|---|---|---|
| `job-files` | no | signed URLs, 1h |
| `expense-receipts` | no | signed URLs, 1h |
| `company-logos` | **yes** | logos only |

Download from old, upload to new, preserving paths — `job_files.file_url` and `expenses.file_path` store paths that must keep matching.

## Phases 2–5: what actually happened (executed 2026-08-02)

All four completed and verified. Four things bit, none of them obvious in advance — recorded here because they would bite again:

1. **`handle_new_user()` fires during Phase 3.** There is an `on_auth_user_created` trigger on `auth.users`. Creating the migrated user made it auto-create a *new* company (fresh uuid, `job_seq` 0) and point the profile at it. Because the data copy uses `on conflict do nothing`, that wrong profile would have survived and the account would have opened onto an empty company with all 12 jobs present but unreachable. **Delete the trigger-created company before copying data** — the profile cascades with it.

2. **Generated columns cannot be inserted into.** `quote_line_items.line_total`, `invoice_line_items.line_total` and `cost_entries.total_cost` are computed. Postgres rejects any explicit value. Filter on `is_generated <> 'ALWAYS'` and let the database recompute — then *verify the sums match the source*, because a silent formula difference would be wrong money, not an error.

3. **json/jsonb columns need explicit `JSON.stringify`.** node-postgres serialises a JS array into a Postgres array literal (`{a,b}`), which is not valid JSON. Surfaces as `invalid input syntax for type json` on `feedback_digests`.

4. **`storage.list()` is not recursive and does not error on a missing bucket.** A flat listing reported 1 object in `expense-receipts`; walking the per-company folders found 4. It also returns an empty array for buckets that do not exist, so it is useless as an existence check.

Verified after the fact: all 22 row counts match the source; the three recomputed generated columns match to the cent (15382.50 / 3455.09 / 1885.18); `job_seq` is 18; the profile points at the real company; job numbers `JOB-0001`–`0011` and `0014` are intact; and the only lat/lng columns anywhere in the database are `jobs.geo_lat`/`geo_lng`.

## Phase 6 — Cutover

1. `apps/web/.env.local` → new `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Vercel env vars → the same three, for Production **and** Preview.
3. **New project → Auth → URL Configuration → Site URL and redirect URLs set to `https://app.joytech.nz`.** Skipping this has bitten this project before: password-reset links silently point at the wrong host.
4. Pin Vercel functions to London by adding to `vercel.json`:
   ```json
   { "regions": ["lhr1"] }
   ```
5. Redeploy.

`CRON_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` and `GOOGLE_MAPS_API_KEY` are unchanged.

## Phase 7 — Verify

Do not skip. Against the deployed app, not localhost:

- [ ] Log in as the owner account (after password reset)
- [ ] Jobs list shows all jobs with correct numbers
- [ ] Open a job — costs, quote, invoice, files all present
- [ ] Photo/receipt thumbnails load (signed URLs against the new bucket)
- [ ] Create a job — job number continues the sequence, does not collide
- [ ] Clock in and out — geofence still enforces, and **no coordinates are stored**
- [ ] Public quote link opens for a customer with no login
- [ ] Calendar feed URL still returns events
- [ ] Chat assistant answers a question (Anthropic + DB access)
- [ ] Staff account sees only its own timesheets (RLS intact)
- [ ] Send one real quote email end to end

## Phases 6–7: cutover, executed 2026-08-02

Env vars were changed in Vercel **before** the code was pushed. This matters: migration 0030 altered `clock_out_timesheet_entry`'s signature, so new code only works against London and old code only works against Mumbai. Vercel applies env changes to new builds only, so pushing afterwards put new code and new env into the same deployment and switched atomically. A manual redeploy in between would have produced new env against old code and broken clock-out.

Verified against the live site:

- Client bundle for `/reset-password` contains `jqmngabpgdhpohlefeyt` and **zero** references to the old project. This is the authoritative check — `NEXT_PUBLIC_SUPABASE_URL` is inlined into client bundles at build time.
- `x-vercel-id: syd1::lhr1::…` — request enters at the nearest edge and executes in London, confirming the `lhr1` pin.
- Public quote link and calendar feed both 200; site 200; forgot-password serving the code flow.

**A verification trap worth remembering:** the public quote link and calendar feed initially looked like proof of cutover. They are not. Those tokens were *copied*, so they resolve identically against either project. Only artefacts that differ between the two databases — or the build-time-inlined project ref — can tell you which one is live.

Also note `/login` ships no Supabase reference at all: it is server-rendered with a server action, so the browser client never loads there. Scan a client-component page instead.

## Phase 8 — Decommission (OUTSTANDING)

Deliberately deferred on 2026-08-02. The old project costs nothing to keep and is the only rollback if something surfaces that the checks missed. Give it a few days of real use first.

**Then delete the old project.** This is not tidying up — it is the actual remedy. Until it is deleted, the personal data still resides outside the UK and the transfer problem is unresolved.

Checklist when the time comes:

- [ ] Delete the old Supabase project
- [ ] **Record the deletion date** — it is the evidence the issue was remediated, and the thing a regulator or a customer's due-diligence questionnaire would ask for
- [ ] Rotate the London database password (it was shared in a chat transcript during the migration)
- [ ] Delete `apps/web/.env.migration.local` and `C:\JOYTECH\open-me-to-set-password.html`
- [ ] Confirm custom SMTP and the `{{ .Token }}` reset template are still set on London

Rollback disappears at the first step.

## Rollback

Before Phase 8, rollback is reverting the env vars in `.env.local` and Vercel and redeploying. The old project is untouched and authoritative throughout. After Phase 8 there is no rollback, which is why Phase 7 is thorough.

## Not covered here

Still open from the compliance audit, tracked separately: retention periods and purge, account deletion and data export, sub-processor disclosure (Anthropic, Google Maps, Resend, Supabase, Vercel), signup consent capture, `noindex` on public quote pages, and security headers.
