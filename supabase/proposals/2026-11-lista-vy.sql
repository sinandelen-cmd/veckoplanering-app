-- FÖRSLAG. Ännu inte applicerat i produktion. Får INTE köras mot produktion utan skriftligt godkännande.
-- Syfte: planeringslistan i appen laddar bara det som biblioteket behöver. Veckornas innehåll (weeksData) hämtas
-- först när en planering öppnas. Idag laddas hela innehållet för alla planeringar vid varje inloggning, vilket
-- på långsam uppkoppling ger långa väntetider.
--
-- Vyn är read-only och security_invoker, så den visar bara den inloggade användarens rader enligt befintliga RLS-regler.
-- Appen använder vyn om den finns och faller tillbaka till tabellen annars. Därför kan appen köras före och efter installation.
-- Återställning: 2026-11-lista-vy-aterstall.sql.

begin;

-- Tar bort weeksData ur JSON-innehållet. Ogiltig JSON, \u0000-escape och för djup nästling lämnas oförändrade,
-- så att listan aldrig kastar fel för en rad. Övriga fel fortplantas.
create or replace function public.planering_lista_innehall(doc text)
returns text
language plpgsql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $$
begin
  if doc is null then return null; end if;
  return (doc::jsonb - 'weeksData')::text;
exception
  when invalid_text_representation or untranslatable_character or statement_too_complex then
    return doc;
end;
$$;

revoke all on function public.planering_lista_innehall(text) from public, anon;
grant execute on function public.planering_lista_innehall(text) to authenticated, service_role;

create view public.veckoplanering_lista with (security_invoker = true) as
select id, user_id, title, public.planering_lista_innehall(content) as content, week_start, created_at, updated_at,
       subject, school_year, class_name, start_date, weeks, published, public_slug
from public.veckoplanering;

revoke all on public.veckoplanering_lista from public, anon;
grant select on public.veckoplanering_lista to authenticated, service_role;

commit;
