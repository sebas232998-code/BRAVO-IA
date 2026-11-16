"use client";

import { useActionState } from "react";
import { probarMensaje, type EstadoSimulador } from "./acciones";

const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CO").replace(/,/g, ".");

export function Simulador({ inicial }: { inicial: EstadoSimulador }) {
  const [estado, enviar, pensando] = useActionState(probarMensaje, inicial);
  const p = estado.pedido;
  return (
    <>
      <section className="pedido">
        <div className="pedido-cabeza">
          <div className="pedido-nombre">Así va el pedido</div>
          <span className="estado">{p.estado === "confirmado" ? "Confirmado" : "Por confirmar"}</span>
        </div>
        <pre className="mensaje">
          {p.items.map((i) => `${i.cantidad} × ${i.producto}${i.variante ? ` · ${i.variante}` : ""}`).join("\n")}
          {`\nTotal a pagar: ${pesos(Number(p.total))}\nCiudad: ${p.ciudad ?? "-"}\nDirección: ${p.direccion ?? "-"}\nCelular: ${p.telefono_original ?? "-"}`}
        </pre>
      </section>

      <section className="pedido">
        <div className="chat">
          {estado.chat.map((m, i) => (
            <div key={i} className={m.nota ? "nota-ia" : `burbuja ${m.direccion}`}>{m.texto}</div>
          ))}
          {pensando && <div className="nota-ia">La IA está escribiendo…</div>}
        </div>
        {estado.error && <div className="problema">{estado.error}</div>}
        <form action={enviar} className="editar">
          <input name="texto" placeholder="Escribe como si fueras la clienta…" autoComplete="off" required disabled={pensando} />
          <button type="submit" className="principal" disabled={pensando}>Enviar</button>
        </form>
      </section>
    </>
  );
}
