"use client";

// Thin typed fetch helpers for the API routes. Every call returns the parsed
// JSON or throws an Error whose message is the server's error code (Norwegian
// snake_case, mapped to text in the UI).

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const code =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `http_${res.status}`;
    throw new Error(code);
  }
  return data as T;
}

export function getJson<T>(url: string): Promise<T> {
  return request<T>(url, { cache: "no-store" });
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const errorText: Record<string, string> = {
  finnes_ikke: "Fant ikke panelet — sjekk koden.",
  feil_arrangorkode: "Feil arrangørkode.",
  innsending_stengt: "Innsendingen er stengt.",
  ugyldig_sporsmal: "Spørsmålet må være 1–280 tegn.",
  ro_ned_litt: "Ro ned litt — prøv igjen om et øyeblikk.",
  for_mange_foresporsler: "For mange forsøk — vent litt.",
  sporsmal_skjult: "Spørsmålet er skjult.",
  kunne_ikke_sende: "Kunne ikke sende — prøv igjen.",
};

export function humanError(e: unknown): string {
  const code = e instanceof Error ? e.message : String(e);
  return errorText[code] ?? "Noe gikk galt — prøv igjen.";
}
