-- SundayPanel — tie a panel session to a Sunday Account host (optional).
--
-- Adds a NULLABLE owner_id to panel.sessions so a logged-in arrangør/host can
-- list and delete the panels they created ("Mine paneler" dashboard). The
-- column is the host's Sunday Account user id (auth.users.id from the ISSUER /
-- identity Supabase project — a DIFFERENT project than this data project), so
-- there is NO foreign key here: auth.users lives in another database. It is
-- just an opaque uuid we stamp from the verified server-side session.
--
-- ANONYMITY / ANONYMOUS PLAY UNCHANGED:
--   * owner_id is NULLABLE and defaults to null. Anonymous create (no login)
--     keeps inserting a session with owner_id = null and works exactly as
--     before — the organiser_code is still the only thing that gates control.
--   * No identity is added to questions/votes/poll_responses. Only the session
--     row gains an optional owner link, never the audience's submissions.
--
-- DELETE CASCADE: panel.questions, panel.votes, panel.polls and
-- panel.poll_responses all reference panel.sessions(id) ON DELETE CASCADE
-- (migrations 0001/0002), and sessions.live_question_id / active_poll_id are
-- ON DELETE SET NULL. So deleting a session row removes all its children in one
-- statement — the owner-gated DELETE route relies on exactly this.
--
-- Idempotent + additive: safe to run multiple times, never rewrites 0001 data.

alter table panel.sessions
  add column if not exists owner_id uuid;

-- Index the owner so the "my panels" query (owner_id = $host) is cheap.
create index if not exists sessions_owner_idx
  on panel.sessions (owner_id, created_at desc)
  where owner_id is not null;

-- Same grant discipline as the earlier migrations: only service_role touches
-- the table (RLS on, no policies). Re-assert so a fresh apply is self-contained.
grant all on all tables in schema panel to service_role;
revoke all on all tables in schema panel from anon, authenticated;
