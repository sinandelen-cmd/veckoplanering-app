# Beslutsunderlag – veckoinfogning, datum och kopplade klasser

**2026-10-24.** PR #5 är draft. Inga produktionsändringar eller merge.

## Verifierat
- GitHub Actions för `662aa60` och `db3b976` avslutades med success (verify + sql-regressions).
- `insertBlankWeekAfter` flyttar efterföljande `weekStart` och veckonummer +7 dagar; `publishDate` och `hideDate` följer inte med automatiskt.
- `src/ClassSchedules.jsx` bygger schemat direkt från grundplaneringens `weeksData`; varje klass har egna veckodagar, inställda datum, extra tillfällen, ledigheter och `overrides`.
- **Viktig risk:** `buildClassSchedule` använder `group.overrides[String(lessonNumber-1)]` – alltså ordningsindex, inte datum eller stabilt lektions-ID. När en ny vecka läggs in före befintliga lektioner kan en klasspecifik override flytta till ett annat moment. Testerna dokumenterar nu detta nuvarande beteende, inte önskat resultat.
- Nya syntetiska kontroller kör verklig `buildClassSchedule` tillsammans med verklig veckoinfogningsfunktion. Detta är inte React- eller webbläsartest.

## Rekommenderade beslut före rättning
1. **Publicerings-/döljdatum:** behåll datumen som kalenderbundna som säker standard, om inte användaren uttryckligen väljer att flytta dem. Undvik tyst förlängd synlighet eller automatisk publicering.
2. **Klassens inställda dagar, lov och extra tillfällen:** behåll datumanknytningen. Dessa är kalenderhändelser.
3. **Klasspecifika lektionsanpassningar:** knyt dem långsiktigt till stabilt lektions-ID i stället för globalt ordningsindex. Gör separat kompatibilitetsplan för redan sparade `overrides`; migrera inte produktionsdata utan godkännande.
4. **Publicerad elevvy:** behåll befintlig publicerad snapshot vid ändring av privat utkast; uppdatera endast efter uttrycklig ompublicering.
5. **Ångra/gör om:** genomför ett verkligt React/browser-test före merge; nuvarande snapshot-test täcker inte hook-synkronisering.

## Leveransstatus och tidsbedömning
Arbetsgruppens fyra spår: (1) kontroll av tidigare CI – klart, (2) datumregler – analyserat, beslut kvar, (3) klasschema – testat syntetiskt, beteenderisk kvar, (4) dokumentation – klart. Ny CI efter senaste testcommit måste verifieras separat.

**Ingen exakt tidsprognos är möjlig utan verifierad testmiljö och produktbeslut.** En realistisk plan är ytterligare minst en arbetsgrupp för klassöverstyrningar/React-tester och en för slutgranskning. Detta är arbetsgrupper, inte minuter eller löften om färdigtid.

## Dubbel arbetsgrupp: konkret testutökning och kompatibilitetsanalys
- CI på `2450715` var röd i `verify/npm run check`, medan `sql-regressions` var grön. Den nya klassens override-assertion jämförde `weekStart`, men insatt vecka upptar samma kalenderdatum som den tidigare veckan. Assertionen ändrades till att jämföra faktiskt lektions-ID före/efter; ingen produktionskod ändrades.
- Fiktiva klassgrupper använder nu riktiga schemafält. Nya scenarier täcker två klassers veckokoppling, inställda dagar, extra fredagstillfällen, dolda veckor och förskjutet innehåll.
- Testerna extraherar dessutom de **verkliga** `undoPlan`/`redoPlan`-hanterarna ur `src/App.jsx` och provar flera steg bakåt/framåt. React-livscykeln och webbläsarinteraktioner omfattas fortfarande inte.
- **Kompatibilitetsrisk:** Befintliga klassanpassningar lagras med index för lektionens ordning. Att tyst skriva om dem vid veckoinfogning är riskabelt när klasser har olika veckodagar, inställda lektioner eller extra tillfällen. Rekommenderad väg: identifiera stabil lektionsidentitet, definiera hur äldre indexnycklar läses, testa flera klassscheman och migrera först efter särskilt beslut. Inga produktionsmigreringar.
- **Säkerhet:** `publishDate` och `hideDate` är fortfarande kalenderbundna; testet dokumenterar befintligt beteende, inte en godkänd produktregel. Publicerat snapshot ska inte påverkas av utkast före uttrycklig publicering.
- **CI för de allra senaste testerna:** måste verifieras separat innan arbetet kan kallas grönt.

## Ny implementering på feature-grenen: remappning av klassanpassningar
- `src/ClassSchedules.jsx` exporterar `remapClassOverridesAfterInsertion(previous,next,index)`. Den bygger före/efter-scheman med samma `buildClassSchedule` som elev- och lärarvyn och flyttar numeriska `overrides`-nycklar till det nya ordningsnumret för samma ursprungliga vecka och lektionsposition.
- `src/App.jsx` anropar remappningen atomärt i samma `setPlan`-uppdatering som infogar veckan. Planeringar utan `classGroups` får ingen ny tom egenskap.
- Befintligt format (ordningsindex som strängar) bevaras; ingen databasändring eller massmigrering. Icke-numeriska äldre nycklar lämnas orörda.
- Regressionsfallet för en klassanpassning som låg på lektion 2 före infogning kräver nu att den ligger på ursprungslektionen efter infogning och inte på den nyinfogade veckan.
- **Begränsning:** Om ett gammalt override-index inte kan matchas mot schemat behålls dess nyckel. Detta kan ge tvetydighet för felaktiga eller historiska data. Kollisionsfall och fullständiga UI-/publiceringstester kräver vidare verifiering före merge.
- GitHub Actions måste bli gröna för den nya implementationen; mellanliggande commits hade röda tester eftersom testhärvan inte först stödde den nya helpern. Rätta och verifiera innan slutgodkännande.
