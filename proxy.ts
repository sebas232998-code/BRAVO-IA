import { NextResponse, type NextRequest } from "next/server";

// Protege la app con una contraseña (variable APP_PASSWORD), porque muestra datos de clientas.
// El webhook de Shopify queda por fuera: ese se protege con la firma de Shopify.
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
  matcher: ["/((?!api/webhooks|manifest.webmanifest|icon.svg|_next/static|_next/image).*)"],
};
