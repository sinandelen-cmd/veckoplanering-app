# Driftsanteckningar: databas och migrationer

**Läs före varje migrationskörning.**

- Produktionsdatabasens migrationshistorik (`supabase_migrations.schema_migrations`) innehåller andra versioner och namn än filerna i `supabase/migrations/`. Repot kan därför **inte** spelas upp mot produktion.
- Kör aldrig `supabase db push`, `supabase db reset` eller någon annan automatisk migrationsåtgärd mot produktion från det här repot.
- `supabase/migrations/` används för att bygga en **ny, lokal, syntetisk** databas från början (`supabase start` / `supabase db reset` i en isolerad lokal stack).
- Migrationen `20261112000000_teacher_admin_functions.sql` ändrar administratörsfunktionerna så att de använder `public.platform_admins`. Den får **inte** köras i produktion förrän `ops/prod-platform-admin-bootstrap.sql` har körts med ett skriftligt godkännande. Annars förlorar produktionsadministratören sina rättigheter.
- `prod-platform-admin-bootstrap.sql` är en engångsåtgärd som kräver godkännande från ägaren. Den ändrar ingen befintlig rad i `teacher_access`.
- Produktionens användare, giltighetstider och behörigheter ändras inte av något i det här repot.
