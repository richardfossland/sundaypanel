-- SundayPanel — AI-assisted moderation + question clustering.
-- Additive, idempotent columns on panel.questions. The AI pass NEVER auto-hides
-- or mutates `status` — a human moderator decides. These columns only carry
-- *suggestions* surfaced in the moderator UI:
--
--   cluster_id     uuid  — questions the model judged semantically similar share
--                          a cluster_id; the moderator page collapses them into
--                          one card with a count. NULL = standalone question.
--   flag_reason    text  — short Norwegian reason the model flagged the question
--                          as likely inappropriate/troll/off-topic. NULL = clean.
--                          Renders as a SOFT "foreslått skjult" badge, not a hide.
--   suggested_body text  — an optional neutral rephrase the moderator may accept.
--                          NULL = no suggestion. The original `body` is untouched.
--
-- Anonymity is preserved: only question BODIES are ever sent to the model, never
-- device tokens (which live solely in panel.votes). These columns add no identity.
--
-- Safe to run multiple times. RLS/grants are inherited from 0001 (the table is
-- already locked down; service_role default privileges cover new columns).

alter table panel.questions add column if not exists cluster_id     uuid;
alter table panel.questions add column if not exists flag_reason    text;
alter table panel.questions add column if not exists suggested_body text;

-- Guard rails on the new free-text columns (the model output is sanitised in the
-- API route too, but the DB is the last line of defence). Add constraints only
-- once, and only after backfilling any rogue rows to within bounds.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'questions_flag_reason_len'
      and connamespace = 'panel'::regnamespace
  ) then
    alter table panel.questions
      add constraint questions_flag_reason_len
      check (flag_reason is null or char_length(flag_reason) between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'questions_suggested_body_len'
      and connamespace = 'panel'::regnamespace
  ) then
    alter table panel.questions
      add constraint questions_suggested_body_len
      check (suggested_body is null or char_length(suggested_body) between 1 and 280);
  end if;
end $$;

-- Cluster lookups when the moderator page groups questions.
create index if not exists questions_cluster_idx
  on panel.questions (session_id, cluster_id)
  where cluster_id is not null;
