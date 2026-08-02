-- Job title for staff — "Electrician", "Apprentice", "Foreman", "Office admin".
--
-- Deliberately NOT reusing profiles.role. That column is constrained to
-- ('company', 'staff'), is referenced throughout the app, and is baked into the
-- RLS policies for viewing, editing and scheduling jobs plus quote and invoice
-- access. Putting an occupation in it would fail every authorisation check.
-- Two people with the same job title must be able to hold different access
-- levels, and vice versa, so these are genuinely separate concepts.
--
-- Purely descriptive: free text, no constraint, no functional effect.

alter table profiles add column if not exists job_title text;
alter table company_invites add column if not exists job_title text;

-- The trigger that turns an accepted invite into a profile has to carry the
-- title across, otherwise a title set when inviting someone is silently lost
-- the moment they accept.
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

  return new;
end;
$$;
