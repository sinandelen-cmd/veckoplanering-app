# Överlämning: Min planering (feature/server-subjects)

Status: lokal utveckling. Ingen push sedan 9999bd9. Ingen produktionsmigration. PR #19 är Draft.

## Produktion
- Live: minplanering.pages.dev, deployment aeee4b00 (main f0851cb + 73ee626 + d361700 som Publicera/Avpublicera).
- Rättningar för publicering måste finnas kvar i framtida release: f0851cb (autosparning publicerar inte), 73ee626, d361700.
- Netlify deploy previews och Workers Builds för feature-grenen är ej verifierat avstängda. Pusha inte innan det är gjort.

## Lokal miljö
- Supabase: C:\vp\localsupabase, portar 55320–55329 (config.toml ändrad lokalt, Windows reserverar 54222–54843).
- App-build för test: VITE_SUPABASE_URL=http://127.0.0.1:55321 och anon key från `npx supabase status -o env`, outDir C:/vp/harness/dist-chapters, serveras på port 4200.
- Testanvändare: testlarare-a@example.test / Testlarare-A-lokal-2026, testlarare-b@example.test / Testlarare-B-lokal-2026.
- Chrome-tester: C:\vp\harness\e2e (_h2.mjs = login; gp-edit2.mjs = redigering + autosparning + omladdning).

## Lokala commits (ordning)
- 2b4d794 migration för app_update_notices (saknades i repo)
- 28eb003 Ladda upp planering i kursvyn
- f754750 import: kapitel/moment/begrepp, veckonummer, Excel-bredtabell (testad txt/docx/pdf/xlsx)
- d3e861e, 981950d publicera/avpublicera/publicera ändringar (testad)
- 760a327, a5a595a Klassvy tre veckor, en veckorubrik
- e9d731b Grundplanering tre veckor (testad: placering, autosparning, omladdning)

## Testat i Chrome (lokal Supabase)
- Filimport för txt, docx, pdf, xlsx: avbryt ändrar inget, godkänd import sparas, ny session visar vecka 46.
- Publicera/Avpublicera/Publicera ändringar, annan lärare kan inte ändra (0 rader).
- Klassvy: tre veckor sida vid sida, lektioner, en veckorubrik.
- Grundplanering: tre veckor sida vid sida, redigering i lektionsfält sparas och finns kvar efter omladdning.

## Återstår (exakt)
DEL 1 – Grundplanering/Klassvy-tester
- Redigera Moment, Sida, Uppgift i alla tre kolumner (endast ett fält testat).
- Tio lektioner per vecka (ej testat).
- Veckor från olika kapitel (ej testat).
- Modaler öppna/stäng, vertikal scrollning, navigering (ej testat).
- Kompaktare fält, talintervall 999–1009 utan radbrytning (ej gjort).
Nästa kodsteg: skriv gp-tests.mjs som ändrar Moment i kolumn 1–3, tio lektioner i en vecka (sätt lessonsPerWeek=10 via UI), och öppnar/stänger "Öppna hela veckan".

DEL 2 – PDF-export liggande A4, tre veckor, sidbrytningar, inga klipp.
DEL 3 – Word-export med samma veckor och lektionsstruktur.
DEL 4 – Autosparningsstatus Sparar/Sparat, ångra + versionshistorik, kopiera lektion/vecka, sökning i egna planeringar.
DEL 5 – Arkivering + återställning, synkronisering mellan sessioner/datorer, val av startvecka vid import utan veckonummer, begrepp kopplas till rätt moment, slutliga funktions-, säkerhets-, behörighets-, prestanda- och regressionstester, publiceringsrapport.

## Kända begränsningar
- Begrepp från fil kopplas till sista momentet i filen.
- Import utan veckonummer placeras i ordning, inte efter val.
- Testdata "Mitt kursnamn 7A" innehåller "REDIG1" (lokalt).

## Uppdatering (ny session)
- Automatiskt Chrome-test för del 1 (Grundplanering): C:\vp\harness\e2e\del1-grundplanering.mjs. Körs med `node del1-grundplanering.mjs` mot port 4200 och lokal Supabase. Resultat 8/8:
  - tre veckokort på samma höjd, sida vid sida
  - redigering i alla tre kolumner sparas automatiskt i databasen
  - ändringarna finns kvar efter omladdning
  - befintligt innehåll finns kvar
  - sidan scrollar vertikalt
  - "Dölj/visa innehåll" fungerar
  - inga JavaScript-fel
- Ej testat ännu i del 1: tio lektioner per vecka, veckor från olika kapitel, Klassvyns motsvarande tester, kompaktare fält, talintervall 999–1009.
- Nästa kodsteg: lägg till tio lektioner per vecka i testet (ändra "Lektioner per vecka" i planeringens inställningar eller via lokal testdata) och ett test med två kapitel.

## Uppdatering: PDF-export för lärarens Grundplanering (2026-11-13)
- Knapp "Skriv ut (liggande A4)" i publiceringsraden. Commit 5572b9c, plus CSS-tillägg för vit bakgrund under utskrift.
- Verifierat med page.pdf(): 2 sidor, liggande A4 (841,9 × 595 pt). Sida 1 renderad med pdf.js och granskad.
- Kvarstår i utskriften: ett blått band överst (ej identifierat element; elementFromPoint ger body), smala Moment/Sida/Uppgift-fält, ej testat med lång planering eller tio lektioner per vecka i PDF.
- Nästa steg: hitta bandets källa (kontrollera teacher-week-navigation/ChapterVocabulary i utskriftsläge), gör fälten bredare i utskrift, testa tio lektioner och lång planering, sedan Klassvyns utskrift, sedan Word-export.
- Elevutskriften (stående) är inte omtestad efter ändringen.
