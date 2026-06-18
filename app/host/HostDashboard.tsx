"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";
import { host as t } from "@/lib/i18n/host";
import { humanError } from "@/lib/client/api";
import type { HostPanel } from "@/lib/server/panels";

export default function HostDashboard({
  email,
  initialPanels,
}: {
  email: string;
  initialPanels: HostPanel[];
}) {
  const router = useRouter();
  const [panels, setPanels] = useState<HostPanel[]>(initialPanels);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function signOut() {
    const supabase = createAuthBrowserClient();
    await supabase.auth.signOut();
    router.push("/host/login");
  }

  /** Open the control panel for an owned panel. Stash the organiser code on
   * this device first so /kontroll/[id] unlocks without retyping — exactly
   * what the create flow already does. */
  function openControl(p: HostPanel) {
    try {
      localStorage.setItem(`panel:ok:${p.id}`, p.organiserCode);
    } catch {
      // ignore storage failures; the control page will prompt for the code.
    }
    router.push(`/kontroll/${p.id}`);
  }

  async function remove(p: HostPanel) {
    if (!window.confirm(t.dashboard.confirmDelete(p.title))) return;
    setErr(null);
    setBusyId(p.id);
    try {
      const res = await fetch("/api/host/panels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: p.id }),
      });
      if (!res.ok) {
        let code = `http_${res.status}`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) code = data.error;
        } catch {
          /* non-JSON body */
        }
        throw new Error(code);
      }
      setPanels((prev) => prev.filter((x) => x.id !== p.id));
      try {
        localStorage.removeItem(`panel:ok:${p.id}`);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page page--wide">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link className="brand" href="/" style={{ textDecoration: "none" }}>
          {t.brand}
        </Link>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          {t.dashboard.signedInAs(email)} ·{" "}
          <button
            type="button"
            onClick={signOut}
            className="linklike"
            style={{
              background: "none",
              border: 0,
              padding: 0,
              cursor: "pointer",
              color: "inherit",
              textDecoration: "underline",
              font: "inherit",
            }}
          >
            {t.dashboard.signOut}
          </button>
        </span>
      </div>

      <h1 style={{ margin: "8px 0 2px" }}>{t.dashboard.title}</h1>
      <p className="muted">{t.dashboard.lede}</p>

      <div style={{ margin: "12px 0" }}>
        <Link
          className="btn"
          href="/"
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          + {t.dashboard.createNew}
        </Link>
      </div>

      {err && <p className="error">{err}</p>}

      {panels.length === 0 ? (
        <section className="card">
          <p className="muted">{t.dashboard.empty}</p>
        </section>
      ) : (
        <ul className="qlist">
          {panels.map((p) => (
            <li key={p.id} className="qitem">
              <div className="qbody">
                <p className="qtext">{p.title}</p>
                <div className="qmeta">
                  <span className="tag">
                    {t.dashboard.code} {p.code}
                  </span>
                  <span className="tag">{p.mode}</span>
                  <span className="tag">{p.status}</span>
                </div>
              </div>
              <div className="qactions">
                <button
                  className="btn btn--small"
                  type="button"
                  onClick={() => openControl(p)}
                >
                  {t.dashboard.open}
                </button>
                <a
                  className="btn btn--ghost btn--small"
                  href={`/board/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.dashboard.board}
                </a>
                <button
                  className="btn btn--danger btn--small"
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => remove(p)}
                >
                  {busyId === p.id ? t.dashboard.deleting : t.dashboard.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
