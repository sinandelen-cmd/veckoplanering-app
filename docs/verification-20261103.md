# Verifiering av Årsplanering – 2026-11-03

Status: Kärnscenarier för autosparning och klassbyten verifierade. Hela produkten är INTE 100 % färdigverifierad.

Gren: `fix/plan-summaries-20261102`.
Senaste verifierade applikationscommit: `d3d24f24f163b2ad96f801eb3e9aa9173e01af8e`.
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
- GitHub Actions för applikationscommit abb8098dd245bcc0ac1045cc16e9a0fabf9647d1: completed/success.
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

- Automatisk veckopublicering har fortfarande inget installerat serverstöd. Reglaget ligger i avstängt gränssnitt och publiceringskoden stoppar funktionen om stöd saknas. Ordinarie publicering är nu verifierad enligt uppföljningen nedan.
- Mobilvy är uttryckligen borttagen ur uppdraget av användaren. A4/PDF (inklusive långa veckor) och återstående datum-/årsskiftesscenarier i QA-SLUTTEST.md återstår. Innehållsfiltrering har verifierats enligt uppföljningen.
- Ingen standardiserad belastningsmätning av alla visningslägen. ”Visa alla veckor” kan fortfarande vara tung för mycket stora planeringar.
- Lintvarningar och paketstorleksvarning är inte åtgärdade.
- Elevkompassen är ett separat pågående arbete; ingen slutrapport från dess senaste Replit-uppdrag har ännu erhållits.

## Drift och avgränsning

Endast testgren och syntetiska data i testdatabasen ändrades. Ingen merge till main, produktionspublicering eller ändring av riktiga användardata.

Efter testpasset begärdes paus av Årsplanering Test och återaktivering av projektet med namnet Elevkompassen enligt tidigare godkänt tillfälligt projektbyte. Slutlig status verifierad: Årsplanering Test INACTIVE, projektet Elevkompassen ACTIVE_HEALTHY och Veckoplanering ACTIVE_HEALTHY. Observera att själva Elevkompassen-appen använder Veckoplanering-projektet, inte det tomma projektet som heter Elevkompassen. Produktionsprojektet Veckoplanering har förblivit ACTIVE_HEALTHY och har inte ändrats.

## Uppföljning: elevpublicering och datorversion

- Publiceringsknappen saknades trots text om automatisk publicering. Synlig Publicera för elever/Uppdatera elevversion har återställts. Autosparning fortsätter spara utkast, och elevversionen uppdateras uttryckligen.
- Klasspecifika overrides och lektionstider filtreras nu till tillåtna fält. Ny regressionskontroll säkerställer att interna fält i klasslektioner inte publiceras.
- 44/44 tester, lint utan fel (47 varningar), isolerad build och GitHub Actions passerar för d3d24f24f163b2ad96f801eb3e9aa9173e01af8e. Cloudflare bekräftade samma kod driftsatt.
- Testdatabasens befintliga schema granskades. Endast get_public_annual_plan installerades med migration install_isolated_student_snapshot_rpc; inga tabeller eller befintliga RLS-policyer ändrades. Funktionen hämtar endast published_content från publicerade rader för exakt slug, med låst search_path.
- Webbläsartest på syntetisk rad 7: publicera → redigera → autospara utkast → ladda om elevlänk → ompublicera → ladda om elevlänk. Utkast och publicerad text var olika tills ompublicering. Samma slug behölls och den nya texten syntes efter ompublicering.
- Anonym SQL-roll kunde läsa publicerad elevtext via RPC men såg 0 rader i bastabellen.
- Testdata för dolda veckor skapades med SQL enbart i syntetisk rad 7. Webbläsaren stoppade publicering när alla veckor var dolda. Efter ompublicering med en dold vecka innehöll anonymt RPC-svar 3 veckor och varken den dolda veckans titel eller QA_LARARANTECKNING_PRIVAT.
- Bulkvalet Dölj för elever i webbläsaren gav ett dialog-/automationsproblem och kunde inte bekräftas sparat via det UI-flödet; detta är kvar att särskilt verifiera. Det ersätts inte av SQL-fixturens test.
- Skriv ut provades i både lärar- och elevvy. Ingen utskriftsdialog/PDF blev tillgänglig i den styrda webbläsaren. Utskriftslayouten kan därför inte godkännas från detta test. En PDF från användarens Chrome behövs för visuell granskning; längre testfall återstår därefter.
- Senaste Replit-status: busy; slutrapport inte tillgänglig. Inget nytt ändringsuppdrag skickades i denna uppföljning.

### Aktuellt driftläge för fortsatt testning

Årsplanering Test ACTIVE_HEALTHY; tomma projektet med namnet Elevkompassen INACTIVE under det godkända tillfälliga bytet. Testdatabasen lämnas aktiv så elevlänken kan användas för PDF-kontrollen. Veckoplanering (produktionen och Elevkompassen-appens faktiska databas) är ACTIVE_HEALTHY och oförändrad. Återställ projektbytet när testningen är avslutad.

### Databasrådgivning efter installation

Två varningar gäller avsiktligt anropbar SECURITY DEFINER-RPC för elevversionen (anon/authenticated). Funktionen ska vara offentlig men bara exponera den publicerade kopian; rolltester ovan verifierar avgränsningen. Se [Supabase 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) och [0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Även [skydd mot läckta lösenord](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) rapporterades avstängt i testprojektet. Inga autentiseringsinställningar ändrades.

## Uppföljning: tom A4-sida

Användarens skärmbild visade en tom A4-sida i utskriftsförhandsvisning. Koden dolde student-screen-view vid utskrift, medan student-print-pages inte skapades eftersom de låg bakom AVSTANGD_GRANSSNITT. Spärren har tagits bort endast för utskriftssidorna i commit 3d3b2cba77c2af4ed3c067566da7d80453fc4629. Regressionstest tillagt; alla 44 tester, lint och isolerad build passerar. Slutlig visuell A4/PDF-kontroll efter rättningen återstår. AirPrint-meddelandet om saknad skrivare är separat från felet med tom sida.

## Driftsättning och kontroll efter tömd byggkö

Det äldre ofärdiga testbygget 77c00821-7e28-4966-8d20-7024ee1f9d3a stod fast i initialize och togs bort. Den senaste testversionen d57ac8d6c3542b2bd0cf835a46f5ff2632888497 driftsattes därefter med status success 2026-11-03 16:55:53 UTC. Ingen fungerande deployment eller produktionsmiljö togs bort.

Efter omladdning av elevlänken i webbläsaren finns 1 student-print-page med ämne, läsår, vecka 45, datum, lektionsrubrik, momenttext, sida 10 och uppgift 1–3. Detta verifierar att den tidigare saknade utskriftskopian nu finns i körande sida; det ersätter inte visuell PDF-granskning.

Elevkompassens rapport hämtades: 31/31 säkerhetstester samt byggning/typkontroll passerade. Elevblad, närvaro, IUP, ångra och krypterad backup/återställning verifierades med syntetiska data och simulerade Supabase-svar. Riktiga serverbehörigheter är inte verifierade. Fortsatt isolerat Replit-uppdrag har skickats för datumstyrd historikåterställning och musklick i klassdialogen; inga produktionsändringar eller publicering tillåts.
