# Säker specifikation: kollegieinbjudningar (förslag, EJ driftsatt)

**Status:** Endast design och granskningsunderlag. Ingen SQL-migrering, databasändring eller aktivering av delning ingår.

## Nuvarande läge och produktbeslut
Appen anropar `create_plan_share_invite(p_plan_id, p_recipient_email, p_password)` och `claim_plan_share_invite(p_token)`, men dessa RPC:er saknas i den anslutna produktionsdatabasen och versionshanterade migreringar. Nuvarande klient skickar alltid `p_plan_id: null` och `p_password: ''`. UI-texten är motsägelsefull: skapandet säger att mottagaren börjar med en **tom planering**, medan mottagandet säger att en **kopia** finns i biblioteket. Produktbeslut krävs före implementation: (A) en ren inbjudan till lärarkonto, utan överföring av innehåll, eller (B) en planeringskopia med uttryckligt valt käll-ID och samtycke. Ingen implicit kopiering vid null-ID.

## Säkerhetskrav
1. Endast autentiserad, godkänd lärare med giltig åtkomst får skapa inbjudan. Servern ska kontrollera `auth.uid()` och ägarskap till vald planering när innehåll delas. Klientkontroller räcker inte.
2. Generera varje kod med kryptografiskt säker slump (minst 128 bitar; rekommenderat 192–256). Lagra endast kryptografisk hash av koden, inte klartext. Visa klartext en gång efter skapandet. Logga aldrig koden.
3. Giltighetstid `expires_at = created_at + interval '7 days'` på servern; använd databasens tidskälla. Kontrollera både utgång och återkallelse vid inlösen.
4. En kod kan lösas in exakt en gång, atomiskt i samma transaktion som mottagande/skapande. Samtidiga försök får inte skapa två kopior eller två åtkomster. Använd låsning/unikhetsvillkor.
5. Bind koden till normaliserad mottagaradress och verifiera att den inloggade mottagarens verifierade e-postadress matchar. En kod ensam ska inte kringgå inloggning eller lärarbehörighet. Fastställ om mottagaren får vara `pending` och hur godkännande då sker.
6. Ägaren ska kunna återkalla en oanvänd inbjudan; återkallelse måste stoppa senare inlösen. Redan mottagen kopia är en separat resurs och raderas inte automatiskt.
7. Om en kopia skapas: ny ägare = `auth.uid()`, separat rad/ID, inga ärvda publicerings- eller delningstoken, `published=false`, ingen vidarebefordran om produktkravet kräver det. Förbud mot vidarebefordran måste verkställas på servern, inte bara via `plan.receivedCopy` i klienten.
8. `SECURITY DEFINER` endast om nödvändigt, med låst `search_path`, fullt kvalificerade objekt och strikt `EXECUTE`-grant till `authenticated`; inte `anon`. Granska även RLS för lagringstabellen.
9. Felmeddelanden får inte avslöja om en viss e-postadress har ett konto eller om en kod tidigare var giltig. Begränsa antal försök/skapanden och hantera missbruk.
10. Inga lösenord i RPC-argument. Ta bort eller avvisa `p_password`; autentisering ska ske via Supabase Auth, aldrig genom att hantera mottagarens lösenord.

## Föreslagna API-kontrakt (ej SQL)
- `create_plan_share_invite(p_plan_id uuid | null, p_recipient_email text)` → engångskod endast vid lyckat skapande; tydligt läge konto-inbjudan kontra kopiering.
- `claim_plan_share_invite(p_token text)` → status och eventuellt nytt plan-ID, men inga privata källdata vid fel.
- `revoke_plan_share_invite(p_invite_id uuid)` → endast skaparen eller uttryckligen behörig administratör.

## Testkrav före driftsättning
- Ej inloggad, ej godkänd, utgången lärare, annan ägare, fel mottagare, obekräftad e-post, saknad/ogiltig/utgången/återkallad/använd kod.
- Två samtidiga inlösenförsök: högst ett lyckas; inga dubbla kopior.
- Verifiera sju dagars gräns, återkallelse, behörighetsändringar mellan skapande och inlösen, isolering mellan lärare och ingen vidare-delning av mottagen kopia.
- Kör syntetiska tester i isolerad databas och externt API-test med begränsade testkonton. **Inga produktionsdata används.**
- Säkerhetsgranska SQL, migrering och rollback separat. Godkänn uttryckligen innan produktion ändras.

## Nuvarande öppna risker
- Klientens UI lovar sju dagars giltighet och engångsanvändning utan implementerad backend.
- Null-plan-ID och motsägelsefulla UI-texter gör funktionens avsikt oklar.
- Återkallelse saknas i nuvarande klientflöde.
- Användarkontroller för vidare-delning finns i klienten men kan kringgås om de inte finns i databasen.
