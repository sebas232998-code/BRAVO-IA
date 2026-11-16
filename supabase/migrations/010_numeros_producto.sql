-- Fase 2 (adelantada): números de cada producto para el punto de equilibrio de la tasa de entrega.
-- Se pega una sola vez en Supabase → SQL Editor → Run.
create table if not exists productos_numeros (
  tienda_dominio text not null,
  shopify_product_id bigint not null,
  costo numeric,        -- lo que cobra el proveedor en Dropi
  flete numeric,        -- flete de ida
  cpa numeric,          -- costo por venta en publicidad (si se conoce)
  tasa_minima numeric,  -- la que escribe el vendedor; vacía = la calcula la app
  actualizado_en timestamptz not null default now(),
  primary key (tienda_dominio, shopify_product_id)
);
alter table productos_numeros enable row level security;
