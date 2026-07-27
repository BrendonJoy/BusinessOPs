-- Per-job audit trail: timestamp, which user, what they did. Append-only --
-- no update/delete policy, even for the company owner.

create table job_audit_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);

alter table job_audit_log enable row level security;

create policy "select own company job audit log" on job_audit_log
  for select using (exists (select 1 from jobs j where j.id = job_audit_log.job_id and j.company_id = public.current_company_id()));

create policy "insert own company job audit log" on job_audit_log
  for insert with check (exists (select 1 from jobs j where j.id = job_audit_log.job_id and j.company_id = public.current_company_id()));

-- respond_to_quote (0003/0004/0007/0009): log the customer's accept/decline,
-- an anon-triggered event with no authenticated app user behind it.
create or replace function public.respond_to_quote(p_token text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated quotes;
  v_job_number text;
  v_invoice_id uuid;
  v_deposit_amount numeric;
begin
  if p_status not in ('accepted', 'declined') then
    return jsonb_build_object('error', 'invalid_status');
  end if;

  update quotes
    set status = p_status::quote_status, responded_at = now()
    where share_token = p_token and status = 'sent' and superseded_at is null
    returning * into updated;

  if updated.id is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  insert into job_audit_log (job_id, user_id, action)
    values (updated.job_id, null, 'Quote ' || p_status || ' by customer');

  if p_status = 'accepted' and updated.deposit_percent > 0 then
    select job_number into v_job_number from jobs where id = updated.job_id;
    v_deposit_amount := round((updated.total + updated.tax_amount) * updated.deposit_percent / 100, 2);

    insert into invoices (job_id, status, quote_id, tax_rate)
      values (updated.job_id, 'draft', updated.id, 0)
      returning id into v_invoice_id;

    insert into invoice_line_items (invoice_id, description, quantity, unit_price, source)
      values (
        v_invoice_id,
        format('Deposit (%s%%) for quote on %s', updated.deposit_percent, coalesce(v_job_number, 'job')),
        1,
        v_deposit_amount,
        'deposit'
      );
  end if;

  return jsonb_build_object('quote', to_jsonb(updated) - 'share_token');
end;
$$;
