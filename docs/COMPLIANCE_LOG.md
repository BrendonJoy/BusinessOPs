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

## Known outstanding

Not yet addressed. Recorded so the gaps are explicit rather than forgotten:

- Retention periods and any purge mechanism — nothing is ever deleted today
- Account deletion and data export — access and erasure requests cannot currently be serviced
- Sub-processor disclosure: Anthropic, Google Maps, Resend, Supabase, Vercel
- Signup consent capture, with a versioned record of what was accepted and when
- Terms and privacy pages (drafting last, after the behaviour they describe is settled — needs legal review)
- `noindex` on public quote pages; security headers (CSP, `Referrer-Policy`, `X-Frame-Options`)
