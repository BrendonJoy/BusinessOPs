-- ============================================================
-- Invoice types: the auto-created deposit invoice is typed 'deposit',
-- and the next invoice on a job with a deposit becomes a 'final'
-- (balance) invoice that deducts the deposit via a credit line item.
-- ============================================================

alter table invoices
  add column invoice_type text not null default 'standard'
  check (invoice_type in ('standard', 'deposit', 'final'));

-- Existing auto-created deposit invoices are identifiable by their
-- source='deposit' line item.
update invoices set invoice_type = 'deposit'
  where id in (select invoice_id from invoice_line_items where source = 'deposit');

-- The final invoice's deposit deduction gets its own source value.
alter table invoice_line_items drop constraint invoice_line_items_source_check;
alter table invoice_line_items
  add constraint invoice_line_items_source_check
  check (source in ('material', 'labour', 'manual', 'deposit', 'deposit_credit'));

-- respond_to_quote (0009): the auto-created deposit invoice now carries
-- invoice_type='deposit'. Otherwise unchanged.
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

  if p_status = 'accepted' and updated.deposit_percent > 0 then
    select job_number into v_job_number from jobs where id = updated.job_id;
    v_deposit_amount := round((updated.total + updated.tax_amount) * updated.deposit_percent / 100, 2);

    insert into invoices (job_id, status, quote_id, tax_rate, invoice_type)
      values (updated.job_id, 'draft', updated.id, 0, 'deposit')
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

-- create_invoice_version (0018): carry invoice_type into the new version
-- (the deposit-credit line item copies with the other line items).
create or replace function public.create_invoice_version(p_invoice_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_old invoices;
  v_new_id uuid;
begin
  select * into v_old from invoices where id = p_invoice_id;
  if v_old.id is null then
    raise exception 'invoice not found';
  end if;

  insert into invoices (job_id, status, total, quote_id, tax_rate, replaces_invoice_id, invoice_type)
    values (v_old.job_id, 'draft', 0, v_old.quote_id, v_old.tax_rate, v_old.id, v_old.invoice_type)
    returning id into v_new_id;

  insert into invoice_line_items (invoice_id, description, quantity, unit_price, source, item_type, cost_entry_id)
    select v_new_id, description, quantity, unit_price, source, item_type, cost_entry_id
    from invoice_line_items
    where invoice_id = v_old.id;

  update invoices set superseded_at = now() where id = v_old.id;

  return v_new_id;
end;
$$;
