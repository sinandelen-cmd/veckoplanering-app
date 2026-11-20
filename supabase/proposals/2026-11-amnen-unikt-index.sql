-- FÖRSLAG, ännu inte applicerat i någon databas.
-- Hindrar dubbla ämnesrader per konto och skolform vid samtidiga skrivningar (två flikar eller enheter).
-- Gäller bara rader med content.kind = 'amne-v1'. Planeringar (arsplanering-v2) och äldre rader påverkas inte.
-- Verifierad lokalt: samtidiga inserts ger en rad och en 23505-fel. Appen behandlar 23505 som "finns redan".
-- Innan detta körs mot produktion: kör 2026-11-amnen-unikt-index-kontroller.sql (skrivskyddat) och läs resultatet.
-- content är text i schemat. Uttrycket content::jsonb kräver giltig JSON i alla rader, annars misslyckas indexet utan att något ändras.
create unique index if not exists veckoplanering_unikt_amne
  on public.veckoplanering (user_id, lower(content::jsonb->>'schoolForm'), lower(content::jsonb->>'subject'))
  where (content::jsonb->>'kind') = 'amne-v1';
