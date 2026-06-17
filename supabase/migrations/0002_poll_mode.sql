-- SundayPanel — live poll / voting mode for the big screen.
--
-- A third board mode 'poll' alongside 'curated' and 'open'. The moderator
-- pushes a quick poll (Ja/Nei/Usikker or a short option list) to every phone;
-- results fill in live on the board, driven by the same broadcast-hint +
-- refetch realtime the rest of the app already uses.
--
-- Mirrors the existing votes model exactly:
--   * panel.poll_responses uses (poll_id, device_token) as PK for one-vote
--     dedup, exactly like panel.votes uses (question_id, device_token).
--   * panel.cast_poll_response is an atomic SECURITY DEFINER RPC modelled on
--     panel.add_vote — it locks the poll row first, validates the choice
--     against the poll's option set, and upserts the response (a device can
--     change its mind; one row per device is preserved).
--
-- Anonymity is UNCHANGED: device_token is the same random client UUID used for
-- vote dedup, never linked to identity, and lives only in the dedup table.
--
-- Idempotent + additive: safe to run multiple times, never touches 0001 data.

-- ------------------------------------------------ extend sessions.mode + col
-- 'poll' becomes a valid board mode. The CHECK from 0001 must be replaced; do
-- it guarded so re-running is a no-op and existing rows are untouched.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'sessions_mode_check'
      and connamespace = 'panel'::regnamespace
  ) then
    alter table panel.sessions drop constraint sessions_mode_check;
  end if;
  alter table panel.sessions
    add constraint sessions_mode_check
    check (mode in ('curated', 'open', 'poll'));
end $$;

-- Which poll (if any) is currently on the big screen. Cleared (set null) when
-- the moderator stops showing a poll or the poll is deleted.
alter table panel.sessions
  add column if not exists active_poll_id uuid;

-- ------------------------------------------------------------------- polls
create table if not exists panel.polls (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references panel.sessions(id) on delete cascade,
  question   text not null check (char_length(question) between 1 and 200),
  -- Ordered option list, e.g. ["Ja","Nei","Usikker"]. Validated in the API
  -- route (2–8 non-empty strings); the RPC enforces choice ∈ options.
  options    jsonb not null,
  status     text not null default 'open'
             check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists polls_session_idx
  on panel.polls (session_id, created_at desc);

-- sessions.active_poll_id → polls (circular ref, added after both tables
-- exist). Deleting the active poll simply clears the projector.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_active_poll_fk'
      and connamespace = 'panel'::regnamespace
  ) then
    alter table panel.sessions
      add constraint sessions_active_poll_fk
      foreign key (active_poll_id) references panel.polls(id)
      on delete set null;
  end if;
end $$;

-- --------------------------------------------------------- poll_responses
-- One row per device per poll → PK(poll_id, device_token) gives the same
-- one-vote dedup the votes table gets from PK(question_id, device_token).
-- `choice` is the option string the device picked.
create table if not exists panel.poll_responses (
  poll_id      uuid not null references panel.polls(id) on delete cascade,
  device_token text not null check (char_length(device_token) between 8 and 64),
  choice       text not null,
  created_at   timestamptz not null default now(),
  primary key (poll_id, device_token)
);

create index if not exists poll_responses_poll_idx
  on panel.poll_responses (poll_id);

-- ------------------------------------------------------------------- RPC
-- Atomic single-vote cast for a poll, modelled on panel.add_vote.
--   * Locks the poll row first (FOR UPDATE): a missing poll → null (not an
--     error), and serialises concurrent casts.
--   * Refuses closed polls (returns null) and invalid choices (returns null)
--     so a malicious client can't stuff an arbitrary `choice` string.
--   * Upserts on the (poll_id, device_token) PK: a device may change its
--     answer while the poll is open; still exactly one row per device.
-- Returns the device's recorded choice on success, or null on any rejection.
create or replace function panel.cast_poll_response(
  p_poll_id uuid,
  p_device_token text,
  p_choice text
)
returns text
language plpgsql
security definer
set search_path = panel
as $$
declare
  v_status  text;
  v_options jsonb;
begin
  select status, options into v_status, v_options
    from panel.polls where id = p_poll_id for update;
  if not found then
    return null;            -- unknown poll
  end if;
  if v_status <> 'open' then
    return null;            -- voting closed
  end if;
  -- choice must be one of the poll's declared options
  if not (v_options ? p_choice) then
    return null;            -- invalid option
  end if;

  insert into panel.poll_responses (poll_id, device_token, choice)
  values (p_poll_id, p_device_token, p_choice)
  on conflict (poll_id, device_token)
  do update set choice = excluded.choice, created_at = now();

  return p_choice;
end;
$$;

-- ------------------------------------------------------------------- RLS
alter table panel.polls          enable row level security;
alter table panel.poll_responses enable row level security;
-- No policies on purpose: only service_role (bypasses RLS) reads/writes.

-- ------------------------------------------------------------------ grants
-- Same discipline as 0001: explicit grants to service_role, lock anon out.
grant all on all tables in schema panel to service_role;
grant execute on all functions in schema panel to service_role;

revoke all on all tables in schema panel from anon, authenticated;
revoke execute on all functions in schema panel from public, anon, authenticated;
