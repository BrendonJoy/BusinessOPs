-- Stop retaining staff GPS coordinates.
--
-- Migration 0023 added clock_in_lat/lng and clock_out_lat/lng and wrote them on
-- every clock in and out. Nothing ever read them back: the geofence check runs
-- server-side in the application layer (lib/geo.ts, called from timesheet
-- actions) on the coordinates submitted with the request, and it happens BEFORE
-- the insert or the clock-out RPC. Storage was never required for the feature.
--
-- Retaining precise, indefinitely-kept location traces of employees for no
-- purpose is the clearest possible failure of data minimisation (UK/EU GDPR
-- Art. 5(1)(c), NZ Privacy Act principle 1, Australian Privacy Principle 3).
-- The intended and now actual behaviour is: coordinates are transmitted, used
-- once to answer "are you inside the geofence?", and discarded.
--
-- This drops the columns rather than merely blanking them, so the data cannot
-- be resurrected and there is nothing to disclose in a subject access request.
-- Existing rows lose their stored coordinates; that is the point.

-- The RPC has to lose its location parameters before the columns can go. A
-- parameter change means drop and recreate rather than "create or replace".
drop function if exists public.clock_out_timesheet_entry(uuid, timestamptz, double precision, double precision);

create function public.clock_out_timesheet_entry(
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

  if v_company.workday_enforced and p_clock_out::time > v_company.workday_end then
    raise exception 'Finish time is outside the company work-day hours.';
  end if;

  update timesheet_entries
    set clock_out = p_clock_out
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

grant execute on function public.clock_out_timesheet_entry(uuid, timestamptz) to authenticated;

alter table timesheet_entries
  drop column if exists clock_in_lat,
  drop column if exists clock_in_lng,
  drop column if exists clock_out_lat,
  drop column if exists clock_out_lng;
