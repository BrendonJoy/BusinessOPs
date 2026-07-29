-- ============================================================
-- Staff timesheets: clock in/out against a job or a misc category,
-- optional geofencing, and auto-populated labour cost entries.
-- ============================================================

alter table companies
  add column modules_timesheets_enabled boolean not null default true,
  add column geofence_enabled boolean not null default false,
  add column geofence_radius_meters integer not null default 200;

create table timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  misc_category text check (misc_category in ('travel', 'admin', 'break', 'other')),
  clock_in timestamptz not null,
  clock_out timestamptz,
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_out_lat double precision,
  clock_out_lng double precision,
  cost_entry_id uuid references cost_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint one_target_only check (
    (job_id is not null and misc_category is null) or (job_id is null and misc_category is not null)
  )
);

-- One open (still clocked in) entry per person, enforced at the DB level.
create unique index one_open_entry_per_profile on timesheet_entries (profile_id) where (clock_out is null);

alter table timesheet_entries enable row level security;

-- Staff see only their own timesheet -- same privacy stance as staff_pay_rates,
-- not everything a can_view_all_jobs staff member can otherwise see.
create policy "select own or company timesheet entries" on timesheet_entries
  for select using (
    company_id = public.current_company_id()
    and (profile_id = auth.uid() or public.current_user_role() = 'company')
  );

create policy "insert own timesheet entries" on timesheet_entries
  for insert with check (
    profile_id = auth.uid()
    and company_id = public.current_company_id()
    and (job_id is null or public.can_access_job(job_id))
  );

create policy "update own or company timesheet entries" on timesheet_entries
  for update using (
    company_id = public.current_company_id()
    and (profile_id = auth.uid() or public.current_user_role() = 'company')
  )
  with check (
    company_id = public.current_company_id()
    and (profile_id = auth.uid() or public.current_user_role() = 'company')
  );

create policy "company deletes timesheet entries" on timesheet_entries
  for delete using (
    company_id = public.current_company_id() and public.current_user_role() = 'company'
  );

-- ------------------------------------------------------------
-- Clock-out needs to insert into cost_entries, which normally requires
-- can_edit_job() -- a staff member logging their own hours shouldn't need
-- edit rights on the job's content for that. This function does the whole
-- clock-out + auto-cost-entry write as a narrowly-scoped, server-validated
-- security definer RPC (same idiom as respond_to_quote / get_invite_by_token),
-- rather than loosening cost_entries' own RLS.
-- ------------------------------------------------------------

create or replace function public.clock_out_timesheet_entry(
  p_entry_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns timesheet_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry timesheet_entries%rowtype;
  v_rate numeric;
  v_hours numeric;
  v_cost_entry_id uuid;
begin
  select * into v_entry
    from timesheet_entries
    where id = p_entry_id and profile_id = auth.uid() and clock_out is null;

  if not found then
    raise exception 'No open timesheet entry found.';
  end if;

  update timesheet_entries
    set clock_out = now(), clock_out_lat = p_lat, clock_out_lng = p_lng
    where id = p_entry_id
    returning * into v_entry;

  if v_entry.job_id is not null then
    select pay_rate into v_rate from staff_pay_rates where profile_id = auth.uid();

    if v_rate is not null then
      v_hours := round((extract(epoch from (v_entry.clock_out - v_entry.clock_in)) / 3600.0)::numeric, 2);

      insert into cost_entries (job_id, type, description, quantity, unit_cost)
        values (
          v_entry.job_id,
          'labour',
          'Timesheet ' || to_char(v_entry.clock_in, 'DD Mon HH24:MI') || '-' || to_char(v_entry.clock_out, 'HH24:MI'),
          v_hours,
          v_rate
        )
        returning id into v_cost_entry_id;

      update timesheet_entries set cost_entry_id = v_cost_entry_id where id = p_entry_id;
      v_entry.cost_entry_id := v_cost_entry_id;
    end if;
  end if;

  return v_entry;
end;
$$;

grant execute on function public.clock_out_timesheet_entry(uuid, double precision, double precision) to authenticated;
