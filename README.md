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
