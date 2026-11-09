# Bravo IA — instrucciones para Claude

- La especificación completa está en `especificacion.md`. Léela antes de construir algo nuevo.
- El dueño es Sebastián: no programa. Explícale todo en español sencillo, paso a paso, diciendo exactamente dónde hacer clic y qué pegar.
- Se construye por fases. Ahora mismo: **Fase 1** (confirmar pedidos y subirlos a Dropi).
- Stack: Next.js (PWA), Supabase, Vercel, API de Anthropic, WhatsApp Business API.
- Nunca guardar tokens ni claves en el código ni en el repositorio: van en variables de entorno (`.env.local`, que está en `.gitignore`, y en Vercel).
- Textos para clientas: seguir las reglas de tono de la especificación (sin 🙏 ni 😊, nunca culpar a la clienta, cada dato de la confirmación en su renglón).
