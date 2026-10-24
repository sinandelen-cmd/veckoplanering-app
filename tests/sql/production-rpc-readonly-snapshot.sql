-- READ-ONLY pg_get_functiondef snapshot taken 2026-10-24 from Veckoplanering. DO NOT DEPLOY.
-- Exact production SQL, including currently known NULL hideDate filtering bug.
CREATE OR REPLACE FUNCTION public.get_public_annual_plan(slug_value text)
 RETURNS TABLE(published_content text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with source as (
 select v.published_content::jsonb as doc,
        (now() at time zone 'Europe/Stockholm')::date as today
 from public.veckoplanering v
 where v.published = true and v.public_slug = slug_value and v.published_content is not null
 limit 1
), eligible as (
 select s.doc,s.today,w.week,w.ordinality,
        case when (w.week->>'publishDate') ~ '^\d{4}-\d{2}-\d{2}$' then (w.week->>'publishDate')::date
             else date_trunc('week', (w.week->>'weekStart')::date::timestamp)::date end as release_day
 from source s
 cross join lateral jsonb_array_elements(case when jsonb_typeof(s.doc->'weeksData')='array' then s.doc->'weeksData' else '[]'::jsonb end) with ordinality as w(week,ordinality)
 where (w.week->>'weekStart') ~ '^\d{4}-\d{2}-\d{2}$'
 and coalesce((w.week->>'hidden')::boolean,false)=false
 and (not coalesce((s.doc->>'autoReleaseWeeks')::boolean,false)
      or (case when (w.week->>'publishDate') ~ '^\d{4}-\d{2}-\d{2}$' then (w.week->>'publishDate')::date
             else date_trunc('week',(w.week->>'weekStart')::date::timestamp)::date end) <= s.today)
 and (not ((w.week->>'hideDate') ~ '^\d{4}-\d{2}-\d{2}$') or (w.week->>'hideDate')::date > s.today)
), chosen as (
 select e.* from eligible e
 where not coalesce((e.doc->>'autoReleaseWeeks')::boolean,false)
 or e.ordinality in (
   select z.ordinality from eligible z
   order by z.release_day desc,z.ordinality desc
   limit greatest(1,least(12,coalesce(nullif(e.doc->>'visibleWeekCount','')::integer,2)))
 )
), assembled as (
 select s.doc,
   coalesce((select jsonb_agg(c.week order by c.ordinality) from chosen c),'[]'::jsonb) as shown
 from source s
)
select jsonb_set(
 jsonb_set(a.doc,'{weeksData}',a.shown),
 '{schoolClosures}',
 coalesce((select jsonb_agg(c.closure order by c.ordinality)
 from jsonb_array_elements(case when jsonb_typeof(a.doc->'schoolClosures')='array' then a.doc->'schoolClosures' else '[]'::jsonb end) with ordinality as c(closure,ordinality)
 where exists (select 1 from jsonb_array_elements(a.shown) as w(week)
 where (c.closure->>'startDate') <= ((w.week->>'weekStart')::date+6)::text
 and (c.closure->>'endDate') >= (w.week->>'weekStart'))),'[]'::jsonb)
)::text from assembled a;
$function$

