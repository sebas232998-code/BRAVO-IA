-- Fase 1: guardar cuándo vence el token de WhatsApp, para avisar antes de que deje de funcionar.
-- Se pega una sola vez en Supabase → SQL Editor → Run.
-- Vacío = no se sabe o no vence (token permanente de usuario del sistema).
alter table whatsapp_config add column if not exists token_vence_en timestamptz;
