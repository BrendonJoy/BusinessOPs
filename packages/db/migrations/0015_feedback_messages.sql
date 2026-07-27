-- Founder feedback/support channel (feature-backlog item 13's other half).
-- Company users can send development ideas, complaints, or issues through to
-- the app owner. Platform-admin access is a small membership table rather
-- than a hardcoded user id, so growing this into a "DevTeam" concept later
-- (once the Business tier's proper roles system exists) is just inserting
-- more rows -- no schema or policy changes needed.

create table platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table feedback_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  user_id uuid references profiles (id) on delete set null,
  category text not null check (category in ('idea', 'support')),
  message text not null,
  ai_summary text,
  status text not null default 'new' check (status in ('new', 'read', 'resolved')),
  created_at timestamptz not null default now()
);

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

alter table platform_admins enable row level security;
alter table feedback_messages enable row level security;

-- No policies on platform_admins for regular users -- membership is only
-- readable/writable via security definer functions (or the postgres role
-- directly in the SQL editor), never exposed to the app's anon/authenticated
-- roles.

create policy "insert own company feedback" on feedback_messages
  for insert with check (company_id = public.current_company_id());

create policy "select own company feedback" on feedback_messages
  for select using (company_id = public.current_company_id());

create policy "platform admin full access to feedback" on feedback_messages
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Platform admins also need to read across companies/profiles so the admin
-- inbox can show which company and which person sent each message.
create policy "platform admin reads all companies" on companies
  for select using (public.is_platform_admin());

create policy "platform admin reads all profiles" on profiles
  for select using (public.is_platform_admin());
