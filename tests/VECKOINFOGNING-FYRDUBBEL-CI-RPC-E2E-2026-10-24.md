# Fyrdubbel slutverifiering – 2026-10-24

**Scope:** 18 sammanhängande granskningsmoment, endast feature-gren och GitHub Actions. Inga produktionsändringar, ingen publicering för riktiga elever, ingen merge.

## 18 utförda arbetsmoment

1. Kontrollerade samtliga senaste GitHub Actions-flöden.
2. Läste loggar för misslyckade fullstackmigreringar.
3. Spårade felaktig SQL-avslutning i kopian av produktions-RPC:n.
4. Rättade avslutande SQL-semikolon efter `$function$`.
5. Spårade felaktigt placerad parentes i `COALESCE`-uttrycket för `hideDate`.
6. Rättade `hideDate`-predikatet till `not coalesce(regex,false) or hideDate > today` i **endast isolerad testfixtur**.
7. Bytte till explicit `[0-9]` i testfixturens datumregex för robust stränghantering.
8. Säkerställde att testmiljön inte är kopplad till produktion.
9. Begränsade fullstackens Docker-tjänster till Auth, PostgREST, databas och beroenden.
10. Lade till begränsade omförsök (tre totalt) med stigande väntetid vid externa Docker-registryfel, utan externa inloggningsuppgifter.
11. Kontrollerade att den ordinarie `verify`-körningen passerar.
12. Kontrollerade att separat Chromium-test för klassanpassningar passerar.
13. Kontrollerade den tidigare gröna verkliga lokala Supabase-fullstackkörningen och dess täckning.
14. Granskade att fullstacktestet nu använder **read-only kopia av produktions-RPC** med enbart föreslagen NULL-korrigering.
15. Granskade testfallen för automatisk veckopublicering, två senaste veckor, framtida veckor och skollov.
16. Granskade den verkliga App.jsx-vägen för autosparande och automatisk publicering; dess kod använder `save(true,true)`.
17. Granskade det nya Chromium-flödet som öppnar en lärarplan, redigerar, inväntar elevsnapshot och öppnar elevlänk.
18. Verifierade att legacy-arkivet skyddar alla ogiltiga numeriska lektionsindex mot oavsiktlig framtida aktivering, med gröna ordinarie test- och Chromium-flöden.

## Vad är faktiskt grönt?

- Commit `191c7ec`: [verify](https://github.com/sinandelen-cmd/veckoplanering-app/actions/runs/40092038409) **SUCCESS**.
- Commit `191c7ec`: [Chromium klassanpassningar/legacy](https://github.com/sinandelen-cmd/veckoplanering-app/actions/runs/40092038389) **SUCCESS**.
- Tidigare [lokal verklig Supabase Auth/PostgREST/RLS/elev-RPC och App.jsx-elevvy](https://github.com/sinandelen-cmd/veckoplanering-app/actions/runs/40089856001) **SUCCESS**, men då med en kompatibel syntetisk RPC. Det är **inte** bevis för den nya kopian av produktions-RPC:n.
- Ny [fullstack med kopierad produktions-RPC och full redigera→publicera→elev Chromium](https://github.com/sinandelen-cmd/veckoplanering-app/actions/runs/40092038412): **inte verifierat grönt vid rapportskrivningen**. Körningen köar eller kör, och resultat måste kontrolleras separat.

## Återstående blockerare och releasebeslut

1. Ny fullstack måste avslutas grönt; fel i migration, databas-RPC eller nya App.jsx-E2E ska rättas innan slutsats.
2. Den lokala databasen är en minimal testfixtur, inte hela produktionsschemat. RPC-koden är kopierad från produktion genom read-only `pg_get_functiondef`, med **enbart NULL-fix för hideDate i testfixturen**. Produktions-RPC:n är oförändrad.
3. Eventuella externa Docker-registrykvoter är ett CI-infrastrukturproblem, inte ett godkänt E2E-resultat.

**Driftsättning/merge/publicering: EJ GODKÄNT.** Inga verkliga användaruppgifter används.
