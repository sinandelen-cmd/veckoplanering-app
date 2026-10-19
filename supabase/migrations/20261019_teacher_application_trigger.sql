-- Register pending teacher applications when Supabase Auth creates an account.
create or replace function public.register_teacher_application()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.teacher_access(user_id, status)
  values (new.id, 'pending')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_teacher_application on auth.users;
create trigger on_auth_user_created_teacher_application
after insert on auth.users
for each row execute function public.register_teacher_application();
-- Backfill accounts registered before the trigger without overwriting approvals.
insert into public.teacher_access(user_id,status)
select id,'pending' from auth.users
on conflict (user_id) do nothing;
