-- ============================================================
-- Chat Agent: persistent per-user conversation with the assistant.
-- Private to each user -- Company does not see staff chats.
-- ============================================================

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_profile_created on chat_messages (profile_id, created_at);

alter table chat_messages enable row level security;

create policy "select own chat messages" on chat_messages
  for select using (
    profile_id = auth.uid() and company_id = public.current_company_id()
  );

create policy "insert own chat messages" on chat_messages
  for insert with check (
    profile_id = auth.uid() and company_id = public.current_company_id()
  );
