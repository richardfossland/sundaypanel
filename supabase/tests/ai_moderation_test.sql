-- SundayPanel AI-moderation assertions, run against real Postgres by
-- scripts/test-db.sh after migration 0003 (applied twice for idempotency).
-- Verifies the additive columns, their constraints, the partial cluster index,
-- and that anon still can't touch the table. Prints PASS lines; raises on first
-- failure.

\set ON_ERROR_STOP on

do $$
declare
  s_id uuid;
  q1   uuid;
begin
  -- ---------------------------------------------------------- setup
  insert into panel.sessions (code, title, organiser_code)
  values ('AIMD-TS', 'AI-test', 'AAAA-BB') returning id into s_id;
  insert into panel.questions (session_id, body) values (s_id, 'Hva er dåp?')
    returning id into q1;

  -- columns exist and default NULL ---------------------------------
  if (select cluster_id from panel.questions where id = q1) is not null
     or (select flag_reason from panel.questions where id = q1) is not null
     or (select suggested_body from panel.questions where id = q1) is not null then
    raise exception 'FAIL: new AI columns should default NULL';
  end if;
  raise notice 'PASS: cluster_id/flag_reason/suggested_body exist + default NULL';

  -- a normal AI patch is accepted ----------------------------------
  update panel.questions
     set cluster_id = gen_random_uuid(),
         flag_reason = 'useriøst, utenfor tema',
         suggested_body = 'Hva betyr dåp?'
   where id = q1;
  raise notice 'PASS: valid AI suggestion patch accepted';

  -- clearing back to NULL (re-run / dismiss) is accepted -----------
  update panel.questions
     set cluster_id = null, flag_reason = null, suggested_body = null
   where id = q1;
  raise notice 'PASS: AI columns can be cleared (re-run replaces stale)';

  -- flag_reason length guard ---------------------------------------
  begin
    update panel.questions set flag_reason = repeat('x', 201) where id = q1;
    raise exception 'FAIL: 201-char flag_reason accepted';
  exception when check_violation then
    raise notice 'PASS: over-long flag_reason rejected (<=200)';
  end;

  begin
    update panel.questions set flag_reason = '' where id = q1;
    raise exception 'FAIL: empty flag_reason accepted';
  exception when check_violation then
    raise notice 'PASS: empty flag_reason rejected';
  end;

  -- suggested_body length guard ------------------------------------
  begin
    update panel.questions set suggested_body = repeat('y', 281) where id = q1;
    raise exception 'FAIL: 281-char suggested_body accepted';
  exception when check_violation then
    raise notice 'PASS: over-long suggested_body rejected (<=280)';
  end;

  -- the original body constraint is untouched by the migration -----
  begin
    insert into panel.questions (session_id, body) values (s_id, repeat('z', 281));
    raise exception 'FAIL: 281-char body accepted post-0003';
  exception when check_violation then
    raise notice 'PASS: original body constraint still enforced';
  end;

  -- partial cluster index present ----------------------------------
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'panel' and indexname = 'questions_cluster_idx'
  ) then
    raise exception 'FAIL: questions_cluster_idx missing';
  end if;
  raise notice 'PASS: questions_cluster_idx present';

  delete from panel.sessions where id = s_id;
end $$;

-- anon still locked out of the (now wider) questions table ----------
insert into panel.sessions (code, title, organiser_code)
values ('AILK-DN', 'AI-RLS', 'XXXX-YY');

set role anon;
do $$
begin
  begin
    perform cluster_id from panel.questions;
    raise exception 'FAIL: anon could read AI columns on panel.questions';
  exception when insufficient_privilege then
    raise notice 'PASS: anon select on questions (incl. AI cols) denied';
  end;
end $$;
reset role;

select 'ALL AI-MODERATION TESTS PASSED' as result;
