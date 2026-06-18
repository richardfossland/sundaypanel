"use client";

import Link from "next/link";

// Route-level error boundary — a transient render/runtime error shows a
// friendly recovery screen instead of a blank, unrecoverable page.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <div className="hero">
        <span className="brand">SundayPanel</span>
        <h1>Noe gikk galt</h1>
        <p>Prøv på nytt — spørsmålene er trygt lagret på serveren.</p>
      </div>
      <section className="card" style={{ textAlign: "center" }}>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={() => reset()}>
            Prøv igjen
          </button>
          <Link
            className="btn btn--ghost"
            href="/"
            style={{ textDecoration: "none" }}
          >
            Til forsiden
          </Link>
        </div>
      </section>
    </main>
  );
}
