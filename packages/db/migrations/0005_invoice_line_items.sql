-- Manual invoice creation: pull job costs into an invoice, or add arbitrary
-- manual line items. These helper functions run as the calling (authenticated)
-- role, not security definer -- they rely on the existing RLS policies on
-- cost_entries/invoices/invoice_line_items for company scoping, same as any
-- other owner-side action. They only exist to make each two-step operation
-- atomic (insert + stamp / delete + release).

alter table cost_entries add column invoiced_at timestamptz;

alter table invoice_line_items
  add column cost_entry_id uuid references cost_entries(id) on delete set null;

create function public.import_cost_entry_to_invoice(p_cost_entry_id uuid, p_invoice_id uuid)
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

  insert into invoice_line_items (invoice_id, description, quantity, unit_price, source, cost_entry_id)
    values (
      p_invoice_id,
      v_cost_entry.description,
      v_cost_entry.quantity,
      v_cost_entry.unit_cost,
      v_cost_entry.type::text,
      p_cost_entry_id
    );

  update cost_entries set invoiced_at = now() where id = p_cost_entry_id;
end;
$$;

grant execute on function public.import_cost_entry_to_invoice(uuid, uuid) to authenticated;

create function public.remove_invoice_line_item(p_line_item_id uuid)
returns void
language plpgsql
as $$
declare
  v_cost_entry_id uuid;
begin
  select cost_entry_id into v_cost_entry_id from invoice_line_items where id = p_line_item_id;

  delete from invoice_line_items where id = p_line_item_id;

  if v_cost_entry_id is not null then
    update cost_entries set invoiced_at = null where id = v_cost_entry_id;
  end if;
end;
$$;

grant execute on function public.remove_invoice_line_item(uuid) to authenticated;
