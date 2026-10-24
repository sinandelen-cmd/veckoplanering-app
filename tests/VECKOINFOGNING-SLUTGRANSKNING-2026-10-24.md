# Slutgranskning av veckoinfogning – CI och säkerhetsgränser

Datum: 2026-10-24. Endast feature-grenen `feature/provtraning-infogad-vecka`, draft PR #5. Ingen produktion, publicering eller merge.

## Verifierade kodvägar och utökade fall

- Faktisk `insertBlankWeekAfter` körs isolerat med syntetiska veckor.
- Faktisk `buildClassSchedule` och `remapClassOverridesAfterInsertion` körs isolerat med klassernas olika scheman.
- Flera klassgrupper med egna anpassningar före/efter infogning.
- Flera numeriska overrides samtidigt: ska fortsätta tillhöra samma ursprungslektion.
- Överstyrning före infogningen ligger kvar; överstyrning efter infogningen räknas om.
- Inställda datum, lov/studiedagar, halvdagslektioner, extra tillfällen och dolda veckor.
- Historiska ogiltiga index: negativt, nollutfyllt, icke-numeriskt och utanför schemat. De bevaras i datan; de är inte verifierade som användbara i UI.
- Planer utan `classGroups` förblir utan fältet efter infogning.
- Datumregler: befintliga `publishDate`/`hideDate` förblir oförändrade på förskjutna veckor; infogad vecka ärver dem inte.
- Faktiska `undoPlan`/`redoPlan`-handlers har körts med syntetiska historiktillstånd, inklusive flera steg och ny ändring efter ångra. React-effekter och webbläsare ingår inte.
- Faktiska `sanitizeForStudents` körs med ett syntetiskt utkast: dolda veckor filtreras, publiceringsdatum bevaras, privat lärarfält följer inte med och ett tidigare serialiserat publiceringssnapshot påverkas inte av efterföljande ändringar i utkastet. Ny explicit sanering ger nytt snapshot.
- Befintlig SQL-regressionssvit körs av GitHub Actions i isolerad PostgreSQL; inga produktionsanrop.

## Kända blockerare och risker

1. Ingen verklig webbläsar-/React-end-to-end-testkörning har genomförts. Testerna exekverar verkliga funktionskroppar, men använder syntetiska beroenden.
2. Publiceringssnapshot-testet provar den verkliga sanitiseraren men inte Supabase-lagring, elev-RPC eller live-publicering. Detta kräver en isolerad integrationstestmiljö.
3. Ogiltiga eller historiska override-nycklar bevaras i stället för att raderas. Kollisionsfall, exempelvis ett äldre föräldralöst numeriskt index som sammanfaller med ett ommappat index, behöver en särskild produktregel och test innan generell migrering.
4. Datumanknutna klassundantag och publiceringsdatum flyttas inte med lektionens innehåll; detta är nuvarande dokumenterade beteende, inte ett nytt publiceringsbeslut.
5. Slutlig grön CI på senaste commit måste bekräftas före release-godkännande.

## Framsteg

Sju av åtta definierade kvalitetsdelar bedöms färdiga på kod-/testnivå (87,5 %). Den sista delen är **inte** färdig förrän browser- och publiceringsintegrationstest samt återstående historiska kollisionsfall är granskade. Inget godkännande för merge eller publicering.

Tidsbedömning: minst en större arbetsgrupp till för att sätta upp och köra isolerade browser-/publiceringstester och besluta om gamla kollisionsfall; kan bli fler vid fel. Ingen pålitlig minutprognos.
