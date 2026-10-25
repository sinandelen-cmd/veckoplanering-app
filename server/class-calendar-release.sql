-- Additive endpoint: the existing public API and all saved plans stay untouched.
-- Pure helpers accept documents, never read teacher tables, and run as invoker.
create or replace function public.annual_class_calendar(doc jsonb, class_doc jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $body$
declare
  source_weeks jsonb := coalesce(doc->'classSourceWeeks', doc->'weeksData', '[]'::jsonb);
  queue jsonb := '[]'::jsonb;
  closures jsonb := '[]'::jsonb;
  results jsonb := '[]'::jsonb;
  events jsonb := coalesce(class_doc->'calendarEvents','[]'::jsonb);
  event_doc jsonb; event_lesson jsonb; last_event date;
  w jsonb; l jsonb; e jsonb; s jsonb; topics jsonb; selected jsonb;
  current_lesson jsonb; scheduled_lesson jsonb; template jsonb;
  first_week date; last_week date; calendar_day date; week_date date;
  start_day date := coalesce(nullif(class_doc->>'startDate',''),nullif(doc->>'startDate',''))::date;
  day_name text; date_key text; key text;
  cursor_index integer := 0; topic_offset integer := 0; original_offset integer;
  queue_units integer := 0; horizon integer; week_offset integer; day_offset integer;
  regular_count integer; slot_count integer; cancelled_count integer;
  first_slot integer; last_slot integer; slot_index integer;
  requested integer; available integer; take_count integer; i integer;
  lesson_number integer := 0; week_number integer; week_lessons jsonb; source_chapter text := ''; week_chapters jsonb; chapter_name text;
  blocked boolean; cancel_start boolean;
begin
  if jsonb_typeof(source_weeks) <> 'array' then return '[]'::jsonb; end if;
  for w in select value from jsonb_array_elements(source_weeks) where value->>'weekStart' ~ '^\d{4}-\d{2}-\d{2}$' order by value->>'weekStart' loop
    week_date := date_trunc('week',(w->>'weekStart')::date)::date;
    first_week := least(first_week,week_date); last_week := greatest(last_week,week_date);
    if nullif(btrim(w->>'chapter'),'') is not null then source_chapter := w->>'chapter'; end if;
    if coalesce((w->>'calendarEventWeek')::boolean,false) then
      events := events || jsonb_build_array(jsonb_build_object('weekStart',w->>'weekStart','type',coalesce(w->>'eventType','Annat'),'title',coalesce(w->>'eventTitle',w->>'eventType','Händelse'),'days',coalesce(w->'eventDays','["Måndag","Tisdag","Onsdag","Torsdag","Fredag"]'::jsonb),'lessons',coalesce(w->'lessons','[]'::jsonb)));
      continue;
    end if;
    for l in select value from jsonb_array_elements(coalesce(w->'lessons','[]'::jsonb)) loop
      queue := queue || jsonb_build_array(jsonb_build_object('lesson',l,'chapter',source_chapter));
      queue_units := queue_units + greatest(1,jsonb_array_length(coalesce(l->'topics','[]'::jsonb)));
    end loop;
  end loop;
  if first_week is null then return '[]'::jsonb; end if;
  for e in select value from jsonb_array_elements(coalesce(doc->'schoolClosures','[]'::jsonb)) loop
    if e->'classNames' is null or e->'classNames' ? (class_doc->>'name') then closures := closures || jsonb_build_array(e); end if;
  end loop;
  closures := closures || coalesce(class_doc->'schoolClosures','[]'::jsonb);
  select max((value->>'weekStart')::date) into last_event from jsonb_array_elements(events) where value->>'weekStart' ~ '^\d{4}-\d{2}-\d{2}$';
  last_week := greatest(last_week,start_day,last_event);
  for e in select value from jsonb_array_elements(closures || coalesce(class_doc->'extraSlots','[]'::jsonb)) loop
    key := coalesce(e->>'endDate',e->>'startDate',e->>'date');
    if key ~ '^\d{4}-\d{2}-\d{2}$' then last_week := greatest(last_week,key::date); end if;
  end loop;
  for key in select jsonb_array_elements_text(coalesce(class_doc->'cancelledDates','[]'::jsonb)) loop
    if key ~ '^\d{4}-\d{2}-\d{2}$' then last_week := greatest(last_week,key::date); end if;
  end loop;
  horizon := greatest(1,(last_week-first_week)/7+1) + ceil(queue_units::numeric/greatest(1,jsonb_array_length(coalesce(class_doc->'days','[]'::jsonb))))::integer + 2;
  for week_offset in 0..horizon-1 loop
    week_date := first_week + week_offset*7;
    exit when cursor_index >= jsonb_array_length(queue) and (last_event is null or week_date>last_event);
    week_lessons := '[]'::jsonb; week_chapters := '[]'::jsonb;
    template := null;
    select value into template from jsonb_array_elements(source_weeks) where value->>'weekStart'=week_date::text limit 1;
    for day_offset in 0..4 loop
      calendar_day := week_date + day_offset;
      date_key := calendar_day::text;
      day_name := (array['Måndag','Tisdag','Onsdag','Torsdag','Fredag'])[day_offset+1];
      if calendar_day < start_day or coalesce(class_doc->'cancelledDates','[]'::jsonb) ? date_key then continue; end if;
      blocked := false; cancelled_count := 0; cancel_start := false;
      for e in select value from jsonb_array_elements(closures) where value->>'startDate' <= date_key and coalesce(value->>'endDate',value->>'startDate') >= date_key loop
        if coalesce(e->>'type','') <> 'Halvdag' then blocked := true;
        else cancelled_count := cancelled_count + greatest(1,coalesce((e->>'cancelledLessons')::integer,1));
          cancel_start := cancel_start or e->>'cancelledFrom'='start';
        end if;
      end loop;
      if blocked then continue; end if;
      select count(*) into regular_count from jsonb_array_elements_text(coalesce(class_doc->'days','[]'::jsonb)) d where d=day_name;
      select regular_count + count(*) into slot_count from jsonb_array_elements(coalesce(class_doc->'extraSlots','[]'::jsonb)) x where x->>'date'=date_key;
      first_slot := case when cancel_start then least(slot_count,cancelled_count) else 0 end;
      last_slot := case when cancel_start then slot_count else greatest(0,slot_count-cancelled_count) end;
      if last_slot <= first_slot then continue; end if;
      for slot_index in first_slot..last_slot-1 loop
        event_doc := null;
        select value into event_doc from jsonb_array_elements(events) with ordinality as x(value,n) where value->>'weekStart'=week_date::text and coalesce(value->'days','[]'::jsonb) ? day_name order by n desc limit 1;
        if event_doc is not null then
          event_lesson := null;
          select value into event_lesson from jsonb_array_elements(coalesce(event_doc->'lessons','[]'::jsonb)) where value->>'day'=day_name limit 1;
          if event_lesson is null then
            event_lesson := jsonb_build_object('name',event_doc->>'type','topics',jsonb_build_array(jsonb_build_object('name',coalesce(event_doc->>'title',event_doc->>'type'),'pages','[]'::jsonb,'assignments','[]'::jsonb,'links','[]'::jsonb)));
            if event_doc->>'type' in ('Prov','Test','Nationellt prov') then event_lesson := event_lesson || jsonb_build_object('assessment',jsonb_build_object('type',event_doc->>'type','title',coalesce(event_doc->>'title',event_doc->>'type'),'description','')); end if;
          end if;
          lesson_number := lesson_number+1;
          week_lessons := week_lessons || jsonb_build_array(event_lesson || jsonb_build_object('day',day_name,'date',date_key,'name','Lektion '||(jsonb_array_length(week_lessons)+1)));
          continue;
        end if;
        if cursor_index >= jsonb_array_length(queue) then continue; end if;
        s := queue->cursor_index;
        original_offset := topic_offset;
        lesson_number := lesson_number+1;
        requested := greatest(1,least(20,coalesce((class_doc->'momentsPerLesson'->>(lesson_number-1)::text)::integer,(class_doc->'momentsPerDay'->>day_name)::integer,1)));
        selected := '[]'::jsonb;
        while cursor_index < jsonb_array_length(queue) and jsonb_array_length(selected)<requested loop
          current_lesson := queue->cursor_index->'lesson';
          topics := coalesce(current_lesson->'topics','[]'::jsonb);
          if jsonb_array_length(topics)=0 then
            if jsonb_array_length(selected)=0 then cursor_index := cursor_index+1; end if;
            exit;
          end if;
          if current_lesson->'assessment' is not null and jsonb_array_length(selected)>0 and current_lesson is distinct from s->'lesson' then exit; end if;
          chapter_name := queue->cursor_index->>'chapter';
          if nullif(chapter_name,'') is not null and not (week_chapters ? chapter_name) then week_chapters := week_chapters || jsonb_build_array(chapter_name); end if;
          available := jsonb_array_length(topics)-topic_offset;
          take_count := least(requested-jsonb_array_length(selected),available);
          if take_count>0 then
            for i in topic_offset..topic_offset+take_count-1 loop selected := selected || jsonb_build_array(topics->i); end loop;
          end if;
          topic_offset := topic_offset+take_count;
          if topic_offset>=jsonb_array_length(topics) then
            cursor_index := cursor_index+1; topic_offset := 0;
            exit when current_lesson->'assessment' is not null;
          end if;
        end loop;
        scheduled_lesson := (s->'lesson') || jsonb_build_object('topics',selected,'day',day_name,'date',date_key,'name','Lektion '||(jsonb_array_length(week_lessons)+1));
        if original_offset>0 then scheduled_lesson := scheduled_lesson-'assessment'; end if;
        week_lessons := week_lessons || jsonb_build_array(scheduled_lesson);
      end loop;
    end loop;
    week_number := extract(week from week_date)::integer;
    results := results || jsonb_build_array(coalesce(template,'{}'::jsonb) || jsonb_build_object('weekStart',week_date::text,'weekNumber',week_number,'title',coalesce(template->>'title','Vecka '||week_number),'chapter',coalesce((select string_agg(value,' / ') from jsonb_array_elements_text(week_chapters)),template->>'chapter',''),'lessons',week_lessons,'content','','items','[]'::jsonb,'pages','[]'::jsonb,'assignments','[]'::jsonb,'links','[]'::jsonb));
  end loop;
  return results;
end;
$body$;

create or replace function public.annual_visible_weeks(weeks jsonb, automatic boolean, visible_count integer, today date)
returns jsonb language sql immutable security invoker set search_path = '' as $body$
 select coalesce(jsonb_agg(w order by w->>'weekStart' desc),'[]'::jsonb)
 from jsonb_array_elements(coalesce(weeks,'[]'::jsonb)) as a(w)
 where w->>'weekStart' ~ '^\d{4}-\d{2}-\d{2}$'
   and coalesce(w->>'hidden','false') <> 'true'
   and coalesce(nullif(w->>'publishDate',''),w->>'weekStart')::date <= today
   and (nullif(w->>'hideDate','') is null or (w->>'hideDate')::date > today)
   and (w->>'keepVisibleExtra'='true'
     or (w->>'weekStart')::date between date_trunc('week',today)::date-7*(greatest(1,least(12,visible_count))-1) and date_trunc('week',today)::date);
$body$;

create or replace function public.get_public_annual_plan_v2(slug_value text, class_value text default '')
returns table(published_content text) language plpgsql stable security definer set search_path = '' as $body$
declare doc jsonb; class_doc jsonb; shown jsonb; today date; names jsonb; public_closures jsonb;
begin
 select v.published_content::jsonb into doc from public.veckoplanering v where v.published=true and v.public_slug=slug_value and v.published_content is not null limit 1;
 if doc is null then return; end if;
 today := ((now() at time zone 'Europe/Stockholm')-interval '1 minute')::date;
 select coalesce(jsonb_agg(jsonb_build_object('name',g->>'name')),'[]'::jsonb) into names from jsonb_array_elements(coalesce(doc->'classGroups','[]'::jsonb)) g;
 if coalesce(class_value,'')<>'' then
   select g into class_doc from jsonb_array_elements(coalesce(doc->'classGroups','[]'::jsonb)) g where g->>'name'=class_value limit 1;
   if class_doc is null then return; end if;
   shown := public.annual_class_calendar(doc,class_doc);
 else shown := doc->'weeksData'; end if;
 shown := public.annual_visible_weeks(shown,coalesce((doc->>'autoReleaseWeeks')::boolean,false),coalesce((doc->>'visibleWeekCount')::integer,2),today);
 select coalesce(jsonb_agg(c || jsonb_build_object('name',coalesce(c->>'name',c->>'type','Ledig dag'),'endDate',coalesce(c->>'endDate',c->>'startDate'),'verified',coalesce((c->>'verified')::boolean,true))),'[]'::jsonb) into public_closures from jsonb_array_elements(coalesce(doc->'schoolClosures','[]'::jsonb) || coalesce(class_doc->'schoolClosures','[]'::jsonb)) c where (coalesce(class_value,'')='' or c->'classNames' is null or c->'classNames' ? class_value) and exists(select 1 from jsonb_array_elements(shown) w where c->>'startDate' <= ((w->>'weekStart')::date+6)::text and coalesce(c->>'endDate',c->>'startDate') >= w->>'weekStart');
 doc := (doc-'classSourceWeeks'-'classGroups'-'schoolClosures') || jsonb_build_object('weeksData',shown,'schoolClosures',public_closures,'classGroups',names,'classScheduleResolved',coalesce(class_value,'')<>'','resolvedClassName',coalesce(class_value,''));
 return query select doc::text;
end;
$body$;
revoke all on function public.get_public_annual_plan_v2(text,text) from public;
grant execute on function public.get_public_annual_plan_v2(text,text) to anon,authenticated;
-- Capability is tied to the real calendar endpoint, not a client-side bypass.
create or replace function public.supports_class_week_release() returns boolean language sql stable security invoker set search_path = '' as $body$
 select to_regprocedure('public.get_public_annual_plan_v2(text,text)') is not null;
$body$;
