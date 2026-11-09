import { baseConfigurada, listarPedidos, nombresTiendas, vinculosDe } from "@/lib/db";
import { PEDIDOS_EJEMPLO } from "@/lib/ejemplo";
import { formatoPesos, mensajeConfirmacion } from "@/lib/mensajes";
import { ESTADOS, NOMBRE_ESTADO, type Pedido } from "@/lib/tipos";
import type { VinculoDropi } from "@/lib/dropi";
import {
  editarDatos,
  eliminarPedido,
  marcarConfirmado,
  subirADropi,
  vincularProducto,
  volverAPorConfirmar,
} from "./acciones";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const conectada = baseConfigurada();
  const pedidos: Pedido[] = conectada ? await listarPedidos() : PEDIDOS_EJEMPLO;
  const nombres = conectada ? await nombresTiendas() : {};
  const tiendas = [...new Set(pedidos.map((p) => p.tienda_dominio))];
  const vinculos: Record<string, VinculoDropi[]> = Object.fromEntries(
    await Promise.all(tiendas.map(async (t) => [t, conectada ? await vinculosDe(t) : []] as const)),
  );
  const nombreTienda = (d: string) => nombres[d] ?? d.replace(".myshopify.com", "").toUpperCase();

  const conteo = ESTADOS.map((e) => [e, pedidos.filter((p) => p.estado === e).length] as const).filter(
    ([, n]) => n > 0,
  );

  return (
    <main>
      <h1>
        Bravo <span>IA</span>
      </h1>
      <p className="subtitulo">Pedidos de tus tiendas</p>

      {!conectada && (
        <div className="aviso">
          Estás viendo pedidos de ejemplo. Cuando conectemos la base de datos, aquí aparecen los pedidos reales de
          Shopify.
        </div>
      )}

      <div className="filtros">
        {conteo.map(([estado, n]) => (
          <span key={estado} className="filtro">
            {NOMBRE_ESTADO[estado]} <b>{n}</b>
          </span>
        ))}
      </div>

      {pedidos.length === 0 && <p className="subtitulo">Todavía no han entrado pedidos.</p>}

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

            {!p.telefono && (
              <div className="problema">
                Número no válido: “{p.telefono_original ?? "vacío"}”. Corrígelo en “Editar datos”.
              </div>
            )}
            {p.error_dropi && <div className="problema">Dropi: {p.error_dropi}</div>}
            {enDropi && <div className="listo">✓ En Dropi con el pedido N.º {p.dropi_order_id}</div>}

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
                {p.estado === "confirmado" && !enDropi && (
                  <form action={volverAPorConfirmar}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit">Aún no confirma</button>
                  </form>
                )}
              </div>
            )}

            <details>
              <summary>Ver mensaje de confirmación</summary>
              <pre className="mensaje">{mensajeConfirmacion(p)}</pre>
            </details>

            {conectada && !enDropi && (
              <details>
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
