// Novedades atendidas solas (reloj de tareas): le escribe a la clienta según la novedad y le recuerda si no responde.
import { enHorarioDeMensajes } from "./automatico";
import { apartarNovedad, configWhatsAppDe, gestionesNovedad, guardarGestionNovedad, ordenesDropiDesde } from "./db";
import { etapa, tieneNovedad } from "./dropi-estados";
import {
  explicacionNovedad,
  mensajeNovedad,
  mensajeRecordatorioNovedad,
  novedadesAbiertas,
  type Novedad,
} from "./novedades";
import type { Tienda } from "./tipos";
import { enviarYGuardar } from "./wa-servidor";
import { mensajePlantilla } from "./whatsapp";

export const HORAS_RECORDATORIO = 12; // si no responde en 12 horas, se le recuerda (una sola vez)
const MAX_POR_VUELTA = 10;

const saludo = (n: { primerNombre?: string | null }) => n.primerNombre || "buen día";
const producto = (n: { producto?: string | null }) => n.producto || "tu compra";

// ¿Qué le toca a esta novedad? (sin base de datos, para poder probarlo)
export function pasoNovedad(
  g: { mensaje_enviado_en: string | null; recordatorio_en: string | null; respuesta_en: string | null; escrito_en: string | null } | undefined,
  ahora: Date,
): "primer_mensaje" | "recordatorio" | null {
  if (!g) return "primer_mensaje";
  if (g.respuesta_en) return null; // ya respondió: lo atiende la IA o el vendedor
  if (!g.mensaje_enviado_en) return g.escrito_en ? null : "primer_mensaje"; // si el vendedor ya le escribió a mano, no se repite
  if (g.recordatorio_en) return null;
  return ahora.getTime() - new Date(g.mensaje_enviado_en).getTime() >= HORAS_RECORDATORIO * 3_600_000 ? "recordatorio" : null;
}

export async function atenderNovedades(tiendas: Tienda[], ahora = new Date()) {
  const resumen = { novedades_escritas: 0, recordatorios: 0, errores_novedad: 0 };
  const activas = tiendas.filter((t) => t.auto_novedades);
  if (activas.length === 0 || !enHorarioDeMensajes(ahora)) return resumen;

  const ordenes = (await ordenesDropiDesde(new Date(ahora.getTime() - 30 * 86_400_000))).filter(
    (o) => !o.es_prueba && etapa(o.estado) === "en_camino" && tieneNovedad(o),
  );
  const gestiones = await gestionesNovedad();
  let contactos: Map<number, Novedad> | null = null; // se piden a Dropi solo si hace falta

  for (const t of activas) {
    const c = await configWhatsAppDe(t.dominio);
    if (!c) continue;
    const deLaTienda = ordenes.filter((o) => (o.tienda ?? "") === t.nombre.toUpperCase());
    const tareas = deLaTienda
      .map((o) => ({ o, paso: pasoNovedad(gestiones[o.id], ahora) }))
      .filter((x) => x.paso)
      .slice(0, MAX_POR_VUELTA);
    if (tareas.length === 0) continue;

    if (!contactos) {
      const { novedades } = await novedadesAbiertas();
      contactos = new Map(novedades.map((n) => [n.id, n]));
    }

    for (const { o, paso } of tareas) {
      const n = contactos.get(o.id);
      if (paso === "primer_mensaje") {
        if (!n?.telefono) {
          await guardarGestionNovedad(o.id, { tienda_dominio: t.dominio, novedad: o.novedad ?? o.estado, error: "El número no es válido en Dropi." });
          resumen.errores_novedad++;
          continue;
        }
        const datos = {
          tienda_dominio: t.dominio,
          telefono: n.telefono,
          primer_nombre: n.primerNombre || null,
          producto: n.producto,
          novedad: n.novedad ?? n.estado,
          mensaje_enviado_en: new Date().toISOString(),
        };
        if (!(await apartarNovedad(o.id, datos))) {
          // ya existía (por ejemplo, marcada a mano): solo se completa si no se le había escrito
          if (gestiones[o.id]?.escrito_en) continue;
          await guardarGestionNovedad(o.id, datos);
        }
        const valores = [saludo(n), producto(n), explicacionNovedad(n)];
        const r = await enviarYGuardar(c, n.telefono, mensajePlantilla(n.telefono, "novedad_entrega", c.idioma_plantilla, valores), mensajeNovedad(n), null, o.id);
        if (r.ok) resumen.novedades_escritas++;
        else {
          await guardarGestionNovedad(o.id, { error: r.mensaje });
          resumen.errores_novedad++;
        }
      } else if (paso === "recordatorio") {
        const g = gestiones[o.id]!;
        if (!g.telefono) continue;
        await guardarGestionNovedad(o.id, { recordatorio_en: new Date().toISOString() });
        const datos = { primerNombre: g.primer_nombre, producto: g.producto };
        const valores = [saludo(datos), producto(datos)];
        const r = await enviarYGuardar(
          c, g.telefono, mensajePlantilla(g.telefono, "novedad_recordatorio", c.idioma_plantilla, valores),
          mensajeRecordatorioNovedad({ primerNombre: g.primer_nombre ?? "", producto: g.producto }), null, o.id,
        );
        if (r.ok) resumen.recordatorios++;
        else {
          await guardarGestionNovedad(o.id, { error: r.mensaje });
          resumen.errores_novedad++;
        }
      }
    }
  }
  return resumen;
}
