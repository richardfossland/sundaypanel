#!/usr/bin/env node
// End-to-end smoke test for SundayPanel against a running instance.
//   BASE=http://localhost:3000 node scripts/smoke.mjs
// Exercises: create → resolve code → submit ×3 → vote (+dupe) → moderator
// show/queue/answer/hide/mode/close → negative tests (wrong code, closed
// session, over-long body, hidden stripped from public state).
// NOTE: creates a real session; there is no delete API, so it leaves one
// closed session named "Røyktest …" behind (harmless, but visible in DB).

const BASE = process.env.BASE ?? "http://localhost:3000";
let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

const DEVICE_A = "smoke-device-aaaa";
const DEVICE_B = "smoke-device-bbbb";

console.log(`Smoke test against ${BASE}`);

// ---- create ---------------------------------------------------------------
let r = await api("POST", "/api/session", {
  title: `Røyktest ${new Date().toISOString()}`,
});
check("create session", r.status === 200 && r.data?.session?.id, JSON.stringify(r.data));
const sid = r.data.session.id;
const code = r.data.session.code;
const ok = r.data.organiserCode;
check("organiser code present", typeof ok === "string" && ok.length >= 6);

r = await api("GET", `/api/session?code=${encodeURIComponent(code)}`);
check("resolve code", r.status === 200 && r.data?.session?.id === sid);
check("organiser code NOT leaked publicly", !("organiser_code" in (r.data?.session ?? {})) && !("organiserCode" in (r.data ?? {})));

r = await api("GET", `/api/session?code=ZZZZ-ZZ`);
check("unknown code → 404", r.status === 404);

// ---- submit ---------------------------------------------------------------
const qids = [];
for (const text of ["Hvorfor tillater Gud lidelse?", "Hva er bønn egentlig?", "Tuller dere noen gang i panelet?"]) {
  r = await api("POST", "/api/question", { sessionId: sid, body: text, deviceToken: DEVICE_A });
  check(`submit «${text.slice(0, 20)}…»`, r.status === 200 && r.data?.question?.id);
  qids.push(r.data?.question?.id);
}

r = await api("POST", "/api/question", { sessionId: sid, body: "x".repeat(281), deviceToken: DEVICE_A });
check("over-long body → 400", r.status === 400);

r = await api("POST", "/api/question", { sessionId: sid, body: "", deviceToken: DEVICE_A });
check("empty body → 400", r.status === 400);

// ---- vote -----------------------------------------------------------------
r = await api("POST", "/api/vote", { questionId: qids[0], deviceToken: DEVICE_A, on: true });
check("vote", r.status === 200 && r.data?.voteCount === 1, JSON.stringify(r.data));
r = await api("POST", "/api/vote", { questionId: qids[0], deviceToken: DEVICE_A, on: true });
check("duplicate vote stays 1", r.status === 200 && r.data?.voteCount === 1);
r = await api("POST", "/api/vote", { questionId: qids[0], deviceToken: DEVICE_B, on: true });
check("second device → 2", r.status === 200 && r.data?.voteCount === 2);
r = await api("POST", "/api/vote", { questionId: qids[0], deviceToken: DEVICE_B, on: false });
check("unvote → 1", r.status === 200 && r.data?.voteCount === 1);

// ---- moderator ------------------------------------------------------------
r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: "FEIL-KO", action: "show", questionId: qids[0] });
check("wrong organiser code → 403", r.status === 403);

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "show", questionId: qids[0] });
check("show question", r.status === 200 && r.data?.liveQuestionId === qids[0]);

r = await api("GET", `/api/state?sessionId=${sid}`);
check("public state has live id", r.data?.session?.live_question_id === qids[0]);
check("live question status", r.data?.questions?.find((q) => q.id === qids[0])?.status === "live");

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "show", questionId: qids[1] });
check("switch live question", r.status === 200 && r.data?.liveQuestionId === qids[1]);
r = await api("GET", `/api/state?sessionId=${sid}`);
check("previous live back to new", r.data?.questions?.find((q) => q.id === qids[0])?.status === "new");

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "queue", questionId: qids[2], on: true });
check("queue", r.status === 200);

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "answer", questionId: qids[1] });
check("answer live question", r.status === 200);
r = await api("GET", `/api/state?sessionId=${sid}`);
check("answer clears live", r.data?.session?.live_question_id === null);
check("answered status", r.data?.questions?.find((q) => q.id === qids[1])?.status === "answered");

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "hide", questionId: qids[0], on: true });
check("hide", r.status === 200);
r = await api("GET", `/api/state?sessionId=${sid}`);
check("hidden stripped from public state", !r.data?.questions?.some((q) => q.id === qids[0]));
r = await api("GET", `/api/state?sessionId=${sid}&organiserCode=${encodeURIComponent(ok)}`);
check("hidden visible for moderator", r.data?.questions?.find((q) => q.id === qids[0])?.status === "hidden");

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "show", questionId: qids[0] });
check("show hidden → 409", r.status === 409);

r = await api("POST", "/api/vote", { questionId: qids[0], deviceToken: DEVICE_B, on: true });
check("vote on hidden → 404", r.status === 404);

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "mode", mode: "open" });
check("switch to open mode", r.status === 200 && r.data?.mode === "open");

// ---- live poll mode -------------------------------------------------------
r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "mode", mode: "poll" });
check("switch to poll mode", r.status === 200 && r.data?.mode === "poll");

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "poll", pollAction: "create", question: "Tror du på Gud?", options: ["Ja", "Nei", "Usikker"] });
check("create poll", r.status === 200 && Array.isArray(r.data?.poll?.options));
const pollId = r.data?.poll?.id;

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "poll", pollAction: "create", question: "x", options: ["bare ett"] });
check("create poll w/ 1 option → 400", r.status === 400);

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "poll", pollAction: "show", pollId });
check("show poll on board", r.status === 200 && r.data?.activePollId === pollId);

r = await api("GET", `/api/state?sessionId=${sid}`);
check("public state has active poll w/ tally", r.data?.session?.active_poll_id === pollId && r.data?.activePoll?.total === 0);

r = await api("POST", "/api/poll-vote", { pollId, deviceToken: DEVICE_A, choice: "Ja" });
check("cast poll vote", r.status === 200 && r.data?.choice === "Ja");
r = await api("POST", "/api/poll-vote", { pollId, deviceToken: DEVICE_A, choice: "Nei" });
check("re-cast updates choice", r.status === 200 && r.data?.choice === "Nei");
r = await api("POST", "/api/poll-vote", { pollId, deviceToken: DEVICE_B, choice: "Ja" });
check("second device votes", r.status === 200);

r = await api("POST", "/api/poll-vote", { pollId, deviceToken: DEVICE_B, choice: "Kanskje" });
check("invalid choice rejected (409)", r.status === 409);

r = await api("GET", `/api/state?sessionId=${sid}`);
check("tally aggregates: Ja=1 Nei=1 total=2", r.data?.activePoll?.counts?.Ja === 1 && r.data?.activePoll?.counts?.Nei === 1 && r.data?.activePoll?.total === 2);

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "poll", pollAction: "close", pollId });
check("close poll", r.status === 200 && r.data?.status === "closed");
r = await api("POST", "/api/poll-vote", { pollId, deviceToken: "device-cccc-99999", choice: "Ja" });
check("vote on closed poll → 409", r.status === 409);

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "poll", pollAction: "show", pollId: null });
check("clear poll from board", r.status === 200 && r.data?.activePollId === null);

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: "FEIL-KO", action: "poll", pollAction: "create", question: "q", options: ["a", "b"] });
check("poll create w/ wrong organiser code → 403", r.status === 403);

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "mode", mode: "open" });
check("back to open mode", r.status === 200);

r = await api("POST", "/api/moderator", { sessionId: sid, organiserCode: ok, action: "status", status: "closed" });
check("close submissions", r.status === 200);
r = await api("POST", "/api/question", { sessionId: sid, body: "for sent?", deviceToken: DEVICE_B });
check("submit after close → 409", r.status === 409);
r = await api("POST", "/api/vote", { questionId: qids[2], deviceToken: DEVICE_B, on: true });
check("vote after close → 409", r.status === 409);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
