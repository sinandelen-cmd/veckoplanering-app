# Gränssnittsgranskning: kollegieinbjudningar (2026-10-24)

**Omfattning:** skrivskyddad analys av `src/App.jsx` på `feature/provtraning-infogad-vecka`. Detta dokument ändrar inte appkod, databas eller publicerad tjänst.

## Faktiskt nuläge
- Kollegiepanelen ligger ca rad 2019 bakom `false && teacherTab === "new" && shareOpen` och **renderas därför aldrig** i denna kodversion. Den ska inte beskrivas som en aktiv funktion.
- Bakom den avstängda panelen finns två formulär: skapa kod och ta emot kod. RPC-anropen `create_plan_share_invite` och `claim_plan_share_invite` saknas i den anslutna Supabase-databasen.
- Skapandeflödet skickar alltid `p_plan_id: null` och `p_password: ''`, oavsett aktuell planering.
- Texten vid skapande lovar ett nytt konto med **tom planering** och sju dagars giltighet. Texten vid mottagande lovar en **privat kopia** som inte får delas vidare. Dessa påståenden är inte verifierade i backend.
- `sharePassword` är ett oanvänt state i den granskade komponenten. `shareToken` visas i ett läsbart fält och kan kopieras till urklipp; koder bör hanteras som hemligheter.
- `plan.receivedCopy` hindrar delning i klienten, men serverkontroll saknas eftersom RPC:n saknas. Detta är inte ett fullgott säkerhetsskydd.
- Det finns ingen synlig funktion för att återkalla en utfärdad kod i den avstängda panelen.

## Rekommenderat UX-beslut innan implementation
1. **Behåll panelen avstängd** tills backend och isolerade säkerhetstester finns. Undvik att slå på den genom att bara ta bort `false &&`.
2. Välj **ett** tydligt syfte: A) bjuda in till eget lärarkonto utan planeringskopiering, eller B) dela en uttryckligen vald planering som en fristående privat kopia. Skilj dessa i både text och API. Om B väljs får `p_plan_id` inte vara null.
3. Visa först efter bekräftad serverrespons: `Engångskoden har skapats. Den gäller i sju dagar och kan användas en gång.` Visa aldrig framgång baserat enbart på lokalt state.
4. Mottagarvyn bör förklara krav på inloggning, verifierad e-post och giltig lärarbehörighet. Använd neutrala fel: `Koden kunde inte användas. Kontrollera kod och behörighet.`
5. Visa koden en gång, med tydlig varning att den ska delas privat; erbjud kopiera-knapp med feedback och rensa känsligt state när panelen stängs eller användaren loggar ut.
6. Lägg till `Återkalla inbjudan` för skaparen, med serververifierad behörighet. Redovisa `Aktiv`, `Använd`, `Utgången`, `Återkallad` utan att återvisa kodens klartext.
7. Ta bort `p_password` från framtida RPC-kontrakt och oanvänt lösenordsstate. Använd Supabase Auth för kontohantering.
8. Testa tangentbord, skärmläsare, laddningsläge, dubbla klick, nätverksfel, ogiltig kod och att avstängd panel verkligen inte är åtkomlig.

## Leveransspärr
Inga UI-texter om kopiering, engångsanvändning, giltighet eller återkallelse ska presenteras som fungerande innan backend implementerats och testats. Se även `docs/KOLLEGIEINBJUDNINGAR-SAKERHETSSPEC.md`. Separat godkännande krävs för kodändringar och driftsättning.
