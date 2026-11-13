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

## Blått band och utskrift – status (2026-11-13)
- Bandet: element NAV.planning-unified-navigation.planning-original-top (sticky, bakgrund rgb(219,233,247)) syns i utskriften. Att dölja den med CSS (display none) och med JS hjälpte inte i PDF:en; bytes i PDF:en var oförändrade, så orsaken är inte fullt klarlagd.
- Experimentet (lås upp förfäderns höjd/overflow under utskrift) gav 7 sidor där första sidan bara innehöll bandet. Det är inte godkänt. Experimentet ligger i C:\vp\harness\print-experiment-uncommitted.patch och är INTE committat.
- Committat läge: c1e9a09 (2 sidor, bandet kvar, vissa kort klipps nederst på sida 1 p.g.a. förfäders overflow/höjd).
- Nästa steg: 1) reproducera med page.pdf() och jämför DOM-träd för vilket element som ritar bandet (använd elementFromPoint i PDF-läget, inte emulateMedia); 2) lås upp förfäder i utskriftsläge enbart för .teacher-months-kedjan; 3) verifiera sidantal och klippfritt med pdf.js-rendering av alla sidor; 4) därefter Word-export.

## PDF-utskrift: separat komponent (2026-11-13, commit f21dadf)
- Ny komponent src/TeacherPrintSheet.jsx, renderas via createPortal direkt under body endast under utskrift. Ingen DOM-manipulation av appen längre. Det blå bandet är borta eftersom navigeringen inte renderas i utskriften.
- Innehåll: tre veckor per rad, veckorubrik med datum, kapitel, samtliga lektioner, fälten Moment, Sida, Uppgift i ordning. Lektioner bryts inte mitt över sidgräns.
- Verifierat med page.pdf() + pdf.js-rendering: kort planering = 1 sida liggande A4 (841,9 × 595 pt), tio lektioner per vecka synliga, bandet borta. Lång planering (12 veckor, 10 lektioner, lång text, talintervall 999–1009 och 1000–1050 brytna korrekt) = 7 sidor, sida 2 kontrollerad visuellt.
- Kvar: 1) veckorubrik upprepas inte på fortsättningssidor; 2) sida 7 ej granskad visuellt; 3) Klassvyns utskrift; 4) elevutskriften (stående) ej omtestad; 5) Word-export; 6) kompaktare fält i redigeringsvyerna; 7) övriga funktioner i listan.
- Testdata: "Mitt kursnamn 7A" har nu 12 veckor (lokalt). Återställ vid behov via data i C:\vp\harness\e2e\long-plan.mjs (skriver över weeksData, endast lokal test-DB).

## Uppdatering: utskrift med upprepade veckorubriker (commit 34c8027)
- TeacherPrintSheet: varje rad med upp till tre veckor är en tabell. Veckorubrikerna ligger i tabellhuvudet och upprepas på fortsättningssidor.
- Lång testplan (12 veckor × 10 lektioner, lokal testdata): 8 sidor liggande A4. Sida 2 och sida 8 granskade visuellt; alla lektioner och fält finns med.
- Kvar: Klassvyns utskrift; elevutskriften (stående) omtestas; Word-export; kompaktare fält i redigeringsvyer; autosparningsstatus; ångra/versionshistorik; kopiera; sökning; arkivering/återställning; synkronisering; import med startvecka; begreppskoppling; samtliga tester (funktion, säkerhet, behörighet, prestanda, regression) och slutrapport.

## Klassvyns utskrift (2026-11-13)
- Knappen "Skriv ut (liggande A4)" i klassvyns rubrik använder samma TeacherPrintSheet via portal under body. Skriver ut de tre veckor som visas i klassvyn (fönstret), inte hela planen.
- Verifierat med page.pdf() för klass 8A: 1 sida liggande A4, tre veckor sida vid sida, fem lektioner per vecka synliga, rubrik med klassnamn. Ingen lektion saknas.
- Kvar: utskrift av alla veckor i klassvyn (inte bara fönstret), och tio lektioner per vecka i klassvyn (ej testat i PDF).
