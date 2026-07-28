-- User-facing "type" for quote/invoice line items (Labour / Materials /
-- Callout fee / Other), so the entry UI can adapt its fields per type
-- (Hours x Rate for labour, Qty x Unit price for materials, a single
-- Amount for a callout fee) and the documents sent out can group items by
-- category. Separate column from invoice_line_items.source (which tracks
-- provenance -- cost-entry-import vs manual vs auto-generated deposit --
-- not the user-facing category), to avoid disturbing existing logic that
-- depends on source's values.

alter table quote_line_items add column item_type text not null default 'other'
  check (item_type in ('labour', 'material', 'callout', 'other'));

alter table invoice_line_items add column item_type text not null default 'other'
  check (item_type in ('labour', 'material', 'callout', 'other'));

-- Backfill existing invoice line items so cost-entry-imported items are
-- correctly bucketed immediately, without the user having to redo anything.
update invoice_line_items set item_type = 'material' where source = 'material';
update invoice_line_items set item_type = 'labour' where source = 'labour';

-- import_cost_entry_to_invoice (0005): tag the new line item's item_type
-- from the cost entry's own type, same as source, so future imports are
-- correctly bucketed too (not just this one-time backfill).
create or replace function public.import_cost_entry_to_invoice(p_cost_entry_id uuid, p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_cost_entry cost_entries;
  v_invoice invoices;
begin
  select * into v_cost_entry from cost_entries where id = p_cost_entry_id;
  if v_cost_entry.id is null then
    raise exception 'cost entry not found';
  end if;
  if v_cost_entry.invoiced_at is not null then
    raise exception 'cost entry already invoiced';
  end if;

  select * into v_invoice from invoices where id = p_invoice_id;
  if v_invoice.id is null then
    raise exception 'invoice not found';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'invoice is not editable';
  end if;

  insert into invoice_line_items (invoice_id, description, quantity, unit_price, source, item_type, cost_entry_id)
    values (
      p_invoice_id,
      v_cost_entry.description,
      v_cost_entry.quantity,
      v_cost_entry.unit_cost,
      v_cost_entry.type::text,
      v_cost_entry.type::text,
      p_cost_entry_id
    );

  update cost_entries set invoiced_at = now() where id = p_cost_entry_id;
end;
$$;

-- create_quote_version / create_invoice_version (0009): carry item_type
-- forward when copying line items to the new draft version.
create or replace function public.create_quote_version(p_quote_id uuid)
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

  insert into quotes (job_id, status, total, deposit_percent, tax_rate, replaces_quote_id)
    values (v_old.job_id, 'draft', 0, v_old.deposit_percent, v_old.tax_rate, v_old.id)
    returning id into v_new_id;

  insert into quote_line_items (quote_id, description, quantity, unit_price, item_type)
    select v_new_id, description, quantity, unit_price, item_type
    from quote_line_items
    where quote_id = v_old.id;

  update quotes set superseded_at = now() where id = v_old.id;

  update invoices
    set superseded_at = now()
    where quote_id = v_old.id and status = 'draft' and superseded_at is null;

  return v_new_id;
end;
$$;

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

  insert into invoices (job_id, status, total, quote_id, tax_rate, replaces_invoice_id)
    values (v_old.job_id, 'draft', 0, v_old.quote_id, v_old.tax_rate, v_old.id)
    returning id into v_new_id;

  insert into invoice_line_items (invoice_id, description, quantity, unit_price, source, item_type, cost_entry_id)
    select v_new_id, description, quantity, unit_price, source, item_type, cost_entry_id
    from invoice_line_items
    where invoice_id = v_old.id;

  update invoices set superseded_at = now() where id = v_old.id;

  return v_new_id;
end;
$$;
