import { afterEach, describe, expect, it, vi } from "vitest";
import { alargarToken } from "../lib/whatsapp";

// Simula las respuestas de Meta según la dirección que se llame.
function simularMeta(respuestas: { app?: unknown; debug?: unknown; cambio?: unknown }) {
  const llamadas: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    llamadas.push(url);
    const cuerpo = url.includes("/debug_token")
      ? respuestas.debug
      : url.includes("/oauth/access_token")
        ? respuestas.cambio
        : respuestas.app;
    return new Response(JSON.stringify(cuerpo ?? {}));
  });
  return llamadas;
}

afterEach(() => vi.unstubAllGlobals());
const ahora = new Date("2026-11-16T15:00:00Z");

describe("alargarToken", () => {
  it("cambia el token de 24 horas por uno de 60 días", async () => {
    const llamadas = simularMeta({
      app: { id: "1652716323154234" },
      debug: { data: { is_valid: true, expires_at: 1794900000 } },
      cambio: { access_token: "EAA-largo", expires_in: 60 * 86400 },
    });
    const r = await alargarToken("EAA-corto", "secreto", ahora);
    expect(r).toEqual({ ok: true, token: "EAA-largo", venceEn: "2027-01-15T15:00:00.000Z", cambiado: true });
    expect(llamadas[2]).toContain("client_id=1652716323154234");
    expect(llamadas[2]).toContain("fb_exchange_token=EAA-corto");
  });

  it("deja igual un token permanente", async () => {
    simularMeta({ app: { id: "1" }, debug: { data: { is_valid: true, expires_at: 0 } } });
    expect(await alargarToken("EAA-permanente", "secreto", ahora)).toEqual({
      ok: true,
      token: "EAA-permanente",
      venceEn: null,
      cambiado: false,
    });
  });

  it("avisa si el token ya venció", async () => {
    simularMeta({ app: { error: { code: 190, message: "Session has expired" } } });
    const r = await alargarToken("EAA-viejo", "secreto", ahora);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/venció/);
  });

  it("avisa si la clave secreta no es de esa app", async () => {
    simularMeta({ app: { id: "1" }, debug: { error: { code: 190, message: "Invalid OAuth access token" } } });
    const r = await alargarToken("EAA-corto", "otra", ahora);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/clave secreta/);
  });
});
