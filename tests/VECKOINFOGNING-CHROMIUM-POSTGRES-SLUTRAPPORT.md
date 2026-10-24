# Fyrdubbel kvalitetssäkring – Chromium och isolerad PostgreSQL

Datum: 2026-10-24. Endast feature-grenen `feature/provtraning-infogad-vecka`, draft PR #5. Ingen produktion, publicering eller merge.

## Genomförda arbetsmoment

1. Kontrollerade senaste fullständiga GitHub Actions: `5f33ef0` var grön.
2. Granskade tidigare React SSR-regression och befintliga CI-jobb.
3. Kontrollerade Playwrights dokumenterade GitHub Actions-stöd.
4. Granskade faktiska klassvyns meny, schema och expanderbara veckor.
5. Skapade isolerad Vite/React-fixture för klassvyn.
6. Lade in två klassgrupper med olika lektionsdagar och separata overrides.
7. Byggde fixture-inläggning som använder produktionsfunktionens verkliga `remapClassOverridesAfterInsertion`.
8. Byggde fixture-knappar för ångra/gör om med lokal React-state. **Detta är inte produktionsappens undo/redo-handler.**
9. Skapade ett Chromium-test som klickar i den faktiska `ClassSchedules`-komponenten.
10. Lade till kontroller av override-nycklar före/efter veckoinfogning.
11. Lade till kontroller av återställning och återinsättning i fixture-historiken.
12. Lade till kontroll av klassbyte 8A till 8B.
13. Skapade separat GitHub Actions-jobb för Chromium med lokalt Vite-test, utan Supabase-uppgifter.
14. Installerade Playwright tillfälligt i CI utan att ändra projektets npm-lockfil.
15. Skapade isolerad PostgreSQL JSONB-fixture för publiceringssnapshots.
16. Lade till fyra SQL-fall: publicerad titel, klassoverride, lektionstid och explicit ny snapshot.
17. Kopplade SQL-filen till PostgreSQL 16-jobbet.
18. Utökade offlinekontrollen av SQL-fixturens read-only-egenskaper.
19. Rättade en testkontroll som räknade semikolon även i SQL-kommentarer.
20. Utredde Chromium-testets första fel: klassveckor är hopfällda tills användaren klickar; lade till explicita veckoklick.

## Verifieringsgränser

- Chromium kör en riktig webbläsare och den riktiga React-komponenten, men mot **en separat test-fixture**. Veckoinfogningens override-remapper är verklig produktionskod; fixture-historiken är inte den faktiska `App.jsx`-historiken.
- SQL-fallen körs mot isolerad PostgreSQL och verifierar JSONB-snapshotprinciper. De anropar inte den verkliga Supabase-RPC:n eller lagrar något i produktion.
- Kodvägstester för verkliga `undoPlan`/`redoPlan` och `sanitizeForStudents` finns sedan tidigare och körs i ordinarie check.
- Ett riktigt end-to-end-test av hela `App.jsx`, inklusive autentisering och publicering, är **inte** klart.
- `legacy-unmapped:`-nycklar för gamla index skyddas mot överskrivning men saknar gränssnitt för manuell återkoppling.
- Nya GitHub Actions-körningar kan ha pågående status eller fel. Kräv slutlig grön status för **båda** jobb innan nytt teststeg räknas som godkänt.

## Kvalitetsstatus

7/8 delar klara på tidigare verifierad nivå, 1/8 återstår för fullständig app-/publiceringsintegration. 87,5 % av den definierade åttadelade kvalitetssäkringsplanen, inte en uppskattning av total testtäckning. Bedömning: minst en stor arbetsgrupp för att slutföra, stabilisera och eventuellt bygga riktig isolerad auth/publiceringsintegration; fler om CI visar fel. Ingen minutgaranti.

## Utfall efter verkliga Chromium-körningar

- Första browser-körningen visade att schemaveckan är hopfälld tills den klickas upp. Testet rättades.
- Nästa browser-körning tog sig förbi veckoinfogning och fixture-ångra/gör om men misslyckades vid klassbyte, eftersom produktionskomponenten avsiktligt stänger panelen för enskilda ändringar när en ny klass väljs. Testet öppnar nu panelen igen (`1ebda81`).
- SQL-jobbet och ordinarie `verify` är **gröna** på `3e0fdd0` (run `40086348217`). Den fullständiga browser-körningen för senaste teständringen måste fortfarande verifieras.
- Browser-testets historik är en **fixture-implementation**, inte ett test av produktionsappens React-history-effekter. Kvarvarande sista kvalitetsdel får inte markeras färdig enbart på grund av browser-fixturen.
