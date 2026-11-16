-- Fase 1, paso 7: la IA atiende los mensajes de las clientas y cambia el pedido.
-- Se pega una sola vez en Supabase → SQL Editor → Run.

-- Interruptor por tienda (viene apagado; se prende desde "Piloto automático").
alter table tiendas add column if not exists ia_activa boolean not null default false;

-- Variantes de cada producto (tamaño, color) con su precio, para que la IA sepa qué existe.
-- Se llena con los avisos de Shopify de productos y con lo que traen los pedidos.
create table if not exists catalogo_variantes (
  tienda_dominio text not null,
  shopify_variant_id bigint not null,
  shopify_product_id bigint not null,
  producto text not null,
  variante text,
  precio numeric not null,
  disponible boolean not null default true,
  actualizado_en timestamptz not null default now(),
  primary key (tienda_dominio, shopify_variant_id)
);
create index if not exists catalogo_producto_idx on catalogo_variantes (tienda_dominio, shopify_product_id);
alter table catalogo_variantes enable row level security;

-- Después de que la IA actualiza el pedido, el mensaje de "pedido confirmado" sale cuando la clienta
-- responde (por ejemplo "ok, gracias") o a esta hora si no dice nada.
alter table pedidos add column if not exists aviso_confirmado_en timestamptz;
-- Algo que la IA no pudo resolver y le dejó al vendedor.
alter table pedidos add column if not exists atencion_vendedor text;
