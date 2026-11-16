import Link from "next/link";
import {
  baseConfigurada,
  listarPedidos,
  ordenesDropiDesde,
  pedidosConIA,
  tasasMinimas,
  tiendasConInterruptores,
  ultimoLatido,
} from "@/lib/db";
import { porGrupo, tasasDropi, type OrdenDropiLeida } from "@/lib/dropi-estados";
import { PEDIDOS_EJEMPLO } from "@/lib/ejemplo";
import { formatoPesos } from "@/lib/mensajes";
import { calcularMetricas, comparacion, consejoConfirmacion, consejoEntrega, rango } from "@/lib/metricas";
import { avisoMinimo, colorTasa, nivelEntrega } from "@/lib/tasas";
import { guardarTasaMinima } from "./acciones";
import { CirculoTasa } from "./circulo";
import { Confeti } from "./confeti";
import { contarLeyendas, semanas } from "@/lib/leyendas";

export const dynamic = "force-dynamic";

const RANGOS = [["7d", "Últimos 7 días"], ["30d", "Últimos 30 días"], ["90d", "Últimos 90 días"]] as const;
const VISTAS = [["entregas", "Entregas"], ["confirmacion", "Confirmación"]] as const;
type Vista = (typeof VISTAS)[number][0];
const SIN_DATOS = "Todavía no hay pedidos terminados en estas fechas.";

function haceCuanto(fecha: string): string {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60_000);
  if (min < 1) return "hace menos de un minuto";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
}

function Comparacion({ texto, bueno }: { texto: string; bueno: boolean | null }) {
  return <div className={`comparacion ${bueno === null ? "" : bueno ? "sube" : "baja"}`}>{texto}</div>;
}

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
      <div className="pedido-meta">{valor === null ? SIN_DATOS : explica}</div>
    </div>
  );
}

export default async function Panel({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string; tienda?: string; vista?: string; cambiar?: string; ejemplo?: string; tasa?: string }>;
}) {
  const q = await searchParams;
  const r = rango(q.rango, q.desde, q.hasta);
  const vista: Vista = VISTAS.map(([v]) => v).find((v) => v === q.vista) ?? "entregas";
  const ejemplo = q.ejemplo === "1";
  // Arma el enlace conservando lo demás (fechas, tienda, pestaña).
  const enlace = (cambios: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const todo = {
      vista: q.vista ?? null, rango: q.rango ?? null, desde: q.desde ?? null, hasta: q.hasta ?? null,
      tienda: q.tienda ?? null, ejemplo: q.ejemplo ?? null, tasa: q.tasa ?? null, ...cambios,
    };
    for (const [k, v] of Object.entries(todo)) if (v && !(k === "vista" && v === "entregas")) u.set(k, v);
    const t = u.toString();
    return t ? `/panel?${t}` : "/panel";
  };

  const conectada = baseConfigurada();
  const pedidos = conectada ? await listarPedidos(2000) : PEDIDOS_EJEMPLO;
  const conIA = conectada ? await pedidosConIA(pedidos.map((p) => p.id!).filter(Boolean)) : new Set<string>();
  const m = calcularMetricas(pedidos, r.desde, conIA, r.hasta);
  const antes = calcularMetricas(pedidos, r.anterior.desde, conIA, r.anterior.hasta);
  const tiendasApp = conectada ? await tiendasConInterruptores() : [];
  const seguimientoPrendido = tiendasApp.some((t) => t.auto_seguimiento);

  // Estados reales de Dropi (se sincronizan solos cada 30 minutos).
  const latidoDropi = conectada ? await ultimoLatido("dropi") : null;
  const conPruebas = conectada && !ejemplo ? await ordenesDropiDesde(r.anterior.desde) : [];
  // Los pedidos de prueba del vendedor no cuentan.
  const todasDropi = conPruebas.filter((o) => !o.es_prueba);
  const enRango = (o: OrdenDropiLeida, d: Date, h: Date) => new Date(o.creado_en) >= d && new Date(o.creado_en) < h;
  const delRango = todasDropi.filter((o) => enRango(o, r.desde, r.hasta));
  // Solo las tiendas que tienen pedidos en estas fechas (las viejas no aparecen).
  const tiendasDropi = [...new Set(delRango.map((o) => o.tienda).filter(Boolean) as string[])].sort();
  const porDefecto =
    tiendasApp.length === 1 ? tiendasDropi.find((t) => t === tiendasApp[0].nombre.toUpperCase()) ?? "TODAS" : "TODAS";
  const tiendaSel = q.tienda && (q.tienda === "TODAS" || tiendasDropi.includes(q.tienda)) ? q.tienda : porDefecto;
  const filtrar = (os: OrdenDropiLeida[]) => (tiendaSel === "TODAS" ? os : os.filter((o) => o.tienda === tiendaSel));
  const conDropi = todasDropi.length > 0;

  let enCamino = 0;
  if (conDropi) {
    const td = tasasDropi(filtrar(delRango));
    const ta = tasasDropi(filtrar(todasDropi.filter((o) => enRango(o, r.anterior.desde, r.anterior.hasta))));
    Object.assign(m, { despachados: td.despachados, entregados: td.entregados, devueltos: td.devueltos, conNovedad: td.conNovedad });
    enCamino = td.enCamino;
    m.tasas = { ...m.tasas, entrega: td.entrega, novedad: td.novedad, rescate: td.rescate, realVenta: td.realVenta };
    antes.tasas = { ...antes.tasas, entrega: ta.entrega, novedad: ta.novedad };
  }

  // "Ver cómo se verá": números de ejemplo (no son tuyos) para mostrar el diseño.
  if (ejemplo) {
    const t = Math.min(100, Math.max(0, Number(q.tasa ?? 91) || 91));
    const entregados = Math.round(t * 0.8);
    Object.assign(m, {
      rescatadas: 7, plataRescatada: 699300, recibidos: 120, confirmados: 96, porConfirmar: 4, sinRespuesta: 20,
      despachados: 96, conNovedad: 12, entregados, devueltos: 80 - entregados,
      tasas: { confirmacion: 83, entrega: t, novedad: 12, rescate: 64, realVenta: Math.round((entregados * 100) / 120) },
    });
    enCamino = 16;
    antes.tasas = { ...antes.tasas, entrega: t - 3, confirmacion: 80 };
  }

  // Tu tasa mínima, por tienda (la escribes tú).
  const minimas = conectada ? await tasasMinimas() : {};
  const minimo = ejemplo ? 44 : minimas[tiendaSel] ?? null;

  const entrega = m.tasas.entrega;
  const nivel = entrega === null ? null : nivelEntrega(entrega, minimo, false);
  const aviso = entrega === null ? null : avisoMinimo(entrega, minimo, tiendaSel === "TODAS" ? "tus tiendas" : tiendaSel);
  const compEntrega = comparacion(entrega, antes.tasas.entrega, r.anterior.nombre);
  const compConfirmacion = comparacion(m.tasas.confirmacion, antes.tasas.confirmacion, r.anterior.nombre);
  const consejoE = consejoEntrega(entrega, minimo, m.conNovedad);
  const consejoC = consejoConfirmacion(m.tasas.confirmacion, m.porConfirmar, seguimientoPrendido);
  const peores = (campo: "ciudad" | "transportadora" | "producto") => porGrupo(filtrar(delRango), campo).slice(0, 4);
  const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);

  // Leyendas: semanas cerradas con 90 % o más (de la tienda escogida).
  const historial = conectada && !ejemplo ? await ordenesDropiDesde(new Date(Date.now() - 400 * 86_400_000)) : [];
  const leyendas = contarLeyendas(semanas(filtrar(historial)));
  const ultima = leyendas.ultimaSemana;

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

      {/* Fechas: por defecto los últimos 30 días; se pueden escoger. */}
      <div className="filtros">
        {RANGOS.map(([k, nombre]) => (
          <Link key={k} href={enlace({ rango: k === "30d" ? null : k, desde: null, hasta: null })} className={`filtro${r.clave === k ? " filtro-activo" : ""}`}>
            {nombre}
          </Link>
        ))}
        <Link href={enlace({ rango: "fechas" })} className={`filtro${q.rango === "fechas" ? " filtro-activo" : ""}`}>Escoger fechas</Link>
      </div>
      {q.rango === "fechas" && (
        <form action="/panel" method="get" className="fechas">
          {q.vista && <input type="hidden" name="vista" value={q.vista} />}
          {q.tienda && <input type="hidden" name="tienda" value={q.tienda} />}
          <input type="hidden" name="rango" value="fechas" />
          <label>Desde<input type="date" name="desde" defaultValue={q.desde ?? r.desde.toISOString().slice(0, 10)} max={hoy} /></label>
          <label>Hasta<input type="date" name="hasta" defaultValue={q.hasta ?? hoy} max={hoy} /></label>
          <button type="submit" className="principal">Ver</button>
        </form>
      )}
      {r.clave === "fechas" && <p className="pedido-meta">{r.nombre}</p>}

      {/* Tiendas con pedidos en estas fechas. */}
      {conDropi && tiendasDropi.length > 1 && (
        <div className="filtros">
          {["TODAS", ...tiendasDropi].map((t) => (
            <Link key={t} href={enlace({ tienda: t, cambiar: null })} className={`filtro${t === tiendaSel ? " filtro-activo" : ""}`}>
              {t === "TODAS" ? "Todas las tiendas" : t}
            </Link>
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
        !conDropi && <p className="pedido-meta"><Link href={enlace({ ejemplo: "1" })} className="enlace">Ver cómo se verá con datos →</Link></p>
      )}

      {vista === "entregas" && (
        <>
          {!ejemplo && latidoDropi && <p className="pedido-meta">Datos de Dropi · actualizados {haceCuanto(latidoDropi.ultima_vez)}</p>}

          <section className={`pedido tasa-principal${nivel?.leyenda ? " leyenda" : ""}`}>
            <CirculoTasa tasa={entrega} minimo={minimo} leyenda={nivel?.leyenda} tamano={150} />
            <div>
              <div className="pedido-nombre">Tasa de entrega</div>
              {nivel && <div style={{ color: nivel.color, fontWeight: 700 }}>{nivel.nombre}</div>}
              <div className="pedido-meta">
                {entrega === null
                  ? SIN_DATOS
                  : `De cada 100 pedidos que terminan su recorrido, ${entrega} se entregan (${m.entregados} entregados, ${m.devueltos} devueltos).`}
              </div>
              {compEntrega && <Comparacion {...compEntrega} />}
              {aviso && <div className="problema">{aviso}</div>}
              {consejoE && <div className="consejo">💡 {consejoE}</div>}
            </div>

            {/* Tu tasa mínima, junto a la rayita: se escribe aquí mismo. */}
            <div className="minimo">
              {q.cambiar === "1" && !ejemplo ? (
                <form action={guardarTasaMinima} className="minimo-form">
                  <input type="hidden" name="tienda" value={tiendaSel} />
                  <input type="hidden" name="volver" value={enlace({ cambiar: null })} />
                  <label>
                    Tu tasa mínima de efectividad para no perder dinero
                    {tiendaSel === "TODAS" ? "" : ` en ${tiendaSel}`} (%)
                    <input name="tasa_minima" inputMode="numeric" defaultValue={minimo ?? ""} placeholder="Ej. 70" autoFocus />
                  </label>
                  <div className="botones">
                    <button type="submit" className="principal">Guardar</button>
                    <Link href={enlace({ cambiar: null })} className="enlace">Cancelar</Link>
                  </div>
                  <span className="pedido-meta">Déjala vacía y guarda para quitarla.</span>
                </form>
              ) : minimo === null && !ejemplo ? (
                <Link href={enlace({ cambiar: "1" })} className="boton-amarillo">
                  + Agrega tu tasa mínima de efectividad para no perder dinero
                </Link>
              ) : (
                <>
                  ▏ Tu tasa mínima para no perder dinero: <b>{minimo} %</b>
                  {ejemplo ? " (ejemplo)" : <> · <Link href={enlace({ cambiar: "1" })} className="enlace">Cambiar</Link></>}
                </>
              )}
            </div>
          </section>

          {(leyendas.total > 0 || nivel?.leyenda) && (
            <section className="pedido leyendas">
              <div>
                <b>🏆 Leyendas: {leyendas.esteMes} este mes · {leyendas.total} en total</b>
                <div className="pedido-meta">Cada semana cerrada con 90 % o más de entrega (y 5 pedidos terminados o más).</div>
              </div>
              {nivel?.leyenda && entrega !== null && (
                <Link href={`/leyenda?tasa=${entrega}&cuando=${encodeURIComponent(r.nombre)}`} className="boton-amarillo">
                  Compartir mi Leyenda 🔥
                </Link>
              )}
            </section>
          )}
          {ultima?.leyenda && ultima.tasa !== null && (
            <Confeti
              clave={`semana-${ultima.inicio}`}
              mensaje={`¡Semana brava! 🔥 La semana pasada entregaste el ${ultima.tasa} % de tus pedidos.`}
            />
          )}

          <section className="pedido cifras">
            <Cifra valor={m.despachados} nombre="Despachados" />
            <Cifra valor={m.entregados} nombre="Entregados" />
            <Cifra valor={m.devueltos} nombre="Devueltos (no entregados)" />
            <Cifra valor={enCamino} nombre="En camino" />
            <Cifra valor={m.conNovedad} nombre="Con novedad abierta" />
          </section>

          <section className="pedido">
            <div className="lista-tasas">
              <TasaPequena nombre="Tasa de novedad" valor={m.tasas.novedad} invertida explica="Cuántos despachados tienen problemas en el camino." />
              <TasaPequena nombre="Tasa de rescate" valor={m.tasas.rescate} explica="De los que tuvieron novedad, cuántos se entregaron." />
              <TasaPequena nombre="Tasa real de venta" valor={m.tasas.realVenta} explica="De cada 100 pedidos, cuántos se vuelven plata." />
            </div>
          </section>

          {conDropi && (
            <section className="pedido">
              <div className="pedido-nombre">¿Dónde se pierden?</div>
              <p className="pedido-meta">Tasa de entrega en estas fechas, de peor a mejor (con 3 pedidos terminados o más).</p>
              {(["transportadora", "ciudad", "producto"] as const).map((campo) => {
                const lista = peores(campo);
                if (lista.length === 0) return null;
                return (
                  <div key={campo} className="grupo">
                    <b>Por {campo}</b>
                    {lista.map((g) => (
                      <div key={g.nombre} className="fila-grupo">
                        <span>{g.nombre}</span>
                        <span className="pedido-meta">{g.entregados}/{g.terminados}</span>
                        <b style={{ color: colorTasa(g.tasa, minimo) }}>{g.tasa}%</b>
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          )}
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
                  ? "Todavía no hay pedidos decididos en estas fechas."
                  : `De cada 100 pedidos, ${m.tasas.confirmacion} clientas confirman de verdad.`}
              </div>
              {compConfirmacion && <Comparacion {...compConfirmacion} />}
              {consejoC && <div className="consejo">💡 {consejoC}</div>}
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
            Confirmación: pedidos que entraron por la app. Rescatadas: confirmaron gracias al seguimiento, al descuento de
            rescate o a la IA.
          </p>
        </>
      )}

      <p className="pedido-meta">
        Los pedidos archivados (atendidos por fuera) no cuentan.
        {(() => {
          const n = filtrar(conPruebas.filter((o) => o.es_prueba && enRango(o, r.desde, r.hasta))).length;
          return n > 0 ? ` Sin contar ${n} ${n === 1 ? "pedido" : "pedidos"} de prueba.` : "";
        })()}
      </p>
    </main>
  );
}
