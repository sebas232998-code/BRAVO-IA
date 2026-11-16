-- Fase 1, paso 6: bandeja de errores.
-- Se pega una sola vez en Supabase → SQL Editor → Run.

-- Si cada mensaje enviado se entregó, se leyó o falló (por ejemplo, número sin WhatsApp).
alter table mensajes_whatsapp add column if not exists estado text;

-- Correcciones de ciudad que el vendedor hizo una vez: la app las aplica sola la próxima vez.
create table if not exists correcciones_ciudad (
  original text primary key, -- como la escribió la clienta, en MAYÚSCULAS y sin tildes
  ciudad text not null,
  departamento text,
  veces integer not null default 1,
  actualizado_en timestamptz not null default now()
);
alter table correcciones_ciudad enable row level security;
