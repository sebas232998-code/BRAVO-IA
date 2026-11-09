# Bravo IA

App creada por dropshippers, para dropshippers: confirma pedidos por WhatsApp, rescata ventas y conecta con Dropi.

## Qué hace hoy (Fase 1, paso 1)

- Recibe los pedidos nuevos de Shopify (webhook `orders/create`) y los guarda en Supabase.
- Corrige el teléfono a formato WhatsApp (57 + 10 dígitos) o lo marca como error.
- Muestra los pedidos con su estado y el mensaje de confirmación listo.
- Se protege con contraseña y se puede instalar en el celular.

## Configuración

1. Supabase: pegar `supabase/migrations/001_pedidos.sql` en el SQL Editor y darle Run.
2. Vercel: importar este repositorio y poner las variables de `.env.example`.
3. Shopify: crear el webhook "Creación de pedido" apuntando a `https://TU-APP.vercel.app/api/webhooks/shopify`.
