-- Beteende- och åtkomstkontroller för amnen-unikt-index, körda som den inloggade rollen "authenticated".
-- Kräver -v uid=<lokal testanvändare>. Körs ENBART mot lokal Docker-databas. Allt rullas tillbaka.
\set ON_ERROR_STOP 1
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', :'uid', true);
set local role authenticated;

-- A. Vanliga planeringar med ogiltig JSON, \u0000-escape och för djup nästling släpps in
do $$
declare uid uuid := current_setting('request.jwt.claim.sub')::uuid;
begin
  insert into public.veckoplanering (user_id, title, content) values
    (uid, 'CHECK-A1', 'inte json'),
    (uid, 'CHECK-A2', '{"a":"\u0000"}'),
    (uid, 'CHECK-A3', repeat('[', 200000));
end $$;

-- B. Ämnesrader som skiljer sig i skolform släpps in, och ett annat kind-värde är inte ett ämne
do $$
declare uid uuid := current_setting('request.jwt.claim.sub')::uuid;
begin
  insert into public.veckoplanering (user_id, title, content) values
    (uid, 'CHECK-B1', '{"kind":"amne-v1","schoolForm":"Grundskola","subject":"Matte"}'),
    (uid, 'CHECK-B2', '{"kind":"amne-v1","schoolForm":"Gymnasieskola","subject":"Matte"}'),
    (uid, 'CHECK-B3', '{"kind":"arsplanering-v2","schoolForm":"Grundskola","subject":"Matte"}'),
    (uid, 'CHECK-B4', '{"kind":"arsplanering-v2","schoolForm":"Grundskola","subject":"Matte"}');
end $$;

-- C. Dubbletter blockeras oavsett format: skiftläge, mellanslag, ordning och \u-escape i kind
do $$
declare uid uuid := current_setting('request.jwt.claim.sub')::uuid;
begin
  begin
    insert into public.veckoplanering (user_id, title, content) values (uid, 'CHECK-C1', '{"kind":"amne-v1","schoolForm":" GRUNDSKOLA ","subject":"matte"}');
    raise exception 'FEL: dubblett (skiftläge/mellanslag) släpptes in';
  exception when unique_violation then null;
  end;
  begin
    insert into public.veckoplanering (user_id, title, content) values (uid, 'CHECK-C2', '{"subject":"MATTE","schoolForm":"grundskola","kind":"amne-v1"}');
    raise exception 'FEL: dubblett (annan ordning) släpptes in';
  exception when unique_violation then null;
  end;
  begin
    insert into public.veckoplanering (user_id, title, content) values (uid, 'CHECK-C3', '{"kind":"amne-v1","schoolForm":"Grundskola","subject":"Matte"}');
    raise exception 'FEL: dubblett (a-escape) släpptes in';
  exception when unique_violation then null;
  end;
end $$;

-- D. Uppdatering av en vanlig rad till ogiltig JSON går igenom
update public.veckoplanering set content = 'inte json' where title = 'CHECK-A1';

-- E. Rättigheter: authenticated får anropa funktionen, anon får inte
select public.amne_json_text('{"kind":"amne-v1"}', 'kind') as authenticated_anrop;
do $$
begin
  execute 'set local role anon';
  begin
    perform public.amne_json_text('{}', 'kind');
    raise exception 'FEL: anon kunde anropa amne_json_text';
  exception when insufficient_privilege then null;
  end;
  execute 'set local role authenticated';
end $$;

select 'ALLA BETEENDEKONTROLLER OK' as resultat;
rollback;
