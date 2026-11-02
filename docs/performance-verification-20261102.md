# Verifieringsplan – Årsplanering (testgren)

## Syfte och säkerhetsgränser

Verifiera om optimeringarna i `fix/class-navigation-performance-20261102` minskar tiden att öppna **Matte Direkt 8** och om klassbyte, scrollning och redigering fungerar utan frysningar. Detta är en **testplan, inte ett godkänt hastighetsresultat**. Ändra inte produktion, slå inte ihop PR och publicera inte utan uttryckligt godkännande. Använd endast ett auktoriserat testkonto; dokumentera aldrig lösenord, elevuppgifter eller fullständigt planeringsinnehåll.

## Förutsättningar

1. Öppna en separat körande testversion som faktiskt byggts från den aktuella grenen. Kontrollera vilken commit som körs. Enbart godkänd GitHub Actions-build innebär inte att en inloggad testversion finns.
2. Logga in med behörigt testkonto. Kontrollera att **Matte Direkt 8** finns tillgänglig, annars markera testet **blockerat**; använd inte påhittade resultat.
3. Öppna webbläsarens utvecklarverktyg (Performance och Network). Testa på samma enhet, nätverk och webbläsare. Notera om cache är varm eller kall. Kör minst fem upprepningar per scenario; rapportera median och spridning, inte enstaka bästa tid.
4. Testa endast ändringar på en **separat testkopia** av planeringen. Ändra eller radera aldrig användarens originaldata för att genomföra testet.

## Mätpunkter

| ID | Scenario | Mätvärde och godkänt beteende |
| --- | --- | --- |
| P1 | Logga in och ladda planeringsbiblioteket | Tid från navigering till synlig och användbar lista; antal anrop och överförda byte för `veckoplanering` |
| P2 | Öppna sparade **Matte Direkt 8** | Tid från klick till synlig, interaktiv planering; notera om någon väntan/frysning över 1 sekund uppstår |
| P3 | Byt mellan två befintliga klasser och tillbaka | Tid till interaktiv klassvy; inga felaktiga klassdata, inga långa blockeringar |
| P4 | Scrolla genom början, mitten och slutet av planeringen | Responsiv scrollning; notera tappade bildrutor/långa main-thread-tasks |
| P5 | Redigera i en separat testkopia | Tangentrespons, autosparning och återöppning med rätt innehåll |
| P6 | Navigera bort med osparade ändringar i testkopian | Varning visas; avbryt behåller ändringar |
| P7 | Arkivera och återställ separat testkopia | Rätt status och innehåll; originalet påverkas inte |
| P8 | Öppna samma planering efter omladdning | Rätt senast öppnade planering, utan att skriva över nyare osparade ändringar |
| P9 | Kontrollera browser console och Network | Inga oväntade fel, misslyckade anrop eller obehörig åtkomst |
| P10 | Kör GitHub CI på testgrenens commit | `npm ci`, lint, check och build gröna; detta ersätter inte P1–P9 |

## Jämförelse och rapportering

Om samma data och testkonto säkert kan användas i en separat jämförbar miljö, mät före/efter på samma maskin och rapportera skillnaden. **Publicerad produktion är inte testgrenen**; en produktionsmätning är bara nulägesbaslinje. Undvik att kalla en kodgranskning för ett genomfört prestandatest.

Fyll i för varje test: datum, miljö/commit, testkonto (anonymt), webbläsare/enhet, antal körningar, median, min/max, fel, observationer och PASS/FAIL/BLOCKED. För P2 redovisa särskilt om tidigare upplevda cirka 30 sekunder har minskat; påstå inte förbättring utan verklig mätning.

## Beslutsgrind

Gå inte vidare till produktionspublicering förrän P1–P9 har dokumenterade resultat, regressionerna är genomgångna, eventuella fel åtgärdade och användaren uttryckligen har godkänt driftsättning.
