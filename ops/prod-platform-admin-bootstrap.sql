-- ENGÅNGSÅTGÄRD FÖR PRODUKTION. Kör INTE utan skriftligt godkännande från ägaren.
-- Syfte: när migrationen 20261112000000_teacher_admin_functions.sql ska användas i produktion
-- måste produktionsadministratören finnas i public.platform_admins innan funktionerna byts ut.
-- Annars förlorar administratören sina rättigheter.
-- Produktionens nuvarande funktioner är INTE ändrade av repot. Detta skript ändrar ingen befintlig rad i teacher_access.
insert into public.platform_admins (user_id)
values ('fa85f509-bf1c-43c4-bc82-78777232a339')
on conflict (user_id) do nothing;
