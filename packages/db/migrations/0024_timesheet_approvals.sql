-- ============================================================
-- Timesheets v2: clock-out grace window, daily submit/approve flow,
-- company work-day hours, pay cycles + payroll period approval.
-- ============================================================

alter table companies
  add column workday_enforced boolean not null default false,
  add column workday_start time not null default '07:00',
  add column workday_end time not null default '17:00',
  add column workday_days smallint[] not null default '{1,2,3,4,5}', -- ISO: 1=Mon .. 7=Sun
  add column pay_cycle_length text not null default 'weekly'
    check (pay_cycle_length in ('weekly', 'fortnightly', 'monthly')),
  add column pay_cycle_anchor date;

-- ------------------------------------------------------------
-- One row per staff member per submitted day. Created when the staff
-- member submits their day; approved by the Company account.
-- ------------------------------------------------------------

create table timesheet_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  work_date date not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved')),
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references profiles(id) on delete set null,
  unique (profile_id, work_date)
);

alter table timesheet_days enable row level security;

create policy "select own or company timesheet days" on timesheet_days
  for select using (
    company_id = public.current_company_id()
    and (profile_id = auth.uid() or public.current_user_role() = 'company')
  );

create policy "insert own timesheet days" on timesheet_days
  for insert with check (
    profile_id = auth.uid() and company_id = public.current_company_id()
  );

create policy "company updates timesheet days" on timesheet_days
  for update using (
    company_id = public.current_company_id() and public.current_user_role() = 'company'
  )
  with check (
    company_id = public.current_company_id() and public.current_user_role() = 'company'
  );

create policy "company deletes timesheet days" on timesheet_days
  for delete using (
    company_id = public.current_company_id() and public.current_user_role() = 'company'
  );

alter table timesheet_entries
  add column day_id uuid references timesheet_days(id) on delete set null;

-- Now that days are submitted for approval, staff must not be able to rewrite
-- their own entry times after the fact (clock-out goes through the security
-- definer RPC, which is unaffected). Corrections are Company-only.
drop policy "update own or company timesheet entries" on timesheet_entries;

create policy "company updates timesheet entries" on timesheet_entries
  for update using (
    company_id = public.current_company_id() and public.current_user_role() = 'company'
  )
  with check (
    company_id = public.current_company_id() and public.current_user_role() = 'company'
  );

-- ------------------------------------------------------------
-- Payroll period approval record. Report content is always computed live
-- from timesheet data; this row just marks a cycle as approved.
-- ------------------------------------------------------------

create table payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  approved_at timestamptz not null default now(),
  approved_by uuid references profiles(id) on delete set null,
  unique (company_id, period_start)
);

alter table payroll_periods enable row level security;

create policy "company manages payroll periods" on payroll_periods
  for all using (
    company_id = public.current_company_id() and public.current_user_role() = 'company'
  )
  with check (
    company_id = public.current_company_id() and public.current_user_role() = 'company'
  );

-- ------------------------------------------------------------
-- Staff submit their day through this RPC: it creates the timesheet_days row
-- and stamps day_id on the day's entries. Security definer because the
-- timesheet_entries update policy above is now Company-only -- staff can't
-- stamp day_id themselves, and this is the one narrowly-scoped write they need.
-- ------------------------------------------------------------

create function public.submit_timesheet_day(
  p_work_date date,
  p_window_start timestamptz,
  p_window_end timestamptz
)
returns timesheet_days
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_day timesheet_days%rowtype;
  v_entry_count integer;
  v_open_count integer;
begin
  select company_id into v_company_id from profiles where id = auth.uid();

  if v_company_id is null then
    raise exception 'Could not determine your company.';
  end if;

  if p_window_end <= p_window_start or p_window_end > p_window_start + interval '26 hours' then
    raise exception 'Invalid day window.';
  end if;

  select count(*), count(*) filter (where clock_out is null)
    into v_entry_count, v_open_count
    from timesheet_entries
    where profile_id = auth.uid()
      and clock_in >= p_window_start and clock_in < p_window_end;

  if v_entry_count = 0 then
    raise exception 'No timesheet entries to submit for this day.';
  end if;

  if v_open_count > 0 then
    raise exception 'Clock out before submitting the day.';
  end if;

  insert into timesheet_days (company_id, profile_id, work_date)
    values (v_company_id, auth.uid(), p_work_date)
    returning * into v_day;

  update timesheet_entries
    set day_id = v_day.id
    where profile_id = auth.uid()
      and clock_in >= p_window_start and clock_in < p_window_end
      and day_id is null;

  return v_day;
end;
$$;

grant execute on function public.submit_timesheet_day(date, timestamptz, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- Clock-out RPC v2: takes the (possibly forward-dated) clock-out time.
-- Validated here, not just in the server action, because this function is
-- security definer and directly callable by any authenticated staff member.
-- ------------------------------------------------------------

drop function public.clock_out_timesheet_entry(uuid, double precision, double precision);

create function public.clock_out_timesheet_entry(
  p_entry_id uuid,
  p_clock_out timestamptz,
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
  v_company companies%rowtype;
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

  if p_clock_out <= v_entry.clock_in then
    raise exception 'Finish time must be after the clock-in time.';
  end if;

  if p_clock_out > now() + interval '15 minutes' then
    raise exception 'Finish time can be at most 15 minutes ahead of the current time.';
  end if;

  select * into v_company from companies where id = v_entry.company_id;

  if v_company.workday_enforced and p_clock_out::time > v_company.workday_end then
    raise exception 'Finish time is outside the company work-day hours.';
  end if;

  update timesheet_entries
    set clock_out = p_clock_out, clock_out_lat = p_lat, clock_out_lng = p_lng
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

grant execute on function public.clock_out_timesheet_entry(uuid, timestamptz, double precision, double precision) to authenticated;
