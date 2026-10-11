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

create or replace function public.get_public_annual_plan(slug_value text)
returns table (published_content text)
language sql stable security definer
set search_path = public
as $$
  select v.published_content
  from public.veckoplanering v
  where v.published = true
    and v.public_slug = slug_value
    and v.published_content is not null
  limit 1;
$$;
revoke all on function public.get_public_annual_plan(text) from public;
grant execute on function public.get_public_annual_plan(text) to anon, authenticated;
