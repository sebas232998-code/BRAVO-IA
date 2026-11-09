import Link from "next/link";
import { headers } from "next/headers";
import { baseConfigurada, configsWhatsApp, listarTiendas } from "@/lib/db";
import { BOTON_CONFIRMAR, BOTON_CORREGIR, NOMBRE_PLANTILLA, TEXTO_PLANTILLA } from "@/lib/whatsapp";
import { crearPlantilla, guardarWhatsApp, probarWhatsApp } from "./acciones";

export const dynamic = "force-dynamic";

const oculto = (s: string | null | undefined) => (s ? `••••••${s.slice(-4)}` : "");

export default async function ConfigWhatsApp({
  searchParams,
}: {
  searchParams: Promise<{ tienda?: string; ok?: string; error?: string }>;
}) {
  const q = await searchParams;
  if (!baseConfigurada()) {
    return (
      <main>
        <h1>WhatsApp</h1>
        <div className="aviso">Primero hay que conectar la base de datos.</div>
      </main>
    );
  }

  const tiendas = await listarTiendas();
  const configs = await configsWhatsApp();
  const tienda = q.tienda ?? tiendas[0]?.dominio ?? "";
  const c = configs.find((x) => x.tienda_dominio === tienda);
  const h = await headers();
  const urlAviso = `https://${h.get("host") ?? "bravo-ia.vercel.app"}/api/webhooks/whatsapp`;

  return (
    <main>
      <p><Link href="/" className="volver">← Pedidos</Link></p>
      <h1>
        WhatsApp <span>·</span> configuración
      </h1>
      <p className="subtitulo">Conecta el número de WhatsApp de cada tienda.</p>

      {q.ok && <div className="listo caja">{q.ok}</div>}
      {q.error && <div className="problema caja">{q.error}</div>}

      {tiendas.length > 1 && (
        <div className="filtros">
          {tiendas.map((t) => (
            <Link key={t.dominio} href={`/whatsapp?tienda=${encodeURIComponent(t.dominio)}`} className="filtro">
              {t.dominio === tienda ? <b>{t.nombre}</b> : t.nombre}
              {configs.some((x) => x.tienda_dominio === t.dominio) ? " ✓" : ""}
            </Link>
          ))}
        </div>
      )}

      <section className="pedido">
        <div className="pedido-nombre">1. Datos de Meta {tiendas.find((t) => t.dominio === tienda)?.nombre ?? ""}</div>
        <form action={guardarWhatsApp} className="editar">
          <input type="hidden" name="tienda" value={tienda} />
          <label>
            Identificador del número de teléfono (Phone number ID)
            <input name="phone_number_id" inputMode="numeric" defaultValue={c?.phone_number_id ?? ""} required />
          </label>
          <label>
            Identificador de la cuenta de WhatsApp Business (WhatsApp Business Account ID)
            <input name="waba_id" inputMode="numeric" defaultValue={c?.waba_id ?? ""} />
          </label>
          <label>
            Token de acceso {c && <em>(guardado: {oculto(c.access_token)} · déjalo vacío para no cambiarlo)</em>}
            <input name="access_token" type="password" autoComplete="off" required={!c} />
          </label>
          <label>
            Clave secreta de la app (App secret) {c?.app_secret && <em>(guardada: {oculto(c.app_secret)})</em>}
            <input name="app_secret" type="password" autoComplete="off" />
          </label>
          <label>
            Nombre de la plantilla de confirmación
            <input name="plantilla" defaultValue={c?.plantilla_confirmacion ?? NOMBRE_PLANTILLA} />
          </label>
          <button type="submit" className="principal">Guardar</button>
        </form>
      </section>

      {c && (
        <>
          <section className="pedido">
            <div className="pedido-nombre">2. Mensaje de prueba</div>
            <p className="pedido-meta">Te manda un “Hello World” al celular que pongas.</p>
            <form action={probarWhatsApp} className="editar">
              <input type="hidden" name="tienda" value={tienda} />
              <input name="numero" inputMode="tel" placeholder="Tu celular, ej. 3001234567" required />
              <button type="submit">Enviar mensaje de prueba</button>
            </form>
          </section>

          <section className="pedido">
            <div className="pedido-nombre">3. Recibir mensajes (webhook)</div>
            <p className="pedido-meta">Pega estos dos datos en Meta → WhatsApp → Configuración → Webhook.</p>
            <label className="dato">URL de devolución de llamada<code>{urlAviso}</code></label>
            <label className="dato">Token de verificación<code>{c.verify_token}</code></label>
          </section>

          <section className="pedido">
            <div className="pedido-nombre">4. Plantilla de confirmación</div>
            <p className="pedido-meta">
              Una sola plantilla sirve para todos los productos. Se crea con un toque y Meta la revisa.
            </p>
            <pre className="mensaje">{TEXTO_PLANTILLA}</pre>
            <p className="pedido-meta">Botones: [{BOTON_CONFIRMAR}] [{BOTON_CORREGIR}]</p>
            <form action={crearPlantilla}>
              <input type="hidden" name="tienda" value={tienda} />
              <button type="submit">Crear plantilla en Meta</button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
