# FYRDUBBEL kvalitetsgrupp – isolerad Supabase och Chromium, 2026-10-24

## Ändringsgräns
Endast feature-grenen `feature/provtraning-infogad-vecka`, PR #5 och isolerade GitHub Actions-runners. Ingen produktionsmigration, publicering eller merge. Den enda anslutningen till verkliga Supabase-projektet var en **skrivskyddad** `pg_get_functiondef` för elev-RPC:n.

## 18 genomförda arbetsmoment
1. Läste aktuell Actions-status och skilde på grön verifiering, grön Chromium och felande fullstack.
2. Hämtade den faktiska elev-RPC-definitionen skrivskyddat från Veckoplanering.
3. Arkiverade exakt RPC-text i `tests/sql/production-rpc-readonly-snapshot.sql` (referens, aldrig deploy).
4. Bytte ut förenklad test-RPC mot produktions-RPC:ns fullständiga kod i isolerad fixture.
5. Ändrade **endast** `hideDate`-NULL-predikatet med `coalesce` i den isolerade RPC-kopian.
6. Behöll lokala Auth-, PostgREST- och RLS-fixturer separat från produktionsmigreringar.
7. Utökade API-test för senaste två automatiskt frisläppta veckor.
8. Utökade API-test för framtida veckor som inte ska synas.
9. Utökade API-test för lov/studiedagar begränsade till synliga veckor.
10. Behöll negativa API-test för utkast, okänd slug och avpublicering.
11. Behöll negativa RLS-test för anonym direktåtkomst och andra lärares planer.
12. Utökade Chromium-scenariot med verklig inloggning och navigation till lärarplanering.
13. Lade till verklig redigering av synligt veckoinnehåll i `App.jsx`.
14. Lade till väntan på automatisk publicering i lokal PostgREST och kontroll av elevsnapshot.
15. Lade till Chromium-navigering till den nyskapade elevlänken och kontroll av dolt innehåll.
16. Åtgärdade ett separat legacy-fel: även icke-kolliderande ogiltiga numeriska klassindex arkiveras som `legacy-unmapped:`, så de inte senare kan börja gälla för fel lektion.
17. Uppdaterade syntetiska regressionsfall för arkivering, framtida aktivering och kollisioner; rättade två äldre assertions som avsåg det tidigare osäkra beteendet.
18. Felsökte verkliga GitHub Actions-fel: först SQL-terminator som saknades efter RPC:n, därefter Docker-registrets `toomanyrequests: Data limit exceeded`. Lade till CLI-dokumenterat `--exclude` för onödiga Docker-tjänster, med GoTrue/Auth, PostgREST, Kong och Postgres kvar.

## Bevisade resultat och begränsningar
- **Grönt**: `Kontrollera årsplanering` (inklusive kontroller/bygg) för `d126badd`, Actions `40091343649`.
- **Grönt**: `Isolerad Chromium-kontroll` för `d126badd`, Actions `40091343642`. Detta är ett verkligt Chromium-test av klasshantering, undo/redo och manuell återkoppling från legacy-arkiv, men **inte** det nya fullstack-scenariot.
- **Fel**: `Isolerad Supabase fullstack` för `cb41b2f`, Actions `40091028985`, nådde migration men misslyckades på saknat SQL-semikolon. Semikolonet har rättats.
- **Fel**: `Isolerad Supabase fullstack` för `d126badd`, Actions `40091343648`, stoppades innan lokal databas kunde starta på Docker-registrets `toomanyrequests: Data limit exceeded`. Inga Auth/RLS/RPC/E2E-assertions från den körningen får räknas som godkända.
- Den senast ändrade workflow-konfigurationen startar endast nödvändiga tjänster för att minska Docker-nedladdningarna. Detta är en **åtgärd att verifiera**, inte bevis för att registerbegränsningen har upphört.
- Verklig produktions-RPC **har inte ändrats**. Därför kvarstår produktionsbuggen med saknat `hideDate` tills användaren separat godkänner säker migrationsplan.
- Den nya `App.jsx` → lokal Auth → redigering → PostgREST-autopublicering → elev-RPC → Chromium-elevvy-kedjan är **implementerad som test**, men **inte ännu grönkörd**.

## Fortsatt kvalitetsgrind
1. Få fullstackens Docker-images nedladdade i en isolerad runner; minska eller spegla images på ett kontrollerat sätt vid fortsatt registry-begränsning.
2. Kör hela Auth/PostgREST/RLS/RPC-kontraktet och rätta eventuella faktiska SQL-/schemafel.
3. Kör hela Chromium-redigera/publicera/elevvy-testet och rätta faktiska UI- eller fixturefel.
4. Kräv tre gröna workflows på **samma slutcommit** innan kvalitetsdelen kan kallas slutverifierad.
5. Ingen produktion, publicering eller merge utan uttryckligt separat godkännande.

## Status
Samma produktomfattning som tidigare: **7 av 8 delar, 87,5 %**. Den sista delen är den verkliga end-to-end-kvalitetsgrinden. Uppskattning: **2–5 timmar aktivt test-/felsökningsarbete** om Docker-registret svarar, annars längre väntetid eller alternativ isolerad testmiljö. Detta är en uppskattning, inte ett löfte.
