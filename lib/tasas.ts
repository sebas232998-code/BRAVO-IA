// Semáforo de las tasas (ver especificacion.md → "Tasa de entrega con semáforo" y "Tasas de operación").

export interface NumerosProducto {
  precio: number; // precio de venta
  costo: number | null; // lo que cobra el proveedor en Dropi
  flete: number | null; // flete de ida (en Dropi la devolución no cobra el regreso)
  cpa: number | null; // costo por venta en publicidad
  tasa_minima: number | null; // la que escribe el vendedor (si la escribe)
}

// Punto de equilibrio: tasa mínima de entrega = (flete + CPA) ÷ (precio − costo).
// Sin CPA se calcula solo con el flete (y la app no habla de "perder plata").
export function tasaMinimaCalculada(n: NumerosProducto): number | null {
  if (n.costo === null || n.flete === null) return null;
  const ganancia = n.precio - n.costo;
  if (ganancia <= 0) return 100;
  const t = ((n.flete + (n.cpa ?? 0)) / ganancia) * 100;
  return Math.min(100, Math.max(0, Math.round(t)));
}

export function tasaMinima(n: NumerosProducto): { valor: number | null; propia: boolean } {
  if (n.tasa_minima !== null && n.tasa_minima !== undefined) return { valor: n.tasa_minima, propia: true };
  return { valor: tasaMinimaCalculada(n), propia: false };
}

// Color que cambia de a poquito: verde desde 85, amarillo hacia 70, naranja hacia 60 y rojo al acercarse al mínimo.
const VERDE_LEYENDA = [0, 230, 118]; // #00E676
const VERDE = [76, 209, 138]; // #4cd18a
const AMARILLO = [240, 185, 11]; // #f0b90b
const NARANJA = [255, 140, 66]; // #ff8c42
const ROJO = [255, 107, 94]; // #ff6b5e

const mezcla = (a: number[], b: number[], f: number) =>
  "#" + a.map((x, i) => Math.round(x + (b[i] - x) * Math.min(1, Math.max(0, f))).toString(16).padStart(2, "0")).join("");

export function colorTasa(tasa: number, minimo: number | null = null): string {
  const rojoDesde = minimo !== null ? Math.min(minimo + 5, 60) : 50;
  if (tasa >= 90) return mezcla(VERDE_LEYENDA, VERDE_LEYENDA, 0);
  if (tasa >= 85) return mezcla(VERDE, VERDE_LEYENDA, (tasa - 85) / 5);
  if (tasa >= 70) return mezcla(AMARILLO, VERDE, (tasa - 70) / 15);
  if (tasa >= 60) return mezcla(NARANJA, AMARILLO, (tasa - 60) / 10);
  if (tasa >= rojoDesde) return mezcla(ROJO, NARANJA, (tasa - rojoDesde) / Math.max(1, 60 - rojoDesde));
  return mezcla(ROJO, ROJO, 0);
}

export interface Nivel {
  nombre: string;
  color: string;
  leyenda: boolean; // borde iluminado
}

// Frase corta según la zona. "Perdiendo plata" solo si se conoce el CPA real.
export function nivelEntrega(tasa: number, minimo: number | null, conoceCPA: boolean): Nivel {
  const color = colorTasa(tasa, minimo);
  if (tasa >= 90) return { nombre: "Leyenda 🔥", color, leyenda: true };
  if (tasa >= 85) return { nombre: "Excelente", color, leyenda: false };
  if (minimo !== null && tasa < minimo) {
    return { nombre: conoceCPA ? "Perdiendo plata" : "Por debajo de tu tasa mínima", color, leyenda: false };
  }
  if (minimo !== null && tasa - minimo <= 10) {
    const faltan = tasa - minimo;
    return {
      nombre: conoceCPA ? `En riesgo (faltan ${faltan} puntos para perder)` : `En riesgo (faltan ${faltan} puntos para tu mínimo)`,
      color,
      leyenda: false,
    };
  }
  return { nombre: "Bien, pero ojo", color, leyenda: false };
}

// Aviso cuando la tasa se acerca (a 5 puntos) o cruza el mínimo.
export function avisoMinimo(tasa: number, minimo: number | null, producto: string): string | null {
  if (minimo === null) return null;
  if (tasa < minimo) return `Bajaste de tu tasa mínima con ${producto}.`;
  if (tasa - minimo <= 5) return `Tu tasa de entrega va en ${tasa} %, se está acercando a tu límite del ${minimo} %.`;
  return null;
}
