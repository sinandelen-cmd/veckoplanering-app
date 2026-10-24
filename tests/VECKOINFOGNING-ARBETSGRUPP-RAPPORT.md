# Arbetsgrupp – veckoinfogning och kvalitetssäkring (2026-10-24)

**Branch:** `feature/provtraning-infogad-vecka`. **Ingen produktion, ingen merge.**

## Utfört
- Utökat `tests/week-insertion-check.mjs` med syntetiska scenarier för 51→52 veckor, spärr vid 52, ogiltiga index, ISO-årsskifte, egna veckorubriker, bevarande av lektionsinnehåll och metadata samt oförändrade `classGroups`.
- Lagt till ett isolerat snapshot-kontrakt för ångra/gör om. Detta är **inte** ett React-webbläsartest och verifierar inte `useEffect`/UI-historik.
- Granskat `insertBlankWeekAfter`: förskjuter efterföljande `weekStart`, `weekNumber` och automatiska titlar; bevarar övriga objektfält, inklusive `classGroups`, oförändrade.
- Korrigerat förväntade ISO-veckonummer i ett nytt test innan slutlig verifiering.

## Fortfarande öppet
1. **Kopplade klasser:** Oförändrade `classGroups` visar att metadata inte skrivs över, men bevisar inte att respektive klasschema och kopplade lektioner är rätt efter infogning. Kräver produktbeslut och verkligt integrationstest.
2. **Datumsemantik:** `publishDate`, `hideDate` och eventuella lektionsspecifika datum flyttas inte uttryckligen. Avgör om de ska följa med veckan eller ligga kvar på kalenderdatum innan ändring.
3. **Ångra/gör om:** Kräver browser-test för React-historik, fokus, sparning och upprepad användning.
4. **Publicering:** Verifiera att elevsnapshot inte påverkas före explicit ompublicering.
5. **CI:** Slutlig körning på senaste commit ska kontrolleras innan något påstås godkänt.

**Teststatus:** Ny kod incheckad; resultatet för senaste commit måste hämtas från GitHub Actions. Äldre grön körning avser inte de nya fallen.
