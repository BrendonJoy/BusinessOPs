-- What a company has actually bought.
--
-- Products are entitlements on the company record, never separate apps or
-- separate logins. One row per product held: a tier upgrade updates a row, a
-- second product inserts one. A single `plan` column on companies would have
-- collapsed the moment anyone held two.
--
-- This is the seam billing plugs into. A Stripe webhook writes here and nothing
-- else in the application needs to know Stripe exists.

create table company_products (
  company_id uuid not null references companies(id) on delete cascade,
  product text not null check (product in ('businessops', 'staffops')),
  plan text not null default 'standard',
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, product)
);

alter table company_products enable row level security;

-- Readable by everyone in the company, so the app can hide what they have not
-- bought and say why.
create policy "view own company products" on company_products
  for select using (company_id = public.current_company_id());

-- Deliberately NO insert, update or delete policy, not even for the company
-- account. An entitlement a customer can grant themselves is not an
-- entitlement. Writes come from the service role — billing, or a support
-- action — and nowhere else.

create trigger company_products_updated_at
  before update on company_products
  for each row execute function public.set_updated_at();

-- Everyone already using the product keeps it, on the same terms as before.
-- Existing customers must not wake up locked out of something they were using
-- yesterday, so these are 'active' rather than trials.
insert into company_products (company_id, product, plan, status)
  select id, 'businessops', 'standard', 'active' from companies
  on conflict do nothing;

-- And anyone who had already switched the events module on was, in effect,
-- using StaffOps.
insert into company_products (company_id, product, plan, status)
  select id, 'staffops', 'standard', 'active' from companies where modules_events_enabled
  on conflict do nothing;

-- New signups start a BusinessOps trial. StaffOps is granted separately —
-- by billing once it exists, or by hand for a design partner — because nothing
-- at signup says which product someone came for.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  matched_invite company_invites%rowtype;
begin
  select * into matched_invite
    from company_invites
    where email = new.email and accepted_at is null and expires_at > now()
    order by created_at desc
    limit 1;

  if matched_invite.id is not null then
    insert into profiles (
      id, company_id, full_name, role, email, job_title,
      can_view_all_jobs, can_edit_jobs, quotes_access, invoices_access,
      can_log_expenses, can_view_reports, can_schedule
    )
      values (
        new.id, matched_invite.company_id, new.raw_user_meta_data ->> 'full_name', matched_invite.role, new.email,
        matched_invite.job_title,
        matched_invite.can_view_all_jobs, matched_invite.can_edit_jobs, matched_invite.quotes_access,
        matched_invite.invoices_access, matched_invite.can_log_expenses, matched_invite.can_view_reports,
        matched_invite.can_schedule
      );

    if matched_invite.pay_type = 'salaried' then
      insert into staff_pay_rates (profile_id, pay_type, pay_rate) values (new.id, 'salaried', null);
    elsif matched_invite.pay_rate is not null then
      insert into staff_pay_rates (profile_id, pay_type, pay_rate) values (new.id, 'hourly', matched_invite.pay_rate);
    end if;

    update company_invites set accepted_at = now() where id = matched_invite.id;
  else
    insert into companies (name) values (coalesce(new.raw_user_meta_data ->> 'company_name', 'My Company'))
      returning id into new_company_id;

    insert into profiles (
      id, company_id, full_name, role, email,
      can_view_all_jobs, can_edit_jobs, quotes_access, invoices_access,
      can_log_expenses, can_view_reports, can_schedule
    )
      values (
        new.id, new_company_id, new.raw_user_meta_data ->> 'full_name', 'company', new.email,
        true, true, 'full', 'full', true, true, true
      );

    -- A month, matching the stated launch pricing. Nothing enforces the expiry
    -- yet — that arrives with billing — but the date is recorded from the start
    -- so it does not have to be invented retrospectively for early customers.
    insert into company_products (company_id, product, plan, status, trial_ends_at)
      values (new_company_id, 'businessops', 'standard', 'trialing', now() + interval '30 days');
  end if;

  if coalesce(new.raw_user_meta_data ->> 'accepted_privacy_version', '') <> '' then
    insert into policy_acceptances (profile_id, document, version)
      values (new.id, 'privacy', new.raw_user_meta_data ->> 'accepted_privacy_version');
  end if;

  if coalesce(new.raw_user_meta_data ->> 'accepted_terms_version', '') <> '' then
    insert into policy_acceptances (profile_id, document, version)
      values (new.id, 'terms', new.raw_user_meta_data ->> 'accepted_terms_version');
  end if;

  return new;
end;
$$;
