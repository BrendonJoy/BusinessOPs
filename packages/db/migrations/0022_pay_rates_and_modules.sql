-- ============================================================
-- Pay rates (feeding into labour cost-entry auto-fill) + company-level
-- module toggles (Quotes/Invoicing/Expenses/Reports on/off per company).
-- ============================================================

-- ------------------------------------------------------------
-- Pay rates live in their own table, not a column on `profiles`.
-- `profiles` has a blanket "select using (company_id = current_company_id())"
-- policy (0019) -- every teammate can already read every column of every
-- other teammate's profile row (that's how the Team list / job-assignment
-- dropdown / audit-log names work today). RLS filters rows, not columns, so
-- there's no way to hide just one column on that table. A separate table
-- with its own policy is the only way to actually restrict pay-rate
-- visibility to Company + the owning staff member, at the DB level.
-- ------------------------------------------------------------

create table staff_pay_rates (
  profile_id uuid primary key references profiles(id) on delete cascade,
  pay_rate numeric(10, 2) not null,
  updated_at timestamptz not null default now()
);

alter table staff_pay_rates enable row level security;

create policy "select own or company pay rate" on staff_pay_rates
  for select using (
    profile_id = auth.uid()
    or (
      public.current_user_role() = 'company'
      and exists (
        select 1 from profiles p
        where p.id = staff_pay_rates.profile_id and p.company_id = public.current_company_id()
      )
    )
  );

create policy "company inserts pay rates" on staff_pay_rates
  for insert with check (
    public.current_user_role() = 'company'
    and exists (
      select 1 from profiles p
      where p.id = staff_pay_rates.profile_id and p.company_id = public.current_company_id()
    )
  );

create policy "company updates pay rates" on staff_pay_rates
  for update using (
    public.current_user_role() = 'company'
    and exists (
      select 1 from profiles p
      where p.id = staff_pay_rates.profile_id and p.company_id = public.current_company_id()
    )
  )
  with check (
    public.current_user_role() = 'company'
    and exists (
      select 1 from profiles p
      where p.id = staff_pay_rates.profile_id and p.company_id = public.current_company_id()
    )
  );

create policy "company deletes pay rates" on staff_pay_rates
  for delete using (
    public.current_user_role() = 'company'
    and exists (
      select 1 from profiles p
      where p.id = staff_pay_rates.profile_id and p.company_id = public.current_company_id()
    )
  );

-- Invites aren't broadly readable the way profiles are (existing invite RLS
-- is already company-only), so a plain column is fine here -- no separate
-- table needed for the pre-acceptance case.
alter table company_invites add column pay_rate numeric(10, 2);

-- ------------------------------------------------------------
-- Company-level module toggles. Not a security boundary (a company can't
-- "attack" itself by seeing its own quotes) so no new RLS beyond the
-- existing "update own company" policy, same as currency/gst_registered/etc.
-- ------------------------------------------------------------

alter table companies
  add column modules_quotes_enabled boolean not null default true,
  add column modules_invoicing_enabled boolean not null default true,
  add column modules_expenses_enabled boolean not null default true,
  add column modules_reports_enabled boolean not null default true;

-- ------------------------------------------------------------
-- Signup trigger: carry a pending invite's pay rate onto the new profile,
-- same as the permission columns already do.
-- ------------------------------------------------------------

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
      id, company_id, full_name, role, email,
      can_view_all_jobs, can_edit_jobs, quotes_access, invoices_access,
      can_log_expenses, can_view_reports, can_schedule
    )
      values (
        new.id, matched_invite.company_id, new.raw_user_meta_data ->> 'full_name', matched_invite.role, new.email,
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
