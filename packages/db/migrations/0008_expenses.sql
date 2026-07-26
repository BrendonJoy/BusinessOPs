-- Expenses: receipts/invoices uploaded by the owner, optionally AI-parsed,
-- then assigned to a job to become a real cost entry feeding that job's
-- costs and P&L. company_id lives directly on this table (unlike job_files/
-- cost_entries, which derive company via a join to jobs) because an expense
-- can exist with job_id still null -- uploaded first, assigned later.

create table expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  cost_entry_id uuid unique references cost_entries(id) on delete set null,
  file_path text not null,
  file_type text,
  description text not null default '',
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table expenses enable row level security;

create policy "manage own company expenses" on expenses
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Private bucket, like job-files -- these are financial records, not
-- something to expose via public URL.
insert into storage.buckets (id, name, public) values ('expense-receipts', 'expense-receipts', false)
  on conflict (id) do nothing;

create policy "authenticated users manage expense receipts in storage"
  on storage.objects for all
  using (bucket_id = 'expense-receipts' and auth.role() = 'authenticated')
  with check (bucket_id = 'expense-receipts' and auth.role() = 'authenticated');
