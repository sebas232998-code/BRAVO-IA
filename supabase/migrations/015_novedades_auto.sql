-- Novedades atendidas solas: la app le escribe a la clienta según la novedad, le recuerda si no responde
-- y guarda su respuesta (y la solución que entendió la IA) para que el vendedor la aplique en Dropi.
alter table novedades_gestion add column if not exists tienda_dominio text;
alter table novedades_gestion add column if not exists telefono text;
alter table novedades_gestion add column if not exists primer_nombre text;
alter table novedades_gestion add column if not exists producto text;
alter table novedades_gestion add column if not exists novedad text;
alter table novedades_gestion add column if not exists mensaje_enviado_en timestamptz;
alter table novedades_gestion add column if not exists recordatorio_en timestamptz;
alter table novedades_gestion add column if not exists respuesta_en timestamptz;
alter table novedades_gestion add column if not exists respuesta text;
alter table novedades_gestion add column if not exists solucion text;
alter table novedades_gestion add column if not exists error text;
-- "escrito_en" ahora es solo cuando el vendedor marca "Ya le escribí" a mano.
alter table novedades_gestion alter column escrito_en drop not null;
alter table novedades_gestion alter column escrito_en drop default;
create index if not exists novedades_gestion_tel_idx on novedades_gestion (tienda_dominio, telefono);

-- Interruptor por tienda (viene apagado).
alter table tiendas add column if not exists auto_novedades boolean not null default false;

-- Mensajes de WhatsApp que son de una novedad (pedidos que no están en la app).
alter table mensajes_whatsapp add column if not exists dropi_id bigint;
