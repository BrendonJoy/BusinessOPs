-- ============================================================
-- Feedback digests: AI-suggested fixes/actions, shown on the admin
-- page and included in the daily digest email to platform admins.
-- ============================================================

alter table feedback_digests
  add column suggested_actions jsonb not null default '[]';

-- ------------------------------------------------------------
-- The daily digest cron is the first thing to use the service-role key,
-- and none of this project's tables ever received service_role grants
-- (they were all created through SQL-editor migrations). service_role has
-- BYPASSRLS, but still needs plain table privileges.
-- ------------------------------------------------------------

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
