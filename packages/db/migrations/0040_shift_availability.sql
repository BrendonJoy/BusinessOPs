-- Rostering becomes a conversation rather than a decree.
--
-- Two things change. A shift can say how many people it needs and be opened to
-- a whole department, and every person on a shift has a state: asked, said yes,
-- said no, or confirmed on the final roster.
--
-- The distinction that matters is between "available" and "confirmed". More
-- people can put their hand up than there are places — that is the point of an
-- open call — so saying yes is not the same as being rostered on. The manager
-- still chooses who fills the spots.

alter table shifts
  add column positions_needed integer not null default 1 check (positions_needed > 0);

-- When true, everyone in the department can see the shift as one they may
-- volunteer for. When false it is the manager's to fill by name. Staff can
-- already *see* their department's shifts either way; this is what says whether
-- putting your hand up is invited.
alter table shifts
  add column open_to_department boolean not null default false;

alter table shift_assignments
  add column status text not null default 'invited'
    check (status in ('invited', 'available', 'declined', 'confirmed')),
  add column responded_at timestamptz,
  add column confirmed_at timestamptz;

-- Anything already rostered predates the idea of asking, so it counts as
-- settled rather than as an unanswered invitation.
update shift_assignments set status = 'confirmed', confirmed_at = created_at;

create index shift_assignments_status on shift_assignments (profile_id, status);

/**
 * A staff member's own answer to a shift.
 *
 * Security definer because the alternative is letting staff write their own
 * rows in shift_assignments, and RLS filters rows rather than columns — there
 * would be nothing stopping someone setting their own status to 'confirmed'
 * and putting themselves on the roster. Routing every response through here
 * means the only states a person can reach for themselves are 'available' and
 * 'declined'.
 */
create or replace function public.respond_to_shift(p_shift_id uuid, p_available boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift shifts%rowtype;
  v_existing shift_assignments%rowtype;
begin
  select * into v_shift from shifts where id = p_shift_id;
  if not found then
    raise exception 'Shift not found.';
  end if;

  if not public.is_team_member(v_shift.team_id) then
    raise exception 'That shift belongs to another department.';
  end if;

  select * into v_existing
    from shift_assignments
    where shift_id = p_shift_id and profile_id = auth.uid();

  -- Either the manager asked this person directly, or the shift is open to the
  -- department and anyone in it may offer. Otherwise there is nothing to answer.
  if not found and not v_shift.open_to_department then
    raise exception 'You have not been asked to work that shift.';
  end if;

  -- Confirmed is the manager's decision, not something a later answer undoes.
  -- Someone who can no longer work a confirmed shift needs to be taken off it,
  -- which is a conversation rather than a button.
  if found and v_existing.status = 'confirmed' then
    raise exception 'You are already confirmed for that shift — speak to your manager to change it.';
  end if;

  insert into shift_assignments (shift_id, profile_id, status, responded_at)
    values (
      p_shift_id,
      auth.uid(),
      case when p_available then 'available' else 'declined' end,
      now()
    )
  on conflict (shift_id, profile_id) do update
    set status = excluded.status,
        responded_at = excluded.responded_at;
end;
$$;
