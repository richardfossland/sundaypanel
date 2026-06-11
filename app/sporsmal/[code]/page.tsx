"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { getJson, postJson, humanError } from "@/lib/client/api";
import {
  deviceToken,
  myQuestionIds,
  rememberMyQuestion,
  votedIds,
  setVoted,
} from "@/lib/client/device";
import { useSessionState } from "@/lib/client/useSessionState";
import type { PublicSession, Question } from "@/lib/types";

const MAX = 280;

export default function AudiencePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ session: PublicSession }>(
      `/api/session?code=${encodeURIComponent(code)}`,
    )
      .then((d) => setSession(d.session))
      .catch((e) => setLoadErr(humanError(e)));
  }, [code]);

  const { state, refetch } = useSessionState(session?.id ?? null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sentFlash, setSentFlash] = useState(false);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [voted, setVotedState] = useState<Set<string>>(new Set());

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- read localStorage post-mount */
    setMine(myQuestionIds());
    setVotedState(votedIds());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSending(true);
    setSendErr(null);
    try {
      const d = await postJson<{ question: Question }>("/api/question", {
        sessionId: session.id,
        body: text,
        deviceToken: deviceToken(),
      });
      rememberMyQuestion(d.question.id);
      setMine(myQuestionIds());
      setText("");
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 2500);
      refetch();
    } catch (err) {
      setSendErr(humanError(err));
    } finally {
      setSending(false);
    }
  }

  async function toggleVote(q: Question) {
    const on = !voted.has(q.id);
    setVoted(q.id, on);
    setVotedState(votedIds());
    try {
      await postJson("/api/vote", {
        questionId: q.id,
        deviceToken: deviceToken(),
        on,
      });
      refetch();
    } catch {
      setVoted(q.id, !on); // roll back optimistic toggle
      setVotedState(votedIds());
    }
  }

  const questions = useMemo(() => {
    const list = (state?.questions ?? []).filter((q) => q.status !== "answered");
    return [...list].sort(
      (a, b) =>
        b.vote_count - a.vote_count || b.created_at.localeCompare(a.created_at),
    );
  }, [state]);

  if (loadErr)
    return (
      <main className="page">
        <p className="error">{loadErr}</p>
        <Link href="/">← Til forsiden</Link>
      </main>
    );
  if (!session)
    return (
      <main className="page">
        <p className="muted">Laster…</p>
      </main>
    );

  const closed = (state?.session.status ?? session.status) === "closed";

  return (
    <main className="page">
      <Link className="brand" href="/">
        SundayPanel
      </Link>
      <h1 style={{ margin: "4px 0 2px" }}>{session.title}</h1>
      <p className="muted">Spørsmålene dine er helt anonyme.</p>

      <section className="card">
        {closed ? (
          <p className="muted">Innsendingen er stengt.</p>
        ) : (
          <form onSubmit={submit}>
            <textarea
              className="field"
              placeholder="Skriv spørsmålet ditt…"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              maxLength={MAX}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted" style={{ flex: 1 }}>
                {text.length}/{MAX}
              </span>
              <button className="btn" disabled={sending || !text.trim()}>
                Send inn
              </button>
            </div>
            {sentFlash && <p style={{ color: "var(--good)", margin: "8px 0 0" }}>Sendt! 🙌</p>}
            {sendErr && <p className="error">{sendErr}</p>}
          </form>
        )}
      </section>

      <h2 style={{ fontSize: "1.05rem" }}>Spørsmål ({questions.length})</h2>
      <ul className="qlist">
        {questions.map((q) => (
          <li key={q.id} className={`qitem${q.status === "live" ? " qitem--live" : ""}`}>
            <div className="qbody">
              <p className="qtext">{q.body}</p>
              <div className="qmeta">
                {q.status === "live" && <span className="tag tag--live">På skjermen</span>}
                {mine.has(q.id) && <span className="tag tag--mine">Ditt</span>}
              </div>
            </div>
            <button
              className={`votebtn${voted.has(q.id) ? " votebtn--on" : ""}`}
              onClick={() => toggleVote(q)}
              disabled={closed}
              aria-label="Stem opp"
            >
              <span>👍</span>
              <span>{q.vote_count}</span>
            </button>
          </li>
        ))}
        {questions.length === 0 && (
          <li className="muted">Ingen spørsmål ennå — bli den første!</li>
        )}
      </ul>
    </main>
  );
}
