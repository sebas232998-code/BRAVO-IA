import Link from "next/link";
import { baseConfigurada, listarPedidos } from "@/lib/db";
import { iaConfigurada } from "@/lib/conversacion";
import { PEDIDOS_EJEMPLO } from "@/lib/ejemplo";
import { mensajeConfirmacion } from "@/lib/mensajes";
import { Simulador } from "./simulador";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ProbarIA({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const q = await searchParams;
  const pedidos = (baseConfigurada() ? await listarPedidos(30) : PEDIDOS_EJEMPLO).filter(
    (p) => p.estado === "por_confirmar" || p.estado === "confirmado",
  );
  const elegido = pedidos.find((p) => p.id === q.pedido) ?? pedidos[0];

  return (
    <main>
      <p><Link href="/automatico" className="volver">← Piloto automático</Link></p>
      <h1>
        Probar la <span>IA</span>
      </h1>
      <p className="subtitulo">
        Escribe como si fueras la clienta y mira qué respondería la IA. No se envía nada por WhatsApp ni se cambia el
        pedido de verdad.
      </p>
      {!iaConfigurada() && (
        <div className="aviso">Falta la clave de Anthropic (ANTHROPIC_API_KEY) en Vercel. Sin ella solo se prueban los “sí” y los “gracias”.</div>
      )}

      {pedidos.length > 1 && (
        <div className="filtros">
          {pedidos.slice(0, 8).map((p) => (
            <Link key={p.id ?? p.numero} href={`/probar-ia?pedido=${p.id}`} className="filtro">
              {p.id === elegido?.id ? <b>{p.numero}</b> : p.numero}
            </Link>
          ))}
        </div>
      )}

      {elegido ? (
        <Simulador
          key={elegido.id ?? elegido.numero}
          inicial={{ pedido: elegido, chat: [{ direccion: "saliente", texto: mensajeConfirmacion(elegido) }] }}
        />
      ) : (
        <p className="subtitulo">No hay pedidos por confirmar para probar.</p>
      )}
    </main>
  );
}
