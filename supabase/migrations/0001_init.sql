-- Link: initial schema
-- Every row belongs to one user. Row Level Security makes sure a user can only see their own data.
-- Transcripts and audio are NOT stored here; they stay on the user's device by default.

-- ------------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- Profiles (one per auth user, created automatically on sign-up)
-- ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  default_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------
-- Packs (one per meeting or meeting type)
-- ------------------------------------------------------------------

create table public.packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  meeting_type text not null default 'other' check (
    meeting_type in ('investor', 'sales', 'client', 'partner', 'interview',
                     'presentation', 'viva', 'negotiation', 'other')
  ),
  counterpart text not null default '' check (char_length(counterpart) <= 300),
  goal text not null default '' check (char_length(goal) <= 1000),
  language text not null default 'en',
  status text not null default 'draft' check (status in ('draft', 'generating', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index packs_user_id_idx on public.packs (user_id);

create trigger packs_updated_at
before update on public.packs
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- Sources (documents, links and notes a pack is built from)
-- ------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (
    kind in ('file', 'url', 'chatgpt_share', 'claude_share', 'chat_export', 'note')
  ),
  title text not null default '' check (char_length(title) <= 300),
  uri text check (uri is null or char_length(uri) <= 2000),
  storage_path text,
  content_text text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index sources_pack_id_idx on public.sources (pack_id);
create index sources_user_id_idx on public.sources (user_id);

-- ------------------------------------------------------------------
-- Cues (the cards shown during a call)
-- ------------------------------------------------------------------

create table public.cues (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  direction text not null check (direction in ('incoming', 'outgoing')),
  kind text not null check (kind in ('question', 'topic', 'number', 'checklist')),
  prompt text not null check (char_length(prompt) between 1 and 300),
  variants text[] not null default '{}' check (cardinality(variants) <= 12),
  bullets text[] not null default '{}' check (cardinality(bullets) <= 3),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 10),
  priority smallint not null default 2 check (priority between 1 and 3),
  approved boolean not null default false,
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cues_pack_id_idx on public.cues (pack_id);
create index cues_user_id_idx on public.cues (user_id);

create trigger cues_updated_at
before update on public.cues
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- Gap questions (what the documents could not answer; asked to the user)
-- ------------------------------------------------------------------

create table public.gap_questions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 500),
  answer text check (answer is null or char_length(answer) <= 2000),
  status text not null default 'open' check (status in ('open', 'answered', 'skipped')),
  created_at timestamptz not null default now()
);

create index gap_questions_pack_id_idx on public.gap_questions (pack_id);
create index gap_questions_user_id_idx on public.gap_questions (user_id);

-- ------------------------------------------------------------------
-- Sessions (one per live call) and their events
-- ------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pack_id uuid references public.packs (id) on delete set null,
  title text not null default '' check (char_length(title) <= 200),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  summary text
);

create index sessions_user_id_idx on public.sessions (user_id);
create index sessions_pack_id_idx on public.sessions (pack_id);

create table public.session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  t_ms integer not null check (t_ms >= 0),
  type text not null check (
    type in ('cue_shown', 'cue_dismissed', 'checklist_done',
             'unmatched_question', 'fallback_cue', 'hesitation')
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index session_events_session_id_idx on public.session_events (session_id);
create index session_events_user_id_idx on public.session_events (user_id);

-- ------------------------------------------------------------------
-- Row Level Security: users only ever touch their own rows
-- ------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.packs enable row level security;
alter table public.sources enable row level security;
alter table public.cues enable row level security;
alter table public.gap_questions enable row level security;
alter table public.sessions enable row level security;
alter table public.session_events enable row level security;

create policy "profiles: own row" on public.profiles
for all to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "packs: own rows" on public.packs
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "sources: own rows" on public.sources
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.packs p where p.id = pack_id and p.user_id = (select auth.uid()))
);

create policy "cues: own rows" on public.cues
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.packs p where p.id = pack_id and p.user_id = (select auth.uid()))
);

create policy "gap_questions: own rows" on public.gap_questions
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.packs p where p.id = pack_id and p.user_id = (select auth.uid()))
);

create policy "sessions: own rows" on public.sessions
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (pack_id is null
       or exists (select 1 from public.packs p where p.id = pack_id and p.user_id = (select auth.uid())))
);

create policy "session_events: own rows" on public.session_events
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid()))
);

-- ------------------------------------------------------------------
-- Storage: private bucket for uploaded source files, one folder per user
-- Path format: <user_id>/<pack_id>/<filename>
-- ------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;

create policy "sources bucket: read own files" on storage.objects
for select to authenticated
using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "sources bucket: upload own files" on storage.objects
for insert to authenticated
with check (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "sources bucket: delete own files" on storage.objects
for delete to authenticated
using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);