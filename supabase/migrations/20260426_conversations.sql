-- Conversations table for multi-conversation AI chat
create table if not exists public.conversations (
  id          uuid        default gen_random_uuid() primary key,
  client_id   uuid        not null references public.profiles(id) on delete cascade,
  title       text        not null default 'New Conversation',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.conversations enable row level security;

create policy "client owns conversations"
  on public.conversations
  for all
  using  (client_id = auth.uid())
  with check (client_id = auth.uid());

-- Link chat messages to a conversation
alter table public.chat_history
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

create index if not exists chat_history_conv_idx
  on public.chat_history(conversation_id);
