-- Fase 1, paso 4: piloto automático.
-- La app envía sola la confirmación por WhatsApp y sube sola a Dropi 5 minutos después de que la clienta confirma.
-- Se pega una sola vez en Supabase → SQL Editor → Run.

-- Interruptores por tienda (vienen apagados; se prenden desde la pantalla "Piloto automático").
alter table tiendas add column if not exists auto_confirmacion boolean not null default false;
alter table tiendas add column if not exists auto_dropi boolean not null default false;
-- Desde cuándo está prendido el envío automático: los pedidos viejos no se tocan.
alter table tiendas add column if not exists auto_desde timestamptz;

alter table pedidos add column if not exists confirmacion_enviada_en timestamptz;
alter table pedidos add column if not exists confirmado_en timestamptz;
alter table pedidos add column if not exists error_whatsapp text;
-- Si tiene texto, la subida automática a Dropi queda detenida hasta que el vendedor lo revise.
alter table pedidos add column if not exists dropi_en_pausa text;

-- Los pedidos a los que ya se les mandó la confirmación a mano no se vuelven a mandar.
update pedidos p
set confirmacion_enviada_en = e.primera
from (
  select pedido_id, min(creado_en) as primera
  from eventos_pedido
  where tipo = 'confirmacion_enviada'
  group by pedido_id
) e
where e.pedido_id = p.id and p.confirmacion_enviada_en is null;

create index if not exists pedidos_auto_idx on pedidos (tienda_dominio, estado, recibido_en);

-- Cuándo corrió por última vez el reloj de tareas (para mostrar en la app que está funcionando).
create table if not exists latidos (
  nombre text primary key,
  ultima_vez timestamptz not null default now(),
  detalle jsonb
);
alter table latidos enable row level security;
