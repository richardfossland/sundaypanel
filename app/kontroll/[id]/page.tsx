"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { postJson, humanError } from "@/lib/client/api";
import { useSessionState } from "@/lib/client/useSessionState";
import type { Question } from "@/lib/types";

type Tab = "alle" | "ko" | "besvart" | "skjult";
type Sort = "stemmer" | "nyeste";

export default function ControlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [organiserCode, setOrganiserCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [authErr, setAuthErr] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read stored code post-mount
    setOrganiserCode(localStorage.getItem(`panel:ok:${id}`));
  }, [id]);

  const { state, error, refetch } = useSessionState(
    organiserCode ? id : null,
    organiserCode,
  );

  // A wrong stored code surfaces as feil_arrangorkode from /api/state —
  // drop back to the code prompt instead of looping on 403s.
  useEffect(() => {
    if (error === "feil_arrangorkode") {
      localStorage.removeItem(`panel:ok:${id}`);
      /* eslint-disable react-hooks/set-state-in-effect -- back out of bad stored code */
      setOrganiserCode(null);
      setAuthErr("Feil arrangørkode.");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [error, id]);

  const [tab, setTab] = useState<Tab>("alle");
  const [sort, setSort] = useState<Sort>("stemmer");
  const [search, setSearch] = useState("");
  const [actErr, setActErr] = useState<string | null>(null);

  // AI 'Rydd opp' state.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function act(payload: Record<string, unknown>) {
    setActErr(null);
    try {
      await postJson("/api/moderator", {
        sessionId: id,
        organiserCode,
        ...payload,
      });
      refetch();
    } catch (e) {
      setActErr(humanError(e));
    }
  }

  async function runAi() {
    setActErr(null);
    setAiMsg(null);
    setAiBusy(true);
    try {
      const r = await postJson<{
        flagged: number;
        clustered: number;
        rephrased: number;
        considered: number;
      }>("/api/moderator/ai", { sessionId: id, organiserCode });
      setAiMsg(
        `AI så på ${r.considered} spørsmål: ${r.clustered} klynger, ` +
          `${r.flagged} foreslått skjult, ${r.rephrased} omformuleringer.`,
      );
      refetch();
    } catch (e) {
      setActErr(humanError(e));
    } finally {
      setAiBusy(false);
    }
  }

  function toggleExpand(clusterId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }

  const questions = useMemo(() => {
    let list = state?.questions ?? [];
    if (tab === "alle") list = list.filter((q) => q.status !== "hidden" && q.status !== "answered");
    if (tab === "ko") list = list.filter((q) => q.status === "queued" || q.status === "live");
    if (tab === "besvart") list = list.filter((q) => q.status === "answered");
    if (tab === "skjult") list = list.filter((q) => q.status === "hidden");
    const needle = search.trim().toLowerCase();
    if (needle) list = list.filter((q) => q.body.toLowerCase().includes(needle));
    return [...list].sort((a, b) => {
      if (a.status === "live") return -1;
      if (b.status === "live") return 1;
      if (sort === "stemmer")
        return b.vote_count - a.vote_count || a.created_at.localeCompare(b.created_at);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [state, tab, sort, search]);

  // Group AI-clustered questions into one card while preserving sort order: the
  // first question of each cluster anchors the group at its sorted position;
  // standalone questions (no cluster_id) are singleton groups.
  const clusters = useMemo(() => {
    const groups: Question[][] = [];
    const byCluster = new Map<string, Question[]>();
    for (const q of questions) {
      if (!q.cluster_id) {
        groups.push([q]);
        continue;
      }
      let g = byCluster.get(q.cluster_id);
      if (!g) {
        g = [];
        byCluster.set(q.cluster_id, g);
        groups.push(g); // anchor cluster at first-seen (sorted) position
      }
      g.push(q);
    }
    return groups;
  }, [questions]);

  if (!organiserCode) {
    return (
      <main className="page">
        <Link className="brand" href="/">SundayPanel</Link>
        <section className="card">
          <h2>Kontrollpanel</h2>
          <p className="muted">Skriv inn arrangørkoden for dette panelet.</p>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const code = codeInput.trim().toUpperCase();
              if (!code) return;
              localStorage.setItem(`panel:ok:${id}`, code);
              setAuthErr(null);
              setOrganiserCode(code);
            }}
          >
            <input
              className="field field--code"
              placeholder="KODE-XX"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              autoComplete="off"
            />
            <button className="btn">Lås opp</button>
          </form>
          {authErr && <p className="error">{authErr}</p>}
        </section>
      </main>
    );
  }

  if (!state)
    return (
      <main className="page page--wide">
        <p className="muted">Laster…</p>
      </main>
    );

  const s = state.session;
  const liveId = s.live_question_id;
  const counts = {
    alle: state.questions.filter((q) => q.status !== "hidden" && q.status !== "answered").length,
    ko: state.questions.filter((q) => q.status === "queued" || q.status === "live").length,
    besvart: state.questions.filter((q) => q.status === "answered").length,
    skjult: state.questions.filter((q) => q.status === "hidden").length,
  };

  return (
    <main className="page page--wide">
      <Link className="brand" href="/">SundayPanel</Link>
      <h1 style={{ margin: "4px 0 2px" }}>{s.title}</h1>
      <p className="muted">
        Panelkode <strong>{s.code}</strong> · {" "}
        <a href={`/board/${s.id}`} target="_blank">Åpne storskjerm ↗</a>
      </p>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Visningsmodus">
          <button className={s.mode === "curated" ? "on" : ""} onClick={() => act({ action: "mode", mode: "curated" })}>
            Kuratert
          </button>
          <button className={s.mode === "open" ? "on" : ""} onClick={() => act({ action: "mode", mode: "open" })}>
            Åpen vegg
          </button>
        </div>
        <div className="seg" role="group" aria-label="Innsending">
          <button className={s.status === "open" ? "on" : ""} onClick={() => act({ action: "status", status: "open" })}>
            Innsending åpen
          </button>
          <button className={s.status === "closed" ? "on" : ""} onClick={() => act({ action: "status", status: "closed" })}>
            Stengt
          </button>
        </div>
        {liveId && (
          <button className="btn--ghost btn btn--small" onClick={() => act({ action: "show", questionId: null })}>
            Tøm skjermen
          </button>
        )}
        <button
          className="btn btn--ghost btn--small"
          onClick={runAi}
          disabled={aiBusy}
          title="Bruk AI til å gruppere like spørsmål og foreslå moderering (du bestemmer alltid)"
        >
          {aiBusy ? "Rydder opp…" : "✨ Rydd opp"}
        </button>
      </div>

      <div className="toolbar">
        <input
          className="field"
          placeholder="Søk i spørsmålene…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="seg" role="group" aria-label="Sortering">
          <button className={sort === "stemmer" ? "on" : ""} onClick={() => setSort("stemmer")}>
            Flest stemmer
          </button>
          <button className={sort === "nyeste" ? "on" : ""} onClick={() => setSort("nyeste")}>
            Nyeste
          </button>
        </div>
      </div>

      <div className="tabs">
        {(
          [
            ["alle", `Innboks (${counts.alle})`],
            ["ko", `Kø (${counts.ko})`],
            ["besvart", `Besvart (${counts.besvart})`],
            ["skjult", `Skjult (${counts.skjult})`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {actErr && <p className="error">{actErr}</p>}
      {aiMsg && <p className="muted">{aiMsg}</p>}

      <ul className="qlist">
        {clusters.map((group) => {
          if (group.length === 1) {
            const q = group[0];
            return (
              <QuestionRow key={q.id} q={q} isLive={q.id === liveId} act={act} />
            );
          }
          // A real cluster: collapse into one card with a count + expand.
          const clusterId = group[0].cluster_id as string;
          const isOpen = expanded.has(clusterId);
          return (
            <li key={clusterId} className="qitem qitem--cluster">
              <div className="qbody">
                <p className="qtext">
                  <span className="tag tag--cluster">🔗 {group.length} like spørsmål</span>{" "}
                  {group[0].body}
                </p>
                <button
                  className="btn btn--ghost btn--small"
                  onClick={() => toggleExpand(clusterId)}
                >
                  {isOpen ? "Skjul gruppe" : "Vis alle"}
                </button>
                {isOpen && (
                  <ul className="qlist qlist--nested">
                    {group.map((q) => (
                      <QuestionRow key={q.id} q={q} isLive={q.id === liveId} act={act} />
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
        {clusters.length === 0 && <li className="muted">Ingen spørsmål her.</li>}
      </ul>
    </main>
  );
}

function QuestionRow({
  q,
  isLive,
  act,
}: {
  q: Question;
  isLive: boolean;
  act: (p: Record<string, unknown>) => void;
}) {
  const flagged = !!q.flag_reason;
  const cls =
    "qitem" +
    (isLive ? " qitem--live" : "") +
    (q.status === "answered" ? " qitem--answered" : "") +
    (q.status === "hidden" ? " qitem--hidden" : "") +
    (flagged ? " qitem--flagged" : "");
  return (
    <li className={cls}>
      <div className="qbody">
        <p className="qtext">{q.body}</p>
        <div className="qmeta">
          <span className="tag">👍 {q.vote_count}</span>
          {isLive && <span className="tag tag--live">På skjermen</span>}
          {q.status === "queued" && <span className="tag tag--queued">I kø</span>}
          {q.status === "answered" && <span className="tag tag--answered">Besvart</span>}
          {q.status === "hidden" && <span className="tag">Skjult</span>}
          {flagged && (
            <span className="tag tag--flag" title={q.flag_reason ?? undefined}>
              ⚠️ foreslått skjult
            </span>
          )}
        </div>
        {flagged && q.flag_reason && (
          <p className="ai-note ai-note--flag">AI: {q.flag_reason}</p>
        )}
        {q.suggested_body && (
          <div className="ai-note ai-note--rephrase">
            <span className="muted">AI foreslår:</span> «{q.suggested_body}»
            <div className="qactions">
              <button
                className="btn btn--ghost btn--small"
                onClick={() => act({ action: "rephrase", questionId: q.id })}
              >
                Bruk omformulering
              </button>
              <button
                className="btn btn--ghost btn--small"
                onClick={() => act({ action: "clearflag", questionId: q.id })}
              >
                Behold original
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="qactions">
        {q.status === "hidden" ? (
          <button className="btn btn--ghost btn--small" onClick={() => act({ action: "hide", questionId: q.id, on: false })}>
            Vis igjen
          </button>
        ) : (
          <>
            {isLive ? (
              <button className="btn btn--small" onClick={() => act({ action: "answer", questionId: q.id })}>
                Besvart ✓
              </button>
            ) : (
              <button className="btn btn--small" onClick={() => act({ action: "show", questionId: q.id })}>
                Vis på skjerm
              </button>
            )}
            {q.status === "new" && (
              <button className="btn btn--ghost btn--small" onClick={() => act({ action: "queue", questionId: q.id, on: true })}>
                + Kø
              </button>
            )}
            {q.status === "queued" && (
              <button className="btn btn--ghost btn--small" onClick={() => act({ action: "queue", questionId: q.id, on: false })}>
                − Kø
              </button>
            )}
            {q.status === "answered" ? (
              <button className="btn btn--ghost btn--small" onClick={() => act({ action: "restore", questionId: q.id })}>
                Gjenåpne
              </button>
            ) : (
              <button className="btn btn--danger btn--small" onClick={() => act({ action: "hide", questionId: q.id, on: true })}>
                Skjul
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
