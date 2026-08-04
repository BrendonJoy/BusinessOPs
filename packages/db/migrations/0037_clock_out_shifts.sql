-- Clocking out of a shift must not be judged against company work-day hours.
--
-- `workday_enforced` exists for BusinessOps, where a trades business says "our
-- day runs 07:00–17:00" and clock-outs outside it are a mistake. A rostered
-- shift is its own schedule: a pack-out that finishes at 2am is the plan, not
-- an anomaly. Leaving the check in place would refuse the clock-out and strand
-- someone with an open entry at the end of a night shift, which is exactly when
-- they least want to be arguing with a phone.
--
-- The check still applies to job and misc entries, so nothing changes for
-- existing customers.
create or replace function public.clock_out_timesheet_entry(
  p_entry_id uuid,
  p_clock_out timestamptz
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

  if v_entry.shift_id is null
     and v_company.workday_enforced
     and p_clock_out::time > v_company.workday_end then
    raise exception 'Finish time is outside the company work-day hours.';
  end if;

  update timesheet_entries
    set clock_out = p_clock_out
    where id = p_entry_id
    returning * into v_entry;

  -- Labour cost entries belong to jobs, so a shift produces none. Hours still
  -- flow into the payroll report, which is where shift work gets paid from.
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
