-- Nya konton registreras som väntande lärarkonton när Supabase Auth skapar användaren.
-- Motsvarar produktionens trigger teacher_access_on_signup, utan hårdkodad administratör.
create or replace function public.create_teacher_access_on_signup()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.teacher_access (user_id, status)
  values (new.id, 'pending')
  on conflict (user_id) do nothing;
  return new;
end
$$;
drop trigger if exists teacher_access_on_signup on auth.users;
create trigger teacher_access_on_signup
after insert on auth.users
for each row execute function public.create_teacher_access_on_signup();
