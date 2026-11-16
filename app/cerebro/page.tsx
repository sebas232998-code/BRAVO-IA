import Link from "next/link";
import { baseConfigurada, tiendasConInterruptores } from "@/lib/db";
import { guardarCerebroTienda } from "./acciones";

export const dynamic = "force-dynamic";

const QUE_ESCRIBIR = [
  "Cuánto se demora en llegar (por ejemplo: ciudades principales 2 a 4 días hábiles, otras 4 a 7)",
  "Si tiene garantía y qué cubre",
  "Si se puede cambiar o devolver, y cómo",
  "Cómo se paga (contraentrega, efectivo al repartidor)",
  "Medidas, materiales, cómo se lava o se usa",
  "Respuestas a las preguntas que más te hacen",
];

export default async function Cerebro({ searchParams }: { searchParams: Promise<{ tienda?: string; ok?: string }> }) {
  const q = await searchParams;
  if (!baseConfigurada()) return <main><h1>Cerebro de la tienda</h1><div className="aviso">Primero hay que conectar la base de datos.</div></main>;
  const tiendas = await tiendasConInterruptores();
  const t = tiendas.find((x) => x.dominio === q.tienda) ?? tiendas[0];

  return (
    <main>
      <p><Link href="/automatico" className="volver">← Piloto automático</Link></p>
      <h1>
        Cerebro de la <span>tienda</span>
      </h1>
      <p className="subtitulo">
        Lo que la IA puede responderle a la clienta. Responde solo con lo que esté aquí; lo que no esté, te lo pregunta a
        ti. Nunca inventa.
      </p>
      {q.ok && <div className="listo caja">{q.ok}</div>}

      {tiendas.length > 1 && (
        <div className="filtros">
          {tiendas.map((x) => (
            <Link key={x.dominio} href={`/cerebro?tienda=${encodeURIComponent(x.dominio)}`} className={`filtro${x.dominio === t?.dominio ? " filtro-activo" : ""}`}>
              {x.nombre}
            </Link>
          ))}
        </div>
      )}

      {t && (
        <section className="pedido">
          <div className="pedido-nombre">{t.nombre}</div>
          <form action={guardarCerebroTienda} className="editar">
            <input type="hidden" name="tienda" value={t.dominio} />
            <textarea name="cerebro" rows={16} defaultValue={t.cerebro ?? ""} placeholder="Escribe aquí, con tus palabras, lo que la IA puede contestar." />
            <button type="submit" className="principal">Guardar</button>
          </form>
          <details open={!t.cerebro}>
            <summary>¿Qué escribo?</summary>
            <ul className="reglas">
              {QUE_ESCRIBIR.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </details>
          <p className="pedido-meta">Después de guardar, pruébalo en <Link href="/probar-ia" className="enlace">Probar la IA</Link>.</p>
        </section>
      )}
    </main>
  );
}
