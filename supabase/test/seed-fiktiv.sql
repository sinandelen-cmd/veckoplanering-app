-- Fiktiva testkonton och testdata. Endast för en ISOLERAD testdatabas.
-- Skriptet vägrar köra om miljövariabeln app.isolated_test inte är satt till 'ja'.
-- Inga riktiga personer, planeringar eller lösenord används.
do $$
begin
  if coalesce(current_setting('app.isolated_test', true), '') <> 'ja' then
    raise exception 'Seed vägras: sätt app.isolated_test = ja i en isolerad testdatabas. Körs aldrig mot produktion.';
  end if;
end $$;

-- Fiktiva konton skapas via Supabase Auth i testmiljön (inte här), t.ex. admin@test.invalid och larare@test.invalid.
-- Lösenord sätts i testmiljöns konfiguration och skrivs aldrig i repot.
