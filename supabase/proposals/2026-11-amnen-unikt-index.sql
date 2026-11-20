-- FÖRSLAG. Ännu inte applicerat i någon databas. Får INTE köras mot produktion utan godkännande.
-- Hindrar dubbla ämnen per konto, oberoende av JSON-format, skolformsnamn, skiftläge och mellanslag.
--
-- Verifierat i produktion (skrivskyddat, rapporterat): 16 rader, alla med giltig JSON, 0 rader med kind = 'amne-v1'.
--
-- Designval:
--  * amne_json_text returnerar NULL för ogiltig JSON i stället för att fälla skrivningen. Ogiltig content påverkar
--    därför inte vanliga planeringar, och ogiltiga rader räknas inte som ämnen.
--  * Samma funktion används i både indexuttrycket och predikatet, så de alltid tolkar raden på samma sätt.
--  * Funktionen är markerad IMMUTABLE. Den beror bara på sina argument. Den är SECURITY INVOKER och saknar åtkomst till data.
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
exception when others then
  return null;
end;
$$;

create unique index if not exists veckoplanering_unikt_amne
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
