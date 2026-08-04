-- A record of which version of which document each person accepted, and when.
--
-- This is *acceptance*, not consent. For a B2B tool the lawful basis for
-- processing is performance of a contract, not consent — and consent under UK
-- GDPR must be as easy to withdraw as it is to give. Calling contract
-- acceptance "consent" would arm a customer to withdraw it while continuing to
-- use the product, and leave us with no coherent answer.
--
-- Append-only by design. When a document is reissued the version changes and a
-- new row is written; the old row stays, because "what did this customer agree
-- to in 2026" is a question only the historical record can answer.
create table policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  document text not null check (document in ('privacy', 'terms')),
  version text not null,
  accepted_at timestamptz not null default now()
);

create index policy_acceptances_profile on policy_acceptances (profile_id, document);

alter table policy_acceptances enable row level security;

-- Read-only to the person it is about. There is deliberately no insert policy:
-- rows are written solely by handle_new_user below, which is security definer.
-- An acceptance record the subject can create or edit is not evidence of
-- anything.
create policy "read own acceptances" on policy_acceptances
  for select using (profile_id = auth.uid());

-- Recreated to record acceptance at signup. Acceptance has to happen here
-- rather than in application code because email confirmation means there is no
-- session immediately after signing up — nothing is authenticated yet, so
-- nothing could write the row under RLS. The versions ride in on user metadata.
--
-- Both documents are handled even though only the privacy notice is wired up
-- today, so adding terms later is a form field rather than another trigger
-- rewrite.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  matched_invite company_invites%rowtype;
begin
  select * into matched_invite
    from company_invites
    where email = new.email and accepted_at is null and expires_at > now()
    order by created_at desc
    limit 1;

  if matched_invite.id is not null then
    insert into profiles (
      id, company_id, full_name, role, email, job_title,
      can_view_all_jobs, can_edit_jobs, quotes_access, invoices_access,
      can_log_expenses, can_view_reports, can_schedule
    )
      values (
        new.id, matched_invite.company_id, new.raw_user_meta_data ->> 'full_name', matched_invite.role, new.email,
        matched_invite.job_title,
        matched_invite.can_view_all_jobs, matched_invite.can_edit_jobs, matched_invite.quotes_access,
        matched_invite.invoices_access, matched_invite.can_log_expenses, matched_invite.can_view_reports,
        matched_invite.can_schedule
      );

    if matched_invite.pay_rate is not null then
      insert into staff_pay_rates (profile_id, pay_rate) values (new.id, matched_invite.pay_rate);
    end if;

    update company_invites set accepted_at = now() where id = matched_invite.id;
  else
    insert into companies (name) values (coalesce(new.raw_user_meta_data ->> 'company_name', 'My Company'))
      returning id into new_company_id;

    insert into profiles (
      id, company_id, full_name, role, email,
      can_view_all_jobs, can_edit_jobs, quotes_access, invoices_access,
      can_log_expenses, can_view_reports, can_schedule
    )
      values (
        new.id, new_company_id, new.raw_user_meta_data ->> 'full_name', 'company', new.email,
        true, true, 'full', 'full', true, true, true
      );
  end if;

  if coalesce(new.raw_user_meta_data ->> 'accepted_privacy_version', '') <> '' then
    insert into policy_acceptances (profile_id, document, version)
      values (new.id, 'privacy', new.raw_user_meta_data ->> 'accepted_privacy_version');
  end if;

  if coalesce(new.raw_user_meta_data ->> 'accepted_terms_version', '') <> '' then
    insert into policy_acceptances (profile_id, document, version)
      values (new.id, 'terms', new.raw_user_meta_data ->> 'accepted_terms_version');
  end if;

  return new;
end;
$$;
