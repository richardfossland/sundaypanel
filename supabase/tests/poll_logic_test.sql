-- SundayPanel poll-mode assertions, run against real Postgres by
-- scripts/test-db.sh after _prelude.sql + both migrations (each applied twice
-- for idempotency). Prints PASS lines; raises (non-zero exit) on first failure.

\set ON_ERROR_STOP on

do $$
declare
  s_id uuid;
  p_id uuid;
  r    text;
  n    int;
begin
  -- ---------------------------------------------------------- setup
  insert into panel.sessions (code, title, organiser_code)
  values ('POLL-AA', 'Pollpanel', 'HEML-IG')
  returning id into s_id;

  -- 'poll' is now a valid mode (extended CHECK)
  update panel.sessions set mode = 'poll' where id = s_id;
  if (select mode from panel.sessions where id = s_id) <> 'poll' then
    raise exception 'FAIL: could not set mode poll';
  end if;
  raise notice 'PASS: mode poll accepted';

  begin
    update panel.sessions set mode = 'bogus' where id = s_id;
    raise exception 'FAIL: bogus mode accepted';
  exception when check_violation then
    update panel.sessions set mode = 'poll' where id = s_id;
    raise notice 'PASS: bogus mode still rejected';
  end;

  insert into panel.polls (session_id, question, options)
  values (s_id, 'Tror du på Gud?', '["Ja","Nei","Usikker"]'::jsonb)
  returning id into p_id;
  raise notice 'PASS: poll created';

  -- ---------------------------------------------- constraint checks
  begin
    insert into panel.polls (session_id, question, options)
    values (s_id, '', '["Ja"]'::jsonb);
    raise exception 'FAIL: empty poll question accepted';
  exception when check_violation then
    raise notice 'PASS: empty poll question rejected';
  end;

  begin
    insert into panel.polls (session_id, question, options, status)
    values (s_id, 'ok', '["Ja"]'::jsonb, 'bogus');
    raise exception 'FAIL: bogus poll status accepted';
  exception when check_violation then
    raise notice 'PASS: bogus poll status rejected';
  end;

  -- ------------------------------------------------ casting responses
  r := panel.cast_poll_response(p_id, 'device-aaaa-1111', 'Ja');
  if r <> 'Ja' then raise exception 'FAIL: first cast should return Ja, got %', r; end if;
  r := panel.cast_poll_response(p_id, 'device-bbbb-2222', 'Nei');
  if r <> 'Nei' then raise exception 'FAIL: second device cast should return Nei, got %', r; end if;
  select count(*) into n from panel.poll_responses where poll_id = p_id;
  if n <> 2 then raise exception 'FAIL: expected 2 responses, got %', n; end if;
  raise notice 'PASS: two devices cast distinct responses';

  -- same device changing its mind → still ONE row (dedup), updated choice
  r := panel.cast_poll_response(p_id, 'device-aaaa-1111', 'Usikker');
  if r <> 'Usikker' then raise exception 'FAIL: re-cast should return Usikker, got %', r; end if;
  select count(*) into n from panel.poll_responses where poll_id = p_id;
  if n <> 2 then raise exception 'FAIL: re-cast must not add a row, got % rows', n; end if;
  if (select choice from panel.poll_responses
        where poll_id = p_id and device_token = 'device-aaaa-1111') <> 'Usikker' then
    raise exception 'FAIL: re-cast did not update choice';
  end if;
  raise notice 'PASS: one-vote dedup, re-cast updates choice in place';

  -- invalid option is rejected (null), no row written / changed
  if panel.cast_poll_response(p_id, 'device-cccc-3333', 'Kanskje') is not null then
    raise exception 'FAIL: invalid choice should return null';
  end if;
  if exists (select 1 from panel.poll_responses
               where poll_id = p_id and device_token = 'device-cccc-3333') then
    raise exception 'FAIL: invalid choice must not write a row';
  end if;
  raise notice 'PASS: invalid option rejected, no row written';

  -- missing poll → null
  if panel.cast_poll_response(gen_random_uuid(), 'device-aaaa-1111', 'Ja') is not null then
    raise exception 'FAIL: cast on missing poll should return null';
  end if;
  raise notice 'PASS: cast on missing poll returns null';

  -- closed poll refuses new + changed votes
  update panel.polls set status = 'closed' where id = p_id;
  if panel.cast_poll_response(p_id, 'device-dddd-4444', 'Ja') is not null then
    raise exception 'FAIL: cast on closed poll should return null';
  end if;
  if panel.cast_poll_response(p_id, 'device-aaaa-1111', 'Ja') is not null then
    raise exception 'FAIL: re-cast on closed poll should return null';
  end if;
  if (select choice from panel.poll_responses
        where poll_id = p_id and device_token = 'device-aaaa-1111') <> 'Usikker' then
    raise exception 'FAIL: closed poll must not change existing choice';
  end if;
  raise notice 'PASS: closed poll refuses casts and preserves choices';

  -- ------------------------------------------ active poll FK on delete
  update panel.polls set status = 'open' where id = p_id;
  update panel.sessions set active_poll_id = p_id where id = s_id;
  delete from panel.polls where id = p_id;
  if (select active_poll_id from panel.sessions where id = s_id) is not null then
    raise exception 'FAIL: deleting active poll should null active_poll_id';
  end if;
  raise notice 'PASS: active poll FK on delete set null';

  -- session delete cascades polls + responses
  insert into panel.polls (session_id, question, options)
  values (s_id, 'Q?', '["A","B"]'::jsonb) returning id into p_id;
  perform panel.cast_poll_response(p_id, 'device-eeee-5555', 'A');
  delete from panel.sessions where id = s_id;
  if exists (select 1 from panel.polls where session_id = s_id) then
    raise exception 'FAIL: polls should cascade on session delete';
  end if;
  if exists (select 1 from panel.poll_responses where poll_id = p_id) then
    raise exception 'FAIL: poll_responses should cascade with polls';
  end if;
  raise notice 'PASS: session delete cascades polls + responses';
end $$;

-- ----------------------------------------------------- RLS lockout (anon)
insert into panel.sessions (code, title, organiser_code)
values ('PLCK-DN', 'Poll-RLS-test', 'XXXX-YY');

set role anon;
do $$
begin
  begin
    perform * from panel.polls;
    raise exception 'FAIL: anon could select panel.polls';
  exception when insufficient_privilege then
    raise notice 'PASS: anon select on polls denied';
  end;
  begin
    perform * from panel.poll_responses;
    raise exception 'FAIL: anon could select panel.poll_responses';
  exception when insufficient_privilege then
    raise notice 'PASS: anon select on poll_responses denied';
  end;
  begin
    perform panel.cast_poll_response(gen_random_uuid(), 'device-anon-0000', 'Ja');
    raise exception 'FAIL: anon could execute panel.cast_poll_response';
  exception when insufficient_privilege then
    raise notice 'PASS: anon execute cast_poll_response denied';
  end;
end $$;
reset role;

-- service_role must be able to drive the whole poll flow.
set role service_role;
do $$
declare
  s_id uuid;
  p_id uuid;
begin
  insert into panel.sessions (code, title, organiser_code, mode)
  values ('PSRV-OK', 'Poll-service', 'AAAA-BB', 'poll') returning id into s_id;
  insert into panel.polls (session_id, question, options)
  values (s_id, 'service?', '["Ja","Nei"]'::jsonb) returning id into p_id;
  if panel.cast_poll_response(p_id, 'device-srv-0001', 'Ja') <> 'Ja' then
    raise exception 'FAIL: service_role cast_poll_response broken';
  end if;
  delete from panel.sessions where id = s_id;
  raise notice 'PASS: service_role full poll access';
end $$;
reset role;

select 'ALL POLL-LOGIC TESTS PASSED' as result;
