import Link from "next/link";
import { baseConfigurada, listarPedidos, pedidosConIA } from "@/lib/db";
import { PEDIDOS_EJEMPLO } from "@/lib/ejemplo";
import { formatoPesos } from "@/lib/mensajes";
import { calcularMetricas, inicioPeriodo, semaforo, type Periodo } from "@/lib/metricas";

export const dynamic = "force-dynamic";

const PERIODOS: [Periodo, string][] = [["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"]];

function Circulo({ tasa }: { tasa: number | null }) {
  const r = 52;
  const largo = 2 * Math.PI * r;
  const s = tasa === null ? null : semaforo(tasa);
  return (
    <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label={tasa === null ? "Sin datos" : `${tasa} %`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--linea)" strokeWidth="12" />
      {tasa !== null && (
        <circle cx="60" cy="60" r={r} fill="none" stroke={s!.color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(largo * tasa) / 100} ${largo}`} transform="rotate(-90 60 60)" />
      )}
      <text x="60" y="66" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--texto)">
        {tasa === null ? "—" : `${tasa}%`}
      </text>
    </svg>
  );
}

export default async function Panel({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const q = await searchParams;
  const periodo: Periodo = (["hoy", "semana", "mes"] as const).find((x) => x === q.periodo) ?? "semana";
  const conectada = baseConfigurada();
  const pedidos = conectada ? await listarPedidos(2000) : PEDIDOS_EJEMPLO;
  const conIA = conectada ? await pedidosConIA(pedidos.map((p) => p.id!).filter(Boolean)) : new Set<string>();
  const m = calcularMetricas(pedidos, inicioPeriodo(periodo), conIA);
  const s = m.tasaConfirmacion === null ? null : semaforo(m.tasaConfirmacion);

  return (
    <main>
      <p><Link href="/" className="volver">← Pedidos</Link></p>
      <h1>
        Tu <span>panel</span>
      </h1>
      <div className="filtros">
        {PERIODOS.map(([p, nombre]) => (
          <Link key={p} href={`/panel?periodo=${p}`} className={`filtro${p === periodo ? " filtro-activo" : ""}`}>{nombre}</Link>
        ))}
      </div>

      <section className="pedido rescatadas">
        <div className="pedido-meta">Ventas rescatadas por Bravo IA</div>
        <div className="numero-grande">{m.rescatadas}</div>
        <div className="pedido-meta">
          {m.rescatadas === 0
            ? "Pedidos que confirmaron gracias al seguimiento, al descuento de rescate o a la IA."
            : `${formatoPesos(m.plataRescatada)} en pedidos que se hubieran perdido.`}
        </div>
      </section>

      <section className="pedido tasa">
        <Circulo tasa={m.tasaConfirmacion} />
        <div>
          <div className="pedido-nombre">Tasa de confirmación</div>
          {s && <div style={{ color: s.color, fontWeight: 600 }}>{s.frase}</div>}
          <div className="pedido-meta">
            {m.tasaConfirmacion === null
              ? "Todavía no hay pedidos decididos en este período."
              : `De cada 100 pedidos, ${m.tasaConfirmacion} clientas confirman de verdad.`}
          </div>
        </div>
      </section>

      <section className="pedido cifras">
        <div><b>{m.recibidos}</b><span>Recibidos</span></div>
        <div><b>{m.confirmados}</b><span>Confirmados</span></div>
        <div><b>{m.porConfirmar}</b><span>Por confirmar</span></div>
        <div><b>{m.sinRespuesta}</b><span>Sin respuesta o cancelados</span></div>
        <div><b>{m.enDropi}</b><span>Subidos a Dropi</span></div>
      </section>

      <p className="pedido-meta">
        Los pedidos archivados (atendidos por fuera) no cuentan. La tasa de entrega llega cuando la app lea los estados de
        Dropi.
      </p>
    </main>
  );
}
