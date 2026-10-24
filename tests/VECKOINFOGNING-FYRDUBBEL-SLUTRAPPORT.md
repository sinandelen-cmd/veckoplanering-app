# Fyrdubbel arbetsgrupp – slutrapport och kvarvarande säkerhetskrav

Datum: 2026-10-24. Branch: `feature/provtraning-infogad-vecka`. PR #5 draft. Ingen produktion, publicering eller merge.

## Genomförda kontrollmoment
1. Verifierat tidigare CI på `5444668`: success.
2. Verifierat tidigare CI på `f682b7f`: success.
3. Granskat `insertBlankWeekAfter` och dess 52-veckorsspärr.
4. Granskat datumskifte och veckonummer över ISO-årsskifte.
5. Granskat `publishDate` och `hideDate`: kalenderdatumen behålls.
6. Granskat elevvyernas beroende av grundplaneringens `weeksData`.
7. Granskat `buildClassSchedule` med flera veckodagar.
8. Granskat inställda klassdatum.
9. Granskat extra klasslektionstillfällen.
10. Granskat hel- och halvdagsledigheter.
11. Granskat dolda veckors klasslektioner.
12. Granskat klassanpassningar med ordinala `overrides`-nycklar.
13. Granskat bakåtkompatibilitetsrisk vid byte till stabil lektionsidentitet.
14. Utökat test för eget provnamn.
15. Utökat test för tomt lektionsschema.
16. Utökat test för bevarande av kapitel, länkar och synlighetsmetadata.
17. Utökat test för två klassers olika veckodagar och studiedag/halvdag.
18. Utökat test för publiceringsmetadata på ny vecka kontra förskjuten befintlig vecka.
19. Utökat modelltest för redo-invalidering efter ny redigering.
20. Dokumenterat kvarvarande risker och CI-läget.

## Viktig teknisk risk
`buildClassSchedule` kopplar klassens egna ändringar via `group.overrides[String(lessonNumber-1)]`. Infogad vecka före en ändrad lektion kan därmed få klassens override att peka på annat innehåll. Att byta lagringsnycklar utan migrationsstrategi riskerar att tappa eller felplacera befintliga klassändringar. **Ingen sådan runtime-ändring har gjorts**.

Rekommenderad separat implementering: inför stabila lektionsnycklar och explicit legacy-fallback, definiera migreringsregler, testa olika schema-/lovkombinationer, gör verkliga UI-tester och begär godkännande före publicering.

## Säkerhet och testgränser
- `publishDate` och `hideDate` flyttas inte när efterföljande veckor flyttas; ingen ändring av detta utan produktbeslut.
- Klassernas datumanknutna ledigheter, inställda dagar och extra tillfällen är fortsatt kalenderbundna.
- Ångra/gör om testas med verkliga handler-kodutdrag och syntetiska tillstånd; React-livscykel och UI har **inte** testats i webbläsare.
- Tester av `buildClassSchedule` kör verklig funktionskod med syntetiska planer, inte publicerad elevvy eller produktionsdata.
- Publiceringssnapshot och RPC-beteende kräver separat integrationstest.
- Senaste CI för de nya ändringarna måste ha avslutad grön körning innan godkännande.

## Framsteg
Av åtta definierade kvalitetsdelar är sex klara på test-/analysnivå. Två kvar: (1) robust bakåtkompatibel klassanpassning + webbläsartester och (2) fullständig publicerings-/säkerhetsgranskning med godkännande. **6/8 = 75 %.** Detta är en planeringsindikator, inte ett bevis på att 75 % av alla möjliga testfall passerat.

Tidsbedömning: minst en ytterligare större arbetsgrupp för klassidentitetsdesign och webbläsartestmiljö, plus en slutgranskning. Ingen tillförlitlig minutprognos finns utan produktbeslut och integrationstestmiljö.

## Kompletterande slutgranskning – äldre data och verkliga kodvägar

- GitHub Actions för `c78c6d2` avslutades med **success**, inklusive `verify` och isolerade SQL-regressioner.
- `tests/week-insertion-check.mjs` har utökats med verklig `insertBlankWeekAfter`, `buildClassSchedule` och `remapClassOverridesAfterInsertion` i samma syntetiska testflöde.
- Nya scenarier täcker två klassers oberoende överstyrningar, anpassningar före infogningen, äldre icke-numeriska nycklar, index utanför schemat, inställd klassdag och återställning av ursprunglig snapshot.
- Dessa tester verifierar bakåtkompatibel omnumrering i minnet; de verifierar inte en faktisk Supabase-publicering, nätverksanrop, React-livscykel eller användarinteraktion i webbläsare.
- Granskningen av `sanitizeForStudents` visar att publicerad data bygger på separat sanerat planeringsinnehåll. Detta är kodgranskning, inte ett fullständigt publiceringsintegrationstest.
- **Kvarstående edge case:** när en tidigare klassanpassning saknar matchande lektion lämnas nyckeln kvar. Det skyddar mot databortfall, men kan innebära att en framtida ändring av klassens schema återanvänder samma index. Beslut om arkivering/identifiering krävs före produktionsgodkännande.
- Senaste utökade CI-körningen måste bli grön innan denna arbetsgrupp räknas som godkänd.
- PR #5 förblir draft; ingen merge, produktionsändring eller publicering.

**Framsteg:** 7/8 definierade delar har automatiska kontroller och kodgranskning. 1/8 återstår: fullständig gränssnitts-/publiceringsintegration samt beslut om historiska överstyrningar. 87,5 % är planeringsstatus, inte uppmätt täckningsgrad. Tid kvar kan inte anges exakt; bedömningen är minst en större arbetsgrupp för integration och beslut.
