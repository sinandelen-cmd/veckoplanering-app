# Säkerhetsgranskning: PR #20 (feature/auto-update-20261115)

Status: granskad lokalt. Inte mergad. Inte publicerad. Ingen produktionsdatabas har ändrats.

## Verifierat i koden och med automatiska tester
- **Ingen hemlig nyckel i repot.** Cloudflare-token används endast via GitHub-secret och skrivs inte ut. Git-historik (300 senaste commits) innehåller inga vanliga hemlighetsmönster.
- **Publishable Supabase-nyckel i källkod och workflow.** Avsedd att vara publik. Den avslöjar produktions-URL:en. Skyddet ligger i RLS, som inte kan verifieras här.
- **Personuppgifter:** enda e-postadressen är platshållaren `kollega@skola.se` i ett formulär. Testdata är fiktiv.
- **Migrationer oförändrade.** `supabase/migrations/` och `supabase-migration.sql` är identiska med main. Nya filer finns endast under `supabase/test/`.
- **app_update_*-tabellerna behålls.** Äldre klienter kan fortfarande använda dem. Nuvarande kod använder dem inte.
- **Utskriftstester och UI-tester gör inga externa anrop.** Varje test registrerar nätverksanrop och misslyckas vid anrop till icke-lokal värd.
- **Fiktiv Supabase-klient** används endast i UI-testerna (`tests/ui/`). Den ersätter `src/supabase.js` i testkonfigurationen och finns inte i produktionsbygget.

## Åtgärder i denna PR
- **Förhandsvisningsworkflowen** (`publish-class-week-preview.yml`) är manuell och kräver repo-variabeln `ALLOW_PROD_LINKED_PREVIEW="true"`. Den bygger med produktionens Supabase-URL, så spärren är nödvändig.
- **Produktionsworkflowen** (`deploy-cloudflare.yml`) har tre spärrar: körs bara från `main`, kräver repo-variabeln `ALLOW_PRODUCTION_DEPLOY="true"`, och kräver att inmatningen `confirm` är exakt `PUBLICERA`.
- **Felrättning:** `<details defaultOpen>` i två ställen ändrat till `open`. React varnade för ett okänt DOM-attribut, och de ihopfällbara detaljerna öppnades inte rätt.

## Kvarstående risker och beslut
1. **Hårdkodad admin-UUID** i klienten (`src/App.jsx`, `isAdmin`) och i SQL (`20261019_teacher_approval.sql`). Klientkontrollen är bara UI. Det verkliga skyddet måste verifieras i SQL-funktionerna mot produktionsschemat.
2. **RLS och RPC-funktioner** i produktion kan inte verifieras lokalt. Produktionens 35 policyer och 21 funktioner finns inte i repot. Se `docs/testdatabas.md`.
3. **Migrationsordning:** `20261019_teacher_application_trigger.sql` körs före tabellen i `20261019_teacher_approval.sql`. Ändras inte, eftersom produktion redan spårar dem.
4. **`create_plan_share_invite` och `claim_plan_share_invite`** anropas från koden men finns inte i repot. Funktionerna ska verifieras i produktion innan kollegadelningen aktiveras (den är idag avstängd).
5. **`supports_automatic_week_release`** måste finnas i produktion om automatisk veckopublicering ska användas. Saknas den stoppas publiceringen med ett tydligt meddelande.
6. **`admin_list_teacher_accounts`** anropas av adminpanelen, men repot har `admin_list_teacher_requests`. Produktion är den källa som gäller.
