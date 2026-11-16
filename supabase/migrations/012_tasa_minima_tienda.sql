-- La tasa mínima de efectividad para no perder dinero, por tienda (la escribe el vendedor en el panel).
-- tienda = nombre de la tienda en Dropi en MAYÚSCULAS, o 'TODAS'.
create table if not exists tasas_minimas (
  tienda text primary key,
  tasa numeric not null,
  actualizado_en timestamptz not null default now()
);
alter table tasas_minimas enable row level security;
