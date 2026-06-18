"use client";

import { useState } from "react";
import Link from "next/link";

import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";
import { host } from "@/lib/i18n/host";

export default function HostLoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createAuthBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
    } catch {
      setError(host.login.error);
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    const supabase = createAuthBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="page">
      <div className="hero">
        <Link className="brand" href="/" style={{ textDecoration: "none" }}>
          {host.brand}
        </Link>
        <h1>Arrangør-innlogging</h1>
        <p>{host.login.lede}</p>
      </div>

      <section className="card">
        {sent ? (
          <div>
            <h2>{host.login.sentTitle}</h2>
            <p className="muted">{host.login.sentBody(email.trim())}</p>
          </div>
        ) : (
          <form onSubmit={sendMagicLink}>
            <label className="muted" htmlFor="host-email">
              {host.login.emailLabel}
            </label>
            <input
              id="host-email"
              className="field"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={host.login.emailPlaceholder}
              autoComplete="email"
              style={{ marginTop: 6 }}
            />
            {error && <p className="error">{error}</p>}
            <div style={{ marginTop: 12 }}>
              <button className="btn" disabled={busy || !email.trim()}>
                {busy ? host.login.sending : host.login.sendMagicLink}
              </button>
            </div>
          </form>
        )}

        <div style={{ marginTop: 14 }}>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={signInWithGoogle}
            style={{ width: "100%" }}
          >
            {host.login.google}
          </button>
        </div>
      </section>

      <p className="muted" style={{ maxWidth: 460 }}>
        {host.login.note}
      </p>
      <p>
        <Link className="muted" href="/">
          ← {host.login.backToStart}
        </Link>
      </p>
    </main>
  );
}
