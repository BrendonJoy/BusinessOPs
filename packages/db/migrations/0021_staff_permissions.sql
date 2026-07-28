-- ============================================================
-- BusinessOps Business tier: per-staff configurable permissions.
-- Replaces the fixed owner/admin/staff tiers from 0019/0020 with just two
-- account kinds (company / staff) plus 7 individually-toggleable
-- permissions per staff member, configured by the company account.
-- ============================================================

-- ------------------------------------------------------------
-- Permission columns (added before the data fixup below, so the admin/
-- owner backfill can populate them in the same pass)
-- ------------------------------------------------------------

alter table profiles
  add column can_view_all_jobs boolean not null default false,
  add column can_edit_jobs boolean not null default false,
  add column quotes_access text not null default 'hidden' check (quotes_access in ('hidden', 'view', 'full')),
  add column invoices_access text not null default 'hidden' check (invoices_access in ('hidden', 'view', 'full')),
  add column can_log_expenses boolean not null default false,
  add column can_view_reports boolean not null default false,
  add column can_schedule boolean not null default false;

alter table company_invites
  add column can_view_all_jobs boolean not null default false,
  add column can_edit_jobs boolean not null default false,
  add column quotes_access text not null default 'hidden' check (quotes_access in ('hidden', 'view', 'full')),
  add column invoices_access text not null default 'hidden' check (invoices_access in ('hidden', 'view', 'full')),
  add column can_log_expenses boolean not null default false,
  add column can_view_reports boolean not null default false,
  add column can_schedule boolean not null default false;

-- ------------------------------------------------------------
-- Collapse role enum: owner -> company, drop admin entirely. Any existing
-- admin row becomes staff with full permissions, so no real capability is
-- silently lost if one exists in some environment.
-- ------------------------------------------------------------

alter table profiles drop constraint profiles_role_check;
alter table company_invites drop constraint company_invites_role_check;

update profiles
  set role = 'staff', can_view_all_jobs = true, can_edit_jobs = true, quotes_access = 'full',
      invoices_access = 'full', can_log_expenses = true, can_view_reports = true, can_schedule = true
  where role = 'admin';

update profiles
  set role = 'company', can_view_all_jobs = true, can_edit_jobs = true, quotes_access = 'full',
      invoices_access = 'full', can_log_expenses = true, can_view_reports = true, can_schedule = true
  where role = 'owner';

update company_invites
  set role = 'staff', can_view_all_jobs = true, can_edit_jobs = true, quotes_access = 'full',
      invoices_access = 'full', can_log_expenses = true, can_view_reports = true, can_schedule = true
  where role = 'admin';

alter table profiles add constraint profiles_role_check check (role in ('company', 'staff'));
alter table company_invites add constraint company_invites_role_check check (role = 'staff');

-- ------------------------------------------------------------
-- Signup trigger: copy the invite's permission columns onto the new
-- profile (same as role already does); brand-new signups get 'company'
-- with full permissions instead of 'owner'.
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

-- ------------------------------------------------------------
-- Permission-check helper functions (all security definer, bypassing RLS
-- on the tables they read -- same reasoning as current_company_id()).
-- ------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.can_access_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jobs j
    join profiles p on p.id = auth.uid()
    where j.id = p_job_id
      and j.company_id = p.company_id
      and (p.role = 'company' or p.can_view_all_jobs or j.assigned_user_id = auth.uid())
  );
$$;

-- Gates writes to a job's own content (status/address/notes/costs/files).
-- Deliberately distinct from can_schedule_job below -- a staff member
-- might reschedule/reassign work without having blanket edit rights on
-- job content, or vice versa.
create function public.can_edit_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jobs j
    join profiles p on p.id = auth.uid()
    where j.id = p_job_id
      and j.company_id = p.company_id
      and (p.role = 'company' or (p.can_edit_jobs and (p.can_view_all_jobs or j.assigned_user_id = auth.uid())))
  );
$$;

-- Gates the assigned-to dropdown and calendar drag-reschedule specifically.
create function public.can_schedule_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jobs j
    join profiles p on p.id = auth.uid()
    where j.id = p_job_id
      and j.company_id = p.company_id
      and (p.role = 'company' or (p.can_schedule and (p.can_view_all_jobs or j.assigned_user_id = auth.uid())))
  );
$$;

create function public.can_view_quotes(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_job(p_job_id)
    and coalesce((select role = 'company' or quotes_access in ('view', 'full') from profiles where id = auth.uid()), false);
$$;

create function public.can_edit_quotes(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_job(p_job_id)
    and coalesce((select role = 'company' or quotes_access = 'full' from profiles where id = auth.uid()), false);
$$;

create function public.can_view_invoices(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_job(p_job_id)
    and coalesce((select role = 'company' or invoices_access in ('view', 'full') from profiles where id = auth.uid()), false);
$$;

create function public.can_edit_invoices(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_job(p_job_id)
    and coalesce((select role = 'company' or invoices_access = 'full' from profiles where id = auth.uid()), false);
$$;

create function public.can_manage_job_expense(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'company'
    or (p_job_id is not null and public.can_access_job(p_job_id)
        and coalesce((select can_log_expenses from profiles where id = auth.uid()), false));
$$;

-- ------------------------------------------------------------
-- Split every "for all" policy that mixed read and write into separate
-- select/insert/update/delete policies -- the structural change needed to
-- make "view-only" actually enforced at the DB level, not just hidden in
-- the UI.
-- ------------------------------------------------------------

drop policy "manage own company jobs" on jobs;

create policy "select company jobs" on jobs
  for select using (
    company_id = public.current_company_id()
    and (
      public.current_user_role() = 'company'
      or coalesce((select can_view_all_jobs from profiles where id = auth.uid()), false)
      or assigned_user_id = auth.uid()
    )
  );

create policy "insert company jobs" on jobs
  for insert with check (
    company_id = public.current_company_id()
    and (
      public.current_user_role() = 'company'
      or coalesce((select can_edit_jobs from profiles where id = auth.uid()), false)
    )
  );

create policy "update company jobs" on jobs
  for update using (public.can_edit_job(id) or public.can_schedule_job(id))
  with check (company_id = public.current_company_id());

create policy "delete company jobs" on jobs
  for delete using (public.can_edit_job(id));

drop policy "manage own company job files" on job_files;

create policy "select company job files" on job_files
  for select using (public.can_access_job(job_files.job_id));

create policy "insert company job files" on job_files
  for insert with check (public.can_edit_job(job_files.job_id));

create policy "delete company job files" on job_files
  for delete using (public.can_edit_job(job_files.job_id));

drop policy "manage own company cost entries" on cost_entries;

create policy "select company cost entries" on cost_entries
  for select using (public.can_access_job(cost_entries.job_id));

create policy "insert company cost entries" on cost_entries
  for insert with check (public.can_edit_job(cost_entries.job_id));

create policy "update company cost entries" on cost_entries
  for update using (public.can_edit_job(cost_entries.job_id))
  with check (public.can_edit_job(cost_entries.job_id));

create policy "delete company cost entries" on cost_entries
  for delete using (public.can_edit_job(cost_entries.job_id));

drop policy "manage own company quotes" on quotes;

create policy "select company quotes" on quotes
  for select using (public.can_view_quotes(quotes.job_id));

create policy "insert company quotes" on quotes
  for insert with check (public.can_edit_quotes(quotes.job_id));

create policy "update company quotes" on quotes
  for update using (public.can_edit_quotes(quotes.job_id))
  with check (public.can_edit_quotes(quotes.job_id));

create policy "delete company quotes" on quotes
  for delete using (public.can_edit_quotes(quotes.job_id));

drop policy "manage own company quote line items" on quote_line_items;

create policy "select company quote line items" on quote_line_items
  for select using (public.can_view_quotes((select job_id from quotes where id = quote_line_items.quote_id)));

create policy "insert company quote line items" on quote_line_items
  for insert with check (public.can_edit_quotes((select job_id from quotes where id = quote_line_items.quote_id)));

create policy "update company quote line items" on quote_line_items
  for update using (public.can_edit_quotes((select job_id from quotes where id = quote_line_items.quote_id)))
  with check (public.can_edit_quotes((select job_id from quotes where id = quote_line_items.quote_id)));

create policy "delete company quote line items" on quote_line_items
  for delete using (public.can_edit_quotes((select job_id from quotes where id = quote_line_items.quote_id)));

drop policy "manage own company invoices" on invoices;

create policy "select company invoices" on invoices
  for select using (public.can_view_invoices(invoices.job_id));

create policy "insert company invoices" on invoices
  for insert with check (public.can_edit_invoices(invoices.job_id));

create policy "update company invoices" on invoices
  for update using (public.can_edit_invoices(invoices.job_id))
  with check (public.can_edit_invoices(invoices.job_id));

create policy "delete company invoices" on invoices
  for delete using (public.can_edit_invoices(invoices.job_id));

drop policy "manage own company invoice line items" on invoice_line_items;

create policy "select company invoice line items" on invoice_line_items
  for select using (public.can_view_invoices((select job_id from invoices where id = invoice_line_items.invoice_id)));

create policy "insert company invoice line items" on invoice_line_items
  for insert with check (public.can_edit_invoices((select job_id from invoices where id = invoice_line_items.invoice_id)));

create policy "update company invoice line items" on invoice_line_items
  for update using (public.can_edit_invoices((select job_id from invoices where id = invoice_line_items.invoice_id)))
  with check (public.can_edit_invoices((select job_id from invoices where id = invoice_line_items.invoice_id)));

create policy "delete company invoice line items" on invoice_line_items
  for delete using (public.can_edit_invoices((select job_id from invoices where id = invoice_line_items.invoice_id)));

-- job_audit_log's select/insert policies (0019/0020) already reference
-- can_access_job(...) by name -- redefining that function above is enough,
-- no need to touch these policies.

drop policy "manage own company expenses" on expenses;

create policy "select company expenses" on expenses
  for select using (
    company_id = public.current_company_id()
    and (public.current_user_role() = 'company' or (job_id is not null and public.can_access_job(job_id)))
  );

create policy "insert company expenses" on expenses
  for insert with check (company_id = public.current_company_id() and public.can_manage_job_expense(job_id));

create policy "update company expenses" on expenses
  for update using (company_id = public.current_company_id() and public.can_manage_job_expense(job_id))
  with check (company_id = public.current_company_id() and public.can_manage_job_expense(job_id));

create policy "delete company expenses" on expenses
  for delete using (company_id = public.current_company_id() and public.can_manage_job_expense(job_id));

-- ------------------------------------------------------------
-- Team/invite management: owner/admin -> company only
-- ------------------------------------------------------------

drop policy "owner/admin manage own company invites" on company_invites;
create policy "company manages own company invites" on company_invites
  for all using (company_id = public.current_company_id() and public.current_user_role() = 'company')
  with check (company_id = public.current_company_id() and public.current_user_role() = 'company');

drop policy "owner/admin manage teammates" on profiles;
create policy "company manages teammates" on profiles
  for all using (
    company_id = public.current_company_id()
    and role <> 'company'
    and public.current_user_role() = 'company'
  )
  with check (
    company_id = public.current_company_id()
    and role <> 'company'
    and public.current_user_role() = 'company'
  );
