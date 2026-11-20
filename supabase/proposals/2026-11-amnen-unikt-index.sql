-- FÖRSLAG. Ännu inte applicerat i någon databas. Får INTE köras mot produktion utan godkännande.
-- Hindrar dubbla ämnen per konto, oberoende av JSON-ordning, mellanslag, skiftläge och skrivsätt för skolform.
--
-- Verifierat i produktion (skrivskyddat, rapporterat): 16 rader, alla med giltig JSON i content,
-- 0 rader med kind = 'amne-v1', inget index med detta namn.
--
-- Nyckeln:
--  * kind: lower(btrim(...)) = 'amne-v1'. Gäller alla rader som är ämnen, oavsett nyckelordning och formatering.
--  * schoolForm: "Gymnasiet" och "Gymnasieskola" blir samma värde, och "Grundskola" och "Grundskolan" likaså.
--  * subject: btrim, lower och inre mellanslag komprimeras till ett. Samma regel används i appen.
--  * coalesce gör att ett ämne utan skolform också omfattas.
--
-- Konsekvens: content::jsonb tolkas för varje skriven rad. En rad med ogiltig JSON kan därför inte skrivas.
-- Appen skriver alltid giltig JSON med JSON.stringify.
create unique index if not exists veckoplanering_unikt_amne
  on public.veckoplanering (
    user_id,
    (coalesce(
      case
        when lower(btrim(content::jsonb->>'schoolForm')) like 'gymnas%' then 'gymnasiet'
        when lower(btrim(content::jsonb->>'schoolForm')) like 'grundskol%' then 'grundskola'
        else lower(btrim(content::jsonb->>'schoolForm'))
      end, '')),
    (regexp_replace(lower(btrim(coalesce(content::jsonb->>'subject', ''))), '\s+', ' ', 'g'))
  )
  where lower(btrim(content::jsonb->>'kind')) = 'amne-v1';
