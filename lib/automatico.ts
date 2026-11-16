// Reglas del piloto automático (sin base de datos, para poder probarlas).

// Espera después de que la clienta confirma, antes de subir a Dropi (por si corrige algo).
export const ESPERA_DROPI_MS = 5 * 60_000;

// Espera después de que entra el pedido, antes de mandar la confirmación (que no parezca un robot).
export const ESPERA_CONFIRMACION_MS = 60_000;

// Horario en que se les escribe a las clientas (hora de Colombia). Fuera de él, el mensaje espera.
export const HORA_INICIO = 7;
export const HORA_FIN = 21; // hasta las 8:59 p. m.

// Hora de Colombia (UTC−5 todo el año, sin horario de verano).
export function horaColombia(fecha: Date): number {
  return (fecha.getUTCHours() + 24 - 5) % 24;
}

export function enHorarioDeMensajes(fecha: Date): boolean {
  const h = horaColombia(fecha);
  return h >= HORA_INICIO && h < HORA_FIN;
}

// ¿Ya se le puede mandar la confirmación a este pedido?
export function tocaEnviarConfirmacion(
  p: { estado: string; telefono: string | null; confirmacion_enviada_en?: string | null; recibido_en?: string },
  autoDesde: string | null,
  ahora: Date,
): boolean {
  if (p.estado !== "por_confirmar" || !p.telefono || p.confirmacion_enviada_en || !p.recibido_en) return false;
  const recibido = new Date(p.recibido_en).getTime();
  if (autoDesde && recibido < new Date(autoDesde).getTime()) return false; // pedido de antes de prender el piloto
  if (ahora.getTime() - recibido < ESPERA_CONFIRMACION_MS) return false;
  return enHorarioDeMensajes(ahora);
}

// ¿Ya pasaron los 5 minutos y nada detuvo la subida?
export function tocaSubirADropi(
  p: { estado: string; dropi_order_id?: string | null; dropi_en_pausa?: string | null; confirmado_en?: string | null },
  ahora: Date,
): boolean {
  if (p.estado !== "confirmado" || p.dropi_order_id || p.dropi_en_pausa || !p.confirmado_en) return false;
  return ahora.getTime() - new Date(p.confirmado_en).getTime() >= ESPERA_DROPI_MS;
}

// Texto corto para el panel: "Sube a Dropi en 3 min".
export function minutosParaSubir(confirmadoEn: string, ahora: Date): number {
  const faltan = ESPERA_DROPI_MS - (ahora.getTime() - new Date(confirmadoEn).getTime());
  return Math.max(0, Math.ceil(faltan / 60_000));
}
