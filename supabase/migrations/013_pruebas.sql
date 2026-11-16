-- Pedidos de prueba del vendedor: no cuentan en el panel.
-- La app los marca al leer Dropi (sin guardar el nombre de nadie).
alter table dropi_ordenes add column if not exists es_prueba boolean not null default false;

-- Ajustes generales. nombres_prueba: nombres separados por coma que siempre son pedidos de prueba.
create table if not exists ajustes (
  clave text primary key,
  valor text not null
);
alter table ajustes enable row level security;
