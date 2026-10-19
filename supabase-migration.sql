-- Årsplanering – säker, idempotent installation/migration.
-- Kör hela filen i Supabase SQL Editor innan publicering.
create extension if not exists pgcrypto;

create table if not exists public.veckoplanering (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  week_start date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.veckoplanering add column if not exists subject text;
alter table public.veckoplanering add column if not exists school_year text;
alter table public.veckoplanering add column if not exists class_name text;
alter table public.veckoplanering add column if not exists start_date date;
alter table public.veckoplanering add column if not exists weeks integer;
alter table public.veckoplanering add column if not exists published boolean not null default false;
alter table public.veckoplanering add column if not exists public_slug text;
alter table public.veckoplanering add column if not exists published_content text;

-- Äldre publiceringar kan innehålla lärardata i content. Publicera om dem via appen.
update public.veckoplanering
set published = false, public_slug = null, published_content = null
where published = true and published_content is null;

create unique index if not exists veckoplanering_public_slug_unique
on public.veckoplanering(public_slug) where published = true and public_slug is not null;
create index if not exists veckoplanering_user_id_idx on public.veckoplanering(user_id);
create index if not exists veckoplanering_published_idx on public.veckoplanering(published);

alter table public.veckoplanering enable row level security;

drop policy if exists "Users can view their own weekly plans" on public.veckoplanering;
create policy "Users can view their own weekly plans" on public.veckoplanering
for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert their own weekly plans" on public.veckoplanering;
create policy "Users can insert their own weekly plans" on public.veckoplanering
for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own weekly plans" on public.veckoplanering;
create policy "Users can update their own weekly plans" on public.veckoplanering
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own weekly plans" on public.veckoplanering;
create policy "Users can delete their own weekly plans" on public.veckoplanering
for delete to authenticated using (auth.uid() = user_id);

-- Ingen anonym SELECT på bastabellen: content/lärardata får aldrig exponeras direkt.
drop policy if exists "Public can view published weekly plans" on public.veckoplanering;
drop policy if exists "Public can view published annual plans" on public.veckoplanering;

-- Publicerade veckor filtreras i databasen, inte i elevens webbläsare.
-- Kräver explicit opt-in via autoReleaseWeeks=true i publicerad elevkopia.
create or replace function public.get_public_annual_plan(slug_value text)
returns table (published_content text)
language sql stable security definer
set search_path = public
as $func$
  select case
    when coalesce((v.published_content::jsonb ->> 'autoReleaseWeeks')::boolean, false) then
      jsonb_set(
        jsonb_set(v.published_content::jsonb, '{weeksData}',
          coalesce((
            select jsonb_agg(w.week order by w.ordinality)
            from jsonb_array_elements(
              case when jsonb_typeof(v.published_content::jsonb -> 'weeksData') = 'array'
                then v.published_content::jsonb -> 'weeksData' else '[]'::jsonb end
            ) with ordinality as w(week, ordinality)
            where (w.week ->> 'weekStart') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              and date_trunc('week', (w.week ->> 'weekStart')::date::timestamp)::date
                <= (now() at time zone 'Europe/Stockholm')::date
          ), '[]'::jsonb)
        ),
        '{schoolClosures}',
        coalesce((
          select jsonb_agg(c.closure order by c.ordinality)
          from jsonb_array_elements(
            case when jsonb_typeof(v.published_content::jsonb -> 'schoolClosures') = 'array'
              then v.published_content::jsonb -> 'schoolClosures' else '[]'::jsonb end
          ) with ordinality as c(closure, ordinality)
          where exists (
            select 1 from jsonb_array_elements(
              case when jsonb_typeof(v.published_content::jsonb -> 'weeksData') = 'array'
                then v.published_content::jsonb -> 'weeksData' else '[]'::jsonb end
            ) as w(week)
            where (w.week ->> 'weekStart') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              and date_trunc('week', (w.week ->> 'weekStart')::date::timestamp)::date
                <= (now() at time zone 'Europe/Stockholm')::date
              and (c.closure ->> 'startDate') <=
                ((date_trunc('week', (w.week ->> 'weekStart')::date::timestamp) + interval '6 days')::date)::text
              and (c.closure ->> 'endDate') >=
                (date_trunc('week', (w.week ->> 'weekStart')::date::timestamp)::date)::text
          )
        ), '[]'::jsonb)
      )::text
    else v.published_content
  end
  from public.veckoplanering v
  where v.published = true and v.public_slug = slug_value
    and v.published_content is not null
  limit 1;
$func$;
revoke all on function public.get_public_annual_plan(text) from public;
grant execute on function public.get_public_annual_plan(text) to anon, authenticated;

create or replace function public.supports_automatic_week_release()
returns boolean language sql stable security definer set search_path = public
as $func$ select true; $func$;
revoke all on function public.supports_automatic_week_release() from public;
grant execute on function public.supports_automatic_week_release() to authenticated;

-- Kollegdelning: privata, fristående kopior med spärr mot vidare delning.
-- Delningskoden lagras ENDAST som hash i databasen. Konfigurera separat via SQL Editor:
-- insert into private_share_settings(id, pass_hash)
-- values (true, crypt('<ANGE_KODEN_PRIVAT_HÄR>', gen_salt('bf')))
-- on conflict (id) do update set pass_hash = excluded.pass_hash;
-- Kör INTE lösenordet i appens källkod eller en offentlig migration.
create table if not exists public.private_share_settings (
  id boolean primary key default true check (id),
  pass_hash text not null
);
revoke all on public.private_share_settings from public, anon, authenticated;

create table if not exists public.plan_share_invitations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_plan_id uuid not null references public.veckoplanering(id) on delete cascade,
  recipient_email text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_at timestamptz
);
create index if not exists plan_share_invitation_owner_idx on public.plan_share_invitations(owner_id);
alter table public.plan_share_invitations enable row level security;
revoke all on public.plan_share_invitations from anon, authenticated;

create table if not exists public.plan_received_copies (
  plan_id uuid primary key references public.veckoplanering(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  original_owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.plan_received_copies enable row level security;
revoke all on public.plan_received_copies from anon, authenticated;

-- Felaktiga kodförsök begränsas per konto även om appen anropas direkt.
create table if not exists public.plan_share_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists plan_share_attempts_idx on public.plan_share_attempts(user_id, attempted_at);
alter table public.plan_share_attempts enable row level security;
revoke all on public.plan_share_attempts from anon, authenticated;

create or replace function public.create_plan_share_invite(
  p_plan_id uuid, p_recipient_email text, p_password text
) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_secret text;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_email text := lower(trim(p_recipient_email));
begin
  if v_user is null then raise exception 'Logga in först'; end if;
  if length(v_email) < 5 or length(v_email) > 254 or position('@' in v_email) < 2 then
    raise exception 'Ange en giltig e-postadress';
  end if;
  if v_email = lower(coalesce((select email from auth.users where id = v_user), '')) then
    raise exception 'Du kan inte dela med dig själv';
  end if;
  -- Logga alla försök; högst fem försök per timme och konto.
  if (select count(*) from public.plan_share_attempts
      where user_id = v_user and attempted_at > now() - interval '1 hour') >= 5 then
    raise exception 'För många försök. Försök igen om en timme';
  end if;
  insert into public.plan_share_attempts(user_id) values (v_user);
  select pass_hash into v_secret from public.private_share_settings where id = true;
  if v_secret is null then raise exception 'Delningskoden är inte aktiverad av administratören'; end if;
  if crypt(coalesce(p_password, ''), v_secret) is distinct from v_secret then
    -- Returnera ett statusvärde i stället för att kasta fel, så försöket
    -- verkligen sparas och spärren mot upprepade gissningar fungerar.
    return 'ERROR:Fel delningskod';
  end if;
  if not exists(select 1 from public.veckoplanering
                where id = p_plan_id and user_id = v_user) then
    raise exception 'Planeringen hittades inte på ditt konto';
  end if;
  if exists(select 1 from public.plan_received_copies where plan_id = p_plan_id) then
    raise exception 'En mottagen kopia får inte delas vidare';
  end if;
  insert into public.plan_share_invitations(owner_id, source_plan_id, recipient_email, token_hash)
  values(v_user, p_plan_id, v_email, encode(digest(v_token, 'sha256'), 'hex'));
  return v_token;
end;
$$;
revoke all on function public.create_plan_share_invite(uuid,text,text) from public, anon;
grant execute on function public.create_plan_share_invite(uuid,text,text) to authenticated;

create or replace function public.claim_plan_share_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.plan_share_invitations%rowtype;
  v_src public.veckoplanering%rowtype;
  v_new uuid;
  v_content jsonb;
begin
  if v_user is null then raise exception 'Logga in först'; end if;
  select lower(email) into v_email from auth.users where id = v_user;
  select * into v_inv from public.plan_share_invitations
    where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
      and claimed_at is null and expires_at > now()
    for update;
  if not found then raise exception 'Inbjudan saknas, har gått ut eller är redan använd'; end if;
  if v_inv.recipient_email <> v_email then
    raise exception 'Logga in med e-postadressen som inbjudan skickades till';
  end if;
  select * into v_src from public.veckoplanering
    where id = v_inv.source_plan_id and user_id = v_inv.owner_id;
  if not found then raise exception 'Originalplaneringen finns inte längre'; end if;
  if exists(select 1 from public.plan_received_copies where plan_id = v_src.id) then
    raise exception 'Mottagna kopior kan inte delas vidare';
  end if;
  v_content := coalesce(nullif(v_src.content, '')::jsonb, '{}'::jsonb)
    || jsonb_build_object('published', false, 'publicSlug', '', 'archived', false, 'receivedCopy', true);
  insert into public.veckoplanering(user_id,title,content,week_start,subject,school_year,
    class_name,start_date,weeks,published,public_slug,published_content,updated_at)
  values(v_user, v_src.title || ' – egen kopia', v_content::text, v_src.week_start,
    v_src.subject, v_src.school_year,v_src.class_name,v_src.start_date,v_src.weeks,
    false,null,null,now()) returning id into v_new;
  insert into public.plan_received_copies(plan_id,recipient_id,original_owner_id)
  values(v_new,v_user,v_inv.owner_id)
  on conflict (plan_id) do update set original_owner_id = excluded.original_owner_id;
  update public.plan_share_invitations set claimed_at = now() where id = v_inv.id;
  return v_new;
end;
$$;
revoke all on function public.claim_plan_share_invite(text) from public, anon;
grant execute on function public.claim_plan_share_invite(text) to authenticated;

-- Även kopior som återanvänds eller klonas i appen förblir spärrade.
-- Klienten kan inte ändra eller ta bort receivedCopy på en redan mottagen kopia.

create or replace function public.preserve_received_copy_lock()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists(select 1 from public.plan_received_copies where plan_id = old.id) then
    new.content := (coalesce(nullif(new.content,'')::jsonb, '{}'::jsonb)
      || '{"receivedCopy":true}'::jsonb)::text;
  end if;
  return new;
end;
$$;
drop trigger if exists preserve_received_copy_lock_trigger on public.veckoplanering;
create trigger preserve_received_copy_lock_trigger
before update of content on public.veckoplanering
for each row execute function public.preserve_received_copy_lock();

create or replace function public.register_received_copy_clone()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce((nullif(new.content,'')::jsonb ->> 'receivedCopy')::boolean,false) then
    insert into public.plan_received_copies(plan_id,recipient_id,original_owner_id)
    values(new.id,new.user_id,new.user_id)
    on conflict (plan_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists register_received_copy_clone_trigger on public.veckoplanering;
create trigger register_received_copy_clone_trigger
after insert on public.veckoplanering
for each row execute function public.register_received_copy_clone();
