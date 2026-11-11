-- Link: shared chats kept as turns, the "Ask" conversation per pack,
-- and OAuth sign-in for the Claude / ChatGPT connector.

-- ------------------------------------------------------------------
-- Shared and imported chats keep their turns for the chat viewer
-- ------------------------------------------------------------------

alter table public.sources
  add column messages jsonb
  check (messages is null or jsonb_typeof(messages) = 'array');

-- ------------------------------------------------------------------
-- Ask: questions about a pack's sources, answered by Grok
-- ------------------------------------------------------------------

create table public.ask_messages (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 40000),
  created_at timestamptz not null default now()
);

create index ask_messages_pack_id_idx on public.ask_messages (pack_id, created_at);
create index ask_messages_user_id_idx on public.ask_messages (user_id);

alter table public.ask_messages enable row level security;

create policy "ask_messages: read own" on public.ask_messages
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "ask_messages: insert own" on public.ask_messages
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.packs p where p.id = pack_id and p.user_id = (select auth.uid()))
);

create policy "ask_messages: delete own" on public.ask_messages
for delete to authenticated
using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------
-- OAuth 2.1 for the MCP connector ("Connect" in Claude or ChatGPT)
-- Only the server (service role) reads or writes these tables.
-- Codes and tokens are stored as SHA-256 hashes, never in plain text.
-- ------------------------------------------------------------------

-- Clients register themselves (RFC 7591 dynamic client registration).
create table public.oauth_clients (
  client_id text primary key check (char_length(client_id) between 16 and 100),
  client_name text not null default '' check (char_length(client_name) <= 200),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- One-time authorization codes, valid for 5 minutes.
create table public.oauth_codes (
  code_hash text primary key check (char_length(code_hash) = 64),
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_uri text not null check (char_length(redirect_uri) <= 2000),
  code_challenge text not null check (char_length(code_challenge) between 43 and 128),
  scope text not null default 'link',
  resource text check (resource is null or char_length(resource) <= 2000),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index oauth_codes_user_id_idx on public.oauth_codes (user_id);
create index oauth_codes_client_id_idx on public.oauth_codes (client_id);

-- Access tokens (1 hour) and rotating refresh tokens (60 days).
create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  access_hash text not null unique check (char_length(access_hash) = 64),
  refresh_hash text not null unique check (char_length(refresh_hash) = 64),
  scope text not null default 'link',
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index oauth_tokens_user_id_idx on public.oauth_tokens (user_id);
create index oauth_tokens_client_id_idx on public.oauth_tokens (client_id);

alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_tokens enable row level security;
-- No policies: signed-in users cannot read or change these tables directly.