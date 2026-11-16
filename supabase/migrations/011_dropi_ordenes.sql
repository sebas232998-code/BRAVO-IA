-- Fase 2: estados de los pedidos en Dropi (para la tasa de entrega, novedades y "dónde se pierden").
-- La app los trae sola de la API de Dropi cada 30 minutos. NO guarda datos personales de las clientas
-- (ni nombre, ni teléfono, ni dirección): solo lo necesario para las tasas.
create table if not exists dropi_ordenes (
  id bigint primary key,            -- número del pedido en Dropi
  tienda text,                      -- nombre de la tienda en Dropi (PETION, ruumbo...)
  estado text not null,             -- ENTREGADO, DEVOLUCION, EN TRANSITO...
  novedad text,                     -- novedad de la transportadora, si tiene
  ciudad text,
  departamento text,
  transportadora text,
  producto text,
  dropi_product_id bigint,
  total numeric,
  flete numeric,
  costo_producto numeric,           -- lo que cobra el proveedor (precio × unidades)
  shop_order_id text,
  creado_en timestamptz not null,
  actualizado_en timestamptz,
  sincronizado_en timestamptz not null default now()
);
create index if not exists dropi_ordenes_fecha_idx on dropi_ordenes (creado_en desc);
alter table dropi_ordenes enable row level security;
