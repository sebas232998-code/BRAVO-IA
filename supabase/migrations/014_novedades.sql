-- Bandeja de novedades: a qué pedidos ya les escribió el vendedor (solo el número del pedido en Dropi).
create table if not exists novedades_gestion (
  dropi_id bigint primary key,
  escrito_en timestamptz not null default now()
);
alter table novedades_gestion enable row level security;
