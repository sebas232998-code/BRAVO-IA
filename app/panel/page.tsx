import Link from "next/link";
import { baseConfigurada, listarPedidos, numerosProductos, pedidosConIA, productosDelCatalogo } from "@/lib/db";
import { PEDIDOS_EJEMPLO } from "@/lib/ejemplo";
import { formatoPesos } from "@/lib/mensajes";
import { calcularMetricas, inicioPeriodo, type Periodo } from "@/lib/metricas";
import { avisoMinimo, nivelEntrega, tasaMinima, tasaMinimaCalculada } from "@/lib/tasas";
import { guardarNumeros } from "./acciones";
import { CirculoTasa } from "./circulo";

export const dynamic = "force-dynamic";

const PERIODOS: [Periodo, string][] = [["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"]];
const FALTA_DROPI = "Llega cuando la app lea los estados de Dropi.";

export default async function Panel({ searchParams }: { searchParams: Promise<{ periodo?: string; ejemplo?: string; tasa?: string }> }) {
  const q = await searchParams;
  const periodo: Periodo = (["hoy", "semana", "mes"] as const).find((x) => x === q.periodo) ?? "semana";
  const conectada = baseConfigurada();
  const pedidos = conectada ? await listarPedidos(2000) : PEDIDOS_EJEMPLO;
  const conIA = conectada ? await pedidosConIA(pedidos.map((p) => p.id!).filter(Boolean)) : new Set<string>();
  const ejemplo = q.ejemplo === "1";
  const m = calcularMetricas(pedidos, inicioPeriodo(periodo), conIA);
  // "Ver cómo se verá": números de ejemplo (no son tuyos) para mostrar el diseño.
  if (ejemplo) {
    const t = Math.min(100, Math.max(0, Number(q.tasa ?? 91) || 91));
    Object.assign(m, {
      rescatadas: 7, plataRescatada: 699300, recibidos: 120, confirmados: 96, porConfirmar: 4, sinRespuesta: 20, enDropi: 96,
      entregados: Math.round(t * 0.8), devueltos: 80 - Math.round(t * 0.8),
      tasas: { confirmacion: 83, entrega: t, novedad: 12, rescate: 64, realVenta: Math.round((t * 0.8 * 100) / 120) },
    });
  }

  const productos = conectada ? await productosDelCatalogo() : [];
  const numeros = conectada ? await numerosProductos() : [];
  const filas = productos.map((p) => {
    const n = numeros.find((x) => x.tienda_dominio === p.tienda_dominio && x.shopify_product_id === p.shopify_product_id);
    const datos = { precio: p.precio, costo: n?.costo ?? null, flete: n?.flete ?? null, cpa: n?.cpa ?? null, tasa_minima: n?.tasa_minima ?? null };
    return { ...p, datos, minimo: tasaMinima(datos), sugerido: tasaMinimaCalculada(datos) };
  });
  // Con un solo producto, su mínimo es la rayita de la tasa de entrega general.
  const minimoGeneral = ejemplo ? 44 : filas.length === 1 ? filas[0].minimo.valor : null;
  const conoceCPA = filas.length === 1 && filas[0].datos.cpa !== null;

  const entrega = m.tasas.entrega;
  const nivel = entrega === null ? null : nivelEntrega(entrega, minimoGeneral, conoceCPA);
  const aviso = entrega === null ? null : avisoMinimo(entrega, minimoGeneral, ejemplo ? "este producto" : filas[0]?.producto ?? "este producto");

  const tasas: { nombre: string; valor: number | null; explica: string; falta: string; invertida?: boolean }[] = [
    { nombre: "Tasa de confirmación", valor: m.tasas.confirmacion, explica: "Cuántas clientas confirman de verdad.", falta: "Todavía no hay pedidos decididos en este período." },
    { nombre: "Tasa de novedad", valor: m.tasas.novedad, explica: "Cuántos pedidos despachados tienen problemas en el camino.", falta: FALTA_DROPI, invertida: true },
    { nombre: "Tasa de rescate", valor: m.tasas.rescate, explica: "Cuántas novedades salva Bravo IA.", falta: FALTA_DROPI },
    { nombre: "Tasa real de venta", valor: m.tasas.realVenta, explica: "De cada 100 pedidos, cuántos se vuelven plata.", falta: FALTA_DROPI },
  ];

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

      {ejemplo ? (
        <div className="aviso">
          Estos números son de EJEMPLO, para que veas cómo se verá. Prueba otras tasas:{" "}
          {[91, 87, 75, 62, 48, 40].map((t) => (
            <Link key={t} href={`/panel?ejemplo=1&tasa=${t}`} className="enlace">{t}% </Link>
          ))}
          · <Link href="/panel" className="enlace">Volver a mis números</Link>
        </div>
      ) : (
        <p className="pedido-meta"><Link href="/panel?ejemplo=1" className="enlace">Ver cómo se verá con datos →</Link></p>
      )}

      <section className="pedido rescatadas">
        <div className="pedido-meta">Ventas rescatadas por Bravo IA</div>
        <div className="numero-grande">{m.rescatadas}</div>
        <div className="pedido-meta">
          {m.rescatadas === 0
            ? "Pedidos que confirmaron gracias al seguimiento, al descuento de rescate o a la IA."
            : `${formatoPesos(m.plataRescatada)} en pedidos que se hubieran perdido.`}
        </div>
      </section>

      <section className={`pedido tasa-principal${nivel?.leyenda ? " leyenda" : ""}`}>
        <CirculoTasa tasa={entrega} minimo={minimoGeneral} leyenda={nivel?.leyenda} tamano={150} />
        <div>
          <div className="pedido-nombre">Tasa de entrega</div>
          {nivel && <div style={{ color: nivel.color, fontWeight: 700 }}>{nivel.nombre}</div>}
          <div className="pedido-meta">
            {entrega === null
              ? FALTA_DROPI
              : `De cada 100 pedidos despachados, ${entrega} se entregan (${m.entregados} entregados, ${m.devueltos} devueltos).`}
          </div>
          {minimoGeneral !== null && (
            <div className="pedido-meta">
              ▏ Tu mínimo para no perder: <b>{minimoGeneral} %</b>
              {ejemplo ? " (ejemplo)" : filas[0]?.minimo.propia ? " (lo escribiste tú)" : " (según tus costos)"}
            </div>
          )}
          {aviso && <div className="problema">{aviso}</div>}
        </div>
      </section>

      <section className="pedido">
        <div className="pedido-nombre">Tasas de operación</div>
        <div className="lista-tasas">
          {tasas.map((t) => (
            <div key={t.nombre} className="fila-tasa">
              <CirculoTasa tasa={t.valor} tamano={64} invertida={t.invertida} />
              <div>
                <b>{t.nombre}</b>
                <div className="pedido-meta">{t.valor === null ? t.falta : t.explica}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pedido cifras">
        <div><b>{m.recibidos}</b><span>Recibidos</span></div>
        <div><b>{m.confirmados}</b><span>Confirmados</span></div>
        <div><b>{m.porConfirmar}</b><span>Por confirmar</span></div>
        <div><b>{m.sinRespuesta}</b><span>Sin respuesta o cancelados</span></div>
        <div><b>{m.enDropi}</b><span>Subidos a Dropi</span></div>
      </section>

      {filas.length > 0 && (
        <section className="pedido">
          <div className="pedido-nombre">Tus números por producto</div>
          <p className="pedido-meta">
            Con esto la app calcula tu tasa de entrega mínima para no perder: (flete + CPA) ÷ (precio − costo). En Dropi
            la devolución solo cobra el flete de ida.
          </p>
          {filas.map((f) => (
            <form key={`${f.tienda_dominio}-${f.shopify_product_id}`} action={guardarNumeros} className="editar">
              <input type="hidden" name="tienda" value={f.tienda_dominio} />
              <input type="hidden" name="producto" value={String(f.shopify_product_id)} />
              <b>{f.producto} · {formatoPesos(f.precio)}</b>
              <div className="numeros">
                <label>Costo del proveedor<input name="costo" inputMode="numeric" defaultValue={f.datos.costo ?? ""} placeholder="$" /></label>
                <label>Flete de ida<input name="flete" inputMode="numeric" defaultValue={f.datos.flete ?? ""} placeholder="$" /></label>
                <label>CPA (publicidad)<input name="cpa" inputMode="numeric" defaultValue={f.datos.cpa ?? ""} placeholder="$ (si lo sabes)" /></label>
                <label>Tu tasa mínima<input name="tasa_minima" inputMode="numeric" defaultValue={f.datos.tasa_minima ?? ""} placeholder="% (opcional)" /></label>
              </div>
              {f.sugerido !== null && (
                <div className="pedido-meta">
                  Según tus costos, tu mínimo es {f.sugerido} %.{f.datos.cpa === null ? " (Sin CPA: agrégalo para que sea exacto.)" : ""}
                </div>
              )}
              <button type="submit">Guardar</button>
            </form>
          ))}
        </section>
      )}

      <p className="pedido-meta">Los pedidos archivados (atendidos por fuera) no cuentan.</p>
    </main>
  );
}
