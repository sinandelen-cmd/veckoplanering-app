# Förslag: säker delning av planeringar mellan lärare

Status: förslag. Ingen migration är körd i produktion. Delningsknapparna är dolda sedan release (`AVSTANGD_GRANSSNITT = false`).

## Mål
- En behörig lärare kan skicka en engångskod till en annan godkänd lärare.
- Mottagaren får en egen kopia. Originalet ändras inte.
- Inga registreringsspärrar: nya användare ska kunna skapa konto som tidigare.
- Befintliga planeringar, konton och administratörsrättigheter ändras inte.

## Vad som gjordes tidigare och varför det inte används
- Migrationen `20261018_invitation_only_teacher_registration.sql` (borttagen 19 oktober) innehöll en trigger som blockerar alla nya konton utan inbjudningskod. Den används inte.
- Funktionerna `create_plan_share_invite` och `claim_plan_share_invite` saknas i produktion. Därför fungerar inte delning. Gränssnittet är dolt.

## Föreslagen modell (ny, additiv migration, körs först lokalt)
1. Tabell `plan_share_invites`: `id`, `sender_id`, `plan_id`, `recipient_email`, `token_hash` (sha256, aldrig klartext), `expires_at` (7 dagar), `consumed_at`, `consumed_by`. RLS på. Ingen direkt läsning för klienter.
2. `create_plan_share_invite(plan_id, recipient_email)`:
   - kräver `is_platform_admin`-liknande kontroll av godkänt, giltigt lärarkonto,
   - kräver att planeringen ägs av anroparen och inte är en mottagen kopia,
   - returnerar engångskoden en gång.
3. `claim_plan_share_invite(token)`:
   - kräver godkänt, giltigt lärarkonto,
   - skapar en ny rad i `veckoplanering` för mottagaren, med `receivedCopy = true` i innehållet. Originalet rörs inte.
   - markerar inbjudan som använd, och kan bara användas en gång.
4. Ingen trigger på `auth.users`.

## Tester som krävs före produktion
- Lokalt: ägare kan bjuda in, mottagare får kopia, original oförändrat, kod går bara att använda en gång, utgången kod nekas, utgånget konto nekas, obehörig kan inte skapa kod för andras planering, mottagen kopia kan inte delas vidare.
- Lokalt: nya konton kan skapas utan inbjudan.

## Krav innan någon produktionsmigration
- Ditt skriftliga godkännande.
- Verifierad återställningsplan (tabellen är ny, så återställningen är `drop table`).
