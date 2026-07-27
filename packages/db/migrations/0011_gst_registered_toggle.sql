-- Some companies using the app aren't tax-registered. When off: quotes/
-- invoices skip the tax breakdown entirely (handled at the app layer) and
-- new documents get tax_rate = 0 regardless of default_tax_rate.

alter table companies add column gst_registered boolean not null default true;

create or replace function public.set_quote_default_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company companies;
begin
  if new.tax_rate is null then
    select c.* into v_company
    from companies c
    join jobs j on j.company_id = c.id
    where j.id = new.job_id;

    if v_company.gst_registered then
      new.tax_rate := v_company.default_tax_rate;
    else
      new.tax_rate := 0;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.set_invoice_default_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company companies;
begin
  if new.tax_rate is null then
    select c.* into v_company
    from companies c
    join jobs j on j.company_id = c.id
    where j.id = new.job_id;

    if v_company.gst_registered then
      new.tax_rate := v_company.default_tax_rate;
    else
      new.tax_rate := 0;
    end if;
  end if;
  return new;
end;
$$;

-- get_quote_by_token (0003/0006/0009): add gst_registered to the company
-- payload so the public quote page can hide the tax breakdown to match.
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
      'tax_label', comp.tax_label,
      'gst_registered', comp.gst_registered
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
