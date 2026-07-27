-- Jobs previously only stored a date for scheduling. Adding a time of day
-- lets multiple same-day jobs be ordered/scheduled (needed for the
-- upcoming job-routing assistant, which reorders same-day stops).
-- Kept separate from start_date/finish_date rather than switching those to
-- timestamptz, so existing calendar/date logic is unaffected.

alter table jobs add column start_time time;
alter table jobs add column finish_time time;
