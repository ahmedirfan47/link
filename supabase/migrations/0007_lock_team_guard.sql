-- The team guard runs only as a trigger; nobody needs to call it through the API.
-- (Triggers still fire: Postgres checks EXECUTE when the trigger is created, not when it runs.)
revoke execute on function public.packs_team_guard() from public, anon, authenticated;
