-- Link: sharing and team membership by invite link instead of by email.
--
-- With sign-up email confirmation turned off, an email address in a token
-- proves nothing: anyone could sign up as a teammate's address. So a share or
-- a team seat now grants access only after someone opens its invite link and
-- accepts it while signed in; the account that accepts is recorded.

alter table public.pack_shares
  add column token_hash text unique,
  add column accepted_by uuid references auth.users (id) on delete cascade,
  add column accepted_at timestamptz;

alter table public.team_members
  add column token_hash text unique,
  add column accepted_by uuid references auth.users (id) on delete cascade,
  add column accepted_at timestamptz;

create index pack_shares_accepted_by_idx on public.pack_shares (accepted_by);
create index team_members_accepted_by_idx on public.team_members (accepted_by);

-- Pack shares: the invitee sees the share only once they have accepted it.
drop policy "pack_shares: teammate sees own invites" on public.pack_shares;
create policy "pack_shares: invitee sees accepted" on public.pack_shares
for select to authenticated
using ((select auth.uid()) = accepted_by);

-- The owner cannot mark a share as accepted on someone else's behalf.
drop policy "pack_shares: owner manages" on public.pack_shares;
create policy "pack_shares: owner manages" on public.pack_shares
for all to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and accepted_by is null
  and exists (select 1 from public.packs p where p.id = pack_id and p.user_id = (select auth.uid()))
);

-- Team members: membership counts once accepted (the owner counts as accepted).
create or replace function public.is_team_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams where id = t and owner_id = (select auth.uid()))
      or exists (
        select 1 from public.team_members
        where team_id = t and accepted_by = (select auth.uid())
      );
$$;

drop policy "team_members: owner manages" on public.team_members;
create policy "team_members: owner manages" on public.team_members
for all to authenticated
using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())))
with check (
  exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid()))
  and (accepted_by is null or accepted_by = (select auth.uid()))
);
