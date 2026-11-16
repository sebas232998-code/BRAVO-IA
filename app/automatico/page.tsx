import Link from "next/link";
import { baseConfigurada, configsWhatsApp, tiendasConInterruptores, ultimoLatido } from "@/lib/db";
import { HORA_FIN, HORA_INICIO } from "@/lib/automatico";
import { guardarAutomatico } from "./acciones";

export const dynamic = "force-dynamic";

function haceCuanto(fecha: string): string {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60_000);
  if (min < 1) return "hace menos de un minuto";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.round(min / 60);
  return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
}

const hora12 = (h: number) => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "p. m." : "a. m."}`;

export default async function PilotoAutomatico({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const q = await searchParams;
  if (!baseConfigurada()) {
    return (
      <main>
        <h1>Piloto automático</h1>
        <div className="aviso">Primero hay que conectar la base de datos.</div>
      </main>
    );
  }

  const tiendas = await tiendasConInterruptores();
  const conWhatsApp = new Set((await configsWhatsApp()).map((c) => c.tienda_dominio));
  const latido = await ultimoLatido("tareas");
  const relojAndando = latido && Date.now() - new Date(latido.ultima_vez).getTime() < 3 * 60_000;
  const algunoPrendido = tiendas.some((t) => t.auto_confirmacion || t.auto_dropi || t.auto_seguimiento);

  return (
    <main>
      <p><Link href="/" className="volver">← Pedidos</Link></p>
      <h1>
        Piloto <span>automático</span>
      </h1>
      <p className="subtitulo">La app confirma y sube los pedidos sola, sin que tengas que tocar nada.</p>

      {q.ok && <div className="listo caja">{q.ok}</div>}
      {q.error && <div className="problema caja">{q.error}</div>}

      {relojAndando ? (
        <div className="listo caja">✓ El reloj de tareas está funcionando (revisó {haceCuanto(latido.ultima_vez)}).</div>
      ) : (
        <div className={algunoPrendido ? "problema caja" : "aviso"}>
          {latido
            ? `El reloj de tareas no corre desde ${haceCuanto(latido.ultima_vez)}. Mientras no corra, nada se hace solo.`
            : "El reloj de tareas todavía no está conectado. Mientras no lo esté, nada se hace solo: usa los botones de cada pedido."}
        </div>
      )}

      {tiendas.length === 0 && (
        <div className="aviso">Falta correr el paso 4 de la base de datos (supabase/migrations/004_automatico.sql).</div>
      )}

      {tiendas.map((t) => (
        <section key={t.dominio} className="pedido">
          <div className="pedido-nombre">{t.nombre}</div>
          <form action={guardarAutomatico}>
            <input type="hidden" name="tienda" value={t.dominio} />
            <label className="interruptor">
              <input type="checkbox" name="auto_confirmacion" defaultChecked={t.auto_confirmacion} disabled={!conWhatsApp.has(t.dominio)} />
              <div>
                <b>Enviar la confirmación por WhatsApp sola</b>
                <span>
                  {conWhatsApp.has(t.dominio)
                    ? `Un minuto después de que entra el pedido. Solo los pedidos que entren desde que lo prendas. De ${hora12(HORA_INICIO)} a ${hora12(HORA_FIN)}; los de la noche salen a las ${hora12(HORA_INICIO)}.`
                    : "Primero conecta el WhatsApp de esta tienda."}
                </span>
              </div>
            </label>
            <label className="interruptor">
              <input type="checkbox" name="auto_dropi" defaultChecked={t.auto_dropi} />
              <div>
                <b>Subir a Dropi sola</b>
                <span>5 minutos después de que la clienta confirma, por si quiere corregir algo.</span>
              </div>
            </label>
            <label className="interruptor">
              <input type="checkbox" name="auto_seguimiento" defaultChecked={t.auto_seguimiento} disabled={!conWhatsApp.has(t.dominio)} />
              <div>
                <b>Seguimiento a quien no responde</b>
                <span>
                  Hasta 3 mensajes si la clienta no contesta la confirmación. Si responde cualquier cosa, se detiene. Si no
                  responde al tercero, el pedido queda “Sin respuesta” y no se le vuelve a escribir.
                </span>
              </div>
            </label>
            <div className="ajustes">
              <span>Enviar los mensajes a las</span>
              <input name="horas_1" inputMode="numeric" defaultValue={t.seguimiento_horas?.[0] ?? 2} aria-label="Horas mensaje 1" />
              <input name="horas_2" inputMode="numeric" defaultValue={t.seguimiento_horas?.[1] ?? 24} aria-label="Horas mensaje 2" />
              <input name="horas_3" inputMode="numeric" defaultValue={t.seguimiento_horas?.[2] ?? 48} aria-label="Horas mensaje 3" />
              <span>horas sin respuesta.</span>
            </div>
            <label className="interruptor">
              <input type="checkbox" name="descuento_activo" defaultChecked={t.descuento_activo ?? true} />
              <div>
                <b>Descuento de rescate en el tercer mensaje</b>
                <span>Muestra el precio normal, el precio con descuento y cuánto se ahorra. Si confirma a tiempo, sube a Dropi con el valor rebajado.</span>
              </div>
            </label>
            <div className="ajustes">
              <input name="descuento_porcentaje" inputMode="numeric" defaultValue={t.descuento_porcentaje ?? 10} aria-label="Porcentaje" />
              <span>% de descuento, válido por</span>
              <input name="descuento_horas" inputMode="numeric" defaultValue={t.descuento_horas ?? 24} aria-label="Horas de vigencia" />
              <span>horas.</span>
            </div>
            <button type="submit" className="principal">Guardar</button>
          </form>
        </section>
      ))}

      <section className="pedido">
        <div className="pedido-nombre">Cómo funciona</div>
        <ul className="reglas">
          <li>El pedido nunca llega a Dropi hasta que la clienta confirme.</li>
          <li>Si después de confirmar la clienta vuelve a escribir (“no, espera, cambien la dirección”), la subida se detiene y te sale un aviso en el pedido. Un “gracias” o un sticker no la detienen.</li>
          <li>Si corriges los datos de un pedido confirmado, los 5 minutos arrancan de nuevo.</li>
          <li>El seguimiento solo sale de {hora12(HORA_INICIO)} a {hora12(HORA_FIN)}. Necesita las plantillas de seguimiento aprobadas por Meta (se crean en “Configurar WhatsApp”).</li>
          <li>Si la clienta confirma después de que venció el descuento, se le avisa con amabilidad y se le ofrece el precio normal.</li>
          <li>Si Dropi devuelve un error, el pedido queda “Con error” y no se reintenta solo: lo corriges y tocas “Reintentar”.</li>
        </ul>
      </section>
    </main>
  );
}
