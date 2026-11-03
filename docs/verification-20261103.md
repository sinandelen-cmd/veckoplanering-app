# Verifieringsrapport – 3 november 2026

Status: Testgrenen är rättad och kärnflödena är verifierade. Hela produkten är inte 100 % färdigverifierad. Denna sammanställning ersätter tidigare mellanrapporter.

## Omfattning och miljö

- Repository: sinandelen-cmd/veckoplanering-app.
- Gren: fix/plan-summaries-20261102.
- Senaste verifierade kod- och testcommit: 57e3d6bee8c90d5738cc473a89f3e7e4ef4522e3. Cloudflare rapporterade samma commit som kanonisk deployment vid slutkontrollen.
- Testwebbplats: https://arsplanering-isolerad-test-20261102.pages.dev/
- Bara testgrenen och syntetiska testdata ändrades. Ingen merge till main, publicering på den riktiga webbplatsen eller ändring av produktionsdatabasen/riktiga användardata.
- Mobilvy är borttagen ur uppdraget på användarens begäran.

## Verifierat i Årsplanering

| Kontroll | Resultat och gräns |
|---|---|
| Inloggning | Testkontot kunde logga in. |
| Autosparning | Grundtext och klasspecifik ändring återlästes från testdatabasen och efter omladdning i webbläsaren. |
| Klassbyten | Tio växlingar i följd visade rätt klass utan observerad frysning. Cirka 312–352 ms inklusive verktygsanrop; ingen standardiserad prestandamätning. |
| Bevarat innehåll | Grundtext följd direkt av klassbyte sparades. QA-8A:s override bestod efter omladdning utan att ändra grundtext eller QA-8B:s overrides. |
| Publicering | Publicering från webbläsaren, utkast, ompublicering och omladdning av elevlänken verifierade. Utkast ändrade inte publicerad kopia; samma slug behölls. |
| Dolda veckor | Alla dolda veckor stoppade publicering i webbläsaren. Testdata för detta laddades via SQL; bulkvalets UI-flöde är inte färdigverifierat. |
| Integritet | Anonym RPC gav 3 synliga veckor men varken dold veckas titel eller syntetisk läraranteckning. Anonym roll såg 0 rader i bastabellen. |
| Kontoisolering | Tidigare transaktionstest verifierade authenticated infoga/uppdatera/läsa, summaries och blockerat annat kontos läsning/uppdatering. Testet återställdes med ROLLBACK. |
| Datum | Automatiska beteendetester för ISO-vecka 53/1, årsskifte, svensk sommar-/vintertid och datumintervall passerar. |
| Kort A4-utskrift | Användarens bild visar innehåll på A4 stående, 100 %, sida 1 av 1 utan tydlig avklippning/överlappning. Bekräftat på iPhone. |
| Lång utskrift | Syntetiskt fall med 20 lektioner, lång text, obrutet ord, lång HTTPS-länk och fyra korta veckor. Alla moment finns i webbläsarens utskriftsunderlag. Användaren uppger att 9 sidor finns; sidornas visuella layout har inte granskats. |
| Automatiska tester | Slutkörning: 47/47 godkända, inga överhoppade. GitHub Actions för senaste kod-/testcommit passerade. |
| Lint och build | Lint: 0 fel, 47 varningar. Isolerad Vite-build godkänd; varning om stort JavaScript-paket kvarstår. |

Syntetiska planeringar: rad 7 för autosparning/klass/publicering och rad 8 för lång utskrift. Ingen verklig elevinformation användes.

## Rättningar

- Alla testskript körs nu; inaktuella testmiljöer uppdaterade.
- Fyra veckor visas som standard i stället för hela året, även efter återgång till grundplanering. Den stora syntetiska planeringen gick att öppna efter rättningen.
- Navigering till äldre veckor rättad.
- Klasskapande rättat (odefinierad days); anrop till borttagna state-setters borttagna.
- WeekDetails får definierade undo/redo-props. no-undef är nu lintfel.
- Publicera för elever/Uppdatera elevversion återställd. Missvisande text om automatisk publicering korrigerad.
- Klasspecifika overrides och lektionstider filtreras till tillåtna elevfält; regressionstest för interna fält tillagt.
- Tom utskrift rättad: utskriftssidor låg bakom avstängd gränssnittsflagga samtidigt som skärmversionen doldes vid utskrift.
- Ett äldre ofärdigt Cloudflare-testbygge som fastnat i initialize togs bort. Därefter driftsattes rättningen; ingen fungerande deployment eller produktionsmiljö togs bort.
- Testdatabasens get_public_annual_plan installerad med migration install_isolated_student_snapshot_rpc. Den returnerar endast published_content från publicerad rad med exakt slug och låst search_path. Inga tabeller/RLS-policyer ändrades av den migrationen.

## Kvar som inte är godkänt

- Visuell granskning av samtliga 9 sidor, långa veckor och utskrift från datorns Chromium. Den styrda webbläsaren tillhandahåller ingen utskriftsdialog/PDF. Inga fler filer eller manuella kontroller begärs av användaren enligt senaste instruktion.
- Bulkvalet Dölj för elever: dialog-/automationsproblem; dess fulla UI-flöde kunde inte verifieras. Publiceringsspärren med redan dolda veckor är verifierad.
- Automatisk veckopublicering saknar installerat serverstöd. Reglaget är i avstängt gränssnitt och publicering stoppas om funktionen saknar stöd. Datumhjälpfunktionernas tester bevisar inte serverstyrd veckopublicering.
- Ingen standardiserad belastningsmätning av alla lägen. Visa alla veckor kan vara tungt för mycket stora planeringar.
- Återstående scenarier i QA-SLUTTEST.md är inte automatiskt godkända av denna rapport. Inget fullständigt produktionsgodkännande lämnas.

## Elevkompassen

Senaste erhållna Replit-slutrapport: 35/35 tester godkända, inga misslyckade eller överhoppade. Byggning, typkontroll, diffkontroll och syntaxkontroll av 19 transformerade skript godkända. Detta är rapporterade resultat från Replits verifiering, inte en oberoende omkörning här.

De två senast beställda datorflödena är färdigverifierade i utvecklingsmiljön:

- Datumkontroller som saknades på aktiva startsidan har återställts.
- Datumgränsen använder nu lokalt kalenderdatum i stället för UTC.
- Historikvalet väljer senaste giltiga tidsstämpel inom datumgränsen, oberoende av insättningsordning.
- Gränssnittstest återställde anteckning A från 1 november framför B från 2 november. Native bekräftelsedialog fungerade; A bestod efter återställningens omladdning och ytterligare omladdning med normal upplåsning.
- Vanligt musklick på Skapa i klassdialogen fungerade; klassen bestod efter omladdning. Inget reproducerbart appfel i musåtkomst hittades, därför ändrades inte dialogens CSS/zoom.

Tidigare verifierat: elevblad, närvarodetaljer, IUP, ångra och krypterad backup/återställning med syntetiska uppgifter. UI, lokal krypterad lagring och återläsning testades faktiskt i utvecklingsappen. Supabase-inloggning, administratörsgodkännande och hämtning av programfil simulerades.

Tidigare verkliga anonyma Supabase-anrop nekades för status-/kontolistning och dokumentläsning (HTTP 401/42501); Storage gav HTTP 400 med intern 404 utan fil. Detta bevisar inte att behöriga användare kan hämta programmet.

Kvar utanför verifieringen: verkliga godkända/nekade konton, produktionspolicyer samt verklig serverutloggning/sessionåterkallelse. Inget produktionsgodkännande lämnas. Inga produktionsändringar eller publiceringar gjordes.

Inga dokumenterade blockerande fel återstår i de två senast beställda datorflödena. Replit nämner ytterligare fördjupning (negativa backupfall, fler tidszoner, flerfliksfall och en icke blockerande varning om flera Supabase-klientinstanser); dessa beskrivs inte som redan konstaterade blockerande fel.

## Databasrådgivning

Efter installation rapporterades två varningar om avsiktligt anropbar SECURITY DEFINER-RPC. Rolltester verifierade dess begränsning till elevkopian; varningarna har inte dolts. Se [0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) och [0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Även [skydd mot läckta lösenord](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) rapporterades avstängt i testprojektet. Autentiseringsinställningar ändrades inte.

## Drift vid avslut

Det godkända tillfälliga projektbytet är återställt och status verifierad: Årsplanering Test INACTIVE, projektet med namnet Elevkompassen ACTIVE_HEALTHY och Veckoplanering ACTIVE_HEALTHY. Testlänkarnas databas är därför pausad. Testdata och kod är bevarade. Själva Elevkompassen-appen använder Veckoplanering-projektet; det återstartade projektet med namnet Elevkompassen är ett separat tomt projekt. Produktionsdatabasen har inte pausats eller ändrats.
