import Link from "next/link";
import { Compartir } from "./compartir";

export const dynamic = "force-dynamic";

export default async function Leyenda({ searchParams }: { searchParams: Promise<{ tasa?: string; cuando?: string }> }) {
  const q = await searchParams;
  const tasa = Math.min(100, Math.max(0, Math.round(Number(q.tasa) || 0)));
  const cuando = (q.cuando ?? "").slice(0, 40);
  const url = `/api/leyenda?tasa=${tasa}${cuando ? `&cuando=${encodeURIComponent(cuando)}` : ""}`;
  return (
    <main>
      <p><Link href="/panel" className="volver">← Panel</Link></p>
      <h1>
        Tu <span>Leyenda</span> 🔥
      </h1>
      <p className="subtitulo">Lista para tus historias de Instagram o TikTok. No muestra datos de clientas ni plata.</p>
      <img src={url} alt={`Leyenda: ${tasa} % de tasa de entrega`} className="imagen-leyenda" />
      <div className="botones">
        <Compartir url={url} />
        <a href={url} download="mi-leyenda-bravo-ia.png" className="enlace">Descargar</a>
      </div>
    </main>
  );
}
