-- One-way calendar export: a per-company secret token generates a standard
-- iCalendar (.ics) feed URL that Google Calendar/Outlook/Apple Calendar can
-- subscribe to (read-only, refreshed on their own schedule). No OAuth or
-- external accounts needed -- unlike two-way sync, Trade Assist only ever
-- serves a file here, nothing pushes back into the app.

alter table companies add column calendar_token uuid not null default gen_random_uuid();

create or replace function public.get_calendar_feed_data(p_token uuid)
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
    'company_name', comp.name,
    'jobs', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', j.id,
        'job_number', j.job_number,
        'status', j.status,
        'address_line', j.address_line,
        'start_date', j.start_date,
        'start_time', j.start_time,
        'finish_date', j.finish_date,
        'finish_time', j.finish_time,
        'notes', j.notes,
        'customer_name', c.name,
        'updated_at', j.updated_at
      ) order by j.start_date)
      from jobs j
      left join customers c on c.id = j.customer_id
      where j.company_id = comp.id and j.status <> 'cancelled' and j.start_date is not null),
      '[]'::jsonb
    )
  )
  into result
  from companies comp
  where comp.calendar_token = p_token;

  return result;
end;
$$;

grant execute on function public.get_calendar_feed_data(uuid) to anon, authenticated;
