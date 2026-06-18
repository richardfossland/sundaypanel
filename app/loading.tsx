// Route-level loading UI — shown while a page segment streams in.
export default function Loading() {
  return (
    <main className="page" aria-busy="true" aria-live="polite">
      <div className="hero">
        <span className="brand">SundayPanel</span>
        <p className="muted" style={{ display: "inline-flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
          <span className="spinner" aria-hidden="true" />
          Laster…
        </p>
      </div>
    </main>
  );
}
