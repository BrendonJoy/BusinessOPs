# Sub-processor register

Every third party that receives personal data handled by BusinessOps, what they
receive, why, and where they hold it.

This is the factual record the privacy policy will be written from, and the
document to hand a customer whose procurement process asks "who else touches our
data?" — a question a business customer is entitled to ask and, under UK GDPR
Art. 28, one their own compliance depends on.

**Roles.** For a customer's own business data — their jobs, customers, quotes,
invoices, and their staff's timesheets — the customer company is the **data
controller** and JOYTECH is a **processor**. The parties below are therefore
**sub-processors**, engaged by JOYTECH to deliver the service. For account-level
data (the signing-up user's own name, email and login) JOYTECH is the controller.

Accurate as at **2026-08-04**. Update this file whenever a dependency that
receives personal data is added, removed, or moves region.

---

## Supabase

| | |
|---|---|
| **Purpose** | The database, file storage and authentication. Everything the product stores. |
| **Data received** | All of it: account credentials, staff names, job titles, pay rates, customer names/addresses/phone/email, quotes, invoices, expenses, job photos and receipts, timesheets, audit logs, assistant transcripts. |
| **Location** | **London, `eu-west-2`** (project `jqmngabpgdhpohlefeyt`). |
| **Notes** | Moved from Asia-Pacific to London on 2026-08-02 specifically so that UK personal data is not subject to a restricted transfer. See `RESIDENCY_MIGRATION.md` and `COMPLIANCE_LOG.md`. |

## Vercel

| | |
|---|---|
| **Purpose** | Application hosting. Serves every page and runs all server-side code. |
| **Data received** | In transit, everything the user submits or views. Request metadata (IP address, user agent, URL) appears in platform logs. |
| **Location** | Serverless functions pinned to **`lhr1` (London)** so processing happens beside the data. Vercel's edge network terminates TLS globally. |
| **Notes** | The region pin is in the root `vercel.json`. Removing it silently returns execution to US East. |

## Resend

| | |
|---|---|
| **Purpose** | Transactional email only. No marketing, no mailing lists. |
| **Data received** | Recipient email address, and the content of the message. Four senders exist: quote emails and invoice emails (customer name, job number, amounts, quote link), team invitations, and the daily feedback digest to the founder. Supabase also sends auth mail (password reset codes, confirmations) through Resend via custom SMTP. |
| **Location** | United States. |
| **Notes** | A US transfer, but a narrow one — email addresses and document contents, not the database. Needs covering in the transfer section of the privacy policy. |

## Anthropic

| | |
|---|---|
| **Purpose** | The in-app assistant (`lib/chat-agent.ts`) and the daily feedback digest (`lib/feedback-digest.ts`). Model `claude-haiku-4-5`. |
| **Data received** | Whatever the user types, plus whatever the assistant's tools return in order to answer — which includes customer names, phone numbers, addresses and job details, and schedule data. Feedback digest sends the text of submitted feedback messages. |
| **Location** | United States. |
| **Notes** | **The most sensitive item on this list**, because the data is customer PII rather than only an email address, and because users do not necessarily realise a question to the assistant sends job data to a third party. Must be named explicitly in the privacy policy rather than covered by a general "we use AI" line. Worth confirming the API's data-retention and training terms and recording the answer here. |

## Google Maps Platform

| | |
|---|---|
| **Purpose** | Address autocomplete, geocoding a job address to coordinates, and distance calculation for route planning. |
| **Data received** | The address text being searched, and job addresses. No staff location: the geofence comparison is arithmetic done in our own code (`lib/geo.ts`), and no employee coordinate is ever sent to Google. |
| **Location** | United States. |
| **Notes** | Called **server-side only** (`lib/google-maps.ts`). The browser never contacts Google, so no API key is exposed and no user IP or cookie reaches Google from our pages. This is also why no Google origin appears in the Content-Security-Policy. |

---

## Not sub-processors

Recorded so the absence is deliberate rather than an oversight:

- **No analytics, product telemetry, session recording or advertising pixels** are used anywhere in the app.
- **No payment processor yet.** Stripe will join this list when billing is built, and will receive customer billing details.
- **Staff location is not shared with anyone, or stored.** Coordinates are submitted at clock-in, compared to the job site server-side, and discarded (migration `0030`).

## Open items

- [ ] Confirm and record Anthropic's retention and model-training position for API traffic.
- [ ] Publish a customer-facing version of this list alongside the privacy policy.
- [ ] Put a data processing agreement in place for business customers — required once a customer company's staff data is being processed on their behalf.
