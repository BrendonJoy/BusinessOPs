-- Founder-facing AI ops/summarization agent (feature-backlog item 14). Reads
-- the feedback_messages data store (item 21) and produces an on-demand
-- digest: a narrative summary plus any items flagged urgent, rather than
-- requiring the founder to read every message individually.

create table feedback_digests (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  message_count integer not null,
  summary text not null,
  urgent_items jsonb not null default '[]'::jsonb
);

alter table feedback_digests enable row level security;

create policy "platform admin manages feedback digests" on feedback_digests
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());
