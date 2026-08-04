-- Venues, so shifts can be geofenced.
--
-- Geofencing already exists for BusinessOps, but it checks against a *job's*
-- geocoded address. A shift has no address of its own, and the event's venue
-- was free text — a label, not a location. Worse, a dark-day shift has no event
-- at all, so hanging coordinates off events alone would leave exactly the
-- maintenance work that happens on site unfenceable.
--
-- A venue is therefore its own thing. An events business plausibly works
-- several, so this is also the shape that does not need redoing later.
create table venues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  address text,
  geo_lat double precision,
  geo_lng double precision,
  created_at timestamptz not null default now()
);

create index venues_company on venues (company_id);

alter table venues enable row level security;

-- Readable by everyone in the company: staff see which venue a shift is at.
create policy "view company venues" on venues
  for select using (company_id = public.current_company_id());

-- Managed by the company account only, like departments. A venue's coordinates
-- decide whether someone can clock in at all, so it is not a per-department
-- setting a department manager should be able to move.
create policy "company manages venues" on venues
  for all
  using (company_id = public.current_company_id() and public.current_user_role() = 'company')
  with check (company_id = public.current_company_id() and public.current_user_role() = 'company');

-- A shift's venue is its own if set, otherwise its event's. Dark-day shifts set
-- theirs directly; event shifts normally inherit and leave this null.
alter table events add column venue_id uuid references venues(id) on delete set null;
alter table shifts add column venue_id uuid references venues(id) on delete set null;

-- Replaced by venue_id. Dropped rather than left alongside, because a free-text
-- label sitting next to a real location is the kind of pair where one gets
-- updated and the other quietly does not. No production events exist yet.
alter table events drop column venue;

create index shifts_venue on shifts (venue_id);
