-- Trade Assist — initial schema
-- Run this once in the Supabase project's SQL editor (Dashboard > SQL Editor > New query).
-- Every table carries company_id so a "Business" (multi-user) tier can be added later
-- by adding more profiles to a company — no schema change needed.

create extension if not exists pgcrypto;

-- ============================================================
-- Core tables
-- ============================================================

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  job_seq integer not null default 0,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  full_name text,
  role text not null default 'owner' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create type job_status as enum ('quoted', 'scheduled', 'in_progress', 'completed', 'invoiced');

create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  job_number text,
  customer_id uuid references customers (id) on delete set null,
  assigned_user_id uuid references profiles (id) on delete set null,
  status job_status not null default 'quoted',
  address_line text,
  geo_lat double precision,
  geo_lng double precision,
  notes text,
  start_date date,
  finish_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  file_url text not null,
  file_type text,
  uploaded_at timestamptz not null default now()
);

create type cost_entry_type as enum ('material', 'labour');

create table cost_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  type cost_entry_type not null,
  description text not null,
  quantity numeric not null default 1,
  unit_cost numeric not null default 0,
  total_cost numeric generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now()
);

-- Quoting and invoicing tables are created now (so the schema is stable) but the
-- customer-facing quote link and invoice PDF/email flows are built in a later milestone.

create type quote_status as enum ('draft', 'sent', 'accepted', 'declined');

create table quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  status quote_status not null default 'draft',
  share_token text unique default encode(gen_random_bytes(16), 'hex'),
  total numeric not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  responded_at timestamptz
);

create table quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  line_total numeric generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue');

create table invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  status invoice_status not null default 'draft',
  total numeric not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  line_total numeric generated always as (quantity * unit_price) stored,
  source text not null default 'manual' check (source in ('material', 'labour', 'manual')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Signup trigger: every new auth user gets their own company + profile
-- ============================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  insert into companies (name) values (coalesce(new.raw_user_meta_data ->> 'company_name', 'My Company'))
    returning id into new_company_id;

  insert into profiles (id, company_id, full_name, role)
    values (new.id, new_company_id, new.raw_user_meta_data ->> 'full_name', 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Job numbering: sequential per company, e.g. JOB-0001
-- ============================================================

create function public.set_job_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq integer;
begin
  if new.job_number is null then
    update companies set job_seq = job_seq + 1 where id = new.company_id
      returning job_seq into next_seq;
    new.job_number := 'JOB-' || lpad(next_seq::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger jobs_set_job_number
  before insert on jobs
  for each row execute function public.set_job_number();

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security — every row is scoped to the caller's company
-- ============================================================

create function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from profiles where id = auth.uid();
$$;

alter table companies enable row level security;
alter table profiles enable row level security;
alter table customers enable row level security;
alter table jobs enable row level security;
alter table job_files enable row level security;
alter table cost_entries enable row level security;
alter table quotes enable row level security;
alter table quote_line_items enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;

create policy "view own company" on companies
  for select using (id = public.current_company_id());

create policy "view own profile" on profiles
  for select using (id = auth.uid());
create policy "update own profile" on profiles
  for update using (id = auth.uid());

create policy "manage own company customers" on customers
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "manage own company jobs" on jobs
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "manage own company job files" on job_files
  for all using (exists (select 1 from jobs j where j.id = job_files.job_id and j.company_id = public.current_company_id()))
  with check (exists (select 1 from jobs j where j.id = job_files.job_id and j.company_id = public.current_company_id()));

create policy "manage own company cost entries" on cost_entries
  for all using (exists (select 1 from jobs j where j.id = cost_entries.job_id and j.company_id = public.current_company_id()))
  with check (exists (select 1 from jobs j where j.id = cost_entries.job_id and j.company_id = public.current_company_id()));

create policy "manage own company quotes" on quotes
  for all using (exists (select 1 from jobs j where j.id = quotes.job_id and j.company_id = public.current_company_id()))
  with check (exists (select 1 from jobs j where j.id = quotes.job_id and j.company_id = public.current_company_id()));

create policy "manage own company quote line items" on quote_line_items
  for all using (exists (select 1 from quotes q join jobs j on j.id = q.job_id where q.id = quote_line_items.quote_id and j.company_id = public.current_company_id()))
  with check (exists (select 1 from quotes q join jobs j on j.id = q.job_id where q.id = quote_line_items.quote_id and j.company_id = public.current_company_id()));

create policy "manage own company invoices" on invoices
  for all using (exists (select 1 from jobs j where j.id = invoices.job_id and j.company_id = public.current_company_id()))
  with check (exists (select 1 from jobs j where j.id = invoices.job_id and j.company_id = public.current_company_id()));

create policy "manage own company invoice line items" on invoice_line_items
  for all using (exists (select 1 from invoices i join jobs j on j.id = i.job_id where i.id = invoice_line_items.invoice_id and j.company_id = public.current_company_id()))
  with check (exists (select 1 from invoices i join jobs j on j.id = i.job_id where i.id = invoice_line_items.invoice_id and j.company_id = public.current_company_id()));

-- ============================================================
-- Storage bucket for job photos/files
-- ============================================================

insert into storage.buckets (id, name, public) values ('job-files', 'job-files', false)
  on conflict (id) do nothing;

create policy "authenticated users manage job files in storage"
  on storage.objects for all
  using (bucket_id = 'job-files' and auth.role() = 'authenticated')
  with check (bucket_id = 'job-files' and auth.role() = 'authenticated');
