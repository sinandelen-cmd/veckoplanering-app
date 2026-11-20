-- FÖRSLAG. Ännu inte applicerat i produktion. Får INTE köras mot produktion utan skriftligt godkännande.
-- Kör först 2026-11-amnen-unikt-index-kontroller.sql (skrivskyddat) och kontrollera att allt är som förväntat.
--
-- Hindrar dubbla ämnen per konto, oberoende av JSON-format, skolformsnamn, skiftläge och mellanslag.
-- Hela installationen körs i EN transaktion: misslyckas någon sats rullas både funktionen och indexet tillbaka.
-- Återställning: 2026-11-amnen-unikt-index-aterstall.sql.
--
-- Verifierat i produktion (skrivskyddat, rapporterat): 16 rader, alla med giltig JSON, 0 rader med kind = 'amne-v1'.
--
-- Designval:
--  * Felhanteringen fångar bara tre namngivna JSON-fel och returnerar NULL för dem:
--      invalid_text_representation (22P02): ogiltig JSON, tom text, trunkerad JSON
--      untranslatable_character    (22P05): \u0000-escape, som jsonb inte kan lagra
--      statement_too_complex       (54001): för djupt nästlad JSON
--    Alla andra fel fortplantas. Funktionen fångar alltså inte WHEN OTHERS, och oväntade fel stoppar skrivningen i stället för att tyst släppa igenom.
--  * Ogiltig content räknas som "inte ämne". Vanliga planeringar med ogiltig JSON släpps därför fortfarande in.
--  * Samma funktion används i både indexuttrycket och predikatet, så de alltid tolkar raden på samma sätt.
--  * IMMUTABLE, SECURITY INVOKER, search_path låst. Funktionen läser inga tabeller.
--  * EXECUTE dras in från PUBLIC och anon. authenticated och service_role behåller EXECUTE, eftersom vanliga
--    INSERT och UPDATE annars nekas. Funktionen är ren (läser inga tabeller) och exponeras som RPC i public.
--    Alternativ, om det ska bort helt: flytta funktionen till ett schema som PostgREST inte exponerar.
--  * Vanligt CREATE UNIQUE INDEX (inte CONCURRENTLY, som inte går i en transaktion). Tabellen är liten, låset är kort.
--  * Ingen "IF NOT EXISTS": finns indexet redan ska installationen stanna i stället för att tyst lämna en okänd definition kvar.

begin;

create or replace function public.amne_json_text(doc text, key text)
returns text
language plpgsql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $$
begin
  return (doc::jsonb) ->> key;
exception
  when invalid_text_representation    -- 22P02
    or untranslatable_character       -- 22P05
    or statement_too_complex          -- 54001
  then
    return null;
end;
$$;

-- Rättigheter: Postgres kontrollerar EXECUTE för rollen som skriver, eftersom indexuttrycket anropar funktionen.
-- Därför får authenticated och service_role anropa den. anon och PUBLIC får inte. Verifierat lokalt.
revoke all on function public.amne_json_text(text, text) from public, anon;
grant execute on function public.amne_json_text(text, text) to authenticated, service_role;

create unique index veckoplanering_unikt_amne
  on public.veckoplanering (
    user_id,
    (coalesce(
      case
        when lower(btrim(public.amne_json_text(content, 'schoolForm'))) like 'gymnas%' then 'gymnasiet'
        when lower(btrim(public.amne_json_text(content, 'schoolForm'))) like 'grundskol%' then 'grundskola'
        else lower(btrim(public.amne_json_text(content, 'schoolForm')))
      end, '')),
    (regexp_replace(lower(btrim(coalesce(public.amne_json_text(content, 'subject'), ''))), '\s+', ' ', 'g'))
  )
  where lower(btrim(coalesce(public.amne_json_text(content, 'kind'), ''))) = 'amne-v1';

commit;
