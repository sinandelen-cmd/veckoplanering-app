# Slutgranskning: verklig publiceringshandler och isolerad databas

Datum: 2026-10-24. Endast `feature/provtraning-infogad-vecka`, draft PR #5.

## Fyrdubbel arbetsgrupp – 20 moment

1. Kontrollerade senaste båda GitHub Actions-arbetsflöden.
2. Bekräftade att föregående commit `d6e3572` var grön i både verify och Chromium.
3. Granskade verklig `usePlanHistory` som redan används av både produktionsapp och Chromium-fixture.
4. Bekräftade att Chromium-testet täcker verkliga React-hookens undo/redo och ogiltig redo efter ny redigering.
5. Granskade `publishFromList` i `src/App.jsx`.
6. Granskade `publicationFields` och separata fält för publicerad elevkopia.
7. Granskade `sanitizeForStudents` och klassanpassningarnas djupkopiering.
8. Byggde test som exekverar den verkliga publiceringshandlern isolerat.
9. Implementerade lokal Supabase-kompatibel adapter med id- och user_id-filter.
10. Testade att en publicering skapar elevsnapshot och bevarar klassanpassningar.
11. Testade att lärarutkastet inte kan mutera redan publicerad snapshot.
12. Testade att explicit ompublicering skapar en ny snapshot.
13. Testade att avbruten publicering inte skriver.
14. Testade att databasfel inte ändrar publicerat innehåll.
15. Testade att fel ägare och saknad rad nekas.
16. Kopplade publiceringshandler-testet till `npm run check`.
17. Skapade transaktionsbaserad PostgreSQL-fixture med temporär tabell och ROLLBACK.
18. Testade publicering, utkaständring, felaktig ägare och ompublicering i isolerad PostgreSQL 16.
19. Kopplade PostgreSQL-fixturen till CI och lade till offline-vakter mot bestående SQL-ändringar.
20. Dokumenterade verifieringsgränser och blockerare i PR och denna rapport.

## Exakt verifieringsnivå

- **Verklig React-history:** `src/usePlanHistory.js` används i produktionsappen och i Chromium-fixturen. Testet klickar ångra/gör om, ändrar planering efter ångra och kontrollerar att redo försvinner. Det är verklig React-hook, men inte hela App.jsx-inloggade redigeraren.
- **Verklig publiceringskod:** `publishFromList`, `publicationFields` och `sanitizeForStudents` hämtas från verkliga `src/App.jsx` och exekveras. Supabase-anropet ersätts med en isolerad adapter; inga nätverksanrop görs.
- **Isolerad PostgreSQL:** separat CI-service med temporär tabell, explicit ROLLBACK och inga Supabase-uppgifter. Testar JSONB-lagring och ägarkontroll, men **inte** den riktiga Supabase-tabellens RLS eller elev-RPC.
- **Legacy-override:** giltiga ommappade index prioriteras, äldre kolliderande värden sparas under `legacy-unmapped:`. Detta är automatiskt testat men saknar ett lärargränssnitt för att manuellt återkoppla arkiverade värden.

## Kvarvarande blockerare

1. Full end-to-end-körning av inloggad `App.jsx` med verklig användarinteraktion och publiceringsflöde.
2. Isolerad Supabase-testinstans med faktisk tabell, RLS och `get_public_annual_plan`-RPC. Detta har **inte** körts.
3. Produktbeslut och UI för hur `legacy-unmapped:`-anpassningar ska återkopplas.
4. Senaste commitens båda GitHub Actions-jobb måste vara gröna innan slutligt godkännande.
5. Release kräver användarens uttryckliga godkännande; ingen produktion, publicering eller merge.

**Status:** 7/8 kvalitetsdelar på verifierad tidigare nivå, 1/8 kvar (87,5 %). De nya isolerade publiceringstesterna minskar risken men ersätter inte den sista fulla integrationen. **Tidsbedömning:** minst en större arbetsgrupp för riktig isolerad Supabase-RPC/RLS och inloggad App.jsx-browserintegration, potentiellt fler om infrastrukturen eller buggar kräver det.
