-- SundayPanel — anonymous audience Q&A for youth panels.
-- Dedicated `panel` schema in the shared SundaySuite Supabase project
-- (`public` belongs to SundayChess; turnering/harvest/market/quiz have their
-- own schemas). Idempotent: safe to run multiple times.
--
-- Security model: RLS is ENABLED on every table with NO policies — clients
-- never touch tables directly. All reads/writes go through Next.js API routes
-- using the service role (which bypasses RLS). Vote toggling goes through
-- SECURITY DEFINER RPCs so the count update is atomic.
--
-- Anonymity: `questions` carries NO identity columns whatsoever (no IP, no
-- user, no device token). The device token exists only in `votes` (to prevent
-- double-voting) and is a random client-generated UUID with no link to who
-- submitted which question.
--
-- Realtime: nothing in this schema is added to supabase_realtime. Live updates
-- are broadcast-only hints sent from the API routes (channel `p:{sessionId}`).

create schema if not exists panel;

-- ---------------------------------------------------------------- sessions
create table if not exists panel.sessions (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,            -- word code teens type/scan, e.g. KOLE-FR
  title            text not null check (char_length(title) between 1 and 120),
  mode             text not null default 'curated' check (mode in ('curated', 'open')),
  status           text not null default 'open'    check (status in ('open', 'closed')),
  organiser_code   text not null,                   -- gates all moderator actions
  live_question_id uuid,                            -- FK added below (questions defined later)
  created_at       timestamptz not null default now()
);

-- --------------------------------------------------------------- questions
create table if not exists panel.questions (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references panel.sessions(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 280),
  status     text not null default 'new'
             check (status in ('new', 'queued', 'live', 'answered', 'hidden')),
  vote_count int  not null default 0 check (vote_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists questions_session_idx
  on panel.questions (session_id, created_at desc);

-- sessions.live_question_id → questions (circular ref, so added after both
-- tables exist). Deleting the live question simply clears the projector.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_live_question_fk'
      and connamespace = 'panel'::regnamespace
  ) then
    alter table panel.sessions
      add constraint sessions_live_question_fk
      foreign key (live_question_id) references panel.questions(id)
      on delete set null;
  end if;
end $$;

-- ------------------------------------------------------------------- votes
create table if not exists panel.votes (
  question_id  uuid not null references panel.questions(id) on delete cascade,
  device_token text not null check (char_length(device_token) between 8 and 64),
  created_at   timestamptz not null default now(),
  primary key (question_id, device_token)
);

-- ------------------------------------------------------------------- RPCs
-- Atomic vote toggle. Idempotent: voting twice / unvoting an absent vote is a
-- no-op. Returns the fresh vote_count, or null if the question doesn't exist.
create or replace function panel.add_vote(p_question_id uuid, p_device_token text)
returns int
language plpgsql
security definer
set search_path = panel
as $$
declare
  v_count int;
begin
  -- Lock the question row first: guards the FK (missing id → null, not an
  -- error) and serialises concurrent toggles on the same question.
  select vote_count into v_count
    from panel.questions where id = p_question_id for update;
  if not found then
    return null;
  end if;
  insert into panel.votes (question_id, device_token)
  values (p_question_id, p_device_token)
  on conflict do nothing;
  if found then
    update panel.questions
       set vote_count = vote_count + 1
     where id = p_question_id
     returning vote_count into v_count;
  end if;
  return v_count;
end;
$$;

create or replace function panel.remove_vote(p_question_id uuid, p_device_token text)
returns int
language plpgsql
security definer
set search_path = panel
as $$
declare
  v_count int;
begin
  select vote_count into v_count
    from panel.questions where id = p_question_id for update;
  if not found then
    return null;
  end if;
  delete from panel.votes
   where question_id = p_question_id and device_token = p_device_token;
  if found then
    update panel.questions
       set vote_count = greatest(vote_count - 1, 0)
     where id = p_question_id
     returning vote_count into v_count;
  end if;
  return v_count;
end;
$$;

-- -------------------------------------------------------------------- RLS
alter table panel.sessions  enable row level security;
alter table panel.questions enable row level security;
alter table panel.votes     enable row level security;
-- No policies on purpose: only service_role (bypasses RLS) reads/writes.

-- ------------------------------------------------------------------ grants
-- Lesson from SundayHarvest deploy: a non-public schema needs explicit usage
-- + object grants, or even service_role calls 404 through PostgREST.
grant usage on schema panel to anon, authenticated, service_role;
grant all on all tables in schema panel to service_role;
grant execute on all functions in schema panel to service_role;
alter default privileges in schema panel grant all on tables to service_role;
alter default privileges in schema panel grant execute on functions to service_role;

-- Belt-and-braces: make sure anon/authenticated can't touch anything even if
-- a future migration adds permissive defaults.
-- NB: Postgres grants EXECUTE to PUBLIC on new functions by default, so the
-- revoke must hit public too — revoking from anon/authenticated alone leaves
-- the functions callable by everyone.
revoke all on all tables in schema panel from anon, authenticated;
revoke execute on all functions in schema panel from public, anon, authenticated;
alter default privileges in schema panel revoke execute on functions from public;
