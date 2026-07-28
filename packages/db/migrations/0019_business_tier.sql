-- ============================================================
-- BusinessOps Business tier: multi-user companies, roles, job assignment
-- ============================================================

-- profiles.email -- needed so the Settings "Team" page can list teammates'
-- emails (existing app code only ever reads the *current* user's email via
-- supabase.auth.getUser(), which can't see other members' emails; profiles
-- has no email column today).
alter table profiles add column email text;

update profiles set email = u.email from auth.users u where u.id = profiles.id;

alter table profiles alter column email set not null;

-- Existing RLS only ever let a user see their own profile row (id =
-- auth.uid()), which blocks the whole point of a "Team" list. Adds
-- company-wide visibility (permissive policies OR together, so this only
-- ever widens access, never narrows what "view own profile" already
-- allowed), plus owner/admin management of non-owner teammates' rows
-- (role changes, removal). The owner row is excluded from the management
-- policy entirely -- no one but the owner themselves (via the existing
-- "update own profile" policy, which only lets them touch their own row)
-- can ever act on it.
create policy "view own company profiles" on profiles
  for select using (company_id = public.current_company_id());

create policy "owner/admin manage teammates" on profiles
  for all using (
    company_id = public.current_company_id()
    and role <> 'owner'
    and exists (select 1 from profiles admin_check where admin_check.id = auth.uid() and admin_check.role in ('owner', 'admin'))
  )
  with check (
    company_id = public.current_company_id()
    and role <> 'owner'
    and exists (select 1 from profiles admin_check where admin_check.id = auth.uid() and admin_check.role in ('owner', 'admin'))
  );

-- ============================================================
-- Invites
-- ============================================================

create table company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  token uuid not null default gen_random_uuid(),
  invited_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

create unique index company_invites_token_idx on company_invites (token);

alter table company_invites enable row level security;

create policy "owner/admin manage own company invites" on company_invites
  for all using (
    company_id = public.current_company_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner', 'admin'))
  )
  with check (
    company_id = public.current_company_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner', 'admin'))
  );

-- Public token lookup for the unauthenticated accept-invite page -- same
-- pattern as get_quote_by_token/get_calendar_feed_data: RLS on the
-- underlying table stays locked down, anon only ever gets EXECUTE here.
create function public.get_invite_by_token(p_token uuid)
returns table (email text, role text, company_name text, expires_at timestamptz, accepted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select ci.email, ci.role, c.name, ci.expires_at, ci.accepted_at
  from company_invites ci
  join companies c on c.id = ci.company_id
  where ci.token = p_token;
$$;

grant execute on function public.get_invite_by_token(uuid) to anon, authenticated;

-- ============================================================
-- Signup trigger: honor a pending invite instead of always making a new company
-- ============================================================

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
    insert into profiles (id, company_id, full_name, role, email)
      values (new.id, matched_invite.company_id, new.raw_user_meta_data ->> 'full_name', matched_invite.role, new.email);

    update company_invites set accepted_at = now() where id = matched_invite.id;
  else
    insert into companies (name) values (coalesce(new.raw_user_meta_data ->> 'company_name', 'My Company'))
      returning id into new_company_id;

    insert into profiles (id, company_id, full_name, role, email)
      values (new.id, new_company_id, new.raw_user_meta_data ->> 'full_name', 'owner', new.email);
  end if;

  return new;
end;
$$;

-- ============================================================
-- Job-level access: owner/admin see everything, staff see only assigned jobs
-- ============================================================

create function public.can_access_job(p_job_id uuid)
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
      and (p.role in ('owner', 'admin') or j.assigned_user_id = auth.uid())
  );
$$;

drop policy "manage own company jobs" on jobs;
create policy "manage own company jobs" on jobs
  for all using (
    company_id = public.current_company_id()
    and (
      exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner', 'admin'))
      or assigned_user_id = auth.uid()
    )
  )
  with check (company_id = public.current_company_id());

drop policy "manage own company job files" on job_files;
create policy "manage own company job files" on job_files
  for all using (public.can_access_job(job_files.job_id))
  with check (public.can_access_job(job_files.job_id));

drop policy "manage own company cost entries" on cost_entries;
create policy "manage own company cost entries" on cost_entries
  for all using (public.can_access_job(cost_entries.job_id))
  with check (public.can_access_job(cost_entries.job_id));

drop policy "manage own company quotes" on quotes;
create policy "manage own company quotes" on quotes
  for all using (public.can_access_job(quotes.job_id))
  with check (public.can_access_job(quotes.job_id));

drop policy "manage own company quote line items" on quote_line_items;
create policy "manage own company quote line items" on quote_line_items
  for all using (public.can_access_job((select job_id from quotes where id = quote_line_items.quote_id)))
  with check (public.can_access_job((select job_id from quotes where id = quote_line_items.quote_id)));

drop policy "manage own company invoices" on invoices;
create policy "manage own company invoices" on invoices
  for all using (public.can_access_job(invoices.job_id))
  with check (public.can_access_job(invoices.job_id));

drop policy "manage own company invoice line items" on invoice_line_items;
create policy "manage own company invoice line items" on invoice_line_items
  for all using (public.can_access_job((select job_id from invoices where id = invoice_line_items.invoice_id)))
  with check (public.can_access_job((select job_id from invoices where id = invoice_line_items.invoice_id)));

drop policy "select own company job audit log" on job_audit_log;
create policy "select own company job audit log" on job_audit_log
  for select using (public.can_access_job(job_audit_log.job_id));

drop policy "insert own company job audit log" on job_audit_log;
create policy "insert own company job audit log" on job_audit_log
  for insert with check (public.can_access_job(job_audit_log.job_id));

-- expenses aren't always job-linked (can be uploaded, then assigned to a job
-- later), so they get their own variant rather than reusing can_access_job:
-- owner/admin see everything as before; staff only see expenses tied to a
-- job they're assigned to (needed so the job-detail-page "Add cost from
-- receipt" flow still works for staff on their own jobs). Unassigned
-- expenses (job_id null, from the standalone /expenses review queue) stay
-- owner/admin-only, matching that page being gated to owner/admin in the UI.
drop policy "manage own company expenses" on expenses;
create policy "manage own company expenses" on expenses
  for all using (
    company_id = public.current_company_id()
    and (
      exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner', 'admin'))
      or (job_id is not null and public.can_access_job(job_id))
    )
  )
  with check (
    company_id = public.current_company_id()
    and (
      exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner', 'admin'))
      or (job_id is not null and public.can_access_job(job_id))
    )
  );
