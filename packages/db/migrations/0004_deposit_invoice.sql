-- Auto-generate a deposit invoice when a quote is accepted, for whatever
-- percentage the owner set on that quote.

alter table quotes
  add column deposit_percent numeric not null default 0
  check (deposit_percent >= 0 and deposit_percent <= 100);

alter table invoice_line_items drop constraint invoice_line_items_source_check;
alter table invoice_line_items
  add constraint invoice_line_items_source_check
  check (source in ('material', 'labour', 'manual', 'deposit'));

-- Mirrors update_quote_total() from 0003_quotes.sql, keeping invoices.total in
-- sync with its line items.
create function public.update_invoice_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_invoice_id uuid;
begin
  affected_invoice_id := coalesce(new.invoice_id, old.invoice_id);

  update invoices
    set total = coalesce((select sum(line_total) from invoice_line_items where invoice_id = affected_invoice_id), 0)
    where id = affected_invoice_id;

  return null;
end;
$$;

create trigger invoice_line_items_update_total
  after insert or update or delete on invoice_line_items
  for each row execute function public.update_invoice_total();

-- Same signature as the version in 0003_quotes.sql, so this is an in-place
-- upgrade: on acceptance, if the quote has a deposit_percent set, create a
-- draft invoice for that percentage of the quote total.
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
    where share_token = p_token and status = 'sent'
    returning * into updated;

  if updated.id is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  if p_status = 'accepted' and updated.deposit_percent > 0 then
    select job_number into v_job_number from jobs where id = updated.job_id;
    v_deposit_amount := round(updated.total * updated.deposit_percent / 100, 2);

    insert into invoices (job_id, status)
      values (updated.job_id, 'draft')
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
