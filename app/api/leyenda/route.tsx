import { ImageResponse } from "next/og";

// Imagen para historias (1080 × 1920) con el toro, el porcentaje y la marca. Sin datos de clientas ni plata.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const tasa = Math.min(100, Math.max(0, Math.round(Number(u.searchParams.get("tasa")) || 0)));
  const cuando = (u.searchParams.get("cuando") ?? "").slice(0, 40);
  // El toro se carga antes de dibujar (más seguro que dejar que la imagen lo descargue).
  let toro: string | null = null;
  try {
    const r = await fetch(new URL("/icon-512.png", req.url));
    if (r.ok) toro = `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    toro = null;
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(180deg, #0b0e11 0%, #10251a 100%)", color: "#eaecef",
        }}
      >
        {toro ? <img src={toro} width={300} height={300} style={{ borderRadius: 60 }} /> : <div style={{ display: "flex", height: 300 }} />}
        <div style={{ marginTop: 70, fontSize: 64, letterSpacing: 18, color: "#00E676", fontWeight: 700 }}>LEYENDA</div>
        <div
          style={{
            marginTop: 50, width: 560, height: 560, borderRadius: 280, border: "34px solid #00E676", display: "flex",
            alignItems: "center", justifyContent: "center", boxShadow: "0 0 90px rgba(0,230,118,0.55)",
          }}
        >
          <div style={{ fontSize: 170, fontWeight: 800 }}>{`${tasa}%`}</div>
        </div>
        <div style={{ marginTop: 60, fontSize: 56, fontWeight: 700 }}>de tasa de entrega</div>
        <div style={{ marginTop: 18, fontSize: 40, color: "#929aa5", display: "flex" }}>{cuando || " "}</div>
        <div style={{ marginTop: 130, display: "flex", fontSize: 58, fontWeight: 800 }}>
          Bravo<span style={{ color: "#f0b90b", marginLeft: 16 }}>IA</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 },
  );
}
