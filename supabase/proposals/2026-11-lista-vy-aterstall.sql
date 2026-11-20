-- ÅTERSTÄLLNING av 2026-11-lista-vy.sql. Tar bort vyn och funktionen. Rör inga planeringsrader.
begin;
drop view if exists public.veckoplanering_lista;
drop function if exists public.planering_lista_innehall(text);
commit;
