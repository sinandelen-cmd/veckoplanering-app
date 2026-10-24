# Fyrdubbel slutgranskning – isolerad RLS och arkiverade klassanpassningar

Datum: 2026-10-24. Feature-gren och draft PR #5; ingen produktion, publicering eller merge.

## Arbetsmoment (16)

1. Hämtade senaste GitHub Actions-status.
2. Bekräftade att tidigare fullständig kodversion `bcacebb` hade grön verify och Chromium.
3. Granskade `src/supabase.js` och produktionsanslutningens standardvärden.
4. Granskade att Chromium-fixturen redan använder verkliga `usePlanHistory`-hooken.
5. Granskade verklig `ClassSchedules` och äldre `legacy-unmapped:`-nycklar.
6. Identifierade att arkiverade värden saknade synlig information för läraren.
7. Lade till en icke-destruktiv varning med antal arkiverade klassanpassningar.
8. Avstod från automatisk återkoppling till osäker lektion.
9. Lade in ett arkiverat värde i browser-fixturen.
10. Säkerställde att fixturens indexkontroll bara räknar aktiva numeriska overrides.
11. Lade till Chromium-kontroll av lärarens arkivvarning.
12. Skapade PostgreSQL 16-test för två roller: elev och lärare.
13. Lade till isolerade policyregler för publicerat/privat innehåll och ägarskap.
14. Lade till negativa kontroller av privat rad och annan lärares rad.
15. Kopplade RLS-fixturen till det befintliga isolerade SQL-jobbet.
16. Granskade officiell Supabase-dokumentation om lokal stack och dokumenterade testgränser.

## Exakt omfattning och blockerare

- **React:** Chromium använder verklig klasskomponent och verklig delad React-hook för undo/redo, men kör fortfarande en separat test-fixture, inte hela inloggade App.jsx.
- **Arkiv:** Varningen visar antal arkiverade anpassningar, men avslöjar inte deras text och placerar dem inte automatiskt på någon annan lektion. Manuell återkopplingsfunktion är ännu inte byggd.
- **RLS:** PostgreSQL-fixturen skapar *egna* testroller och egna policies i en transaktion. Den använder inte produktionsschemats verkliga Supabase-policies eller RPC. Verifiera att PostgreSQL-jobbet är grönt innan RLS-simuleringen markeras som passerad.
- **Supabase:** Lokal fullstack med Auth och PostgREST är inte installerad eller körd i den här arbetsgruppen. Detta behövs för verklig inloggad App.jsx-E2E och faktisk elev-RPC. Inga produktionsnycklar eller produktionsdata får användas.
- **CI:** Senaste körningar efter ändringarna måste bekräftas. Tidigare gröna körningar bevisar inte att nya RLS-testet är grönt.

**Status:** 7/8 tidigare verifierade kvalitetsdelar, 87,5 %. Den sista delen är inte klar. Bedömning: minst en större arbetsgrupp, sannolikt fler om en lokal Supabase-stack och inloggad E2E måste byggas upp från grunden. Release kräver separat användargodkännande.
