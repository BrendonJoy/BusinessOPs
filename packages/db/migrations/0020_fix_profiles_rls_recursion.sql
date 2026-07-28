-- Fix: "owner/admin manage teammates" (0019) checked the caller's role via a
-- raw `exists (select 1 from profiles ...)` subquery inside a policy ON
-- profiles itself. Evaluating that subquery re-triggers profiles' own RLS
-- policies -- including this same one -- causing infinite recursion on
-- every query that touches profiles (directly, or indirectly via any policy
-- that checks the caller's role, e.g. jobs/expenses/company_invites).
--
-- current_company_id() has always been safe here because it's a SECURITY
-- DEFINER function, which bypasses RLS on the tables it queries. The same
-- fix applies: wrap the role lookup in a SECURITY DEFINER function instead
-- of an inline subquery.

create function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

drop policy "owner/admin manage teammates" on profiles;
create policy "owner/admin manage teammates" on profiles
  for all using (
    company_id = public.current_company_id()
    and role <> 'owner'
    and public.current_user_role() in ('owner', 'admin')
  )
  with check (
    company_id = public.current_company_id()
    and role <> 'owner'
    and public.current_user_role() in ('owner', 'admin')
  );

drop policy "owner/admin manage own company invites" on company_invites;
create policy "owner/admin manage own company invites" on company_invites
  for all using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('owner', 'admin')
  )
  with check (
    company_id = public.current_company_id()
    and public.current_user_role() in ('owner', 'admin')
  );

drop policy "manage own company jobs" on jobs;
create policy "manage own company jobs" on jobs
  for all using (
    company_id = public.current_company_id()
    and (public.current_user_role() in ('owner', 'admin') or assigned_user_id = auth.uid())
  )
  with check (company_id = public.current_company_id());

drop policy "manage own company expenses" on expenses;
create policy "manage own company expenses" on expenses
  for all using (
    company_id = public.current_company_id()
    and (public.current_user_role() in ('owner', 'admin') or (job_id is not null and public.can_access_job(job_id)))
  )
  with check (
    company_id = public.current_company_id()
    and (public.current_user_role() in ('owner', 'admin') or (job_id is not null and public.can_access_job(job_id)))
  );
