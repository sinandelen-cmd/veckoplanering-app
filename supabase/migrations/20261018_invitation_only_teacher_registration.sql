-- Apply to a separate test Supabase database first. Do not run on production without a migration plan.
create extension if not exists pgcrypto;
create table if not exists public.teacher_share_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id),
  plan_id bigint not null references public.veckoplanering(id),
  recipient_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.teacher_share_invites enable row level security;
revoke all on public.teacher_share_invites from anon, authenticated;
create or replace function public.create_plan_share_invite(p_plan_id bigint, p_recipient_email text, p_password text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  if not exists(select 1 from public.veckoplanering where id=p_plan_id and user_id=auth.uid() and coalesce((content::jsonb->>'receivedCopy')::boolean,false)=false) then
    raise exception 'Du kan bara dela din egen originalplanering';
  end if;
  if p_recipient_email !~* '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'Ogiltig e-postadress'; end if;
  if length(p_password)<6 then raise exception 'Delningskoden måste ha minst 6 tecken'; end if;
  v_token := encode(gen_random_bytes(24),'hex');
  insert into public.teacher_share_invites(sender_id,plan_id,recipient_email,token_hash)
  values(auth.uid(),p_plan_id,lower(trim(p_recipient_email)),encode(digest(v_token,'sha256'),'hex'));
  return v_token;
end $$;
revoke all on function public.create_plan_share_invite(bigint,text,text) from public;
grant execute on function public.create_plan_share_invite(bigint,text,text) to authenticated;

create or replace function public.claim_plan_share_invite(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.teacher_share_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Logga in först'; end if;
  select * into v_inv from public.teacher_share_invites
  where token_hash=encode(digest(trim(p_token),'sha256'),'hex')
    and consumed_at is null and expires_at>now() for update;
  if not found then raise exception 'Koden är ogiltig, använd eller har gått ut'; end if;
  if lower(coalesce(auth.jwt()->>'email',''))<>v_inv.recipient_email then raise exception 'Koden gäller en annan e-postadress'; end if;
  insert into public.veckoplanering(user_id,title,week_start,content,subject,school_year,class_name,start_date,weeks,published,is_published)
  select auth.uid(),title,week_start,
    (coalesce(content,'{}')::jsonb || '{"receivedCopy":true,"archived":false,"published":false}'::jsonb)::text,
    subject,school_year,class_name,start_date,weeks,false,false
  from public.veckoplanering where id=v_inv.plan_id;
  update public.teacher_share_invites set consumed_at=now(),consumed_by=auth.uid() where id=v_inv.id;
end $$;
revoke all on function public.claim_plan_share_invite(text) from public;
grant execute on function public.claim_plan_share_invite(text) to authenticated;

-- Reject uninvited self-service registration at the database boundary.
-- Existing accounts remain unaffected. The invite is consumed on successful signup.
create or replace function public.enforce_teacher_signup_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_token text; v_inv public.teacher_share_invites%rowtype;
begin
  v_token := new.raw_user_meta_data->>'registration_invite_token';
  if nullif(trim(coalesce(v_token,'')),'') is null then
    raise exception 'Registrering kräver en inbjudningskod';
  end if;
  select * into v_inv from public.teacher_share_invites
    where token_hash=encode(digest(trim(v_token),'sha256'),'hex')
      and recipient_email=lower(trim(new.email))
      and consumed_at is null and expires_at>now()
    for update;
  if not found then raise exception 'Ogiltig eller förbrukad inbjudningskod'; end if;
  update public.teacher_share_invites set consumed_at=now(),consumed_by=new.id where id=v_inv.id;
  insert into public.veckoplanering(user_id,title,week_start,content,subject,school_year,class_name,start_date,weeks,published,is_published)
  select new.id,title,week_start,
    (coalesce(content,'{}')::jsonb || '{"receivedCopy":true,"archived":false,"published":false}'::jsonb)::text,
    subject,school_year,class_name,start_date,weeks,false,false
  from public.veckoplanering where id=v_inv.plan_id;
  return new;
end $$;
drop trigger if exists require_teacher_invite_on_signup on auth.users;
create trigger require_teacher_invite_on_signup before insert on auth.users
for each row execute function public.enforce_teacher_signup_invite();
