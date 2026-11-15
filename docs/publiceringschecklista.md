# Publiceringschecklista: Min planering (PR #20)

Status: EJ publicerad. PR #20 är EJ sammanslagen. Ingen deploy har gjorts från denna gren.

## Återställningspunkt (verifierad av ägaren via Cloudflare, 15 nov 2026)
- Projekt: `minplanering` (Cloudflare Pages), produktionsgren `main`
- Webbplats: https://minplanering.pages.dev
- Aktuell live-version, deployment-ID: **98877c91-4f0f-4a35-8172-502763302e06**
- Publicerad: 15 november 2026, kl. 11.30 svensk tid. Status: success.
- Git-commit: saknas i Cloudflares metadata, eftersom publiceringen gjordes manuellt. Live-versionens källkod kan därför inte bekräftas från git. Återställning sker mot deployment-ID, inte mot en commit.
- Denna version är INTE PR #20. Den saknar bland annat `version.json` och den automatiska uppdateringen.

## Återställningsplan (för manuellt publicerad version)
Cloudflare Pages återställer mot ett deployment-ID. Git-commit behövs inte.
1. Före publicering: bekräfta att 98877c91-… finns i listan över deployments och att den är markerad som live. Den ska kunna väljas för återställning ("Rollback to this deployment" i Pages-dashboarden).
2. Efter eventuell publicering av PR #20: om något är fel, återställ till 98877c91-… i Cloudflare. Bekräfta sedan med `curl -I https://minplanering.pages.dev/` att sidan svarar och att `/version.json` ger 404 (den gamla versionen har ingen `version.json`).
3. Ingen databasåterställning behövs. PR #20 har inga schemaändringar, och `app_update_*`-tabellerna är oförändrade.
4. Återställning ändrar inga lärarkonton eller planeringar.
5. Ej verifierat i denna gren: att återställning fungerar som beskrivet. Det kontrolleras av den som har Cloudflare-åtkomst, före publicering.

## Kontroller som kan göras utan inloggad webbläsare
- Cloudflare: deployment-ID, status och publiceringstid (verifierat ovan).
- Före publicering: `curl -I` på live-sidan för att dokumentera headers och att `/version.json` saknas.
- Efter publicering: `curl -I` på `/` och `/index.html` (ska ha `Cache-Control: no-cache, must-revalidate`), och `/version.json` (ska ha `Cache-Control: no-store` och innehålla nytt bygg-ID).
- Att workflowspärrarna finns (`ALLOW_PROD_LINKED_PREVIEW`, `ALLOW_PRODUCTION_DEPLOY`, bekräftelsen `PUBLICERA`) i den gren som ska mergas.

## Kontroller som kräver inloggad webbläsare (riktiga konton och riktiga planeringar)
Dessa kan inte göras från den här sessionen:
1. Inloggning och utloggning med befintliga godkända konton. Kontrollera att rätt planeringar syns. Obs: inloggning skapar en väntande `teacher_access`-rad om kontot saknar en.
2. Adminpanel: lärarkonton och kontomatris visas utan RPC-fel. Ingen ändring eller godkännande görs.
3. Vanligt lärarkonto: adminpanelen syns inte, och andra lärares planeringar syns inte.
4. Grundplanering med riktiga planeringar: två veckor sida vid sida i översikten, fokusläge med en vecka, veckoknappar fungerar.
5. Klassvy: byt klass flera gånger. Lektionerna ska ligga på klassens veckodagar. Moment, Sida och Uppgift på samma rad.
6. A4-utskrift och PDF för en lång vecka och en normal vecka: en vecka per sida, ingen text saknas, inga tomma sidor. Långa veckor som inte ryms i minst 50 % delas mellan lektioner över flera sidor, med "Del n av m" och varning. Det är avsiktligt.
7. Scrollning, klickbarhet och klassbyte med riktig data: inget ska låsa sig eller ta märkbart längre tid.
8. Automatisk uppdatering: efter publicering, öppna en flik med gammal version. Den ska laddas om av sig själv, utan notis, och inte om osparade ändringar finns.

## Stoppvillkor
Stoppa och återställ till 98877c91-… om:
- ett godkänt konto inte kan logga in, eller ser fel planeringar,
- ett vanligt lärarkonto ser adminpanelen eller andras planeringar,
- en planering har ändrats oväntat (kontrollera `updated_at`),
- adminpanelen visar RPC-fel,
- en utskrift har tomma sidor, klippt text eller saknade lektioner,
- headers är fel, eller `/version.json` saknas efter publicering av PR #20.

## Beslut som kvarstår
- Merge av PR #20 till `main`: ägaren.
- Publicering: ägaren, via `scripts/publish-production.sh` eller godkänd workflow.
