# Testdatabas: specifikation och inventering

Syfte: kunna köra inloggning, adminpanel, RLS och utskrift utan att röra produktionsdatabasen.

## Säkerhetsregler
- Produktionsprojektet (Veckoplanering) används inte för skrivtester.
- Testmiljön har egna nycklar och en egen URL. Den hårdkodade fallbacken i `src/supabase.js` är produktion. Tester och förhandsvisningar måste sätta `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` till testmiljöns värden.
- Seed-skriptet (`supabase/test/seed-fiktiv.sql`) vägrar köra utan `app.isolated_test = ja`.
- Utskriftstesterna (`npm run test:print`) registrerar externa anrop och misslyckas om något når en icke-lokal värd.

## Inventering: vad appen använder

Tabeller: `veckoplanering`, `teacher_access`, `planning_visit_events`, `app_update_notices`, `app_update_acknowledgements`.
Storage: bucket `planning-materials`.
Auth: `signInWithPassword`, `signUp`, `signOut`, `getSession`, `onAuthStateChange`.
RPC: `get_public_annual_plan`, `register_teacher_application`, `admin_list_teacher_accounts`, `admin_review_teacher_request`, `admin_set_teacher_access`, `admin_set_teacher_expiry`, `request_teacher_extension`, `supports_automatic_week_release`, `create_plan_share_invite`, `claim_plan_share_invite`.

## Jämförelse med repot

| Objekt | Appen | Repot (SQL) | Kommentar |
|---|---|---|---|
| `veckoplanering`, `teacher_access` | ja | ja | |
| `get_public_annual_plan`, `register_teacher_application`, `admin_review_teacher_request` | ja | ja | |
| `admin_list_teacher_accounts` | ja | nej | Repot har `admin_list_teacher_requests`. Namnet skiljer. Adminpanelen anropar det namn som finns i produktion. |
| `admin_set_teacher_access`, `admin_set_teacher_expiry`, `request_teacher_extension` | ja | nej | Finns inte i repot. |
| `supports_automatic_week_release` | ja | nej | Krävs för automatisk veckopublicering. Saknas den stoppas publiceringen med meddelande. |
| `create_plan_share_invite`, `claim_plan_share_invite` | ja | nej | Kollegadelning, bakom avstängd flagga. **Saknas i produktion enligt skrivskyddad kontroll.** |
| `planning_visit_events` | ja | nej | |
| `app_update_notices`, `app_update_acknowledgements` | nej (nuvarande kod) | nej | Nuvarande kod använder dem inte. Föregående version (före automatisk uppdatering) gjorde det, och gamla öppna flikar kan fortfarande köra den. **Behålls tills gamla klienter inte längre finns.** |
| Bucket `planning-materials` | ja | ja (migration) | |

Slutsats: repot innehåller inte hela produktionsschemat. En databas byggd enbart från repot saknar flera RPC-funktioner som adminpanelen och kollegadelningen anropar.

## Saknade migrationer

1. Migrationer för alla RPC-funktioner i tabellen ovan som saknas i repot. Definitionen måste exporteras från produktion som DDL (skrivskyddat) och läggas i repot.
2. Migration för `planning_visit_events` och eventuellt dess RLS-policyer.
3. Beslut om `app_update_notices` och `app_update_acknowledgements` ska tas bort.
4. Verifiering att RLS-policyerna i produktion (35 st enligt skrivskyddad kontroll) finns i repot. Repot har 13 policyer i SQL-filerna. Differensen måste dokumenteras.

## Reproducerbar testdatabas

1. Skapa en ny, isolerad Supabase-instans eller lokal Postgres med Supabase-kompatibla auth-scheman.
2. Applicera repots SQL: `supabase-migration.sql` och `supabase/migrations/*.sql`.
3. Applicera de saknade migrationerna när de finns i repot.
4. Kör `supabase/test/verify-required-schema.sql`. Förväntat resultat: inga rader.
5. Sätt `app.isolated_test = ja` och kör `supabase/test/seed-fiktiv.sql`.
6. Skapa fiktiva konton via Auth och bygg med testmiljöns URL och nyckel.

Det finns ingen automatisk lokal Supabase i den här sessionen: Docker-avbilder från `ghcr.io` blockeras av proxyn.

## Verifierat lokalt (isolerad, tillfällig PostgreSQL 16, inga externa anslutningar)

- `supabase/test/verify-required-schema.sql` körs och rapporterar korrekt. Mot en tom databas listas 14 saknade objekt, vilket är förväntat.
- `supabase/test/seed-fiktiv.sql` vägrar köra utan `app.isolated_test = ja`. Med flaggan körs den.
- Repots SQL applicerades i tur och ordning med minimala stubbar för `auth` och `storage`. Resultat:
  - `supabase-migration.sql` körs utan fel.
  - `20261019_teacher_application_trigger.sql` misslyckas: `teacher_access` finns inte än. Filen körs före `20261019_teacher_approval.sql`, som skapar tabellen. Filnamnen sorteras alfabetiskt, så ordningen är fel för en databas från grunden. Repot har inte ändrats. Att döpa om filer påverkar Supabase CLI:s versionsspårning mot produktion, så det är ett beslut för dig.
  - `20261110_planning_materials_storage.sql` misslyckas i stubben på kolumnen `file_size_limit`. Det beror på min förenklade `storage.buckets`, inte på produktion.
  - FK-felet i `20261019_teacher_approval.sql` beror på att stubben saknar användarrader i `auth.users`. Det är ett testartefakt.
- Efter applicering: 6 RLS-policyer i `public`, mot 35 i produktion. Repot täcker alltså inte produktionens policyer.
- Efter applicering saknas fortfarande de RPC-funktioner och tabeller som listats ovan.

Slutsats: repot kan inte ensamt återskapa produktionsdatabasen. Det krävs export av produktionens DDL (skrivskyddat) för alla funktioner, policyer och tabeller som saknas.

## Migrationsordning (verifierad lokalt)

- `20261019_teacher_application_trigger.sql` skapar funktionen och triggern utan fel, även när `teacher_access` saknas.
- Enda felet är backfill-satsen sist i filen (`insert into public.teacher_access ... select ... from auth.users`). Den kräver tabellen.
- `20261019_teacher_approval.sql` skapar tabellen. Den innehåller även en hårdkodad admin-UUID som godkänns automatiskt, och den kräver att användaren finns i `auth.users`.
- Alltså: en databas från grunden blir korrekt om `20261019_teacher_approval.sql` körs före backfill-satsen. Ordningen kan inte bestämmas av filnamnen.

Förslag, i prioritetsordning:
1. **Ingen ändring av befintliga migrationer.** Dokumentera ett bootstrap-förfarande för testdatabaser: applicera `supabase-migration.sql`, sedan `20261019_teacher_approval.sql` (efter att ett fiktivt admin-konto skapats med samma UUID i testmiljön), sedan övriga filer i ordning. Ingen produktionsmigration påverkas.
2. **Senare, med godkännande:** samla bootstrap-schemat i `supabase-migration.sql` (idempotent, utan hårdkodad admin-insert). Då behövs ingen manuell ordning för testdatabaser. Produktion körs inte mot det skriptet.
3. **Undviks:** att döpa om befintliga migrationsfiler. Supabase CLI spårar dem efter version.

## Admin-identitet

Admin är hårdkodad på två ställen: klienten (`src/App.jsx`, `isAdmin`) och SQL (`20261019_teacher_approval.sql`). Klientkontrollen är bara UI. Det verkliga skyddet ligger i SQL-funktionerna, som kontrollerar `auth.uid()`. En testmiljö måste därför använda ett fiktivt konto med samma UUID eller ändra båda ställen. Det senare kräver en ändring i koden, och ska göras medvetet.

## Saknas fortfarande för en fullständig lokal testmiljö

- DDL-export från produktion för RPC-funktionerna `admin_list_teacher_accounts`, `admin_set_teacher_access`, `admin_set_teacher_expiry`, `request_teacher_extension`, `supports_automatic_week_release`, `create_plan_share_invite`, `claim_plan_share_invite`.
- Produktionens RLS-policyer utöver de 13 i repot (35 i produktion, enligt skrivskyddad kontroll).
- Tabellen `planning_visit_events`.
- Storage-bucketens inställningar (till exempel `file_size_limit`), som bara finns i Supabase Storage.
- En riktig Supabase-instans eller Supabase-kompatibel stack för auth och PostgREST. Docker-avbilder blockeras i sessionen.
- Fiktiva konton med testlösenord, skapade i testmiljöns Auth. Inga riktiga lärarkonton används.

## Lokal riktig Supabase-stack (kostnadsfri, ingen produktion)

Sedan dess körs en lokal stack på den egna datorn med samma avbilder som Supabase: PostgreSQL, Auth, PostgREST, Storage och en nginx-gateway. Den beskrivs i `tests/real/stack/README.md`.

- `npm run test:real`: integrationstest mot databas, RLS, Storage och åtkomst mellan konton (22 kontroller).
- `npm run test:real-ui`: browsertest med riktig inloggning, skapande, import, omladdning, annan dator, arkiv och radering, samt migrering med fyra samtidiga flikar (12 kontroller).

Testerna vägrar köra mot något annat än localhost. Det finns inget produktionsnyckel i testmiljön.

### Lokala justeringar som kräver verifiering mot produktion
- `teacher_access` saknar `timer_period`, `expires_at` och `extension_requested` i repots migrationer, men appen läser dem. De läggs till lokalt. Verifiera mot produktion med skrivskyddad export innan något ändras i repot.
- Adminens UUID i migrationen byts mot en fiktiv admin i den lokala kopian.
- Storage-rollerna får standardrättigheter, som Supabase-plattformen sätter i produktion.

### Förslag, ännu inte applicerat
- `supabase/proposals/2026-11-amnen-unikt-index.sql` hindrar dubbla ämnesrader vid samtidiga skrivningar. Den gäller bara `amne-v1`-rader. Installationen körs i en transaktion. Den fångar bara tre namngivna JSON-fel (22P02, 22P05, 54001) och returnerar NULL för dem. Alla andra fel fortplantas. EXECUTE dras in från PUBLIC och anon, men behålls för authenticated och service_role, eftersom vanliga skrivningar annars nekas.
- `supabase/proposals/2026-11-amnen-unikt-index-aterstall.sql` tar bort exakt det installationen skapar, i en transaktion.
- `supabase/proposals/2026-11-amnen-unikt-index-kontroller.sql` är skrivskyddade kontroller mot produktion. Del A körs före installation, del B efter.
- `tests/real/stack/index-install-test.sh` testar lokalt: misslyckad installation rullas tillbaka helt, installation och återställning ändrar inga rader eller filer, och rättigheter och beteende stämmer. Kör med `STACK_DIR=<mappen med den lokala stacken> ./index-install-test.sh`. Skriptet kör bara mot den lokala Docker-databasen.
- Verifierat lokalt, men ska inte köras mot produktion utan skriftligt godkännande och en kontroll efter dubbletter.

### Förslag: listvy för planeringslistan (ännu inte i produktion)
- `supabase/proposals/2026-11-lista-vy.sql` skapar vyn `veckoplanering_lista` och funktionen `planering_lista_innehall`. Vyn utelämnar `weeksData` ur innehållet, så att biblioteket laddar listan snabbt. Veckorna hämtas när en planering öppnas.
- Appen använder vyn om den finns och faller tillbaka till tabellen annars. Därför kan appen köras både före och efter installation.
- `supabase/proposals/2026-11-lista-vy-aterstall.sql` tar bort vyn och funktionen.
- Lokalt verifierat: med vyn öppnas en kurs på 1,7 s på långsamt nät (400 ms latens, 1,6 Mbit/s), mot 7,7 s utan vy. Båda körningarna i `test:real-perf`, `test:real-ui` och `test:real-legacy` är gröna.
- Ska inte köras mot produktion utan skriftligt godkännande.
- `npm run test:real-weeks` kontrollerar att veckoinnehållet (21 veckor, markörer, lektioner, klasser) är oförändrat efter namnbyte, arkivering och återställning, och efter omladdning. Körs mot lokal stack.
