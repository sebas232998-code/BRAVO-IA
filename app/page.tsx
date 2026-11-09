import { baseConfigurada, listarPedidos } from "@/lib/db";
import { PEDIDOS_EJEMPLO } from "@/lib/ejemplo";
import { formatoPesos, mensajeConfirmacion } from "@/lib/mensajes";
import { ESTADOS, NOMBRE_ESTADO, type Pedido } from "@/lib/tipos";

export const dynamic = "force-dynamic";

function nombreTienda(dominio: string) {
  return dominio.replace(".myshopify.com", "").toUpperCase();
}

export default async function Inicio() {
  const conectada = baseConfigurada();
  const pedidos: Pedido[] = conectada ? await listarPedidos() : PEDIDOS_EJEMPLO;

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

      {pedidos.map((p) => (
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
              Número no válido: “{p.telefono_original ?? "vacío"}”. Hay que corregirlo para poder escribirle.
            </div>
          )}

          <details>
            <summary>Ver mensaje de confirmación</summary>
            <pre className="mensaje">{mensajeConfirmacion(p)}</pre>
          </details>
        </article>
      ))}
    </main>
  );
}
