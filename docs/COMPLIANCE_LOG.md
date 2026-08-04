# Compliance remediation log

A dated record of privacy and data-protection actions taken on BusinessOps.

Kept because "we fixed that" is worth little without a date attached. A regulator, an enterprise customer's due-diligence questionnaire, or an insurer will ask *when* — and reconstructing it later from git history and memory is miserable. Add an entry when something material changes; keep entries short and factual.

Launch markets: **NZ, Australia, USA, UK.** The UK is the strictest regime and is treated as the design driver — meet UK GDPR and the others generally follow.

Not legal advice; the policy pages still need a lawyer before paying customers.

---

## 2026-08-02 — Staff location data no longer retained

**Was:** `timesheet_entries` stored `clock_in_lat/lng` and `clock_out_lat/lng`, written on every clock in and out and kept indefinitely. Nothing in the application ever read them back.

**Now:** columns dropped (migration `0030`), and `clock_out_timesheet_entry` no longer accepts coordinates. Geofencing is unchanged — coordinates are transmitted, used once server-side to answer "are you inside the radius?", and discarded.

**Why:** retaining precise, indefinitely-kept location traces of employees for no purpose fails data minimisation — UK/EU GDPR Art. 5(1)(c), NZ Privacy Act principle 1, Australian Privacy Principle 3. Columns were dropped rather than blanked, so there is nothing to disclose in a subject access request and nothing to resurrect.

**Verified:** the only lat/lng columns remaining anywhere are `jobs.geo_lat`/`geo_lng` — the job site address, which is business data, not worker tracking.

---

## 2026-08-02 — Data residency moved to the UK

**Was:** Supabase project `tlcvarfbwrrzxlipkamp`, hosted outside the UK (AWS, Asia-Pacific).

**Now:** Supabase project `jqmngabpgdhpohlefeyt`, **London `eu-west-2`**. Vercel functions pinned to `lhr1` so processing happens beside the data.

**Why:** storing UK personal data in a country with no UK adequacy decision is a restricted transfer requiring an IDTA and a transfer risk assessment. Hosting in the UK removes the requirement rather than documenting around it. UK–EU adequacy is mutual; NZ principle 12 and Australian APP 8 both permit offshore storage with comparable safeguards, which the UK satisfies.

**Verified:** live client bundle references the London project and nothing else; `x-vercel-id` confirms execution in `lhr1`; all row counts, recomputed money columns, job numbering and RLS boundaries checked against the source.

**⚠ INCOMPLETE:** the old project still exists, retained as a rollback. **Until it is deleted, the personal data has not left the original jurisdiction.**

- [ ] Old project `tlcvarfbwrrzxlipkamp` deleted — **date: ____________**

---

## 2026-08-02 — Password reset fixed for Microsoft mail users

**Was:** reset used an emailed single-use link. Microsoft Defender Safe Links fetches every URL in inbound mail to scan it, spending the token before the recipient clicks. Reset was therefore broken for every Outlook, Hotmail and Office 365 customer.

**Now:** an emailed code, entered on the reset page. A code cannot be spent by something merely reading the message.

**Why it belongs here:** account recovery is an access-control function. A customer permanently locked out of their own business data is a availability and rights problem, not only a support annoyance.

---

## 2026-08-04 — Security headers, crawler exclusion, sub-processor register

**Now:** A Content-Security-Policy with a per-request nonce and `strict-dynamic`
on scripts (set in `apps/web/src/proxy.ts`, which is where the nonce can be
generated), plus HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` and `Permissions-Policy` in `next.config.ts`. `robots.txt`
disallows the whole `app.joytech.nz` host, and `/q/*` additionally serves
`X-Robots-Tag: noindex, nofollow` with matching page metadata.

**Why:** `/q/[token]` shows a named customer's address and prices to anyone with
the link. Indexing would turn "unlisted" into "public". The header and the
robots rule are deliberately redundant: a crawler that honours robots.txt never
fetches the page, and one that ignores it still receives an explicit noindex.

**Deliberate exceptions, recorded so they are not mistaken for oversights:**

- `style-src` keeps `'unsafe-inline'`. A nonce does not cover inline `style`
  *attributes*, and the calendar computes pixel positions that cannot be
  Tailwind classes — a strict style policy would break the day view silently.
- `Permissions-Policy` allows camera, microphone and geolocation for `self`.
  The widely-copied value disables all three; this app uses all three.
- HSTS omits `preload`, which would commit the whole `joytech.nz` tree for the
  lifetime of shipped browsers and is effectively irreversible.

**Also fixed:** `robots.txt` was being caught by the auth redirect and served as
the login page — the file existed and did nothing. Same failure as the PWA
manifest in an earlier batch; `/robots.txt` is now in the proxy's public paths.

**Sub-processor register written** — `docs/SUBPROCESSORS.md`. Notable finding:
Google Maps is called only server-side, so the browser never contacts Google and
no user IP, cookie or API key is exposed to them. Anthropic is the sub-processor
that most needs naming explicitly, because assistant queries carry customer PII.

---

## 2026-08-04 — Retention periods set and enforced

**Was:** nothing was ever deleted. No retention period existed to state.

**Now:** assistant transcripts (`chat_messages`) are kept 12 months and the job
audit log 24 months, enforced by a weekly cron (`/api/cron/retention-purge`)
built on `apps/web/src/lib/retention.ts`, which is the single source of truth for
the numbers the privacy policy will quote.

**Why these two only:** they are the categories with no statutory floor.
Deliberately excluded: quotes, invoices, expenses and cost entries (seven-year
tax record requirements in NZ, AU and UK); timesheets, timesheet days and
payroll periods (wage and time records — six years NZ, seven years AU). Purging
those would put customers in breach of their own obligations. Live business data
goes when the account goes, which is what account deletion is for.

**Verified:** planted an expired row and a fresh one, ran the job, confirmed only
the expired row was deleted and the count was reported; test rows removed.
Unauthenticated requests get 401.

---

## 2026-08-04 — Email confirmation was a one-way door

**Was:** signing up sent a confirmation email and dropped the user back on the
login form with a small notice. There was no way to request the email again
anywhere in the app. An address whose confirmation email was lost, spam-filtered
or mistyped was permanently stuck: the address was taken, so signing up again
failed, and logging in failed because it was unconfirmed. **Accepting a team
invite had the same flaw and worse** — acceptance consumes the invite, so a
staff member could not reuse their link either.

**Now:** a `/check-email` screen that states what happened, names the address
(read from a short-lived httpOnly cookie, never a query parameter — emails in
URLs end up in server logs, browser history and referer headers), and offers a
resend. The "Email not confirmed" login error links to it. Both signup and
invite acceptance route there.

**Why it belongs in this log:** the same reasoning as the password-reset entry
above. Account access is an access-control function, and a customer permanently
locked out of their own business data is a rights and availability problem, not
a support annoyance.

**Also fixed:** Supabase returns an empty error body for some failures (a
rejected address, a failed confirmation send). The message serialised to the
literal string `{}`, which was shown to the user as their entire explanation.
Unusable messages now become plain English, with the real error logged
server-side (`lib/auth-errors.ts`).

**Rate limiting checked, not guessed:** Supabase allows one confirmation email
per address per 60 seconds. A blocked attempt does *not* restart the window
(verified: success at T+0, 429 at T+30, success at T+65), so repeated presses
cannot lock a user out of their own resend. The countdown in the 429 is shown
verbatim because it tells the user exactly how long to wait.

**Noted, not fixed:** the confirmation email is a single-use link, so Microsoft
Safe Links will spend it in transit exactly as it did for password reset. The
consequence differs — fetching a confirmation link *confirms the account*, so
the user sees "expired" and can simply log in. Confusing rather than a lockout,
so it does not warrant the switch to codes that reset required.

---

## 2026-08-04 — Account deletion and data export

**Was:** neither existed. An access request could not be serviced and an erasure
request could only have been carried out by hand, against the database.

**Now:**

- **Export** — `/api/account/export` returns every table this company holds as a
  single JSON file. Company accounts only: a full export contains colleagues'
  pay rates and the business's finances, which is not a staff member's to take.
  Each table is read *through the caller's own session*, so RLS does the
  scoping — a mistake there can only ever return less than intended, never
  another company's data. Verified: exactly one company row, not two.
- **Deletion** — requested from Settings, confirmed by typing the company name.
  The account closes immediately for everyone in the business; the data is
  erased 30 days later by a daily cron. Company accounts only, enforced in RLS
  rather than only in the UI (see below). Cancellable at any point in the 30
  days, and the export stays reachable the whole time — leaving should not mean
  losing the ability to take your records with you.

**Why a grace period rather than immediate erasure:** a trades business's entire
job, quote and invoice history should not be destroyable by one misclick, and
erasure is the one mistake that no amount of apologising undoes. 30 days is
still inside the one month UK GDPR allows for responding to an erasure request,
so it costs nothing in compliance terms.

**Privilege gap fixed in passing (migration 0032):** the `update own company`
RLS policy allowed *any* member of a company to update the company row — staff
included. Every control built on it has only ever been offered to company
accounts in the UI, but the UI is not the boundary that counts: a staff member
could already have changed their employer's tax settings or job numbering with a
direct API call, and once a deletion flag lived on that table they could have
scheduled the whole account for erasure. Now restricted to `role = 'company'`.

**Verified end to end** with a disposable company account: export scoped
correctly; a wrong company name rejected; the correct name (case-insensitive,
whitespace-trimmed) accepted; the gate blocking every route; cancel restoring
access; and a backdated request erased by the cron — company row, profile,
storage object and auth user all confirmed gone, with a second run a no-op.

**Note on evidence:** once a company is erased there is nothing left in the
database to point at, so the cron's response body — which records what was
erased and when — is the only record that it happened. It lands in the platform
logs. A dedicated erasure log table would be a firmer basis if a regulator ever
asks; recorded as an open item rather than built.

---

## Known outstanding

Not yet addressed. Recorded so the gaps are explicit rather than forgotten:

- Signup acceptance capture, with a versioned record of which terms and privacy notice were accepted and when
- No erasure log survives a deletion — the cron's response in the platform logs is currently the only evidence that an account was erased and on what date
- Terms and privacy pages (drafting last, after the behaviour they describe is settled — needs legal review)
- A data processing agreement for business customers — required once a customer company's staff data is processed on their behalf, and likely to be asked for by the first real customer
- `feedback_messages` has no retention period. Same category as the two now purged (no statutory floor), left out only because it was not part of the agreed scope — worth a decision.
- Anthropic's API retention and model-training position is not yet confirmed in writing (`SUBPROCESSORS.md`)
