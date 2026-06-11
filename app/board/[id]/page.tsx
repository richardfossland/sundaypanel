"use client";

import { useEffect, useMemo, useState, use } from "react";
import QRCode from "qrcode";
import { useSessionState } from "@/lib/client/useSessionState";

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

      {s.mode === "curated" ? (
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
