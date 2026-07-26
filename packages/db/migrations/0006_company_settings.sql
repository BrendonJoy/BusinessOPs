-- Company profile settings: name/GST number/address/logo, so this information
-- can appear on invoice PDFs and the public quote page instead of generic
-- "Trade Assist" placeholder text.

alter table companies add column gst_number text;
alter table companies add column address text;
alter table companies add column logo_url text;

-- companies previously only had a select policy; owners need to be able to
-- update their own company row to use this feature.
create policy "update own company" on companies
  for update using (id = public.current_company_id())
  with check (id = public.current_company_id());

-- Public bucket (unlike job-files) so the logo renders directly in PDFs and
-- on the public quote page without needing signed URLs.
insert into storage.buckets (id, name, public) values ('company-logos', 'company-logos', true)
  on conflict (id) do nothing;

create policy "authenticated users manage company logos in storage"
  on storage.objects for all
  using (bucket_id = 'company-logos' and auth.role() = 'authenticated')
  with check (bucket_id = 'company-logos' and auth.role() = 'authenticated');

-- Add company branding to the public quote payload.
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
      'address', comp.address
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
