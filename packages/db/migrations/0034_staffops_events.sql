-- StaffOps: events, shifts and rostering, with departments.
--
-- The unit of work is an EVENT that runs over one or more days — pack-in, event
-- days, pack-out — with SHIFTS on those days that people are rostered onto. A
-- shift can also stand alone with no event, which is how "dark day" work at a
-- venue is scheduled.
--
-- Deliberately modelled on events rather than on jobs. A trades job is an event
-- with a single day and a single shift, so this generalises downwards; building
-- it the other way round would mean retrofitting multi-day structure and
-- rostering onto the jobs table later.

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------

-- The one genuinely new structural layer. Until now a company was flat: people
-- were 'company' or 'staff' with per-person permission toggles, and nothing sat
-- between the company and the person.
create table teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index teams_company on teams (company_id);

-- Manager is a TEAM-level role, not a company-level one. That is what lets the
-- company account also act as a manager, and lets someone manage catering while
-- being ordinary staff in operations. Membership is many-to-many because casual
-- venue staff cover across departments.
create table team_memberships (
  team_id uuid not null references teams(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'staff' check (role in ('manager', 'staff')),
  created_at timestamptz not null default now(),
  primary key (team_id, profile_id)
);

create index team_memberships_profile on team_memberships (profile_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
--
-- security definer, because a policy on team_memberships that itself queries
-- team_memberships recurses infinitely. Routing every membership check through
-- these functions keeps the policies below readable and non-recursive.

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from team_memberships tm
    where tm.team_id = p_team_id and tm.profile_id = auth.uid()
  );
$$;

create or replace function public.manages_team(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from team_memberships tm
    where tm.team_id = p_team_id and tm.profile_id = auth.uid() and tm.role = 'manager'
  );
$$;

create or replace function public.manages_any_team()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from team_memberships tm
    where tm.profile_id = auth.uid() and tm.role = 'manager'
  );
$$;

-- True when the caller manages at least one team the given person belongs to.
-- This is what scopes pay-rate visibility to a department: a catering manager
-- must not be able to see what operations staff are paid.
create or replace function public.shares_managed_team(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from team_memberships mine
    join team_memberships theirs on theirs.team_id = mine.team_id
    where mine.profile_id = auth.uid()
      and mine.role = 'manager'
      and theirs.profile_id = p_profile_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  venue text,
  notes text,
  created_at timestamptz not null default now()
);

create index events_company on events (company_id);

-- An event's dates live here rather than as a start/finish pair on the event,
-- because pack-in, show days and pack-out are different kinds of day that get
-- staffed differently — and they are not always contiguous.
create table event_days (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  day_date date not null,
  day_type text not null default 'event' check (day_type in ('pack_in', 'event', 'pack_out')),
  notes text,
  unique (event_id, day_date, day_type)
);

create index event_days_company_date on event_days (company_id, day_date);

-- ---------------------------------------------------------------------------
-- Shifts and rostering
-- ---------------------------------------------------------------------------

-- Times are absolute rather than a date plus a time-of-day, so a pack-out that
-- finishes at 2am belongs to the shift that started the previous evening
-- instead of splitting across two days.
--
-- event_day_id is nullable on purpose: that is a dark-day shift, scheduled at
-- the venue with no event attached.
create table shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  event_day_id uuid references event_days(id) on delete cascade,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint shift_ends_after_start check (ends_at > starts_at)
);

create index shifts_company_start on shifts (company_id, starts_at);
create index shifts_team on shifts (team_id);
create index shifts_event_day on shifts (event_day_id);

-- Managers put named people on shifts; staff do not claim them. Chosen for
-- build speed and because it is how venues actually roster.
create table shift_assignments (
  shift_id uuid not null references shifts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shift_id, profile_id)
);

create index shift_assignments_profile on shift_assignments (profile_id);

-- ---------------------------------------------------------------------------
-- Clocking in against a shift
-- ---------------------------------------------------------------------------

alter table timesheet_entries add column shift_id uuid references shifts(id) on delete set null;

-- There are now three things an entry can be against — a job, a shift, or a
-- misc category — and exactly one must be set. The old two-way constraint
-- cannot express that, so it is replaced with a count.
alter table timesheet_entries drop constraint one_target_only;

alter table timesheet_entries add constraint one_target_only check (
  (job_id is not null)::int + (shift_id is not null)::int + (misc_category is not null)::int = 1
);

create index timesheet_entries_shift on timesheet_entries (shift_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table teams enable row level security;
alter table team_memberships enable row level security;
alter table events enable row level security;
alter table event_days enable row level security;
alter table shifts enable row level security;
alter table shift_assignments enable row level security;

-- Everyone in the company can see the department list; only the company account
-- creates or changes departments.
create policy "view company teams" on teams
  for select using (company_id = public.current_company_id());

create policy "company manages teams" on teams
  for all using (company_id = public.current_company_id() and public.current_user_role() = 'company')
  with check (company_id = public.current_company_id() and public.current_user_role() = 'company');

-- You can see who is in a team you are in; the company account sees everyone.
create policy "view team memberships" on team_memberships
  for select using (
    profile_id = auth.uid()
    or public.is_team_member(team_memberships.team_id)
    or (
      public.current_user_role() = 'company'
      and exists (
        select 1 from teams t
        where t.id = team_memberships.team_id and t.company_id = public.current_company_id()
      )
    )
  );

create policy "company manages team memberships" on team_memberships
  for all using (
    public.current_user_role() = 'company'
    and exists (
      select 1 from teams t
      where t.id = team_memberships.team_id and t.company_id = public.current_company_id()
    )
  )
  with check (
    public.current_user_role() = 'company'
    and exists (
      select 1 from teams t
      where t.id = team_memberships.team_id and t.company_id = public.current_company_id()
    )
  );

-- Events are venue-wide context: everyone in the company can see them, and
-- managers as well as the company account can create and edit them.
create policy "view company events" on events
  for select using (company_id = public.current_company_id());

create policy "managers write events" on events
  for all using (
    company_id = public.current_company_id()
    and (public.current_user_role() = 'company' or public.manages_any_team())
  )
  with check (
    company_id = public.current_company_id()
    and (public.current_user_role() = 'company' or public.manages_any_team())
  );

create policy "view company event days" on event_days
  for select using (company_id = public.current_company_id());

create policy "managers write event days" on event_days
  for all using (
    company_id = public.current_company_id()
    and (public.current_user_role() = 'company' or public.manages_any_team())
  )
  with check (
    company_id = public.current_company_id()
    and (public.current_user_role() = 'company' or public.manages_any_team())
  );

-- Shifts are departmental. Staff see the roster for teams they are in — normal
-- for a venue, where you need to know who else is on — and nothing from other
-- departments. Only that team's manager, or the company account, can change it.
create policy "view team shifts" on shifts
  for select using (
    company_id = public.current_company_id()
    and (public.current_user_role() = 'company' or public.is_team_member(shifts.team_id))
  );

create policy "managers write shifts" on shifts
  for all using (
    company_id = public.current_company_id()
    and (public.current_user_role() = 'company' or public.manages_team(shifts.team_id))
  )
  with check (
    company_id = public.current_company_id()
    and (public.current_user_role() = 'company' or public.manages_team(shifts.team_id))
  );

create policy "view shift assignments" on shift_assignments
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from shifts s
      where s.id = shift_assignments.shift_id
        and s.company_id = public.current_company_id()
        and (public.current_user_role() = 'company' or public.is_team_member(s.team_id))
    )
  );

create policy "managers write shift assignments" on shift_assignments
  for all using (
    exists (
      select 1 from shifts s
      where s.id = shift_assignments.shift_id
        and s.company_id = public.current_company_id()
        and (public.current_user_role() = 'company' or public.manages_team(s.team_id))
    )
  )
  with check (
    exists (
      select 1 from shifts s
      where s.id = shift_assignments.shift_id
        and s.company_id = public.current_company_id()
        and (public.current_user_role() = 'company' or public.manages_team(s.team_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Pay rate visibility, scoped to the department
-- ---------------------------------------------------------------------------
--
-- Previously: your own rate, or everything if you are the company account.
-- Now also: a manager sees rates for people in teams they manage — and
-- explicitly no further. A catering manager must not see what operations staff
-- are paid. Company account still sees everyone.

drop policy "select own or company pay rate" on staff_pay_rates;

create policy "select own or managed pay rate" on staff_pay_rates
  for select using (
    profile_id = auth.uid()
    or (
      public.current_user_role() = 'company'
      and exists (
        select 1 from profiles p
        where p.id = staff_pay_rates.profile_id and p.company_id = public.current_company_id()
      )
    )
    or public.shares_managed_team(staff_pay_rates.profile_id)
  );
