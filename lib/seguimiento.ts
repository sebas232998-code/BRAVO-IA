// Seguimiento a quien no responde (ver especificacion.md → "Seguimiento a quien no responde y descuento de rescate").
// Máximo 3 mensajes; si no responde al tercero, el pedido queda "sin respuesta" y no se le vuelve a escribir.
// Todo aquí es sin base de datos, para poder probarlo.

import { enHorarioDeMensajes } from "./automatico";
import { formatoPesos } from "./mensajes";
import type { Pedido } from "./tipos";

export interface ConfigSeguimiento {
  seguimiento_horas: number[]; // [2, 24, 48]
  descuento_activo: boolean;
  descuento_porcentaje: number; // 10
  descuento_horas: number; // 24
  seguimiento_desde: string | null;
}

export const SEGUIMIENTO_POR_DEFECTO: ConfigSeguimiento = {
  seguimiento_horas: [2, 24, 48],
  descuento_activo: true,
  descuento_porcentaje: 10,
  descuento_horas: 24,
  seguimiento_desde: null,
};

const HORA = 3_600_000;

export type Paso = { tipo: "mensaje"; numero: 1 | 2 | 3 } | { tipo: "sin_respuesta" } | null;

type PedidoSeguimiento = Pick<Pedido, "estado" | "telefono"> & {
  confirmacion_enviada_en?: string | null;
  ultima_respuesta_en?: string | null;
  seguimientos_enviados?: number;
  ultimo_seguimiento_en?: string | null;
};

// ¿Qué le toca a este pedido ahora?
export function siguientePaso(p: PedidoSeguimiento, c: ConfigSeguimiento, ahora: Date): Paso {
  if (p.estado !== "por_confirmar" || !p.telefono || !p.confirmacion_enviada_en) return null;
  if (p.ultima_respuesta_en) return null; // la clienta ya escribió: lo atiende el vendedor
  const enviada = new Date(p.confirmacion_enviada_en).getTime();
  if (c.seguimiento_desde && enviada < new Date(c.seguimiento_desde).getTime()) return null; // pedido de antes de prenderlo

  const hechos = p.seguimientos_enviados ?? 0;
  if (hechos >= 3) {
    // Después del tercero se espera lo que dura el descuento (o un día) y se cierra.
    const ultimo = p.ultimo_seguimiento_en ? new Date(p.ultimo_seguimiento_en).getTime() : enviada;
    const espera = (c.descuento_activo ? c.descuento_horas : 24) * HORA;
    return ahora.getTime() - ultimo >= espera ? { tipo: "sin_respuesta" } : null;
  }

  const numero = (hechos + 1) as 1 | 2 | 3;
  const horasDe = (n: number) => c.seguimiento_horas[n - 1] ?? SEGUIMIENTO_POR_DEFECTO.seguimiento_horas[n - 1];
  if (ahora.getTime() - enviada < horasDe(numero) * HORA) return null;
  // Siempre con espacio entre uno y otro, aunque el anterior haya salido tarde (de noche o con el reloj apagado).
  if (numero > 1 && p.ultimo_seguimiento_en) {
    const hueco = (horasDe(numero) - horasDe(numero - 1)) * HORA;
    if (ahora.getTime() - new Date(p.ultimo_seguimiento_en).getTime() < hueco) return null;
  }
  if (!enHorarioDeMensajes(ahora)) return null; // de noche no se le escribe
  return { tipo: "mensaje", numero };
}

// Descuento de rescate sobre el total que paga la clienta (redondeado al peso).
export function calcularDescuento(total: number, porcentaje: number) {
  const ahorro = Math.round((Number(total) * porcentaje) / 100);
  return { normal: Math.round(Number(total)), conDescuento: Math.round(Number(total)) - ahorro, ahorro };
}

// ---------- Plantillas (Meta exige plantilla aprobada fuera de la ventana de 24 horas) ----------

const CIERRE = "Si todo está correcto, envía la palabra *CONFIRMAR* y te lo despachamos lo más pronto posible 🚚";

export const PLANTILLAS_SEGUIMIENTO = {
  seguimiento_1: {
    categoria: "UTILITY",
    texto: `Hola, ¿cómo estás? Te recuerdo que tu pedido de {{1}} está listo para despacharse, solo nos falta tu confirmación 📦\n\n${CIERRE}`,
    ejemplo: ["Forro de sofá · 3 puestos / Gris"],
  },
  seguimiento_2: {
    categoria: "UTILITY",
    texto:
      "Hola, ¿cómo estás? Todavía no hemos podido confirmar tu pedido de {{1}} 📦\n\n" +
      "Si necesitas cambiar algún dato o prefieres recibirlo en otro lugar, como tu trabajo o la casa de un familiar, toca *Corregir datos* y lo ajustamos.\n\n" +
      CIERRE,
    ejemplo: ["Forro de sofá · 3 puestos / Gris"],
  },
  seguimiento_descuento: {
    categoria: "MARKETING",
    texto:
      "Hola, ¿cómo estás? Te cuento que no queremos que te quedes sin tu producto, así que tenemos un descuento especial para ti 🛍\n\n" +
      "Precio normal: {{1}}\nCon tu descuento: {{2}}\nTe ahorras: {{3}}\n\n" +
      "Este descuento es válido solo por {{4}} horas.\n\n" +
      CIERRE,
    ejemplo: ["$89.900", "$80.910", "$8.990", "24"],
  },
} as const;

export type NombrePlantilla = keyof typeof PLANTILLAS_SEGUIMIENTO;

// Pone los valores en los espacios {{1}}, {{2}}… (para guardar en el chat lo que vio la clienta).
export function llenarPlantilla(texto: string, valores: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] ?? "");
}

// Qué plantilla y qué valores lleva cada mensaje del seguimiento.
export function mensajeSeguimiento(
  numero: 1 | 2 | 3,
  resumen: string,
  total: number,
  c: ConfigSeguimiento,
): { plantilla: NombrePlantilla; valores: string[]; descuento: ReturnType<typeof calcularDescuento> | null } {
  if (numero === 1) return { plantilla: "seguimiento_1", valores: [resumen], descuento: null };
  if (numero === 2) return { plantilla: "seguimiento_2", valores: [resumen], descuento: null };
  if (!c.descuento_activo || c.descuento_porcentaje <= 0) {
    // Sin descuento, el tercero es otro recordatorio.
    return { plantilla: "seguimiento_1", valores: [resumen], descuento: null };
  }
  const d = calcularDescuento(total, c.descuento_porcentaje);
  return {
    plantilla: "seguimiento_descuento",
    valores: [formatoPesos(d.normal), formatoPesos(d.conDescuento), formatoPesos(d.ahorro), String(c.descuento_horas)],
    descuento: d,
  };
}

// ---------- Cuando la clienta confirma después de que se le ofreció el descuento ----------

export type DecisionDescuento =
  | { tipo: "sin_descuento" } // nunca se le ofreció: se confirma normal
  | { tipo: "aplicar"; nuevoTotal: number } // confirmó a tiempo
  | { tipo: "avisar_vencido" } // venció: se le avisa y se le ofrece el precio normal (no se confirma todavía)
  | { tipo: "precio_normal" }; // ya se le avisó que venció y volvió a confirmar

export function decidirDescuento(
  p: Pick<Pedido, "total"> & {
    descuento_valor?: number | null;
    descuento_vence_en?: string | null;
    descuento_aplicado?: boolean;
    descuento_vencido_avisado?: boolean;
  },
  ahora: Date,
): DecisionDescuento {
  if (!p.descuento_valor || !p.descuento_vence_en || p.descuento_aplicado) return { tipo: "sin_descuento" };
  if (ahora.getTime() <= new Date(p.descuento_vence_en).getTime()) {
    return { tipo: "aplicar", nuevoTotal: Math.round(Number(p.total) - Number(p.descuento_valor)) };
  }
  return p.descuento_vencido_avisado ? { tipo: "precio_normal" } : { tipo: "avisar_vencido" };
}

export function mensajeDescuentoVencido(total: number): string {
  return (
    `Hola, te cuento que el descuento ya venció, pero tu pedido sigue disponible al precio normal de ${formatoPesos(total)} 🛍\n\n` +
    "Si lo deseas, envía la palabra *CONFIRMAR* y te lo despachamos lo más pronto posible 🚚"
  );
}
