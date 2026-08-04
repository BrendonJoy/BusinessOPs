-- Account deletion with a grace period.
--
-- Deletion is requested, not performed. The account closes immediately and the
-- data is erased 30 days later by a scheduled job. A trades business's entire
-- job, quote and invoice history is not something a single misclick should be
-- able to destroy, and 30 days is still comfortably inside the one-month
-- response window UK GDPR allows for an erasure request.

alter table companies add column deletion_requested_at timestamptz;

-- Deliberately NOT a foreign key to profiles, however much it wants to be.
--
-- companies <- profiles already exists via profiles.company_id. Adding a second
-- foreign key in the other direction makes the relationship between the two
-- tables ambiguous, and PostgREST responds by failing embeds like
-- `select('*, company:companies(*)')` — silently, returning no row rather than
-- an error. That took the settings page down completely the first time this
-- migration was applied.
--
-- The integrity this would buy is worth little here: the only time the value is
-- read, the company row it lives on is about to be erased anyway.
alter table companies add column deletion_requested_by uuid;

-- Pre-existing privilege gap, fixed here because account deletion is what makes
-- it dangerous.
--
-- "update own company" allowed ANY member of a company to update the company
-- row — staff included. Every one of these controls has only ever been offered
-- to company accounts in the UI, but the UI is not the boundary that counts: a
-- staff member could already change their employer's tax settings or job
-- numbering with a direct API call, and once a deletion flag lives on this
-- table they could schedule the whole account for erasure.
--
-- Access level, not job title: `role` is 'company' or 'staff' and is what the
-- rest of the RLS in this schema authorises against.
drop policy "update own company" on companies;

create policy "update own company" on companies
  for update
  using (id = public.current_company_id() and public.current_user_role() = 'company')
  with check (id = public.current_company_id() and public.current_user_role() = 'company');
