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
