import Link from "next/link";
import {
  baseConfigurada,
  configsWhatsApp,
  ordenesDropiDesde,
  listarPedidos,
  mensajesDePedidos,
  nombresTiendas,
  tiendasConInterruptores,
  vinculosDe,
} from "@/lib/db";
import { minutosParaSubir } from "@/lib/automatico";
import { estadoBonito, etapa, tieneNovedad } from "@/lib/dropi-estados";
import { problemasDe } from "@/lib/bandeja";
import { problemaTelefono } from "@/lib/telefono";
import type { MensajeGuardado } from "@/lib/db";
import { PEDIDOS_EJEMPLO } from "@/lib/ejemplo";
import { fechaCorta, fechaHora, formatoPesos, mensajeConfirmacion } from "@/lib/mensajes";
import { NOMBRE_ESTADO, PESTANAS, type Estado, type Pedido, type Pestana } from "@/lib/tipos";
import type { VinculoDropi } from "@/lib/dropi";
import {
  editarDatos,
  eliminarPedido,
  enviarConfirmacionWhatsApp,
  marcarConfirmado,
  archivarPedido,
  atencionResuelta,
  desarchivarPedido,
  quitarPausaDropi,
  subirADropi,
  vincularProducto,
  volverAPorConfirmar,
} from "./acciones";

export const dynamic = "force-dynamic";

export default async function Inicio({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; ver?: string; pestana?: string }>;
}) {
  const q = await searchParams;
  const conectada = baseConfigurada();
  const todos: Pedido[] = conectada ? await listarPedidos() : PEDIDOS_EJEMPLO;
  const nombres = conectada ? await nombresTiendas() : {};
  const tiendas = [...new Set(todos.map((p) => p.tienda_dominio))];
  const vinculos: Record<string, VinculoDropi[]> = Object.fromEntries(
    await Promise.all(tiendas.map(async (t) => [t, conectada ? await vinculosDe(t) : []] as const)),
  );
  const problemas = (p: Pedido) => problemasDe(p, vinculos[p.tienda_dominio] ?? []);
  const conProblemas = todos.filter((p) => problemas(p).length > 0);
  const verErrores = q.ver === "errores";
  const pestana: Pestana = q.pestana && q.pestana in PESTANAS ? (q.pestana as Pestana) : "por_confirmar";
  const enPestana = (p: Pedido, t: Pestana) => (PESTANAS[t].estados as readonly Estado[]).includes(p.estado);
  const pedidos = verErrores ? conProblemas : todos.filter((p) => enPestana(p, pestana));
  const configs = conectada ? await configsWhatsApp() : [];
  const conWhatsApp = new Set(configs.map((c) => c.tienda_dominio));
  const tokensPorVencer = configs.filter(
    (c) => c.token_vence_en && new Date(c.token_vence_en).getTime() - Date.now() < 7 * 86_400_000,
  );
  const chats: Record<string, MensajeGuardado[]> = conectada
    ? await mensajesDePedidos(pedidos.map((p) => p.id!).filter(Boolean))
    : {};
  const subeSola = new Set(conectada ? (await tiendasConInterruptores()).filter((t) => t.auto_dropi).map((t) => t.dominio) : []);
  const ahora = new Date();
  // Estados de Dropi (sincronizados, sin datos personales): novedades abiertas y cómo va cada pedido.
  const ordenesDropi = conectada ? await ordenesDropiDesde(new Date(Date.now() - 120 * 86_400_000)) : [];
  const novedadesAbiertasN = ordenesDropi.filter(
    (o) => !o.es_prueba && new Date(o.creado_en).getTime() > Date.now() - 30 * 86_400_000 && etapa(o.estado) === "en_camino" && tieneNovedad(o),
  ).length;
  const dropiPorShopify = new Map(ordenesDropi.filter((o) => o.shop_order_id).map((o) => [String(o.shop_order_id), o]));
  const dropiPorId = new Map(ordenesDropi.map((o) => [String(o.id), o]));
  // ¿Ya se le mandó la confirmación? (para no reenviarla por error)
  const yaSeEnvio = (p: Pedido) =>
    Boolean(p.confirmacion_enviada_en) || (chats[p.id!] ?? []).some((m) => m.direccion === "saliente");
  const nombreTienda = (d: string) => nombres[d] ?? d.replace(".myshopify.com", "").toUpperCase();

  const conteo = (Object.keys(PESTANAS) as Pestana[]).map((t) => [t, todos.filter((p) => enPestana(p, t)).length] as const);

  return (
    <main>
      <h1>
        Bravo <span>IA</span>
      </h1>
      <p className="subtitulo">
        Pedidos de tus tiendas · <Link href="/panel" className="enlace">Panel</Link> ·{" "}
        <Link href="/novedades" className="enlace">Novedades{novedadesAbiertasN > 0 ? ` (${novedadesAbiertasN})` : ""}</Link> ·{" "}
        <Link href="/automatico" className="enlace">Piloto automático</Link> ·{" "}
        <Link href="/whatsapp" className="enlace">Configurar WhatsApp</Link>
      </p>

      {q.ok && <div className="listo caja">{q.ok}</div>}
      {q.error && <div className="problema caja">{q.error}</div>}

      {tokensPorVencer.map((c) => (
        <div key={c.tienda_dominio} className="problema caja">
          ⚠️ El token de WhatsApp de {nombreTienda(c.tienda_dominio)}{" "}
          {new Date(c.token_vence_en!).getTime() < Date.now() ? "ya venció" : `vence el ${fechaCorta(c.token_vence_en)}`}.{" "}
          <Link href={`/whatsapp?tienda=${encodeURIComponent(c.tienda_dominio)}`} className="enlace">Pegar uno nuevo</Link>
        </div>
      ))}

      {(conProblemas.length > 0 || verErrores) && (
        <div className={verErrores ? "caja" : "problema caja"}>
          {verErrores ? (
            <>
              🧰 Bandeja de errores: {conProblemas.length === 0 ? "todo en orden 🔥" : `${conProblemas.length} por resolver`} ·{" "}
              <Link href="/" className="enlace">Ver todos los pedidos</Link>
            </>
          ) : (
            <>
              🧰 {conProblemas.length === 1 ? "1 pedido necesita" : `${conProblemas.length} pedidos necesitan`} tu ayuda ·{" "}
              <Link href="/?ver=errores" className="enlace">Abrir bandeja de errores</Link>
            </>
          )}
        </div>
      )}

      {!conectada && (
        <div className="aviso">
          Estás viendo pedidos de ejemplo. Cuando conectemos la base de datos, aquí aparecen los pedidos reales de
          Shopify.
        </div>
      )}

      {!verErrores && (
        <div className="filtros">
          {conteo.filter(([t, n]) => n > 0 || PESTANAS[t].siempre || t === pestana).map(([t, n]) => (
            <Link key={t} href={t === "por_confirmar" ? "/" : `/?pestana=${t}`} className={`filtro${t === pestana ? " filtro-activo" : ""}`}>
              {PESTANAS[t].nombre} <b>{n}</b>
            </Link>
          ))}
        </div>
      )}

      {pedidos.length === 0 && (
        <p className="subtitulo">
          {todos.length === 0 ? "Todavía no han entrado pedidos." : "No hay pedidos en esta pestaña."}
        </p>
      )}

      {pedidos.map((p) => {
        const vinc = vinculos[p.tienda_dominio] ?? [];
        const sinVincular = p.items.filter(
          (i) => i.shopify_variant_id && !vinc.some((v) => v.shopify_variant_id === i.shopify_variant_id),
        );
        const enDropi = Boolean(p.dropi_order_id);
        const puedeSubir = p.estado === "confirmado" || (p.estado === "error" && Boolean(p.error_dropi));

        return (
          <article key={`${p.tienda_dominio}-${p.shopify_order_id}`} className="pedido">
            <div className="pedido-cabeza">
              <div>
                <div className="pedido-nombre">{p.nombre_clienta}</div>
                <div className="pedido-meta">
                  {nombreTienda(p.tienda_dominio)} · {p.numero} · {p.ciudad ?? "Sin ciudad"} · {formatoPesos(p.total)}
                </div>
              </div>
              <span className={`estado estado-${p.estado}`}>{NOMBRE_ESTADO[p.estado]}</span>
            </div>

            {verErrores && (
              <div className="filtros chips">
                {problemas(p).map((x) => (
                  <span key={x} className="filtro chip-error">{x}</span>
                ))}
              </div>
            )}
            {!p.telefono && (
              <div className="problema">
                Número no válido: “{p.telefono_original ?? "vacío"}”. {problemaTelefono(p.telefono_original)} Corrígelo en
                “Editar datos”.
              </div>
            )}
            {p.error_whatsapp && (p.estado === "por_confirmar" || p.estado === "sin_respuesta") && (
              <div className="problema">
                No se pudo enviar el WhatsApp: {p.error_whatsapp}{" "}
                {p.telefono && (
                  <a href={`tel:+${p.telefono}`} className="enlace">📞 Llamar</a>
                )}
              </div>
            )}
            {p.estado === "por_confirmar" && (p.seguimientos_enviados ?? 0) > 0 && (
              <div className="espera">
                📨 Seguimiento {p.seguimientos_enviados} de 3 enviado
                {p.descuento_valor && p.descuento_vence_en
                  ? ` · descuento de ${formatoPesos(Number(p.descuento_valor))} ${new Date(p.descuento_vence_en) > ahora ? `hasta el ${fechaHora(p.descuento_vence_en)}` : "(ya venció)"}`
                  : ""}
              </div>
            )}
            {p.descuento_aplicado && p.total_original && (
              <div className="listo">
                🛍 Confirmó con descuento: {formatoPesos(Number(p.total_original))} → {formatoPesos(Number(p.total))}
              </div>
            )}
            {p.atencion_vendedor && !enDropi && (
              <div className="problema">
                🤖 La IA te necesita: {p.atencion_vendedor}
                <form action={atencionResuelta} className="enlinea">
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit">Ya lo resolví</button>
                </form>
              </div>
            )}
            {p.error_dropi && <div className="problema">Dropi: {p.error_dropi}</div>}
            {p.dropi_en_pausa && p.estado === "confirmado" && !enDropi && (
              <div className="problema">
                ⏸ Subida a Dropi detenida. {p.dropi_en_pausa} Revisa el chat, corrige los datos si hace falta y toca
                “Subir a Dropi” o “Todo bien, que siga sola”.
              </div>
            )}
            {!p.dropi_en_pausa && p.estado === "confirmado" && !enDropi && p.confirmado_en && subeSola.has(p.tienda_dominio) && (
              <div className="espera">
                {minutosParaSubir(p.confirmado_en, ahora) > 0
                  ? `⏳ Se sube a Dropi sola en ${minutosParaSubir(p.confirmado_en, ahora)} min.`
                  : "⏳ Subiéndose a Dropi en el próximo minuto."}
              </div>
            )}
            {enDropi && <div className="listo">✓ En Dropi con el pedido N.º {p.dropi_order_id}</div>}
            {(() => {
              // Cómo va en Dropi (también si lo subió la app de Dropi en Shopify).
              const o = (p.dropi_order_id && dropiPorId.get(String(p.dropi_order_id))) || dropiPorShopify.get(String(p.shopify_order_id));
              if (!o) return null;
              const e = etapa(o.estado);
              const color = e === "entregado" ? "var(--ok)" : e === "devuelto" ? "var(--error)" : "var(--acento)";
              return (
                <div className="estado-dropi" style={{ color }}>
                  📦 Dropi: {estadoBonito(o.estado)}
                  {o.transportadora ? ` · ${o.transportadora}` : ""}
                  {tieneNovedad(o) && e === "en_camino" ? (
                    <> · <Link href="/novedades" className="enlace">⚠️ Novedad</Link></>
                  ) : null}
                </div>
              );
            })()}

            {conectada && !enDropi && sinVincular.map((i) => (
              <form key={i.shopify_variant_id} action={vincularProducto} className="vincular">
                <div className="vincular-titulo">
                  ¿Qué producto de Dropi es “{i.producto}{i.variante ? ` · ${i.variante}` : ""}”?
                </div>
                <input type="hidden" name="tienda" value={p.tienda_dominio} />
                <input type="hidden" name="variante" value={String(i.shopify_variant_id)} />
                <input name="dropi_producto" inputMode="numeric" placeholder="ID del producto en Dropi" required />
                <input name="dropi_variacion" inputMode="numeric" placeholder="ID de la variación (si tiene)" />
                <button type="submit">Guardar</button>
              </form>
            ))}

            {conectada && (
              <div className="botones">
                {p.estado === "por_confirmar" && conWhatsApp.has(p.tienda_dominio) && p.telefono && !yaSeEnvio(p) && (
                  <form action={enviarConfirmacionWhatsApp}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="principal">Enviar confirmación por WhatsApp 📦</button>
                  </form>
                )}
                {p.estado === "por_confirmar" && (
                  <form action={marcarConfirmado}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="principal">La clienta confirmó ✅</button>
                  </form>
                )}
                {puedeSubir && !enDropi && (
                  <form action={subirADropi}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="principal">
                      {p.estado === "error" ? "Reintentar subir a Dropi" : "Subir a Dropi 🚚"}
                    </button>
                  </form>
                )}
                {p.estado === "confirmado" && !enDropi && p.dropi_en_pausa && subeSola.has(p.tienda_dominio) && (
                  <form action={quitarPausaDropi}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit">Todo bien, que siga sola</button>
                  </form>
                )}
                {p.estado === "confirmado" && !enDropi && (
                  <form action={volverAPorConfirmar}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit">Aún no confirma</button>
                  </form>
                )}
              </div>
            )}

            {(chats[p.id!] ?? []).length > 0 && (
              <details open={(chats[p.id!] ?? []).some((m) => m.direccion === "entrante")}>
                <summary>Chat de WhatsApp ({chats[p.id!].length})</summary>
                <div className="chat">
                  {chats[p.id!].map((m, i) => (
                    <div key={i} className={`burbuja ${m.direccion}`}>{m.texto}</div>
                  ))}
                </div>
              </details>
            )}

            <details>
              <summary>Ver mensaje de confirmación</summary>
              <pre className="mensaje">{mensajeConfirmacion(p)}</pre>
            </details>

            {conectada && !enDropi && (
              <details open={verErrores && problemas(p).some((x) => /Número|ciudad|dirección|Dropi lo rechazó|no le llegó/.test(x))}>
                <summary>Editar datos</summary>
                <form action={editarDatos} className="editar">
                  <input type="hidden" name="id" value={p.id} />
                  <label>Nombre<input name="nombre" defaultValue={p.nombre_clienta} /></label>
                  <label>Celular<input name="telefono" inputMode="tel" defaultValue={p.telefono_original ?? ""} /></label>
                  <label>Departamento<input name="departamento" defaultValue={p.departamento ?? ""} /></label>
                  <label>Ciudad<input name="ciudad" defaultValue={p.ciudad ?? ""} /></label>
                  <label>Dirección<input name="direccion" defaultValue={p.direccion ?? ""} /></label>
                  <button type="submit">Guardar cambios</button>
                </form>
              </details>
            )}

            {conectada && p.estado === "por_confirmar" && conWhatsApp.has(p.tienda_dominio) && p.telefono && yaSeEnvio(p) && (
              <details>
                <summary>La confirmación ya se envió · ¿Reenviar?</summary>
                <form action={enviarConfirmacionWhatsApp}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit">Sí, reenviar la confirmación 📦</button>
                </form>
              </details>
            )}

            {conectada && !enDropi && p.estado !== "archivado" && (
              <form action={archivarPedido} className="enlinea">
                <input type="hidden" name="id" value={p.id} />
                <button type="submit">Ya lo atendí por mi cuenta 📁</button>
              </form>
            )}
            {conectada && p.estado === "archivado" && (
              <>
                <div className="pedido-meta">📁 Lo atendiste por tu cuenta: la app no le escribe a esta clienta.</div>
                <form action={desarchivarPedido} className="enlinea">
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit">Devolver a “Por confirmar”</button>
                </form>
              </>
            )}

            {conectada && !enDropi && (
              <details>
                <summary>Borrar pedido</summary>
                <form action={eliminarPedido}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="peligro">Sí, borrar este pedido de la app</button>
                </form>
              </details>
            )}
          </article>
        );
      })}
    </main>
  );
}
