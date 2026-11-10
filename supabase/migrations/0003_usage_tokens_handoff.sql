-- Link: daily usage caps, personal API tokens (for the MCP connector),
-- and one-time codes that sign the desktop app in through the browser.

-- ------------------------------------------------------------------
-- Daily usage counters
-- ------------------------------------------------------------------

create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default ((now() at time zone 'utc')::date),
  kind text not null check (char_length(kind) between 1 and 40),
  amount integer not null default 0 check (amount >= 0),
  primary key (user_id, day, kind)
);

alter table public.usage_counters enable row level security;

-- Users can see their own counters; only the functions below can change them.
create policy "usage_counters: read own" on public.usage_counters
for select to authenticated
using ((select auth.uid()) = user_id);

-- Adds p_amount to today's counter if that keeps it at or under p_cap.
-- Returns true when the usage was allowed (and recorded), false when over the cap.
create function public.consume_usage_for(p_user uuid, p_kind text, p_amount integer, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if p_user is null or p_amount < 1 or p_cap < 1 then
    return false;
  end if;

  insert into public.usage_counters (user_id, day, kind, amount)
  values (p_user, v_today, p_kind, 0)
  on conflict (user_id, day, kind) do nothing;

  update public.usage_counters
     set amount = amount + p_amount
   where user_id = p_user
     and day = v_today
     and kind = p_kind
     and amount + p_amount <= p_cap;

  return found;
end;
$$;

revoke execute on function public.consume_usage_for(uuid, text, integer, integer) from public, anon, authenticated;
-- Only the server (service role) records usage; users cannot call this.
grant execute on function public.consume_usage_for(uuid, text, integer, integer) to service_role;

-- ------------------------------------------------------------------
-- Personal API tokens (used in the MCP connector URL)
-- ------------------------------------------------------------------

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  -- SHA-256 of the token; the token itself is shown once and never stored.
  token_hash text not null unique,
  token_hint text not null default '' check (char_length(token_hint) <= 8),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_tokens_user_id_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;

create policy "api_tokens: read own" on public.api_tokens
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "api_tokens: create own" on public.api_tokens
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "api_tokens: revoke own" on public.api_tokens
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "api_tokens: delete own" on public.api_tokens
for delete to authenticated
using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------
-- Desktop sign-in through the browser (one-time, 5-minute codes)
-- ------------------------------------------------------------------

create table public.desktop_handoffs (
  code text primary key check (char_length(code) between 32 and 128),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- base64url SHA-256 of a secret only the desktop app knows (PKCE).
  challenge text not null check (char_length(challenge) between 32 and 128),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  used_at timestamptz
);

create index desktop_handoffs_user_id_idx on public.desktop_handoffs (user_id);

alter table public.desktop_handoffs enable row level security;

-- Users can create a code for themselves; only the server (service role) reads and redeems it.
create policy "desktop_handoffs: create own" on public.desktop_handoffs
for insert to authenticated
with check ((select auth.uid()) = user_id);