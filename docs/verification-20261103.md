# Verifiering av Årsplanering – 2026-11-03

Status: Kärnscenarier för autosparning och klassbyten verifierade. Hela produkten är INTE 100 % färdigverifierad.

Gren: `fix/plan-summaries-20261102`.
Senaste verifierade applikationscommit: `abb8098dd245bcc0ac1045cc16e9a0fabf9647d1`.
Testwebbplats: https://arsplanering-isolerad-test-20261102.pages.dev/

## Verifierat

- Testkontot kunde logga in i webbläsaren. Tidigare inloggningsblockering är löst.
- Syntetisk testplanering id 7, ”QA verifiering 3 november”, användes. Fyra daterade veckor, sidnummer och uppgifter.
- Två klasser skapades i gränssnittet: QA-8A med måndag och QA-8B med tisdag. Båda sparades i testdatabasen.
- Tio klassbyten i följd gav rätt klassvy utan observerad frysning. Uppmätt tid inklusive verktygsanrop cirka 312–352 ms per byte; detta är inte en standardiserad prestandamätning.
- Grundplaneringens moment ändrades till ”QA autosparning verifierad 2026-11-03” och följdes direkt av klassbyte. Sparad text kontrollerades med SQL och syntes efter full omladdning.
- QA-8A fick egen text ”QA-8A egen ändring 2026-11-03”. Den överlevde omladdning och syntes i klassvyn. SQL visade klassens override, oförändrad grundtext och tomma overrides för QA-8B.
- Senaste applikationsversionen verifierades driftsatt i Cloudflare, laddades om och öppnades i webbläsaren. Återgång från klassvy gav fyra veckor i grundplaneringen.
- Alla 44 automatiska tester passerar. `npm run check` kör nu samtliga toppnivåskript i tests.
- Lint: 0 fel, 47 varningar. Regeln no-undef är nu ett fel för att fånga saknade variabler.
- Isolerad Vite-build passerar. Varning om stora JavaScript-paket kvarstår.
- Testdatabas `tdbmhkwsgzflqgmftzyy` fungerade under testningen. Tidigare säkerhets- och prestandarådgivning gav inga varningar; RLS aktiverat på samtliga fyra public-tabeller.
- Tidigare transaktionstest verifierade authenticated infoga/uppdatera/läsa och list_plan_summaries samt att ett annat konto inte kunde läsa eller uppdatera raden. Transaktionen återställdes med ROLLBACK.

## Åtgärdat i testgrenen

- Samtliga automatiska tester inkluderas; två inaktuella testmiljöer använder aktuella hjälpfunktioner.
- Standardvyn visar fyra veckor i stället för hela året, även efter återgång till grundplanering. Den stora syntetiska planeringen frös före ändringen men gick att öppna efteråt.
- Veckonavigeringen kan visa äldre veckor.
- Klasskapande använder tom lista för schema i stället för odefinierad days.
- Borttagna referenser till saknade setClassWeekPage, setOverviewPage och setSelectedLessonIndex.
- WeekDetails får definierade standardvärden för undo/redo-props.

## Kvar före fullständigt godkännande

- Publik elevlänk, ompublicering, utkast och automatisk veckopublicering måste verifieras i isolerad miljö. Testdatabasen saknade den offentliga årsplanerings-RPC:n och stödfunktionen för automatisk veckopublicering vid schemaöversikten.
- Hela visuella protokollet i QA-SLUTTEST.md återstår, inklusive mobilvy, A4/PDF, årsskifte och innehållsfiltrering.
- Ingen standardiserad belastningsmätning av alla visningslägen. ”Visa alla veckor” kan fortfarande vara tung för mycket stora planeringar.
- Lintvarningar och paketstorleksvarning är inte åtgärdade.
- Elevkompassen är ett separat pågående arbete; ingen slutrapport från dess senaste Replit-uppdrag har ännu erhållits.

## Drift och avgränsning

Endast testgren och syntetiska data i testdatabasen ändrades. Ingen merge till main, produktionspublicering eller ändring av riktiga användardata.

Efter testpasset begärdes paus av Årsplanering Test och återaktivering av projektet med namnet Elevkompassen enligt tidigare godkänt tillfälligt projektbyte. Slutlig hälsostatus kontrolleras separat. Observera att själva Elevkompassen-appen använder Veckoplanering-projektet, inte det tomma projektet som heter Elevkompassen. Produktionsprojektet Veckoplanering har förblivit ACTIVE_HEALTHY och har inte ändrats.
