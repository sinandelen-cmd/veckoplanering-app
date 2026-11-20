-- ÅTERSTÄLLNING. Tar bort exakt det installationen 2026-11-amnen-unikt-index.sql skapade.
-- Rör inga planeringsrader, inga filer i Storage och inga andra funktioner eller index.
-- Körs i en transaktion. Indexet tas bort först, eftersom det beror på funktionen.
-- Får INTE köras mot produktion utan skriftligt godkännande.

begin;

drop index if exists public.veckoplanering_unikt_amne;
drop function if exists public.amne_json_text(text, text);

commit;
