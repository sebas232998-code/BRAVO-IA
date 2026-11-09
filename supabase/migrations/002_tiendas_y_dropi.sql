-- Fase 1, paso 2: nombres de las tiendas y subida de pedidos a Dropi.
-- Se pega una sola vez en Supabase → SQL Editor → Run.

-- Nombre bonito de cada tienda (en vez del código interno de Shopify).
create table if not exists tiendas (
  dominio text primary key,
  nombre text not null
);

insert into tiendas (dominio, nombre)
values ('7hvike-y1.myshopify.com', 'PETION')
on conflict (dominio) do update set nombre = excluded.nombre;

-- Qué producto de Dropi corresponde a cada producto/variante de Shopify.
-- Se llena una sola vez por producto desde la app; después la app lo recuerda.
create table if not exists vinculos_dropi (
  tienda_dominio text not null,
  shopify_variant_id bigint not null,
  dropi_product_id bigint not null,
  dropi_variation_id bigint,
  creado_en timestamptz not null default now(),
  primary key (tienda_dominio, shopify_variant_id)
);

alter table pedidos add column if not exists dropi_order_id text;
alter table pedidos add column if not exists error_dropi text;
alter table pedidos add column if not exists subiendo_desde timestamptz;

alter table tiendas enable row level security;
alter table vinculos_dropi enable row level security;
