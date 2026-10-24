# Testmatris – infoga vecka, provträning, prov och kopplade klasser

**Status:** gransknings- och testplan för PR #5. Inte bevis på genomförda tester. Kör med fiktiva data i isolerad miljö. **Ingen produktionsdata, migrering eller driftsättning.**

## Förutsättningar
Skapa syntetiska årsplaneringar med 1, 2, 3, 51 och 52 veckor, varierande antal lektioner (0, 1, 2, 5), unika lektions-ID:n och innehåll, datum vid årsskifte och terminsgräns, minst två kopplade klasser med avvikande scheman samt publicerad och opublicerad variant. Ta snapshots av hela planeringen inklusive klassgrupper och publiceringsfält före varje fall. Kör alla tre lägena via den faktiska knappen och webbläsardialogerna.

## Testfall och förväntade resultat

| ID | Scenario | Förväntat resultat | Typ |
|---|---|---|---|
| W01 | Infoga vanlig vecka mellan två veckor | Exakt en ny vecka med standardlektioner, utan provmarkering; alla följande veckor +7 dagar | UI + data |
| W02 | Välj 2: Träna inför prov | Samtliga nya lektioner har träningsmoment; `weekActivity=provtraning`; inga prov | UI + data |
| W03 | Välj 3: Provträning + prov, prov på sista lektionen | Föregående lektioner är träning, vald lektion har `assessment.type=Prov`, efterföljande lektioner neutrala | UI + data |
| W04 | Välj 3, prov på första lektionen | Första lektionen prov; resterande neutrala; inget negativt index | UI + data |
| W05 | Prov i mellanliggande lektion | Endast vald lektion får prov, tidigare träningsmoment, senare neutrala | UI + data |
| W06 | Ändra provnamn | Provtitel och lektionsmoment visar angivet namn, utan att påverka andra veckor | UI + data |
| W07 | Tomt provnamn | Standardnamnet `Prov` används | UI |
| W08 | Avbryt val av veckotyp | Ingen ändring i planering eller historik | UI |
| W09 | Ogiltig veckotyp (0, 4, text, tom) | Begripligt fel; ingen ändring | UI |
| W10 | Avbryt lektionsnummer eller provnamn | Ingen vecka infogas | UI |
| W11 | Ogiltigt provlektionsnummer (0, >antal, decimal, text) | Begripligt fel; ingen ändring | UI |
| W12 | En lektion i ny vecka | Prov kan placeras på lektion 1; ingen indexöverskridning | UI + data |
| W13 | Noll lektioner i genererad vecka | Operation stoppas med fel, utan ändring | Data |
| W14 | Infoga vid första tillåtna mellanrum | Endast följande veckor flyttas, föregående oförändrade | Data |
| W15 | Infoga vid sista tillåtna mellanrum | Den sista befintliga veckan flyttas +7 dagar | Data |
| W16 | Försök infoga efter sista veckan eller ogiltigt index | Avvisas, utan dialog eller mutation | Data |
| W17 | Planering med 51 veckor | Infogning till 52 fungerar | Data |
| W18 | Planering med 52 veckor | Knappen avaktiverad, ingen infogning | UI + data |
| W19 | Övergång december–januari | Datum +7 dagar, ISO-veckonummer och standardrubriker korrekta över årsskiftet | Data |
| W20 | ISO-vecka 53 till vecka 1 | Ingen sorterings-/nummerkollision, kronologisk ordning bevaras | Data |
| W21 | Anpassad titel på efterföljande vecka | Anpassad titel bevaras; automatisk `Vecka N` uppdateras | Data |
| W22 | Befintliga uppgifter/länkar/prov i följande veckor | Innehållet bevaras exakt förutom avsedda datum- och standardrubrikfält | Data |
| W23 | Efterföljande veckor med `publishDate`/`hideDate` | Kontrollera att datumens avsedda semantik följs; flagga om veckodatum flyttas men publicerings-/döljdatum inte gör det | Riskgranskning |
| W24 | Skollov och nationella prov vid förskjutning | Kontrollera kalenderanknytning och att inga nationella provdatum tyst flyttas | Integration |
| W25 | Ångra efter infogning | Hela föregående planeringssnapshot återställs, inklusive innehåll och datum | UI + historik |
| W26 | Gör om efter ångra | Exakt samma infogning återställs en gång, utan dubblering | UI + historik |
| W27 | Ångra → ny redigering → gör om | Redo-historiken nollställs efter ny ändring | UI + historik |
| W28 | Upprepad infogning och flera ångra/gör om | Korrekt ordning, inga tappade eller dubblerade veckor | UI + historik |
| W29 | Spara efter infogning, ladda om | Nya veckan och följande datum finns kvar i sparad privat planering | Integration |
| W30 | Infoga i publicerad planering utan ompublicering | Publicerad elevsnapshot ändras inte av utkaständring | Integration |
| W31 | Publicera uttryckligen efter infogning | Endast avsedda synliga veckor och säkert sanerat innehåll visas | Integration |
| W32 | Två kopplade klasser med olika veckoscheman | Verifiera om klassgrupperna ska få den nya veckan, och att klasspecifika scheman/lektioner inte tappas eller skrivs över | **Blockerande produktbeslut** |
| W33 | Infoga när kopplad klass har särskilda lektionsundantag | Undantag och lektionskopplingar bevaras, inga oavsiktliga kopior | Integration |
| W34 | Växla mellan grundplanering och kopplad klass efter infogning | Visad vecka, datum och prov är konsekventa enligt fastställd klassmodell | Integration |
| W35 | Dubbelklick/snabb upprepad infogning | Ingen oavsiktlig dubbelinfogning | UI |
| W36 | Tangentbord/skärmläsare och avbrutna dialoger | Kontroller kan användas, fokus och status begripligt; ingen mutation vid avbrott | Tillgänglighet |

## Särskilda kodrisker att verifiera
- `insertBlankWeekAfter` skapar lektionsmallen med `makeWeeks(...,1)`, och flyttar efterföljande veckors `weekStart`, `weekNumber` och automatiska rubrik. Den flyttar **inte uttryckligen** `publishDate`, `hideDate` eller lektionsspecifika datum. W23 är därför en konkret risk, inte ett godkänt test.
- Dialogerna använder `window.prompt`; de har begränsat stöd för tillgänglighet och kan ge svårtestade interaktionsflöden.
- UI använder `onUndo`/`onRedo` med planhistorik. Ångra/gör om måste kontrolleras mot fullständig snapshot, inte bara antal veckor.
- Kopplade klasser representeras i `classGroups`; avsedd påverkan vid veckoinfogning är inte fastställd i PR-beskrivningen. **Kräver beslut före merge.**

## Acceptanskriterier före merge
1. Samtliga relevanta fall körda med dokumenterade resultat: `PASS`, `FAIL` eller `BLOCKED` med motivering. Inga otestade fall får märkas godkända.
2. W23 och W32–W34 får inte lämnas oavgjorda; besluta om datumsemantik och klassgruppers relation till veckor.
3. Säkerställ att befintliga `verify` och `sql-regressions` är gröna efter eventuella ändringar.
4. Genomför browser-/integrationstester mot syntetisk testmiljö; statiska kodkontroller räcker inte.
5. PR förblir draft tills granskning är klar. Ingen produktionsändring utan separat godkännande.
