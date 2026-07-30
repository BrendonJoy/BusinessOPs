-- ============================================================
-- Multi-staff job assignment: jobs.assigned_user_id (single FK) becomes a
-- job_assignments join table, so a job can be assigned to any number of the
-- company's staff. All the staff-visibility RLS that keyed off
-- assigned_user_id = auth.uid() now checks membership instead.
-- ============================================================

create table job_assignments (
  job_id uuid not null references jobs (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, profile_id)
);

alter table job_assignments enable row level security;

grant select, insert, update, delete on job_assignments to authenticated, service_role;

insert into job_assignments (job_id, profile_id)
  select id, assigned_user_id from jobs where assigned_user_id is not null;

-- ------------------------------------------------------------
-- Rewrite the permission helpers (latest versions from 0021) to check
-- membership. Security definer, so they read job_assignments without RLS --
-- no recursion with the policies below.
-- ------------------------------------------------------------

create or replace function public.can_access_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jobs j
    join profiles p on p.id = auth.uid()
    where j.id = p_job_id
      and j.company_id = p.company_id
      and (
        p.role = 'company'
        or p.can_view_all_jobs
        or exists (select 1 from job_assignments ja where ja.job_id = j.id and ja.profile_id = auth.uid())
      )
  );
$$;

create or replace function public.can_edit_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jobs j
    join profiles p on p.id = auth.uid()
    where j.id = p_job_id
      and j.company_id = p.company_id
      and (
        p.role = 'company'
        or (p.can_edit_jobs and (
          p.can_view_all_jobs
          or exists (select 1 from job_assignments ja where ja.job_id = j.id and ja.profile_id = auth.uid())
        ))
      )
  );
$$;

create or replace function public.can_schedule_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jobs j
    join profiles p on p.id = auth.uid()
    where j.id = p_job_id
      and j.company_id = p.company_id
      and (
        p.role = 'company'
        or (p.can_schedule and (
          p.can_view_all_jobs
          or exists (select 1 from job_assignments ja where ja.job_id = j.id and ja.profile_id = auth.uid())
        ))
      )
  );
$$;

-- ------------------------------------------------------------
-- The jobs select policy references the column directly, so it must be
-- recreated (and dropped before the column can be dropped).
-- ------------------------------------------------------------

drop policy "select company jobs" on jobs;

create policy "select company jobs" on jobs
  for select using (
    company_id = public.current_company_id()
    and (
      public.current_user_role() = 'company'
      or coalesce((select can_view_all_jobs from profiles where id = auth.uid()), false)
      or exists (select 1 from job_assignments ja where ja.job_id = jobs.id and ja.profile_id = auth.uid())
    )
  );

alter table jobs drop column assigned_user_id;

-- ------------------------------------------------------------
-- job_assignments RLS: read follows job visibility; NO direct write
-- policies. All writes go through set_job_assignments below -- a
-- delete-then-reinsert under plain RLS would strip a non-view-all
-- scheduler's own membership mid-operation and fail the re-insert.
-- ------------------------------------------------------------

create policy "select job assignments" on job_assignments
  for select using (public.can_access_job(job_assignments.job_id));

-- ------------------------------------------------------------
-- Single write path, validated once against pre-change state (same idiom
-- as respond_to_quote / clock_out_timesheet_entry). The "no assignments
-- yet" clause lets a can_schedule staffer without can_view_all_jobs seed
-- assignees on a job they just created.
-- ------------------------------------------------------------

create function public.set_job_assignments(p_job_id uuid, p_profile_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_caller profiles%rowtype;
begin
  select * into v_caller from profiles where id = auth.uid();
  if v_caller.id is null then
    raise exception 'Not signed in.';
  end if;

  select * into v_job from jobs where id = p_job_id and company_id = v_caller.company_id;
  if v_job.id is null then
    raise exception 'Job not found.';
  end if;

  if not (
    v_caller.role = 'company'
    or (v_caller.can_schedule and (
      v_caller.can_view_all_jobs
      or exists (select 1 from job_assignments ja where ja.job_id = p_job_id and ja.profile_id = v_caller.id)
      or not exists (select 1 from job_assignments ja where ja.job_id = p_job_id)
    ))
  ) then
    raise exception 'You do not have permission to assign this job.';
  end if;

  if exists (
    select 1 from unnest(p_profile_ids) as pid
    where not exists (
      select 1 from profiles p where p.id = pid and p.company_id = v_job.company_id
    )
  ) then
    raise exception 'All assignees must belong to your company.';
  end if;

  delete from job_assignments
    where job_id = p_job_id and profile_id <> all (coalesce(p_profile_ids, '{}'));

  insert into job_assignments (job_id, profile_id)
    select p_job_id, pid from unnest(coalesce(p_profile_ids, '{}')) as pid
    on conflict (job_id, profile_id) do nothing;
end;
$$;

revoke execute on function public.set_job_assignments(uuid, uuid[]) from public;
grant execute on function public.set_job_assignments(uuid, uuid[]) to authenticated, service_role;
