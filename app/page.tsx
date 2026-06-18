"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getJson, postJson, humanError } from "@/lib/client/api";
import { normalizeWordCode } from "@/lib/codes";
import type { PublicSession } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    session: PublicSession;
    organiserCode: string;
  } | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setJoinErr(null);
    try {
      const code = normalizeWordCode(joinCode);
      await getJson(`/api/session?code=${encodeURIComponent(code)}`);
      router.push(`/sporsmal/${encodeURIComponent(code)}`);
    } catch (err) {
      setJoinErr(humanError(err));
      setJoining(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateErr(null);
    try {
      const data = await postJson<{
        session: PublicSession;
        organiserCode: string;
      }>("/api/session", { title });
      // Moderator convenience: remember the code on this device so the
      // control page opens without retyping.
      localStorage.setItem(`panel:ok:${data.session.id}`, data.organiserCode);
      setCreated(data);
    } catch (err) {
      setCreateErr(humanError(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="page">
      <div className="hero">
        <span className="brand">SundayPanel</span>
        <h1>Spør panelet — helt anonymt</h1>
        <p>Send inn spørsmål fra mobilen. Panelet velger hva som vises på storskjermen.</p>
      </div>

      <section className="card">
        <h2>Bli med</h2>
        <form onSubmit={join} className="row">
          <input
            className="field field--code"
            placeholder="KODE-XX"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Panelkode"
          />
          <button className="btn" disabled={joining || !joinCode.trim()} aria-busy={joining}>
            {joining && <span className="spinner" aria-hidden="true" />}
            {joining ? "Kobler til…" : "Bli med"}
          </button>
        </form>
        {joinErr && <p className="error">{joinErr}</p>}
      </section>

      <section className="card">
        <h2>Opprett panel</h2>
        {created ? (
          <div>
            <p className="muted">
              Panelet «{created.session.title}» er klart. Ungdommene bruker koden:
            </p>
            <div className="codebox">{created.session.code}</div>
            <p className="muted">
              Din <strong>arrangørkode</strong> (hold den hemmelig — den styrer alt):
            </p>
            <div className="codebox">{created.organiserCode}</div>
            <div className="row" style={{ marginTop: 14 }}>
              <a className="btn" href={`/kontroll/${created.session.id}`} style={{ textDecoration: "none", textAlign: "center", flex: 1 }}>
                Åpne kontrollpanel
              </a>
              <a className="btn btn--ghost" href={`/board/${created.session.id}`} target="_blank" style={{ textDecoration: "none", textAlign: "center", flex: 1 }}>
                Åpne storskjerm
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={create}>
            <input
              className="field"
              placeholder="Tittel, f.eks. «Spør presten»"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
            <div style={{ marginTop: 10 }}>
              <button className="btn" disabled={creating || !title.trim()} aria-busy={creating}>
                {creating && <span className="spinner" aria-hidden="true" />}
                {creating ? "Oppretter…" : "Opprett"}
              </button>
            </div>
            {createErr && <p className="error">{createErr}</p>}
          </form>
        )}
      </section>

      <p className="muted" style={{ textAlign: "center", marginTop: 8 }}>
        Arrangør?{" "}
        <a href="/host" style={{ textDecoration: "underline" }}>
          Logg inn med Sunday-konto
        </a>{" "}
        for å samle panelene dine.
      </p>
    </main>
  );
}
