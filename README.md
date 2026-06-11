# SundayPanel

Anonyme spørsmål til panelsamtaler — ungdommene sender inn fra mobilen, panelet
velger hva som vises på storskjermen. Del av Sunday-suiten.

**Prod:** https://panel.sundaysuite.app (CF Worker `sundaypanel` via OpenNext)

## Flater

| Rute | Hvem | Hva |
|---|---|---|
| `/` | alle | Bli med (panelkode) / opprett panel |
| `/sporsmal/[code]` | ungdom (mobil) | Send inn anonymt, se + 👍 andres spørsmål |
| `/kontroll/[id]` | moderator | Innboks/kø/besvart/skjult, søk, sorter, «Vis på skjerm», modusbryter |
| `/board/[id]` | storskjerm | Kuratert: valgt spørsmål stort. Åpen: vegg av alle + fremhevet. QR + kode |

## Moduser

- **Kuratert** (standard): storskjermen viser KUN spørsmålet moderator har valgt.
- **Åpen vegg**: alle ikke-skjulte spørsmål vises som vegg; valgt spørsmål
  fremheves over veggen. Skjulte spørsmål vises aldri, uansett modus.

## Arkitektur

- Next.js 16 (app router) → OpenNext → Cloudflare Worker.
- Eget `panel`-schema i det delte SundaySuite-Supabase-prosjektet
  (ref `fwbfhwxgkjelcutwajza`; `public` tilhører SundayChess).
- RLS på alle tabeller uten policies — klienter rører aldri tabellene. Alt går
  via API-ruter med service-role (`lib/supabase/service.ts`, schema-scopet).
- Moderator-handlinger gates av arrangørkode (`lib/server/auth.ts`).
- **Anonymitet:** `questions` har ingen identitetskolonner overhodet. Device-token
  (tilfeldig UUID i localStorage) brukes kun til stemme-dedup + rate-limiting.
- Realtime = broadcast-hint på kanal `p:{sessionId}` (`lib/realtime.ts`);
  klientene refetcher autoritativ state, med 15 s polling som sikkerhetsnett.
  Ingen tabeller ligger på supabase_realtime.

## Utvikling

```bash
npm install
supabase start                       # lokal stack (config.toml eksponerer `panel`)
# kjør migrasjonen mot lokal DB:
docker exec supabase_db_sundaypanel psql -U postgres -v ON_ERROR_STOP=1 \
  -f /dev/stdin < supabase/migrations/0001_panel_schema.sql
npm run dev
```

`.env.local` (lokal stack): se `.env.example`; verdier fra `supabase status -o env`.

## Test

```bash
npm run check          # tsc + eslint + vitest
./scripts/test-db.sh   # migrasjon (idempotens) + 14 logikk/RLS-assertions mot Docker-Postgres
BASE=http://localhost:3000 node scripts/smoke.mjs   # 33 ende-til-ende-assertions
```

## Deploy

1. **Migrasjon** (én gang): kjør `supabase/migrations/0001_panel_schema.sql` i
   Supabase SQL-editor på det delte prosjektet.
2. **Eksponer schema** (én gang, MÅ gjøres i dashboard — lærdom fra Harvest):
   Settings → API → Exposed schemas → legg til `panel` → Save.
   Uten dette feiler ALLE kall (også service-role) gjennom PostgREST.
3. Bygg + deploy (prod-nøkler i `.env.production.local`, gitignored):
   ```bash
   npx opennextjs-cloudflare build
   npx opennextjs-cloudflare deploy
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # én gang
   ```
4. Prod-røyktest: `BASE=https://panel.sundaysuite.app node scripts/smoke.mjs`
   (etterlater én stengt «Røyktest …»-sesjon i DB).
