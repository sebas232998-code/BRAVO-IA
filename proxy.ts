import { NextResponse, type NextRequest } from "next/server";

// Protege la app con una contraseña (variable APP_PASSWORD), porque muestra datos de clientas.
// Los webhooks quedan por fuera (se protegen con la firma de Shopify y Meta), igual que el reloj de tareas (clave CRON_SECRET).
export function proxy(req: NextRequest) {
  const clave = process.env.APP_PASSWORD;
  if (!clave) return NextResponse.next();

  const auth = req.headers.get("authorization") ?? "";
  const [tipo, valor] = auth.split(" ");
  if (tipo === "Basic" && valor) {
    const [, pass] = atob(valor).split(":");
    if (pass === clave) return NextResponse.next();
  }
  return new NextResponse("Necesitas la contraseña de Bravo IA", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Bravo IA"' },
  });
}

export const config = {
  matcher: ["/((?!api/webhooks|api/tareas|api/dropi/diagnostico|api/dropi/sincronizar|privacidad|eliminar-datos|manifest.webmanifest|icon-.*\\.png|_next/static|_next/image).*)"],
};
