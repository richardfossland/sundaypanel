"use client";

import { useEffect, useMemo, useState, use } from "react";
import QRCode from "qrcode";
import { useSessionState } from "@/lib/client/useSessionState";
import type { PollResults } from "@/lib/types";

export default function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state } = useSessionState(id);
  const [qr, setQr] = useState<string | null>(null);

  const code = state?.session.code;
  useEffect(() => {
    if (!code) return;
    const url = `${window.location.origin}/sporsmal/${encodeURIComponent(code)}`;
    QRCode.toDataURL(url, { margin: 1, width: 360 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [code]);

  const live = useMemo(() => {
    if (!state?.session.live_question_id) return null;
    return (
      state.questions.find((q) => q.id === state.session.live_question_id) ??
      null
    );
  }, [state]);

  // Wall: everything non-hidden except the highlighted one, hottest first.
  const wall = useMemo(() => {
    const list = (state?.questions ?? []).filter(
      (q) => q.id !== live?.id && q.status !== "answered",
    );
    return [...list].sort(
      (a, b) =>
        b.vote_count - a.vote_count || b.created_at.localeCompare(a.created_at),
    );
  }, [state, live]);

  if (!state)
    return (
      <main className="board">
        <p className="muted">Laster…</p>
      </main>
    );

  const s = state.session;

  return (
    <main className="board">
      <header className="board-head">
        <h1 className="board-title">{s.title}</h1>
        <div className="board-join">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR-kode for å bli med: ${s.code}`} />
          )}
          <div>
            <div className="code">{s.code}</div>
            <div className="url">panel.sundaysuite.app</div>
            {s.status === "closed" && <div className="url">Innsending stengt</div>}
          </div>
        </div>
      </header>

      {s.mode === "poll" ? (
        <section className="board-poll">
          {state.activePoll ? (
            <PollBoard results={state.activePoll} />
          ) : (
            <p className="board-empty">
              Avstemning kommer — skann QR-koden eller gå til
              panel.sundaysuite.app og bruk koden {s.code}
            </p>
          )}
        </section>
      ) : s.mode === "curated" ? (
        <section className="board-live">
          {live ? (
            <blockquote className={live.body.length > 90 ? "long" : ""}>
              «{live.body}»
            </blockquote>
          ) : (
            <p className="board-empty">
              Send inn ditt spørsmål — skann QR-koden eller gå til
              panel.sundaysuite.app og bruk koden {s.code}
            </p>
          )}
        </section>
      ) : (
        <>
          {live && (
            <section className="board-highlight">
              <blockquote>«{live.body}»</blockquote>
            </section>
          )}
          <section className="wall">
            {wall.map((q) => (
              <div className="qcard" key={q.id}>
                {q.body}
                {q.vote_count > 0 && <div className="votes">👍 {q.vote_count}</div>}
              </div>
            ))}
            {wall.length === 0 && !live && (
              <p className="board-empty">Ingen spørsmål ennå — bli den første!</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

/** Live bar chart for the active poll. Bars scale to the leading option so
 * the result is readable from across a room; each row shows the option, its
 * share, and the raw count. Driven entirely by the refetched tally — the
 * server is the source of truth, this only theatricalises it. */
function PollBoard({ results }: { results: PollResults }) {
  const { poll, counts, total } = results;
  const max = Math.max(1, ...poll.options.map((o) => counts[o] ?? 0));
  return (
    <div className="poll">
      <h2 className="poll-q">{poll.question}</h2>
      <div className="poll-bars">
        {poll.options.map((opt) => {
          const c = counts[opt] ?? 0;
          const pct = total > 0 ? Math.round((c / total) * 100) : 0;
          const lead = c > 0 && c === max;
          return (
            <div className={`poll-row${lead ? " poll-row--lead" : ""}`} key={opt}>
              <div className="poll-row-head">
                <span className="poll-opt">{opt}</span>
                <span className="poll-pct">
                  {pct}% <span className="poll-count">({c})</span>
                </span>
              </div>
              <div className="poll-track">
                <div
                  className="poll-fill"
                  style={{ width: `${(c / max) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="poll-total">
        {total} {total === 1 ? "svar" : "svar"}
        {poll.status === "closed" && " · Avstemning lukket"}
      </p>
    </div>
  );
}
