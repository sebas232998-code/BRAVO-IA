-- Reloj de tareas del piloto automático: cada minuto Supabase llama a la app (/api/tareas).
-- Se pega una sola vez en Supabase → SQL Editor → Run, DESPUÉS de cambiar las dos cosas marcadas:
--   1. PEGA-AQUI-TU-CLAVE  → el mismo valor de CRON_SECRET que pusiste en Vercel.
--   2. TU-APP.vercel.app   → la dirección de tu app.
-- La clave queda guardada en la caja fuerte de Supabase (Vault), no en este archivo.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('PEGA-AQUI-TU-CLAVE', 'bravo_cron_secret');

select cron.schedule(
  'bravo-ia-tareas',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://TU-APP.vercel.app/api/tareas',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'bravo_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);

-- Para apagarlo:  select cron.unschedule('bravo-ia-tareas');
