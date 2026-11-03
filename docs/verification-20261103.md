# Verifiering av Årsplanering – 2026-11-03

Status: INTE färdigverifierad. Databasscenariot är godkänt efter tillfällig återaktivering. Inloggade webbläsartester blockeras av nekad testinloggning. Se uppföljningen längst ned.

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

## Ursprunglig blockering (åtgärdad tillfälligt i uppföljningen)

Supabase rapporterar Årsplanering Test som INACTIVE. Ett återaktiveringsförsök nekades: ägaren har nått gränsen på två aktiva gratisprojekt. Ingen annan databas pausades eller ändrades. Ingen SQL kördes och inga användardata ändrades.

## Återstår före godkännande

1. Återaktivera testdatabasen med tillgänglig projektkapacitet; detta får inte ske genom otillåten paus av produktion eller Elevkompassen.
2. Verifiera inloggning med separat testkonto och syntetiska data.
3. Verifiera autosparning mot databasen, omladdning och att sparat innehåll finns kvar.
4. Upprepa klassbyten och redigering under sparning; kontrollera rätt innehåll och mät respons/frysningar.
5. Kör återstående inloggade och visuella scenarier i QA-SLUTTEST.md och prestandaplanen.

Automatiska hjälpfunktionstester är inte bevis för fungerande autosparning eller klassbyten i den körande webbläsaren. Ingen merge till main eller publicering till den riktiga webbplatsen har gjorts.

## Uppföljning efter godkänt projektbyte

- Användaren godkände tillfällig paus av Elevkompassen för testning och efterföljande återaktivering.
- Årsplanering Test återaktiverades och rapporterade ACTIVE_HEALTHY. SQL-frågor besvarades. Två godkända testkonton och sex planeringar fanns kvar.
- RLS är aktiverat på samtliga fyra tabeller i public. Supabases säkerhets- och prestandarådgivare rapporterade inga varningar vid kontrollen.
- Databasscenario genomfört som authenticated med kontots auth.uid: infoga syntetisk planering, uppdatera och läsa tillbaka, kontrollera list_plan_summaries, växla till andra kontot och verifiera att läsning och uppdatering blockeras. Samtliga assertioner passerade. Testtransaktionen återställdes med ROLLBACK. Detta bevisar databasbeteende, inte webbläsarens autosparning.
- Ny körning: 44/44 automatiska tester godkända.
- Säker webbläsarinloggning genomfördes med användarinmatade uppgifter men nekades av tjänsten: invalid_credentials. Inga lösenord lästes eller ändrades. Autosparning efter omladdning och klassbyten förblir BLOCKED tills giltig testinloggning finns.
- Schemaöversikten visar endast list_plan_summaries och plan_summary_content i public. Offentlig årsplanerings-RPC och stöd för automatisk veckopublicering är därför inte verifierade i denna databas; dessa funktioner kräver separat komplettering innan hela QA-protokollet kan godkännas.
- Efter databaskontrollen pausades Årsplanering Test och återaktivering av Elevkompassen begärdes. Återaktiveringen verifierades därefter: Elevkompassen ACTIVE_HEALTHY, Årsplanering Test INACTIVE, Veckoplanering ACTIVE_HEALTHY.

