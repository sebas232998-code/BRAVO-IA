import Link from "next/link";
import { baseConfigurada, novedadesEscritas } from "@/lib/db";
import { dropiConfigurado } from "@/lib/dropi";
import { enlaceWhatsApp, mensajeNovedad, novedadesAbiertas, type Novedad } from "@/lib/novedades";
import { marcarEscrita } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function haceCuanto(fecha: string | null): string {
  if (!fecha) return "";
  const h = Math.round((Date.now() - new Date(fecha).getTime()) / 3_600_000);
  if (h < 1) return "hace menos de una hora";
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

const titulo = (n: Novedad) => n.novedad ?? (n.estado === "RECLAME EN OFICINA" ? "Reclame en oficina" : n.estado);

export default async function Novedades({ searchParams }: { searchParams: Promise<{ tienda?: string }> }) {
  const q = await searchParams;
  if (!baseConfigurada() || !dropiConfigurado()) {
    return <main><h1>Novedades</h1><div className="aviso">Falta conectar la base de datos o el token de Dropi.</div></main>;
  }
  const { novedades, error } = await novedadesAbiertas();
  const escritas = await novedadesEscritas();
  const tiendas = [...new Set(novedades.map((n) => n.tienda).filter(Boolean) as string[])].sort();
  const tienda = q.tienda && tiendas.includes(q.tienda) ? q.tienda : null;
  // Primero las que llevan más tiempo y a las que no les has escrito.
  const lista = novedades
    .filter((n) => !tienda || n.tienda === tienda)
    .sort((a, b) => Number(Boolean(escritas[a.id])) - Number(Boolean(escritas[b.id])) || (a.desde ?? "").localeCompare(b.desde ?? ""));
  const pendientes = lista.filter((n) => !escritas[n.id]).length;

  return (
    <main>
      <p><Link href="/" className="volver">← Pedidos</Link></p>
      <h1>
        Novedades <span>{lista.length > 0 ? `· ${lista.length}` : ""}</span>
      </h1>
      <p className="subtitulo">
        Pedidos en camino con un problema reportado por la transportadora. Escríbele a la clienta hoy mismo: cada novedad
        que salves es un pedido que no se devuelve.
      </p>
      {error && <div className="problema caja">{error}</div>}

      {tiendas.length > 1 && (
        <div className="filtros">
          <Link href="/novedades" className={`filtro${!tienda ? " filtro-activo" : ""}`}>Todas</Link>
          {tiendas.map((t) => (
            <Link key={t} href={`/novedades?tienda=${encodeURIComponent(t)}`} className={`filtro${t === tienda ? " filtro-activo" : ""}`}>{t}</Link>
          ))}
        </div>
      )}

      {lista.length === 0 && !error && <div className="listo caja">No tienes novedades abiertas. 🔥</div>}
      {lista.length > 0 && (
        <p className="pedido-meta">
          {pendientes === 0 ? "Ya les escribiste a todas. ✓" : `Te faltan ${pendientes} por escribir.`}
        </p>
      )}

      {lista.map((n) => {
        const wa = enlaceWhatsApp(n);
        const escrita = escritas[n.id];
        return (
          <article key={n.id} className={`pedido${escrita ? " novedad-escrita" : ""}`}>
            <div className="pedido-cabeza">
              <div>
                <div className="pedido-nombre">{n.primerNombre || "Clienta"} · {n.ciudad ?? "Sin ciudad"}</div>
                <div className="pedido-meta">
                  {n.tienda ?? ""} · Dropi #{n.id} · {n.transportadora ?? ""}{n.guia ? ` · guía ${n.guia}` : ""}
                </div>
              </div>
              <span className="estado estado-error">{haceCuanto(n.desde)}</span>
            </div>
            <div className="problema">⚠️ {titulo(n)}</div>
            {n.producto && <div className="pedido-meta">{n.producto}</div>}
            {n.direccion && <div className="pedido-meta">Dirección: {n.direccion}</div>}

            <details>
              <summary>Ver el mensaje</summary>
              <pre className="mensaje">{mensajeNovedad(n)}</pre>
            </details>

            <div className="botones">
              {wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="boton-amarillo boton-wa">Escribirle por WhatsApp 💬</a>
              ) : (
                <span className="problema">El número no es válido en Dropi.</span>
              )}
              <form action={marcarEscrita}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="escrita" value={escrita ? "0" : "1"} />
                <button type="submit">{escrita ? `✓ Le escribiste ${haceCuanto(escrita)}` : "Ya le escribí"}</button>
              </form>
            </div>
          </article>
        );
      })}

      <p className="pedido-meta">
        Los datos de contacto se leen de Dropi al abrir esta pantalla y no se guardan en la app. Para corregir la dirección
        o pedir un nuevo intento, hazlo en Dropi.
      </p>
    </main>
  );
}
