-- SundayPanel logic assertions, run against real Postgres by scripts/test-db.sh
-- after _prelude.sql + the migration (applied twice for idempotency).
-- Prints PASS lines; raises (non-zero exit) on the first failure.

\set ON_ERROR_STOP on

do $$
declare
  s_id uuid;
  q1   uuid;
  q2   uuid;
  n    int;
begin
  -- ---------------------------------------------------------- setup
  insert into panel.sessions (code, title, organiser_code)
  values ('TEST-AB', 'Testpanel', 'HEML-IG')
  returning id into s_id;

  insert into panel.questions (session_id, body) values (s_id, 'Hvorfor finnes ondskap?') returning id into q1;
  insert into panel.questions (session_id, body) values (s_id, 'Hva er nåde?') returning id into q2;
  raise notice 'PASS: setup session + 2 questions';

  -- ---------------------------------------------- constraint checks
  begin
    insert into panel.questions (session_id, body) values (s_id, '');
    raise exception 'FAIL: empty question body accepted';
  exception when check_violation then
    raise notice 'PASS: empty body rejected';
  end;

  begin
    insert into panel.questions (session_id, body) values (s_id, repeat('x', 281));
    raise exception 'FAIL: 281-char body accepted';
  exception when check_violation then
    raise notice 'PASS: over-long body rejected';
  end;

  begin
    insert into panel.questions (session_id, body, status) values (s_id, 'ok', 'bogus');
    raise exception 'FAIL: bogus status accepted';
  exception when check_violation then
    raise notice 'PASS: bogus status rejected';
  end;

  begin
    update panel.sessions set mode = 'bogus' where id = s_id;
    raise exception 'FAIL: bogus mode accepted';
  exception when check_violation then
    raise notice 'PASS: bogus mode rejected';
  end;

  -- ------------------------------------------------- vote toggling
  n := panel.add_vote(q1, 'device-aaaa-1111');
  if n <> 1 then raise exception 'FAIL: first vote should give count 1, got %', n; end if;
  n := panel.add_vote(q1, 'device-aaaa-1111');
  if n <> 1 then raise exception 'FAIL: duplicate vote should stay 1, got %', n; end if;
  n := panel.add_vote(q1, 'device-bbbb-2222');
  if n <> 2 then raise exception 'FAIL: second device should give 2, got %', n; end if;
  raise notice 'PASS: add_vote atomic + idempotent';

  n := panel.remove_vote(q1, 'device-aaaa-1111');
  if n <> 1 then raise exception 'FAIL: unvote should give 1, got %', n; end if;
  n := panel.remove_vote(q1, 'device-aaaa-1111');
  if n <> 1 then raise exception 'FAIL: double unvote should stay 1, got %', n; end if;
  n := panel.remove_vote(q1, 'device-cccc-3333');
  if n <> 1 then raise exception 'FAIL: unvote without vote should stay 1, got %', n; end if;
  raise notice 'PASS: remove_vote idempotent, never negative';

  if panel.add_vote(gen_random_uuid(), 'device-aaaa-1111') is not null then
    raise exception 'FAIL: vote on missing question should return null';
  end if;
  raise notice 'PASS: vote on missing question returns null';

  -- --------------------------------------- live question + cascade
  update panel.sessions set live_question_id = q2 where id = s_id;
  delete from panel.questions where id = q2;
  if (select live_question_id from panel.sessions where id = s_id) is not null then
    raise exception 'FAIL: deleting live question should null live_question_id';
  end if;
  raise notice 'PASS: live question FK on delete set null';

  delete from panel.sessions where id = s_id;
  if exists (select 1 from panel.questions where session_id = s_id) then
    raise exception 'FAIL: questions should cascade on session delete';
  end if;
  if exists (select 1 from panel.votes where question_id = q1) then
    raise exception 'FAIL: votes should cascade with questions';
  end if;
  raise notice 'PASS: session delete cascades questions + votes';
end $$;

-- ----------------------------------------------------- RLS lockout (anon)
-- Re-seed a row as superuser, then verify anon can't see or touch anything.
insert into panel.sessions (code, title, organiser_code)
values ('LOCK-DN', 'RLS-test', 'XXXX-YY');

set role anon;
do $$
begin
  begin
    perform * from panel.sessions;
    raise exception 'FAIL: anon could select panel.sessions';
  exception when insufficient_privilege then
    raise notice 'PASS: anon select on sessions denied';
  end;
  begin
    insert into panel.questions (session_id, body) values (gen_random_uuid(), 'hack');
    raise exception 'FAIL: anon could insert into panel.questions';
  exception when insufficient_privilege then
    raise notice 'PASS: anon insert on questions denied';
  end;
  begin
    perform panel.add_vote(gen_random_uuid(), 'device-anon-0000');
    raise exception 'FAIL: anon could execute panel.add_vote';
  exception when insufficient_privilege then
    raise notice 'PASS: anon execute add_vote denied';
  end;
end $$;
reset role;

-- service_role must be able to do everything (it's what the API routes use).
set role service_role;
do $$
declare
  s_id uuid;
  q_id uuid;
begin
  insert into panel.sessions (code, title, organiser_code)
  values ('SRVC-OK', 'Service-test', 'AAAA-BB') returning id into s_id;
  insert into panel.questions (session_id, body) values (s_id, 'service ok') returning id into q_id;
  if panel.add_vote(q_id, 'device-srv-0001') <> 1 then
    raise exception 'FAIL: service_role add_vote broken';
  end if;
  delete from panel.sessions where id = s_id;
  raise notice 'PASS: service_role full access';
end $$;
reset role;

select 'ALL PANEL-LOGIC TESTS PASSED' as result;
