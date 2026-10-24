# Fyrdubbel arbetsgrupp: isolerad RPC och verklig App.jsx i Chromium

Datum: 2026-10-24. Endast feature-gren `feature/provtraning-infogad-vecka`, draft PR #5.

## 18 genomförda moment

1. Kontrollerade de senaste båda GitHub Actions-flödena och deras commit-SHA.
2. Bekräftade att `89588ea` hade gröna kod/SQL- och Chromium-jobb.
3. Granskade dokumentationen för lokal Supabase CLI, Docker, Auth och PostgREST.
4. Bekräftade att lokal stack behöver Docker och egna migrationsfiler; ingen produktion får länkas.
5. Granskade isolerade PostgreSQL-roller och RLS-test från föregående arbetsgrupp.
6. Granskade den föreslagna, ännu inte driftsatta `hideDate`-RPC-rättningen.
7. Skapade en **körbar**, isolerad PostgreSQL SECURITY DEFINER-RPC med temporär tabell.
8. Lade till offentlig, privat, saknad och tom plan som testdata.
9. Lade till kontroll att dolda veckor inte returneras.
10. Lade till elevroll, schemaåtkomst och begränsad RPC EXECUTE.
11. Säkrade `BEGIN`/`ROLLBACK` så testobjekten inte lever kvar.
12. Kopplade RPC-kontraktstestet till GitHub Actions SQL-jobb.
13. Lade till offlinekontroll för temporär tabell, funktionsbehörighet och rollback.
14. Utökade verkliga Chromium-klicktestet: legacy-varningen kvar efter veckoinfogning och ångra.
15. Granskade `AnnualApp`-inloggning, lärarbehörighet och laddning av planeringar.
16. Byggde nytt Chromium-test som öppnar **riktiga `src/main.jsx` och `App.jsx`**.
17. Isolerade Auth/REST-nätverk mot `127.0.0.1:4199` med fiktiv lärare och nekad extern trafik.
18. Lade till separat Vite-start på port 4176 och hantering av CORS-preflight i browser-CI.

## Verifieringsnivå

- SQL-testet anropar en **verklig körbar PostgreSQL-funktion**, med SECURITY DEFINER, elevroll, test-RLS och publika/privata data. Denna funktion är en **syntetisk kontraktsmodell**, inte den verkliga `public.get_public_annual_plan` från Supabase. Inga produktionsnycklar eller produktionsdata används.
- Chromium-fixturen med `ClassSchedules` och produktionshooken `usePlanHistory` körs fortfarande.
- Det nya Chromium-testet laddar **hela riktiga App.jsx** och försöker logga in mot en **lokal HTTP-mock** för Auth och lärarens REST-frågor. Detta är inte GoTrue/PostgREST eller ett riktigt inloggat Supabase-konto. Körningen måste vara grön innan den räknas som godkänd.
- Den fullständiga lokala Supabase-stacken har **inte** startats. För det behövs en separat CLI/Docker-konfiguration, lokal schema/migration för verklig `veckoplanering`, `teacher_access` och elev-RPC samt integration med Auth. Dessa kan inte ersättas av mockarna.
- Arkiverade `legacy-unmapped:`-anpassningar finns kvar i lärarutkastet, visas som antal i klassvyn och filtreras bort från elevernas snapshot. Automatisk återkoppling görs inte utan säker lektionstillhörighet.

## Kvarvarande hinder

1. Full Supabase CLI-stack med Auth, PostgREST, verkligt schema/RLS och verklig `get_public_annual_plan` i isolerad testmiljö.
2. Full App.jsx-redigerings- och publiceringsresa i Chromium mot den teststacken.
3. Gränssnitt för manuell återkoppling av arkiverade anpassningar.
4. Slutlig grön CI för **senaste commit** och separat releasegodkännande.

**Planstatus:** 7/8 kvalitetspaket (87,5 %), 1 kvar. Detta är inte ett påstående om total kodtäckning eller releaseklarhet. **Tidsbedömning:** 1–3 ytterligare fyrdubbla arbetsgrupper för riktig lokal Supabase-fullstack och end-to-end, möjligen fler om databasmodellen behöver återskapas.

Ingen produktion, publicering eller merge.

## Bekräftade gröna körningar och extra moment

19. Granskade faktiskt Chromium-jobblogg: `83f0241` körde `tests/browser-real-app-check.mjs` och skrev **PASS** efter verklig App.jsx-inloggning och lärarbehörighetsfråga mot localhost-mock. Browser-run `40088992508` **success**.
20. Lade till ett negativt verkligt App.jsx-inloggningstest: fel lösenord ska ge felmeddelande och behålla inloggningsvyn innan lyckad testinloggning. Detta är ett nytt teststeg; invänta slutlig CI för `bf5472a` eller senare.

Tidigare kod- och SQL-körning `40088992498` på `83f0241` var också **success**, inklusive det anropbara RPC-kontraktstestet. Det är fortfarande en syntetisk funktion, inte produktions-RPC.

## Korrigering av ny Chromium-regression

- Browser-körningarna `995918a` och `821cb3c` visade en asynkron timingfråga: den riktiga App.jsx begär planeringslistan **efter** lärarbehörigheten; testet kontrollerade för tidigt. Lade till begränsad väntan (`ea88e9d`).
- Browser-körningen `bf5472a` visade att det nya negativa inloggningstestet förväntade sig ett 400-svar som inte hade kopplats in i mockens Auth-handler. Lade till det faktiska 400-svaret (`2aeebea`).
- Dessa är testhärdningar, inte produktionsändringar. Kontrollera nya båda workflows innan slutligt godkännande.

## Slutligt kod-CI för senaste teständringen

- Commit `2aeebea`: ordinarie verify + isolerade PostgreSQL-regressioner **success** i run `40089151958`.
- Samma commit: Chromium **success** i run `40089151883`. Detta inkluderar verkliga App.jsx-inloggningen, först felaktigt lösenord och därefter godkänd fiktiv lärare mot localhost-mock; klasschema/vecka/undo/redo i den andra isolerade Chromium-fixturen.
- Efterföljande dokumentationscommit behöver inte ändra testkod men dess egen workflowstatus kontrolleras separat.
- Ingen full GoTrue/PostgREST-stack, produktionslik migration eller faktisk produktions-RPC har körts. **Release ej godkänd.**
