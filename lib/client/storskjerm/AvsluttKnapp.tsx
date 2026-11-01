"use client";

import { settPresentasjon } from "./usePresentasjon";
import { tekst } from "./tekst";
import "./storskjerm.css";

/** Liten «Avslutt skjermvisning»-knapp, usynlig til hover. Bare i tavlevisning. */
export function AvsluttKnapp() {
  return (
    <button
      type="button"
      className="btn btn--ghost btn--small presentasjon-avslutt"
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        settPresentasjon(false);
      }}
    >
      {tekst.tavle.avslutt}
    </button>
  );
}
