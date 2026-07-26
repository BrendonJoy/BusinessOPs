-- Tables created via the SQL editor (running as postgres) don't automatically pick up
-- the grants Supabase normally sets up for tables created through its own tooling.
-- Without these, PostgREST returns "permission denied for table X" before RLS is ever evaluated.

grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Ensure any tables/sequences added by future migrations get the same grants automatically.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
