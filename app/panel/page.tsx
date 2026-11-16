import Link from "next/link";
import { baseConfigurada, listarPedidos, numerosProductos, pedidosConIA, productosDelCatalogo } from "@/lib/db";
import { PEDIDOS_EJEMPLO } from "@/lib/ejemplo";
import { formatoPesos } from "@/lib/mensajes";
import { calcularMetricas, inicioPeriodo, type Periodo } from "@/lib/metricas";
import { avisoMinimo, nivelEntrega, tasaMinima, tasaMinimaCalculada } from "@/lib/tasas";
import { guardarNumeros, guardarTasaMinima } from "./acciones";
import { CirculoTasa } from "./circulo";

export const dynamic = "force-dynamic";

const PERIODOS: [Periodo, string][] = [["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"]];
const VISTAS = [["entregas", "Entregas"], ["confirmacion", "Confirmación"], ["numeros", "Mis números"]] as const;
type Vista = (typeof VISTAS)[number][0];
const FALTA_DROPI = "Llega cuando la app lea los estados de Dropi.";

function Cifra({ valor, nombre, amarilla }: { valor: number | string; nombre: string; amarilla?: boolean }) {
  return (
    <div className={amarilla ? "cifra-rescatadas" : undefined}>
      <b>{valor}</b>
      <span>{nombre}</span>
    </div>
  );
}

function TasaPequena({ nombre, valor, explica, invertida }: { nombre: string; valor: number | null; explica: string; invertida?: boolean }) {
  return (
    <div className="fila-tasa">
      <CirculoTasa tasa={valor} tamano={84} invertida={invertida} />
      <b>{nombre}</b>
      <div className="pedido-meta">{valor === null ? FALTA_DROPI : explica}</div>
    </div>
  );
}

export default async function Panel({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; ejemplo?: string; tasa?: string; vista?: string; cambiar?: string }>;
}) {
  const q = await searchParams;
  const periodo: Periodo = (["hoy", "semana", "mes"] as const).find((x) => x === q.periodo) ?? "semana";
  const vista: Vista = VISTAS.map(([v]) => v).find((v) => v === q.vista) ?? "entregas";
  const ejemplo = q.ejemplo === "1";
  // Arma el enlace conservando lo demás (período, ejemplo, pestaña).
  const enlace = (cambios: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const todo = { vista: q.vista ?? null, periodo: q.periodo ?? null, ejemplo: q.ejemplo ?? null, tasa: q.tasa ?? null, ...cambios };
    for (const [k, v] of Object.entries(todo)) if (v && !(k === "vista" && v === "entregas")) u.set(k, v);
    const t = u.toString();
    return t ? `/panel?${t}` : "/panel";
  };

  const conectada = baseConfigurada();
  const pedidos = conectada ? await listarPedidos(2000) : PEDIDOS_EJEMPLO;
  const conIA = conectada ? await pedidosConIA(pedidos.map((p) => p.id!).filter(Boolean)) : new Set<string>();
  const m = calcularMetricas(pedidos, inicioPeriodo(periodo), conIA);
  // "Ver cómo se verá": números de ejemplo (no son tuyos) para mostrar el diseño.
  if (ejemplo) {
    const t = Math.min(100, Math.max(0, Number(q.tasa ?? 91) || 91));
    const entregados = Math.round(t * 0.8);
    Object.assign(m, {
      rescatadas: 7, plataRescatada: 699300, recibidos: 120, confirmados: 96, porConfirmar: 4, sinRespuesta: 20,
      enDropi: 96, despachados: 96, conNovedad: 12, entregados, devueltos: 80 - entregados,
      tasas: { confirmacion: 83, entrega: t, novedad: 12, rescate: 64, realVenta: Math.round((entregados * 100) / 120) },
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
  const unico = filas.length === 1 ? filas[0] : null;
  const minimoGeneral = ejemplo ? 44 : unico?.minimo.valor ?? null;
  const conoceCPA = Boolean(unico && unico.datos.cpa !== null);

  const entrega = m.tasas.entrega;
  const nivel = entrega === null ? null : nivelEntrega(entrega, minimoGeneral, conoceCPA);
  const aviso = entrega === null ? null : avisoMinimo(entrega, minimoGeneral, ejemplo ? "este producto" : unico?.producto ?? "este producto");

  return (
    <main>
      <p><Link href="/" className="volver">← Pedidos</Link></p>
      <h1>
        Tu <span>panel</span>
      </h1>

      <div className="pestanas">
        {VISTAS.map(([v, nombre]) => (
          <Link key={v} href={enlace({ vista: v, cambiar: null })} className={`pestana${v === vista ? " pestana-activa" : ""}`}>{nombre}</Link>
        ))}
      </div>

      {vista !== "numeros" && (
        <div className="filtros">
          {PERIODOS.map(([p, nombre]) => (
            <Link key={p} href={enlace({ periodo: p })} className={`filtro${p === periodo ? " filtro-activo" : ""}`}>{nombre}</Link>
          ))}
        </div>
      )}

      {ejemplo ? (
        <div className="aviso">
          Estos números son de EJEMPLO, para que veas cómo se verá. Prueba otras tasas de entrega:{" "}
          {[91, 87, 75, 62, 48, 40].map((t) => (
            <Link key={t} href={enlace({ ejemplo: "1", tasa: String(t), vista: "entregas" })} className="enlace">{t}% </Link>
          ))}
          · <Link href={enlace({ ejemplo: null, tasa: null })} className="enlace">Volver a mis números</Link>
        </div>
      ) : (
        vista !== "numeros" && (
          <p className="pedido-meta"><Link href={enlace({ ejemplo: "1" })} className="enlace">Ver cómo se verá con datos →</Link></p>
        )
      )}

      {vista === "entregas" && (
        <>
          <section className={`pedido tasa-principal${nivel?.leyenda ? " leyenda" : ""}`}>
            <CirculoTasa tasa={entrega} minimo={minimoGeneral} leyenda={nivel?.leyenda} tamano={150} />
            <div>
              <div className="pedido-nombre">Tasa de entrega</div>
              {nivel && <div style={{ color: nivel.color, fontWeight: 700 }}>{nivel.nombre}</div>}
              <div className="pedido-meta">
                {entrega === null ? FALTA_DROPI : `De cada 100 pedidos despachados, ${entrega} se entregan.`}
              </div>
              {aviso && <div className="problema">{aviso}</div>}
            </div>

            {/* Tu tasa mínima, junto a la rayita: se cambia aquí mismo. */}
            <div className="minimo">
              {q.cambiar === "1" && unico && !ejemplo ? (
                <form action={guardarTasaMinima} className="minimo-form">
                  <input type="hidden" name="tienda" value={unico.tienda_dominio} />
                  <input type="hidden" name="producto" value={String(unico.shopify_product_id)} />
                  <label>
                    Tu tasa mínima para no perder (%)
                    <input name="tasa_minima" inputMode="numeric" defaultValue={unico.datos.tasa_minima ?? ""} placeholder={unico.sugerido !== null ? `Según tus costos: ${unico.sugerido}` : "Ej. 45"} />
                  </label>
                  <div className="botones">
                    <button type="submit" className="principal">Guardar</button>
                    <Link href={enlace({ cambiar: null })} className="enlace">Cancelar</Link>
                  </div>
                  <span className="pedido-meta">Déjalo vacío para que la app la calcule con tus costos.</span>
                </form>
              ) : (
                <>
                  ▏ Tu tasa mínima:{" "}
                  <b>{minimoGeneral === null ? "sin definir" : `${minimoGeneral} %`}</b>
                  {ejemplo
                    ? " (ejemplo)"
                    : unico?.minimo.propia
                      ? " (la escribiste tú)"
                      : minimoGeneral !== null
                        ? " (según tus costos)"
                        : ""}
                  {!ejemplo && unico && (
                    <> · <Link href={enlace({ cambiar: "1" })} className="enlace">Cambiar</Link></>
                  )}
                  {!ejemplo && !unico && filas.length > 1 && (
                    <> · <Link href={enlace({ vista: "numeros" })} className="enlace">Ponla por producto</Link></>
                  )}
                  {!ejemplo && unico && minimoGeneral === null && (
                    <div className="pedido-meta">Escríbela o llena tus costos en “Mis números” para que la app la calcule.</div>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="pedido cifras">
            <Cifra valor={m.despachados} nombre="Despachados" />
            <Cifra valor={m.entregados} nombre="Entregados" />
            <Cifra valor={m.devueltos} nombre="Devueltos (no entregados)" />
            <Cifra valor={m.conNovedad} nombre="Con novedad" />
          </section>

          <section className="pedido">
            <div className="lista-tasas">
              <TasaPequena nombre="Tasa de novedad" valor={m.tasas.novedad} invertida explica="Cuántos despachados tienen problemas en el camino." />
              <TasaPequena nombre="Tasa de rescate" valor={m.tasas.rescate} explica="Cuántas novedades salva Bravo IA." />
              <TasaPequena nombre="Tasa real de venta" valor={m.tasas.realVenta} explica="De cada 100 pedidos, cuántos se vuelven plata." />
            </div>
          </section>
        </>
      )}

      {vista === "confirmacion" && (
        <>
          <section className="pedido tasa-principal">
            <CirculoTasa tasa={m.tasas.confirmacion} tamano={150} />
            <div>
              <div className="pedido-nombre">Tasa de confirmación</div>
              <div className="pedido-meta">
                {m.tasas.confirmacion === null
                  ? "Todavía no hay pedidos decididos en este período."
                  : `De cada 100 pedidos, ${m.tasas.confirmacion} clientas confirman de verdad.`}
              </div>
            </div>
          </section>

          <section className="pedido cifras">
            <Cifra valor={m.recibidos} nombre="Recibidos" />
            <Cifra valor={m.porConfirmar} nombre="Por confirmar" />
            <Cifra valor={m.confirmados} nombre="Confirmados" />
            <Cifra valor={m.sinRespuesta} nombre="No confirmados (sin respuesta o cancelados)" />
            <Cifra
              valor={m.rescatadas}
              nombre={`Rescatadas por Bravo IA${m.rescatadas > 0 ? ` · ${formatoPesos(m.plataRescatada)}` : ""}`}
              amarilla
            />
          </section>
          <p className="pedido-meta">
            Rescatadas: confirmaron gracias al seguimiento, al descuento de rescate o a la IA.
          </p>
        </>
      )}

      {vista === "numeros" && filas.length === 0 && <p className="subtitulo">Todavía no hay productos en el catálogo.</p>}
      {vista === "numeros" && filas.length > 0 && (
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
