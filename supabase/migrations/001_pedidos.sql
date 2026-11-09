-- Fase 1, paso 1: guardar los pedidos que llegan de Shopify.
-- Se pega una sola vez en Supabase → SQL Editor → Run.

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  tienda_dominio text not null,
  shopify_order_id bigint not null,
  numero text not null,
  nombre_clienta text not null,
  telefono text,
  telefono_original text,
  departamento text,
  ciudad text,
  direccion text,
  notas text,
  total numeric not null,
  moneda text not null default 'COP',
  estado text not null default 'por_confirmar',
  items jsonb not null default '[]',
  creado_en timestamptz not null,
  recibido_en timestamptz not null default now(),
  unique (tienda_dominio, shopify_order_id)
);

create index if not exists pedidos_estado_idx on pedidos (estado, creado_en desc);

-- Historial de cada pedido (llegó, se envió mensaje, confirmó, subió a Dropi...).
create table if not exists eventos_pedido (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references pedidos (id) on delete cascade,
  tipo text not null,
  detalle jsonb,
  creado_en timestamptz not null default now()
);

-- Nadie entra a estas tablas desde el navegador: solo el servidor de la app con su clave secreta.
alter table pedidos enable row level security;
alter table eventos_pedido enable row level security;
