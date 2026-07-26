-- Multi-currency + multi-tax (GST/VAT) support. Currency is a company-level
-- setting (not snapshotted per-document -- see feature-backlog memory for the
-- reasoning). Tax rate is locked in on each quote/invoice at creation time
-- (copied from the company default) and editable per-document afterward.

alter table companies add column currency text not null default 'USD';
alter table companies add column tax_label text not null default 'Tax';
alter table companies add column default_tax_rate numeric not null default 0
  check (default_tax_rate >= 0 and default_tax_rate <= 100);

-- tax_rate is added with a temporary default of 0 purely so the ALTER
-- succeeds against existing rows (NOT NULL requires every existing row to
-- get a value); the default is dropped immediately after, so from this
-- point on, inserts that omit tax_rate land as NULL, which the before-insert
-- triggers below fill from the company default. Callers that need a specific
-- value (version copies, the zero-tax deposit invoice) provide it explicitly
-- and bypass that fallback.
alter table quotes add column tax_rate numeric not null default 0 check (tax_rate >= 0 and tax_rate <= 100);
alter table quotes alter column tax_rate drop default;
alter table quotes add column tax_amount numeric not null default 0;

alter table invoices add column tax_rate numeric not null default 0 check (tax_rate >= 0 and tax_rate <= 100);
alter table invoices alter column tax_rate drop default;
alter table invoices add column tax_amount numeric not null default 0;

create function public.set_quote_default_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tax_rate is null then
    select default_tax_rate into new.tax_rate
    from companies
    where id = (select company_id from jobs where id = new.job_id);
  end if;
  return new;
end;
$$;

create trigger quotes_set_default_tax_rate
  before insert on quotes
  for each row execute function public.set_quote_default_tax_rate();

create function public.set_invoice_default_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tax_rate is null then
    select default_tax_rate into new.tax_rate
    from companies
    where id = (select company_id from jobs where id = new.job_id);
  end if;
  return new;
end;
$$;

create trigger invoices_set_default_tax_rate
  before insert on invoices
  for each row execute function public.set_invoice_default_tax_rate();

-- Extend the existing total-sync triggers (0003/0004) to also compute
-- tax_amount from the row's own tax_rate whenever line items change.
create or replace function public.update_quote_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_quote_id uuid;
  v_subtotal numeric;
begin
  affected_quote_id := coalesce(new.quote_id, old.quote_id);
  select coalesce(sum(line_total), 0) into v_subtotal from quote_line_items where quote_id = affected_quote_id;

  update quotes
    set total = v_subtotal,
        tax_amount = round(v_subtotal * tax_rate / 100, 2)
    where id = affected_quote_id;

  return null;
end;
$$;

create or replace function public.update_invoice_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_invoice_id uuid;
  v_subtotal numeric;
begin
  affected_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  select coalesce(sum(line_total), 0) into v_subtotal from invoice_line_items where invoice_id = affected_invoice_id;

  update invoices
    set total = v_subtotal,
        tax_amount = round(v_subtotal * tax_rate / 100, 2)
    where id = affected_invoice_id;

  return null;
end;
$$;

-- Editing the tax rate directly (not via line-item changes) needs its own
-- recompute, since the triggers above only fire on quote_line_items/
-- invoice_line_items changes.
create function public.recompute_quote_tax()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tax_rate is distinct from old.tax_rate then
    new.tax_amount := round(new.total * new.tax_rate / 100, 2);
  end if;
  return new;
end;
$$;

create trigger quotes_recompute_tax
  before update on quotes
  for each row execute function public.recompute_quote_tax();

create function public.recompute_invoice_tax()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tax_rate is distinct from old.tax_rate then
    new.tax_amount := round(new.total * new.tax_rate / 100, 2);
  end if;
  return new;
end;
$$;

create trigger invoices_recompute_tax
  before update on invoices
  for each row execute function public.recompute_invoice_tax();

-- create_quote_version/create_invoice_version (0007): carry the real
-- tax_rate forward into the copy instead of falling back to whatever the
-- company's current default is.
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

  insert into invoice_line_items (invoice_id, description, quantity, unit_price, source, cost_entry_id)
    select v_new_id, description, quantity, unit_price, source, cost_entry_id
    from invoice_line_items
    where invoice_id = v_old.id;

  update invoices set superseded_at = now() where id = v_old.id;

  return v_new_id;
end;
$$;

-- respond_to_quote (0004/0007): deposit is a percentage of the tax-inclusive
-- total (what the customer actually owes), and the deposit invoice's one
-- line item is already that tax-inclusive figure -- giving it its own
-- tax_rate would double-tax it, so it's explicitly zeroed.
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

-- get_quote_by_token (0003/0006): add currency to the company payload. The
-- quote jsonb already picks up tax_rate/tax_amount for free via to_jsonb(q).
create or replace function public.get_quote_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'quote', to_jsonb(q) - 'share_token',
    'line_items', coalesce(
      (select jsonb_agg(to_jsonb(qli) order by qli.created_at) from quote_line_items qli where qli.quote_id = q.id),
      '[]'::jsonb
    ),
    'job', jsonb_build_object('job_number', j.job_number, 'address_line', j.address_line),
    'customer', jsonb_build_object('name', c.name),
    'company', jsonb_build_object(
      'name', comp.name,
      'logo_url', comp.logo_url,
      'gst_number', comp.gst_number,
      'address', comp.address,
      'currency', comp.currency,
      'tax_label', comp.tax_label
    )
  )
  into result
  from quotes q
  join jobs j on j.id = q.job_id
  join companies comp on comp.id = j.company_id
  left join customers c on c.id = j.customer_id
  where q.share_token = p_token;

  return result;
end;
$$;
