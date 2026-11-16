-- Fase 2 (adelantada): cerebro de la tienda.
-- Lo que la IA puede responderle a la clienta (producto, medidas, envíos, garantía, cambios...).
-- Se escribe desde la pantalla "Cerebro de la tienda". Se pega una sola vez en Supabase → SQL Editor → Run.
alter table tiendas add column if not exists cerebro text;
