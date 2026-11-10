-- handle_new_user only runs as a trigger on auth.users; nobody should call it through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;