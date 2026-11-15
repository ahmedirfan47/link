-- Link: teams and the team playbook, plus questions missed in Pocket and the
-- Chrome extension.

-- ------------------------------------------------------------------
-- Teams. Members are added by email, like pack shares; the owner is a
-- member too. A pack can belong to one team, which shares it read-only
-- with every member and pools its stars and missed questions.
-- ------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index teams_owner_id_idx on public.teams (owner_id);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320 and position('@' in email) > 1),
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (team_id, email)
);

create index team_members_email_idx on public.team_members (email);

alter table public.packs
  add column team_id uuid references public.teams (id) on delete set null;

create index packs_team_id_idx on public.packs (team_id) where team_id is not null;

-- True when the signed-in user owns the team or is a member by email.
-- Security definer so the policies below can use it without recursion.
create function public.is_team_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams where id = t and owner_id = (select auth.uid()))
      or exists (
        select 1 from public.team_members
        where team_id = t and email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      );
$$;

revoke execute on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;

alter table public.teams enable row level security;

create policy "teams: members read" on public.teams
for select to authenticated
using (public.is_team_member(id));

create policy "teams: owner creates" on public.teams
for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "teams: owner changes" on public.teams
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "teams: owner deletes" on public.teams
for delete to authenticated
using ((select auth.uid()) = owner_id);

alter table public.team_members enable row level security;

create policy "team_members: members read" on public.team_members
for select to authenticated
using (public.is_team_member(team_id));

create policy "team_members: owner manages" on public.team_members
for all to authenticated
using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())))
with check (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())));

-- A user can only put their own pack in a team they belong to.
create function public.packs_team_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id is not null
     and (tg_op = 'INSERT' or new.team_id is distinct from old.team_id)
     and (select auth.uid()) is not null
     and not public.is_team_member(new.team_id) then
    raise exception 'You are not a member of that team.';
  end if;
  return new;
end;
$$;

create trigger packs_team_guard
before insert or update of team_id on public.packs
for each row execute function public.packs_team_guard();

-- ------------------------------------------------------------------
-- Questions nobody had a card for, heard in Pocket or the Chrome
-- extension. Written by the server after checking access; read by the
-- owner, and pooled into the team playbook by the server.
-- ------------------------------------------------------------------

create table public.pocket_misses (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 3 and 300),
  source text not null default 'pocket' check (source in ('pocket', 'extension')),
  created_at timestamptz not null default now()
);

create index pocket_misses_pack_idx on public.pocket_misses (pack_id, created_at desc);
create index pocket_misses_user_idx on public.pocket_misses (user_id);

alter table public.pocket_misses enable row level security;

create policy "pocket_misses: own rows" on public.pocket_misses
for select to authenticated
using ((select auth.uid()) = user_id);

-- Who marked which card as helpful, so the team playbook can show it per member.
create table public.card_stars (
  id uuid primary key default gen_random_uuid(),
  cue_id uuid not null references public.cues (id) on delete cascade,
  pack_id uuid not null references public.packs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index card_stars_pack_idx on public.card_stars (pack_id);
create index card_stars_cue_idx on public.card_stars (cue_id);
create index card_stars_user_idx on public.card_stars (user_id);

alter table public.card_stars enable row level security;

create policy "card_stars: own rows" on public.card_stars
for select to authenticated
using ((select auth.uid()) = user_id);
