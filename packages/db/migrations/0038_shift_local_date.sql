-- The calendar date a shift belongs to, in the venue's own terms.
--
-- `starts_at` is a timestamptz, which is the right way to store an instant but
-- the wrong thing to group by. Deriving a date from it on the server would use
-- the server's zone — UTC in production — so a shift starting at 8pm in
-- Auckland would file itself under the following day, and a roster for "the
-- 10th" would show the wrong shifts. Every fix that keeps the derivation
-- server-side is a guess about where the viewer is.
--
-- So the client sends the date it means, taken straight from the date half of
-- the picker. No arithmetic, nothing to get wrong. This mirrors
-- timesheet_days.work_date, which already solves the same problem the same way.
--
-- A pack-out running 20:00 to 02:00 belongs to the day it started, which is
-- what a crew means when they say "Saturday's pack-out".
alter table shifts add column local_date date not null default current_date;

-- The default exists only so the statement above is valid; every insert must
-- state the date deliberately rather than inheriting the server's idea of today.
alter table shifts alter column local_date drop default;

create index shifts_company_local_date on shifts (company_id, local_date);
