-- Salaried staff: people who are rostered but not paid by the hour.
--
-- Managers at a venue are typically salaried, and rostering exists mainly to
-- schedule casual hourly labour. Until now the only way to express "no hourly
-- rate" was to have no `staff_pay_rates` row at all — which is indistinguishable
-- from "nobody has set this person up yet". One is a deliberate decision and
-- the other is an oversight, and silently skipping their labour cost looks the
-- same either way.
--
-- With a pay type, a row means the person has been configured and no row still
-- means outstanding.

alter table staff_pay_rates
  add column pay_type text not null default 'hourly' check (pay_type in ('hourly', 'salaried'));

alter table staff_pay_rates alter column pay_rate drop not null;

-- An hourly worker without a rate is a half-finished setup; a salaried one with
-- an hourly rate is a contradiction that would eventually get used by mistake.
alter table staff_pay_rates add constraint pay_rate_matches_type check (
  (pay_type = 'hourly' and pay_rate is not null)
  or (pay_type = 'salaried' and pay_rate is null)
);

-- Existing rows all carry a rate and default to 'hourly', so behaviour is
-- unchanged for everyone already set up.

-- Pay type is a property of the PERSON, not of a team membership: someone in
-- both catering and operations does not have two pay types. It lives on
-- staff_pay_rates rather than on profiles for the same reason the rate itself
-- does — profiles is readable by every teammate, and RLS filters rows, not
-- columns, so a column there would tell every casual who is salaried.

-- Invitations can pre-set it, so a manager can be invited as salaried rather
-- than being invited and then corrected.
alter table company_invites
  add column pay_type text check (pay_type in ('hourly', 'salaried'));

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

    -- Salaried is checked first: it is a deliberate "no hourly rate", and must
    -- not fall through to the rate branch even if a rate was typed and then the
    -- invite was switched to salaried.
    if matched_invite.pay_type = 'salaried' then
      insert into staff_pay_rates (profile_id, pay_type, pay_rate) values (new.id, 'salaried', null);
    elsif matched_invite.pay_rate is not null then
      insert into staff_pay_rates (profile_id, pay_type, pay_rate) values (new.id, 'hourly', matched_invite.pay_rate);
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
