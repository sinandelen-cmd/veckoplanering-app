-- DEVELOPMENT DRAFT ONLY. Review in isolated Supabase before applying.
-- Existing plan primary key is bigint, owner is user_id uuid.
create table if not exists public.plan_collaborators (
  plan_id bigint not null references public.veckoplanering(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (plan_id,user_id)
);
create index if not exists plan_collaborators_user_idx on public.plan_collaborators(user_id);
alter table public.plan_collaborators enable row level security;
revoke all on public.plan_collaborators from anon, authenticated;
grant select on public.plan_collaborators to authenticated;

-- Membership lookup is intentionally private to prevent RLS recursion.
create schema if not exists private;
create or replace function private.can_edit_shared_plan(p_plan_id bigint, p_actor uuid)
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.plan_collaborators c
    join public.teacher_access t on t.user_id=c.user_id
    where c.plan_id=p_plan_id and c.user_id=p_actor
      and t.status='approved' and (t.expires_at is null or t.expires_at>now())
  )
$$;
revoke all on function private.can_edit_shared_plan(bigint,uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_edit_shared_plan(bigint,uuid) to authenticated;

create policy "collaborator sees own access" on public.plan_collaborators
for select to authenticated using (user_id=(select auth.uid()) or
  exists (select 1 from public.veckoplanering p where p.id=plan_id and p.user_id=(select auth.uid())));

create policy "approved collaborator reads plan" on public.veckoplanering
for select to authenticated using (private.can_edit_shared_plan(id,(select auth.uid())));
create policy "approved collaborator edits plan" on public.veckoplanering
for update to authenticated
using (private.can_edit_shared_plan(id,(select auth.uid())))
with check (private.can_edit_shared_plan(id,(select auth.uid())));

-- An UPDATE policy cannot compare old and new owner values; guard at row level.
create or replace function private.protect_shared_plan_owner()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.user_id is distinct from new.user_id or old.id is distinct from new.id then
    raise exception 'Plan owner and identity cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists protect_shared_plan_owner on public.veckoplanering;
create trigger protect_shared_plan_owner before update on public.veckoplanering
for each row execute function private.protect_shared_plan_owner();

-- Email lookup never exposes other users' addresses to the caller.
create or replace function public.invite_plan_colleague(p_plan_id bigint,p_email text)
returns void language plpgsql security definer set search_path='' as $$
declare v_target uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.veckoplanering p where p.id=p_plan_id and p.user_id=auth.uid()
  ) then raise exception 'Only the plan owner may invite colleagues'; end if;
  select u.id into v_target from auth.users u
  join public.teacher_access t on t.user_id=u.id
  where lower(u.email)=lower(trim(p_email)) and t.status='approved'
    and (t.expires_at is null or t.expires_at>now()) limit 1;
  if v_target is null or v_target=auth.uid() then
    raise exception 'No approved colleague with this email'; end if;
  insert into public.plan_collaborators(plan_id,user_id,invited_by)
  values(p_plan_id,v_target,auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.invite_plan_colleague(bigint,text) from public,anon;
grant execute on function public.invite_plan_colleague(bigint,text) to authenticated;

create or replace function public.revoke_plan_colleague(p_plan_id bigint,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.veckoplanering p where p.id=p_plan_id and p.user_id=auth.uid()
  ) then raise exception 'Only the plan owner may revoke access'; end if;
  delete from public.plan_collaborators where plan_id=p_plan_id and user_id=p_user_id;
end $$;
revoke all on function public.revoke_plan_colleague(bigint,uuid) from public,anon;
grant execute on function public.revoke_plan_colleague(bigint,uuid) to authenticated;

-- The frontend must update an existing shared row WITHOUT changing user_id.
-- Revocation is enforced at the database on every update/publish request.
