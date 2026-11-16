// Números del panel (Fase 2, adelantado con lo que ya sabe la app).
import type { Pedido } from "./tipos";

export type Periodo = "hoy" | "semana" | "mes";

// Inicio del período en hora de Colombia (semana desde el lunes).
export function inicioPeriodo(periodo: Periodo, ahora = new Date()): Date {
  const col = new Date(ahora.getTime() - 5 * 3_600_000); // reloj de Colombia
  const y = col.getUTCFullYear();
  const m = col.getUTCMonth();
  const d = col.getUTCDate();
  let inicio = Date.UTC(y, m, d);
  if (periodo === "semana") inicio -= ((col.getUTCDay() + 6) % 7) * 86_400_000;
  if (periodo === "mes") inicio = Date.UTC(y, m, 1);
  return new Date(inicio + 5 * 3_600_000);
}

const CONFIRMADOS = new Set(["confirmado", "enviado_dropi", "novedad", "entregado", "devuelto"]);

export interface Metricas {
  recibidos: number;
  confirmados: number;
  porConfirmar: number;
  sinRespuesta: number;
  enDropi: number;
  tasaConfirmacion: number | null; // 0-100
  rescatadas: number;
  plataRescatada: number;
  // Tasas de operación (null = todavía no hay con qué calcularla)
  tasas: {
    confirmacion: number | null;
    entrega: number | null;
    novedad: number | null;
    rescate: number | null;
    realVenta: number | null;
  };
  entregados: number;
  devueltos: number;
  despachados: number;
  conNovedad: number;
}

// Rescatada por Bravo IA: confirmó después de un mensaje de seguimiento, con el descuento de rescate
// o después de que la IA le resolvió algo.
export function esRescatada(p: Pedido, conIA: Set<string>): boolean {
  if (!CONFIRMADOS.has(p.estado) && !(p.estado === "error" && p.error_dropi)) return false;
  return (p.seguimientos_enviados ?? 0) > 0 || Boolean(p.descuento_aplicado) || conIA.has(p.id ?? "");
}

export function calcularMetricas(pedidos: Pedido[], desde: Date, conIA: Set<string> = new Set(), hasta: Date | null = null): Metricas {
  // Los archivados los atendió el vendedor por fuera: no cuentan.
  const del = pedidos.filter(
    (p) => p.estado !== "archivado" && new Date(p.creado_en) >= desde && (!hasta || new Date(p.creado_en) < hasta),
  );
  const confirmados = del.filter((p) => CONFIRMADOS.has(p.estado) || (p.estado === "error" && p.error_dropi));
  const sinRespuesta = del.filter((p) => p.estado === "sin_respuesta" || p.estado === "cancelado");
  // La tasa se mide sobre los que ya se decidieron (confirmaron o no respondieron / cancelaron).
  const decididos = confirmados.length + sinRespuesta.length;
  const rescatadas = confirmados.filter((p) => esRescatada(p, conIA));
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  const entregados = del.filter((p) => p.estado === "entregado").length;
  const devueltos = del.filter((p) => p.estado === "devuelto").length;
  const despachados = del.filter((p) => ["enviado_dropi", "novedad", "entregado", "devuelto"].includes(p.estado)).length;
  const conNovedad = del.filter((p) => p.estado === "novedad").length;
  return {
    recibidos: del.length,
    confirmados: confirmados.length,
    porConfirmar: del.filter((p) => p.estado === "por_confirmar").length,
    sinRespuesta: sinRespuesta.length,
    enDropi: del.filter((p) => Boolean(p.dropi_order_id)).length,
    tasaConfirmacion: decididos ? Math.round((confirmados.length / decididos) * 100) : null,
    rescatadas: rescatadas.length,
    plataRescatada: rescatadas.reduce((s, p) => s + Number(p.total), 0),
    tasas: {
      confirmacion: decididos ? Math.round((confirmados.length / decididos) * 100) : null,
      entrega: pct(entregados, entregados + devueltos),
      novedad: pct(conNovedad, despachados),
      rescate: null, // llega cuando la app lea las novedades de Dropi
      realVenta: entregados + devueltos > 0 ? pct(entregados, del.length) : null,
    },
    entregados,
    devueltos,
    despachados,
    conNovedad,
  };
}

// Color y frase según la tasa (verde arriba de 85, amarillo hacia 70, naranja hacia 60, rojo abajo).
export function semaforo(tasa: number): { color: string; frase: string } {
  if (tasa >= 90) return { color: "#00E676", frase: "Leyenda 🔥" };
  if (tasa >= 85) return { color: "#4cd18a", frase: "Excelente" };
  if (tasa >= 70) return { color: "#f0b90b", frase: "Bien, pero ojo" };
  if (tasa >= 60) return { color: "#ff8c42", frase: "En riesgo" };
  return { color: "#ff6b5e", frase: "Hay que revisar" };
}

// El período anterior del mismo tamaño (ayer, la semana pasada, el mes pasado).
export function periodoAnterior(periodo: Periodo, ahora = new Date()): { desde: Date; hasta: Date } {
  const hasta = inicioPeriodo(periodo, ahora);
  if (periodo === "hoy") return { desde: new Date(hasta.getTime() - 86_400_000), hasta };
  if (periodo === "semana") return { desde: new Date(hasta.getTime() - 7 * 86_400_000), hasta };
  return { desde: inicioPeriodo("mes", new Date(hasta.getTime() - 86_400_000)), hasta };
}

const NOMBRE_ANTERIOR: Record<Periodo, string> = { hoy: "ayer", semana: "la semana pasada", mes: "el mes pasado" };

// "▲ 3 puntos vs la semana pasada"
export function comparacion(actual: number | null, antes: number | null, periodo: Periodo, menosEsMejor = false) {
  if (actual === null || antes === null) return null;
  const d = actual - antes;
  const cuando = NOMBRE_ANTERIOR[periodo];
  if (d === 0) return { texto: `Igual que ${cuando}`, bueno: null as boolean | null };
  const puntos = Math.abs(d) === 1 ? "1 punto" : `${Math.abs(d)} puntos`;
  return { texto: `${d > 0 ? "▲" : "▼"} ${puntos} vs ${cuando}`, bueno: menosEsMejor ? d < 0 : d > 0 };
}

// Qué hacer, en una línea, según cómo va la tasa de entrega.
export function consejoEntrega(tasa: number | null, minimo: number | null, conNovedad: number): string | null {
  if (tasa === null) return null;
  const novedades = conNovedad > 0 ? `Atiende rápido ${conNovedad === 1 ? "la novedad abierta" : `las ${conNovedad} novedades abiertas`}: cada una que salves sube tu tasa.` : "";
  if (tasa >= 90) return "¡Semana brava! 🔥 Sigue así.";
  if (tasa >= 85) return "Vas muy bien. Sigue confirmando bien los datos antes de despachar.";
  if (minimo !== null && tasa < minimo) return `${novedades || "Revisa qué ciudad o transportadora te está devolviendo más."} Mientras tanto, cada devolución te cuesta el flete.`.trim();
  if (minimo !== null && tasa - minimo <= 10) return novedades || "Revisa qué ciudad o transportadora te está devolviendo más.";
  return novedades || "Para subirla: confirma bien la dirección y atiende las novedades el mismo día.";
}

// Qué hacer, en una línea, según cómo va la confirmación.
export function consejoConfirmacion(tasa: number | null, porConfirmar: number, seguimientoPrendido: boolean): string | null {
  if (tasa === null) return porConfirmar > 0 ? `Tienes ${porConfirmar} por confirmar.` : null;
  if (tasa >= 85) return "Muy bien: casi todas tus clientas confirman.";
  if (!seguimientoPrendido) return "Prende el seguimiento a quien no responde (Piloto automático) para rescatar más pedidos.";
  return porConfirmar > 0 ? `Tienes ${porConfirmar} por confirmar: el seguimiento les va a escribir solo.` : "El seguimiento está prendido y rescatando pedidos.";
}
