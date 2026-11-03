# Verifiering av Årsplanering – 2026-11-03

Status: INTE färdigverifierad. Databastester och inloggade webbläsartester är blockerade.

Gren: `fix/plan-summaries-20261102`. Granskad applikationscommit: `46a0ee2497d89cc2cfbcb4408b5dcb6089b90600`.
Testwebbplats: https://arsplanering-isolerad-test-20261102.pages.dev/

## Genomförda kontroller

- `npm ci`: godkänd.
- `npm run check`: samtliga 44 tester/kontrollskript godkända, inga överhoppade.
- `npm run lint`: exit 0, 47 varningar kvar; alltså inte varningsfri.
- Isolerad Vite-build: godkänd. Varning om stora JavaScript-paket kvarstår.
- Byggda JavaScript-filer innehåller testprojektet `tdbmhkwsgzflqgmftzyy` och saknar produktionsprojektets URL.
- Cloudflare bekräftade att testwebbplatsens kanoniska deployment kör ovanstående commit och den isolerade testkonfigurationen.
- Webbläsaren öppnade testwebbplatsen och visade lärarinloggningen.

## Åtgärdade testfel

Den tidigare `npm run check` utelämnade flera befintliga regressionstester. Alla toppnivåskript i tests körs nu. Full körning hittade två inaktuella testmiljöer: årsplaneringens sparscenario saknade importerad `reconcileSavedEditor`, och publiceringstestet saknade `parseContent` samt dess cache. Testerna använder nu aktuella hjälpfunktioner. Navigeringskontrollen pekar på nuvarande `openPlanRow` och behåller kravet att knappen är spärrad under sparning. Ingen applikationslogik ändrad.

## Blockering

Supabase rapporterar Årsplanering Test som INACTIVE. Ett återaktiveringsförsök nekades: ägaren har nått gränsen på två aktiva gratisprojekt. Ingen annan databas pausades eller ändrades. Ingen SQL kördes och inga användardata ändrades.

## Återstår före godkännande

1. Återaktivera testdatabasen med tillgänglig projektkapacitet; detta får inte ske genom otillåten paus av produktion eller Elevkompassen.
2. Verifiera inloggning med separat testkonto och syntetiska data.
3. Verifiera autosparning mot databasen, omladdning och att sparat innehåll finns kvar.
4. Upprepa klassbyten och redigering under sparning; kontrollera rätt innehåll och mät respons/frysningar.
5. Kör återstående inloggade och visuella scenarier i QA-SLUTTEST.md och prestandaplanen.

Automatiska hjälpfunktionstester är inte bevis för fungerande autosparning eller klassbyten i den körande webbläsaren. Ingen merge till main eller publicering till den riktiga webbplatsen har gjorts.
