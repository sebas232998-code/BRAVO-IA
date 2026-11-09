-- Fase 1, paso 3: conectar WhatsApp.
-- Se pega una sola vez en Supabase → SQL Editor → Run.

-- Datos de WhatsApp de cada tienda (se llenan desde la pantalla "WhatsApp" de la app).
-- Solo el servidor de la app los lee: nadie entra a esta tabla desde el navegador.
create table if not exists whatsapp_config (
  tienda_dominio text primary key,
  phone_number_id text not null,
  waba_id text,
  access_token text not null,
  app_secret text,
  verify_token text not null,
  plantilla_confirmacion text,
  idioma_plantilla text not null default 'es',
  actualizado_en timestamptz not null default now()
);

-- Todos los mensajes de WhatsApp, los que llegan y los que se envían.
create table if not exists mensajes_whatsapp (
  id bigint generated always as identity primary key,
  wa_id text unique,
  tienda_dominio text,
  pedido_id uuid references pedidos (id) on delete set null,
  telefono text not null,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  texto text not null default '',
  tipo text,
  creado_en timestamptz not null default now()
);

create index if not exists mensajes_whatsapp_pedido_idx on mensajes_whatsapp (pedido_id, creado_en);
create index if not exists pedidos_telefono_idx on pedidos (telefono);

alter table whatsapp_config enable row level security;
alter table mensajes_whatsapp enable row level security;
