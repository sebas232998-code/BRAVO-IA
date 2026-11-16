// Leyendas: semanas (lunes a domingo, hora de Colombia) cerradas con tasa de entrega de 90 % o más.
import { etapa, type OrdenDropiLeida } from "./dropi-estados";

export const TASA_LEYENDA = 90;
export const MINIMO_TERMINADOS = 5; // con menos pedidos no cuenta (sería suerte)

const DIA = 86_400_000;

// Lunes 00:00 (Colombia) de la semana de la fecha, en milisegundos.
export function inicioSemana(fecha: Date): number {
  const col = new Date(fecha.getTime() - 5 * 3_600_000);
  const dia = Date.UTC(col.getUTCFullYear(), col.getUTCMonth(), col.getUTCDate());
  return dia - ((col.getUTCDay() + 6) % 7) * DIA + 5 * 3_600_000;
}

export interface Semana {
  inicio: number;
  entregados: number;
  devueltos: number;
  tasa: number | null;
  leyenda: boolean;
}

// Semanas ya cerradas (la actual no cuenta todavía).
export function semanas(ordenes: OrdenDropiLeida[], ahora = new Date()): Semana[] {
  const actual = inicioSemana(ahora);
  const grupos = new Map<number, { entregados: number; devueltos: number }>();
  for (const o of ordenes) {
    if (o.es_prueba) continue;
    const e = etapa(o.estado);
    if (e !== "entregado" && e !== "devuelto") continue;
    const s = inicioSemana(new Date(o.creado_en));
    if (s >= actual) continue;
    const g = grupos.get(s) ?? { entregados: 0, devueltos: 0 };
    if (e === "entregado") g.entregados++;
    else g.devueltos++;
    grupos.set(s, g);
  }
  return [...grupos.entries()]
    .map(([inicio, g]) => {
      const terminados = g.entregados + g.devueltos;
      const tasa = terminados ? Math.round((g.entregados / terminados) * 100) : null;
      return { inicio, ...g, tasa, leyenda: terminados >= MINIMO_TERMINADOS && tasa !== null && tasa >= TASA_LEYENDA };
    })
    .sort((a, b) => b.inicio - a.inicio);
}

export function contarLeyendas(lista: Semana[], ahora = new Date()) {
  const col = new Date(ahora.getTime() - 5 * 3_600_000);
  const inicioMes = Date.UTC(col.getUTCFullYear(), col.getUTCMonth(), 1) + 5 * 3_600_000;
  const leyendas = lista.filter((s) => s.leyenda);
  return {
    esteMes: leyendas.filter((s) => s.inicio >= inicioMes).length,
    total: leyendas.length,
    ultimaSemana: lista[0] && lista[0].inicio === inicioSemana(ahora) - 7 * DIA ? lista[0] : null,
  };
}
