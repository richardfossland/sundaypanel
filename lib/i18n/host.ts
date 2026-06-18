// Norwegian UI strings for the Sunday Account host surface (login + dashboard).
// The rest of the app uses inline Norwegian; the host strings are collected here
// so the login/dashboard copy lives in one place (the app's locale file for the
// host surface). Engelsk kode, norsk UI — som resten av suiten.

export const host = {
  brand: "SundayPanel",

  login: {
    lede: "Logg inn for å se og styre panelene dine.",
    emailLabel: "E-post",
    emailPlaceholder: "deg@menigheten.no",
    sendMagicLink: "Send innloggingslenke",
    sending: "Sender …",
    sentTitle: "Sjekk innboksen",
    sentBody: (email: string) =>
      `Vi har sendt en innloggingslenke til ${email}.`,
    google: "Logg inn med Sunday-konto",
    error: "Klarte ikke å sende lenken — sjekk adressen og prøv igjen.",
    backToStart: "Tilbake til forsiden",
    note:
      "Innlogging er bare for arrangører. Ungdommene blir med med panelkoden — helt anonymt, uten innlogging.",
  },

  dashboard: {
    title: "Mine paneler",
    lede: "Panelene du har opprettet mens du var innlogget.",
    signedInAs: (email: string) => `Innlogget som ${email}`,
    signOut: "Logg ut",
    createNew: "Opprett nytt panel",
    empty:
      "Du har ingen paneler ennå. Opprett ett, så dukker det opp her.",
    open: "Åpne kontrollpanel",
    board: "Storskjerm",
    code: "Panelkode",
    delete: "Slett",
    deleting: "Sletter …",
    confirmDelete: (title: string) =>
      `Slette panelet «${title}»? Alle spørsmål, stemmer og avstemninger forsvinner. Dette kan ikke angres.`,
    deleteFailed: "Kunne ikke slette panelet — prøv igjen.",
    loadFailed: "Kunne ikke laste panelene.",
  },
} as const;
