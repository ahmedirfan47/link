-- Link: card usefulness from Pocket, read-only pack sharing, and packs created
-- from calendar meetings.

-- ------------------------------------------------------------------
-- Pocket: "this card helped" (star). Used to rank cards higher next time.
-- ------------------------------------------------------------------

alter table public.cues
  add column useful_count integer not null default 0 check (useful_count >= 0),
  add column last_useful_at timestamptz;

-- ------------------------------------------------------------------
-- Calendar: a pack can belong to one meeting
-- ------------------------------------------------------------------

alter table public.packs
  add column meeting_at timestamptz,
  add column calendar_uid text check (calendar_uid is null or char_length(calendar_uid) <= 500);

create unique index packs_user_calendar_uid_idx
  on public.packs (user_id, calendar_uid)
  where calendar_uid is not null;

-- The private iCal address of the user's calendar. Server reads it to list meetings.
create table public.calendar_feeds (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ics_url text not null check (char_length(ics_url) between 10 and 2000 and ics_url like 'https://%'),
  updated_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

create policy "calendar_feeds: own row" on public.calendar_feeds
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------
-- Sharing: the owner shares a pack read-only with a teammate's email.
-- Teammates never read packs/cues directly; the server checks this table
-- and serves the shared view. So the packs and cues policies stay owner-only.
-- ------------------------------------------------------------------

create table public.pack_shares (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320 and position('@' in email) > 1),
  created_at timestamptz not null default now(),
  unique (pack_id, email)
);

create index pack_shares_email_idx on public.pack_shares (email);
create index pack_shares_owner_id_idx on public.pack_shares (owner_id);

alter table public.pack_shares enable row level security;

create policy "pack_shares: owner manages" on public.pack_shares
for all to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.packs p where p.id = pack_id and p.user_id = (select auth.uid()))
);

create policy "pack_shares: teammate sees own invites" on public.pack_shares
for select to authenticated
using (email = lower(coalesce((select auth.jwt() ->> 'email'), '')));
