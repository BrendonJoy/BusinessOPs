-- A company works in one timezone, and it is not necessarily the reader's.
--
-- Until now every time in the app was rendered in whatever zone the browser
-- reported, and every shift was *created* from that zone too. That is correct
-- only while everyone involved is standing in the same country. A manager
-- opening the roster from a holiday in Sydney sees every shift shifted two
-- hours, and a shift they create there files under the wrong local_date and
-- disappears from the roster page for the day it belongs to.
--
-- A roster is a shared document. A shift starts at 4pm at the venue no matter
-- where the person reading it happens to be, so the zone belongs to the company
-- and the venue — not to the user, and not to the device.
--
-- Stored as an IANA name ('Pacific/Auckland'), never as an offset. They are not
-- interchangeable: New Zealand moves an hour twice a year, so an offset captured
-- in July and applied to a December shift is wrong. A name resolves to the right
-- offset for whichever date it is applied to. It is also what Postgres itself
-- accepts, so `starts_at at time zone c.timezone` works in SQL if reporting ever
-- needs it.

-- Default is New Zealand rather than UTC. Signup sends the browser's detected
-- zone so this default is only reached when detection fails or a row is created
-- some other way, and in that case a guess that is right for the businesses
-- actually using this beats UTC, which is nobody's real zone and would be wrong
-- silently rather than obviously.
alter table companies add column timezone text not null default 'Pacific/Auckland';

comment on column companies.timezone is
  'IANA zone name. The zone this business operates in — used to render times and to turn typed wall-clock times into instants.';

-- Null means "the company's". Set only by a business running venues in more
-- than one zone; the common case is one country and one answer, and a per-venue
-- copy of it would be one more thing to keep in step.
alter table venues add column timezone text;

comment on column venues.timezone is
  'IANA zone name, or null to use the company''s. Only needed for venues in a different zone from the business.';

-- Validated in the database, not only in the form.
--
-- An invalid name is not a cosmetic problem: Intl.DateTimeFormat throws a
-- RangeError on one, which would take out the roster, the calendar and the
-- assistant for the whole company at once. The application checks too, but the
-- assistant and any future API write through other paths, and this is the one
-- place they all pass through. A trigger rather than a check constraint because
-- pg_timezone_names is a lookup, so the test cannot be immutable.
create or replace function public.assert_valid_timezone()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception '% is not a known timezone name', new.timezone
      using hint = 'Use an IANA name such as Pacific/Auckland or Australia/Sydney.';
  end if;
  return new;
end;
$$;

create trigger companies_timezone_valid
  before insert or update of timezone on companies
  for each row execute function public.assert_valid_timezone();

create trigger venues_timezone_valid
  before insert or update of timezone on venues
  for each row execute function public.assert_valid_timezone();

-- Carries the zone the browser detected at signup, alongside the company name
-- and the policy versions. Same reasoning as those: there is no session during
-- signup when email confirmation is on, so nothing could write it afterwards
-- under RLS, and a company created without a zone would render every time in
-- the wrong one until somebody noticed and went looking in Settings.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  matched_invite company_invites%rowtype;
  signup_timezone text;
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

    if matched_invite.pay_type = 'salaried' then
      insert into staff_pay_rates (profile_id, pay_type, pay_rate) values (new.id, 'salaried', null);
    elsif matched_invite.pay_rate is not null then
      insert into staff_pay_rates (profile_id, pay_type, pay_rate) values (new.id, 'hourly', matched_invite.pay_rate);
    end if;

    update company_invites set accepted_at = now() where id = matched_invite.id;
  else
    -- Someone joining an invite does not bring a zone with them: they work for a
    -- business that already has one, and the shift times they see must match
    -- what their manager sees. Only a new company sets it.
    signup_timezone := new.raw_user_meta_data ->> 'timezone';
    if signup_timezone is null
       or not exists (select 1 from pg_timezone_names where name = signup_timezone) then
      signup_timezone := 'Pacific/Auckland';
    end if;

    insert into companies (name, timezone)
      values (coalesce(new.raw_user_meta_data ->> 'company_name', 'My Company'), signup_timezone)
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

    insert into company_products (company_id, product, plan, status, trial_ends_at)
      values (new_company_id, 'businessops', 'company', 'trialing', now() + interval '30 days');
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
