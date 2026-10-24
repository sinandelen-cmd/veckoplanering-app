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

## Uppföljande arbetsgrupp – datum, historik och klassmodell
- GitHub Actions för tidigare utökning `af3273b8` och rapportcommit `e098a276` har **success** i båda jobben. En tidigare mellanliggande commit `c5e98f9` misslyckades; den efterföljande rättningen passerade.
- Syntetiska tester har kompletterats med W14–W15 (första/sista mellanrum), W23 (bevarande av publicerings-/döljdatum), W33 (klassundantag/overrides), fler ogiltiga provnummer och avbrutet provnamn.
- Testernas klassdata använder nu verkligare modellfält: `days`, `startDate`, `cancelledDates`, `extraSlots`, `lessonTimes` och `overrides`.
- `StudentView` bygger klassernas veckokort från grundplaneringens `weeksData` och skapar klasslektioner via `buildClassSchedule`. En ändring i grundplaneringens veckodatum kan därför påverka klassvyer även när `classGroups` är oförändrade.
- **Datumregel ej beslutad:** nya W23 kontrollerar *nuvarande beteende* (kalenderdatumen för `publishDate`/`hideDate` behålls). Det är inte ett beslut om önskat beteende.
- **Ångra/gör om:** tidigare snapshot-testet är en modellkontroll och inte ett React-hook- eller webbläsartest. Det kan inte ensamt godkänna UI-historiken.
- **Beslutspunkter:** (A) ska publicerings-/döljdatum ligga fast eller flyttas med veckan? (B) ska klassernas datumanknutna undantag/overrides ligga kvar på kalenderdatum eller följa flyttade veckor? (C) hur ska redan publicerade elevvyer påverkas av ett senare utkast?
- **CI-status:** den senaste teständringen `db3b976` måste få egen avslutad körning innan dess nya fall kan rapporteras gröna.
