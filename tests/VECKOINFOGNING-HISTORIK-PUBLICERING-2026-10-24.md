# Slutgranskning – riktig React-historik och isolerad publiceringslagring

Datum 2026-10-24. Feature-gren `feature/provtraning-infogad-vecka`; PR #5 förblir draft. **Ingen produktion, publicering eller merge.**

## Genomförd fyrdubbel arbetsgrupp

1. Verifierat att baslinjens ordinarie GitHub Actions och Chromium var gröna på `b2baaa5`.
2. Granskat verkliga historikfunktionerna och React-effekten i `src/App.jsx`.
3. Granskat tidigare Chromium-fixtur och bekräftat att den tidigare använde en egen historik.
4. Extraherat historikfunktionen till `src/usePlanHistory.js` utan avsedd beteendeförändring.
5. Kopplat riktiga `App.jsx` till den gemensamma historikfunktionen.
6. Anpassat befintliga kodvägstester till samma verkliga historikmodul.
7. Kopplat isolerad Chromium-fixture till den **verkliga produktionshooken**.
8. Behållit faktisk `ClassSchedules` och `remapClassOverridesAfterInsertion` i Chromium-fixturen.
9. Testat klickad veckoinfogning, ångra och gör om med React-state.
10. Testat ny redigering efter ångra och krav på att gör om rensas.
11. **Hittat verklig bugg:** skip-flaggan för historiken förblev sann när useEffect såg ett redan återställt snapshot; nästa redigering registrerades inte och redo fanns kvar.
12. Rättat skip-flaggan i den gemensamma produktionshooken `46861a7`.
13. Utökat Chromium-testet så en ny redigering efter ångra själv kan ångras och göras om.
14. Granskat verklig publiceringssanitiserare `sanitizeForStudents` och befintliga snapshot-regressioner.
15. Skapat isolerad PostgreSQL-fixture med TEMP TABLE och transaktion.
16. Testat sparat publiceringssnapshot mot senare ändringar av lärarutkastet.
17. Testat explicit ersättning av sparat snapshot vid ny publicering.
18. Kopplat transaktionstestet till befintligt isolerat PostgreSQL 16 CI-jobb.
19. Verifierat att CI-databasen är en lokal GitHub Actions-service med hårdkodad localhost och inte Supabase.
20. Kontrollerat legacy-remappning och dess bevarade `legacy-unmapped:`-nycklar; dokumenterat att användargränssnitt för återkoppling saknas.

## Vad de nya testerna faktiskt gör

**React/Chromium:** använder den verkliga `usePlanHistory`-hooken som också används av `App.jsx`, den verkliga klasskomponenten och verklig override-remappning. Testet monterar en isolerad React-fixture, inte hela `App.jsx` med autentisering, laddning och sparande. Ny redigering efter ångra är en verklig React-effekt i webbläsaren, inte simulerad useEffect.

**PostgreSQL:** en faktisk isolerad PostgreSQL-instans utför CREATE TEMP TABLE, INSERT, UPDATE, SELECT och ROLLBACK. Den bekräftar att publicerat JSONB-värde inte ändras när utkastet uppdateras och att explicit ny publicering ersätter snapshot. Den kör inte appens verkliga Supabase-klient, RLS-policy eller publik RPC.

**Kodvägstest:** `sanitizeForStudents` har separat exekverats från faktisk App-kod med syntetiska data; deep-copy av klassanpassningar och tider har verifierats.

## Återstående blockerare

- Full App.jsx E2E med riktig inloggning och UI-flöde för publicering.
- Isolerad Supabase-miljö som verifierar verklig databas-RPC, RLS och elevåtkomst. Inga produktionsuppgifter får användas.
- Beslut om UI för `legacy-unmapped:`-anpassningar och om användaren ska kunna återkoppla dem.
- Slutligt produkt-/releasegodkännande och verifierat gröna senaste GitHub Actions.

**Status:** 7 av 8 definierade kvalitetsdelar, 87,5 %, kvar 1. Den sista delen kan inte markeras som färdig innan ovanstående blockerare är lösta. Bedömd kvarvarande tid: minst en större arbetsgrupp för isolerad Supabase-/App-integration; kan kräva fler beroende på testmiljö och eventuella fel. Ingen tids- eller releasegaranti.
