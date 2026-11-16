// Clasifica la respuesta de la clienta con Haiku (simple, repetitivo y barato).
// Solo se usa cuando las palabras comunes (gratis, sin IA) no alcanzan.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const MODELO_CLASIFICAR = "claude-haiku-5-5";

const Clasificacion = z.object({
  tipo: z.enum(["confirma", "cortesia", "otro"]),
});
export type TipoMensaje = z.infer<typeof Clasificacion>["tipo"];

const INSTRUCCIONES = `Clasifica el último mensaje de una clienta que está confirmando un pedido contraentrega por WhatsApp.
- "confirma": dice que sí desea el pedido tal como está, sin pedir ningún cambio ni hacer preguntas ("sí señora así está bien", "listo mándelo", "si porfa").
- "cortesia": solo agradece o saluda, no pide nada ("gracias", "muy amable", "bendiciones").
- "otro": todo lo demás: pide un cambio, pregunta algo, duda, no lo quiere, o "sí pero..." con un cambio.
Ante la duda, "otro".`;

export type Clasificar = (texto: string) => Promise<TipoMensaje>;

export function clasificarReal(): Clasificar {
  const cliente = new Anthropic();
  return async (texto) => {
    const r = await cliente.messages.parse({
      model: MODELO_CLASIFICAR,
      max_tokens: 1000,
      output_config: { effort: "low", format: zodOutputFormat(Clasificacion) },
      system: INSTRUCCIONES,
      messages: [{ role: "user", content: `<mensaje>${texto.slice(0, 1000)}</mensaje>` }],
    });
    if (r.stop_reason === "refusal" || !r.parsed_output) return "otro";
    return r.parsed_output.tipo;
  };
}
