# Slutgranskning – isolerad fullstack och manuell återkoppling

Datum: 2026-10-24. Allt på feature-grenen och draft PR #5. **Ingen produktionsändring, ingen publik publicering och ingen merge.**

## Implementerat

1. `.github/workflows/isolated-supabase-fullstack.yml` startar en helt fristående Supabase CLI/Docker-stack på GitHub Actions-runnaren, utan att länka mot något Supabase-projekt.
2. Befintliga `supabase/migrations` flyttas till en separat temporär mapp **endast i CI-checkouten**. De hör till en annan schemahistorik och skulle annars göra den syntetiska isolerade teststacken omöjlig att starta.
3. Den testunika SQL-fixturen `tests/sql/local-supabase-fullstack-fixture.sql` skapar `teacher_access`, `veckoplanering`, ägar-RLS, offentlig elev-RPC och explicit EXECUTE. Det är **inte** en produktionsmigration eller en exakt kopia av produktionens schema/RPC.
4. `tests/local-supabase-fullstack-check.mjs` registrerar två fiktiva lärare i verklig lokal GoTrue, loggar in med lösenord, anropar PostgREST, testar åtkomst till eget/annans konto och plan, hindrar ägarbyte, samt kontrollerar elev-RPC före/efter lokal publicering och efter avpublicering. Dolda och utgångna veckor testas.
5. `tests/browser-local-supabase-fullstack-check.mjs` öppnar den **riktiga App.jsx i Chromium** mot denna lokala fullstack, loggar in med fiktiv lärare, öppnar publik elevlänk och kontrollerar dolda/utgångna veckor och okänd elevlänk. Inga API-anrop till produktion ska förekomma.
6. `src/ClassSchedules.jsx` erbjuder manuell återkoppling av `legacy-unmapped:`-anpassningar: läraren väljer mottagande lektion, kan inte skriva över befintlig anpassning och måste bekräfta. Arkiverad post tas bort först efter uttryckligt godkännande och kan ångras/göras om.
7. `tests/browser-integration-check.mjs` testar arkivåterkoppling med riktiga Chromium-klick, samt ångra/gör om.
8. CI begränsar parallella fullstackjobb med `cancel-in-progress` för att undvika onödiga Docker-nedladdningar.

## Viktiga begränsningar

- Även om den isolerade fullstacken kör grönt är testdatabasen **en kompatibel modell**, inte det fullständiga produktionsschemat. Produktionens exakta `public.get_public_annual_plan` har inte flyttats till teststacken och dess säkerhet kan inte förklaras fullt verifierad av detta test.
- GitHub Actions måste visa **success för senaste commit i alla tre workflows** innan testerna kan räknas som slutligt gröna.
- Lokal `published=true` i syntetiska testposter är en säkerhetskontroll, **inte** publicering till elever eller produktion.
- Det återstår en separat säkerhetsgranskning och uttryckligt godkännande före någon produktionsdriftsättning. SQL-förslaget för saknat `hideDate` ligger kvar enbart som förslag.

## Status

Det tidigare paketet 7/8 (87,5 %) avsåg den definierade kvalitetssäkringsplanen, inte fullständig produktionsparitet. Slutpaketet kan bara räknas som färdigt när aktuella CI-körningar är gröna och återstående begränsningar uttryckligen godtas.
