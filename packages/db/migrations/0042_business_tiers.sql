-- BusinessOps has two tiers, and the difference between them is people.
--
-- Individual is one person: jobs, quotes, invoices, expenses, reports, and
-- their own timesheets. Company adds everyone else — inviting staff, pay rates,
-- approving other people's time, payroll across a team, the staff report.
--
-- The shape was already here: `plan` sits alongside `product`, which is exactly
-- the two axes this needs. What was missing is that nothing read it.

alter table company_products
  add constraint company_products_plan_valid
  check (plan in ('individual', 'company', 'standard'));

comment on column company_products.plan is
  'businessops: individual | company. staffops: standard (no tiers yet).';

-- Everyone already using BusinessOps keeps every feature, for the same reason
-- the entitlement backfill made them active rather than trialing: nobody should
-- lose something they were using yesterday because a tier column appeared.
update company_products set plan = 'company' where product = 'businessops';

-- New signups trial on the full tier. A trial that quietly withholds half the
-- product is a poor way to find out whether someone needs the other half, and
-- billing sets the real tier at checkout.
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

    insert into company_products (company_id, product, plan, status, trial_ends_at)
      values (new_company_id, 'businessops', 'company', 'trialing', now() + interval '30 days');
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
