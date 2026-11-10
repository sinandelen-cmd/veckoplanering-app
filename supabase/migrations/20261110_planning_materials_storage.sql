-- Privat lagring för material som bifogas till planeringar.
-- Skapar endast en ny bucket och tre policies för den bucketen. Inga tabeller, planeringar, scheman eller konton ändras.
-- Varje fil ligger i mappen <användarens id>/..., och bara ägaren kan läsa, lägga till och ta bort den.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'planning-materials',
  'planning-materials',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'text/plain'
  ]
)
on conflict (id) do nothing;

create policy "Lärare läser egna planeringsmaterial"
  on storage.objects for select to authenticated
  using (bucket_id = 'planning-materials' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Lärare lägger till egna planeringsmaterial"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'planning-materials' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Lärare tar bort egna planeringsmaterial"
  on storage.objects for delete to authenticated
  using (bucket_id = 'planning-materials' and (storage.foldername(name))[1] = auth.uid()::text);
