# @trade-assist/db

Database schema for Trade Assist, as plain SQL migrations (no Supabase CLI required for this milestone).

## Applying a migration

1. Open your Supabase project dashboard.
2. Go to **SQL Editor** > **New query**.
3. Paste the contents of `migrations/0001_init.sql` and run it.

Run migration files in order (`0001_...`, `0002_...`, ...). Once the project adopts the Supabase CLI for local dev, these same files can be dropped into `supabase/migrations/`.
