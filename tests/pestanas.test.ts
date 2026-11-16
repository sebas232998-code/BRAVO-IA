import { describe, expect, it } from "vitest";
import { ESTADOS, PESTANAS } from "../lib/tipos";
import { problemasDe } from "../lib/bandeja";
import { PEDIDOS_EJEMPLO } from "../lib/ejemplo";

describe("pestañas del panel", () => {
  it("cada estado está en una sola pestaña (ningún pedido se pierde)", () => {
    for (const e of ESTADOS) {
      const en = Object.values(PESTANAS).filter((t) => (t.estados as readonly string[]).includes(e));
      expect(en.length, e).toBe(1);
    }
  });
  it("un pedido archivado no aparece en la bandeja de errores", () => {
    expect(problemasDe({ ...PEDIDOS_EJEMPLO[1], estado: "archivado" }, [])).toEqual([]);
  });
});
