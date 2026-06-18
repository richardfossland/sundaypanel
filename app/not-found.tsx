import Link from "next/link";

// 404 — a friendly dead-end with a way back to the front page.
export default function NotFound() {
  return (
    <main className="page">
      <div className="hero">
        <span className="brand">SundayPanel</span>
        <h1>Fant ikke siden</h1>
        <p>Lenken er kanskje utløpt, eller panelet finnes ikke lenger.</p>
      </div>
      <section className="card" style={{ textAlign: "center" }}>
        <Link className="btn" href="/" style={{ textDecoration: "none" }}>
          Til forsiden
        </Link>
      </section>
    </main>
  );
}
