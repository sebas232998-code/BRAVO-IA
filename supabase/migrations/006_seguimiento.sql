-- Fase 1, paso 5: seguimiento a quien no responde (3 mensajes) y descuento de rescate.
-- Se pega una sola vez en Supabase → SQL Editor → Run.

-- Configuración por tienda (viene apagado; se prende desde "Piloto automático").
alter table tiendas add column if not exists auto_seguimiento boolean not null default false;
alter table tiendas add column if not exists seguimiento_desde timestamptz;
-- Horas sin respuesta (contadas desde que salió la confirmación) para cada uno de los 3 mensajes.
alter table tiendas add column if not exists seguimiento_horas integer[] not null default '{2,24,48}';
alter table tiendas add column if not exists descuento_activo boolean not null default true;
alter table tiendas add column if not exists descuento_porcentaje numeric not null default 10;
alter table tiendas add column if not exists descuento_horas integer not null default 24;

-- Estado del seguimiento de cada pedido.
alter table pedidos add column if not exists seguimientos_enviados integer not null default 0;
alter table pedidos add column if not exists ultimo_seguimiento_en timestamptz;
-- Cuándo escribió la clienta por última vez (si responde, el seguimiento se detiene).
alter table pedidos add column if not exists ultima_respuesta_en timestamptz;
-- Descuento de rescate ofrecido en el mensaje 3.
alter table pedidos add column if not exists descuento_valor numeric;
alter table pedidos add column if not exists descuento_vence_en timestamptz;
alter table pedidos add column if not exists descuento_aplicado boolean not null default false;
alter table pedidos add column if not exists descuento_vencido_avisado boolean not null default false;
-- Total antes del descuento (el total queda rebajado si confirma a tiempo).
alter table pedidos add column if not exists total_original numeric;

-- Los pedidos donde la clienta ya escribió no entran al seguimiento.
update pedidos p
set ultima_respuesta_en = m.ultima
from (
  select pedido_id, max(creado_en) as ultima
  from mensajes_whatsapp
  where direccion = 'entrante' and pedido_id is not null
  group by pedido_id
) m
where m.pedido_id = p.id and p.ultima_respuesta_en is null;
