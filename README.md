# Årsplanering

Lärarportal + publik elevvy för årsplanering.

## Funktioner
- Lärarinloggning med Supabase
- Skapa och redigera årsplaneringar
- Importera Excel (.xlsx/.xls), Word (.docx), PDF, CSV/TXT
- Klistra in material
- Fördela importerat material över veckor för granskning
- Spara utkast
- Publicera planering och skapa elevlänk
- Elevvy utan inloggning
- Klona planering och byta ämne
- Radera planering
- Responsiv grön design

## Lokal körning
1. Kopiera `.env.example` till `.env.local` och fyll i Supabase URL + publishable key.
2. Kör `npm install`.
3. Kör `npm run dev`.

## Supabase
Kör `supabase-migration.sql` i SQL Editor i projektet. Befintlig tabell `veckoplanering` återanvänds.

## Netlify
Byggkommando: `npm run build`
Publiceringsmapp: `dist`

`public/_redirects` innehåller SPA-routing för elevlänkar.

## Viktigt om import
Importen gör en första automatisk fördelning över veckor. Läraren ska alltid granska och justera innan publicering. PDF:er med enbart inskannade bilder kräver OCR och text kan då saknas.

## Projektstruktur
- `index.html` – lärarportal och elevlänkar (`src/main.jsx`).
- `veckoplanering.html` – veckoplaneringen (`src/weekly/`).
- `src/App.jsx` – årsplanering: lärarvy, import, publicering och elevvy.
- `src/Navigation.jsx` – huvudmenyn i årsplaneringen.
- `src/ClassSchedules.jsx` – klassernas scheman. Hjälpfunktioner ligger i `src/classScheduleUtils.js`.
- `src/supabase.js` – Supabase-klienten, delas av båda apparna.
- `src/*.js` – konstanter och hjälpdata (nationella prov, kommuner, utskriftsgrupper, statistik).
- `src/weekly/` – veckoplaneringens egna filer.
- `src/App.css` och `src/index.css` – all styling. Ändra inte utan att köra testerna.
- `public/` – statiska filer som kopieras som de är.
- `supabase/migrations/` – databasändringar i ordning. `supabase-migration.sql` är den samlade installationen.
- `tests/` – alla kontroller som körs med `npm run check` och i CI. `tests/helpers/` innehåller hjälpfunktioner för dem.
- `QA-SLUTTEST.md` – manuell checklista för test mot testdatabas.
