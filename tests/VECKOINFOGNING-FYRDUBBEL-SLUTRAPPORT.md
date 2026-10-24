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
