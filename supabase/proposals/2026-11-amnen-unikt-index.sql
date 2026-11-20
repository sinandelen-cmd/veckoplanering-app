-- FÖRSLAG. Ännu inte applicerat i någon databas. Får INTE köras mot produktion utan godkännande.
-- Hindrar dubbla ämnesrader per konto och skolform, även vid samtidiga skrivningar (två flikar eller enheter).
--
-- Verifierat i produktion (skrivskyddat, rapporterat): 16 rader, alla med giltig JSON i content,
-- 0 rader med kind = 'amne-v1', inget index med detta namn.
--
-- Designval:
--  * Predikatet är en TEXTmatchning på prefixet som appen alltid skriver först: {"kind":"amne-v1",
--    Därför tolkas JSON bara för ämnesrader. Planeringar påverkas inte, även om någon rad skulle ha ogiltig JSON.
--  * btrim + lower gör att "Matematik " och "matematik" räknas som samma ämne, precis som appen gör.
--    Appen använder toLocaleLowerCase('sv') och databasen lower() med databasens kollation. För svenska bokstäver ger de samma resultat.
--  * Inre mellanslag normaliseras inte, varken i appen eller här. "Matematik  1" och "Matematik 1" är olika ämnen.
create unique index if not exists veckoplanering_unikt_amne
  on public.veckoplanering (user_id, lower(btrim(content::jsonb->>'schoolForm')), lower(btrim(content::jsonb->>'subject')))
  where content like '{"kind":"amne-v1",%';
