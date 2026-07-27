-- Adds a 'cancelled' job status so cancelled/rejected jobs have somewhere to
-- land, feeding the Cancelled archive tab on the jobs list. Must run as its
-- own statement (can't be used in the same transaction it's added in).
alter type job_status add value 'cancelled';
