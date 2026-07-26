-- Quote/invoice versioning: editing a sent/accepted/paid document creates a new
-- draft copy and supersedes the old one, so a customer can never accept a stale
-- link. Editing a still-draft document is just an in-place edit (handled at the
-- app layer, not here -- nothing needs to happen in the database for that case).

alter table quotes add column superseded_at timestamptz;
alter table quotes add column replaces_quote_id uuid references quotes(id) on delete set null;

alter table invoices add column superseded_at timestamptz;
alter table invoices add column replaces_invoice_id uuid references invoices(id) on delete set null;
alter table invoices add column quote_id uuid references quotes(id) on delete set null;

-- Copies a quote + its line items into a fresh draft, supersedes the original,
-- and cascades to superseded any still-draft deposit invoice that was
-- auto-generated from it (nothing has gone to the customer for that invoice
-- yet, so its now-outdated numbers shouldn't linger as an actionable draft).
-- An invoice already sent/paid/overdue is left untouched -- that's a real
-- financial record already communicated or settled.
create function public.create_quote_version(p_quote_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_old quotes;
  v_new_id uuid;
begin
  select * into v_old from quotes where id = p_quote_id;
  if v_old.id is null then
    raise exception 'quote not found';
  end if;

  insert into quotes (job_id, status, total, deposit_percent, replaces_quote_id)
    values (v_old.job_id, 'draft', 0, v_old.deposit_percent, v_old.id)
    returning id into v_new_id;

  insert into quote_line_items (quote_id, description, quantity, unit_price)
    select v_new_id, description, quantity, unit_price
    from quote_line_items
    where quote_id = v_old.id;

  update quotes set superseded_at = now() where id = v_old.id;

  update invoices
    set superseded_at = now()
    where quote_id = v_old.id and status = 'draft' and superseded_at is null;

  return v_new_id;
end;
$$;

grant execute on function public.create_quote_version(uuid) to authenticated;

-- Same idea for invoices: copy + supersede. Line items keep their
-- cost_entry_id link (if any) so the job cost stays associated with whichever
-- invoice version is current; removing a line item from the new version still
-- releases the cost entry via remove_invoice_line_item as before.
create function public.create_invoice_version(p_invoice_id uuid)
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

  insert into invoices (job_id, status, total, quote_id, replaces_invoice_id)
    values (v_old.job_id, 'draft', 0, v_old.quote_id, v_old.id)
    returning id into v_new_id;

  insert into invoice_line_items (invoice_id, description, quantity, unit_price, source, cost_entry_id)
    select v_new_id, description, quantity, unit_price, source, cost_entry_id
    from invoice_line_items
    where invoice_id = v_old.id;

  update invoices set superseded_at = now() where id = v_old.id;

  return v_new_id;
end;
$$;

grant execute on function public.create_invoice_version(uuid) to authenticated;

-- respond_to_quote: same signature as 0003_quotes.sql, in-place upgrade.
-- Adds the superseded_at guard and links the auto-generated deposit invoice
-- back to the quote that spawned it.
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
    v_deposit_amount := round(updated.total * updated.deposit_percent / 100, 2);

    insert into invoices (job_id, status, quote_id)
      values (updated.job_id, 'draft', updated.id)
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

-- Note: get_quote_by_token (0003_quotes.sql) needs no change -- it builds its
-- response with to_jsonb(q), which picks up superseded_at automatically now
-- that the column exists.
