import { describe, expect, it } from "vitest";
import { avisoMinimo, colorTasa, nivelEntrega, tasaMinima, tasaMinimaCalculada } from "../lib/tasas";

describe("punto de equilibrio", () => {
  it("(flete + CPA) ÷ (precio − costo)", () => {
    // 99.900 − 36.000 = 63.900 de ganancia; flete 13.000 + CPA 15.000 = 28.000 → 44 %
    expect(tasaMinimaCalculada({ precio: 99900, costo: 36000, flete: 13000, cpa: 15000, tasa_minima: null })).toBe(44);
    expect(tasaMinimaCalculada({ precio: 99900, costo: null, flete: 13000, cpa: null, tasa_minima: null })).toBeNull();
  });
  it("si el vendedor escribe su mínimo, manda el de él", () => {
    expect(tasaMinima({ precio: 99900, costo: 36000, flete: 13000, cpa: 15000, tasa_minima: 50 })).toEqual({ valor: 50, propia: true });
  });
});

describe("semáforo de entrega", () => {
  it("Leyenda desde 90 con verde intenso", () => {
    expect(nivelEntrega(92, 44, false)).toMatchObject({ nombre: "Leyenda 🔥", leyenda: true, color: "#00e676" });
    expect(nivelEntrega(86, 44, false).nombre).toBe("Excelente");
    expect(nivelEntrega(75, 44, false).nombre).toBe("Bien, pero ojo");
  });
  it("solo habla de perder plata si conoce el CPA", () => {
    expect(nivelEntrega(49, 44, false).nombre).toBe("En riesgo (faltan 5 puntos para tu mínimo)");
    expect(nivelEntrega(49, 44, true).nombre).toBe("En riesgo (faltan 5 puntos para perder)");
    expect(nivelEntrega(40, 44, false).nombre).toBe("Por debajo de tu tasa mínima");
    expect(nivelEntrega(40, 44, true).nombre).toBe("Perdiendo plata");
  });
  it("el color cambia de a poquito y ninguno se repite entre niveles", () => {
    expect(colorTasa(85)).toBe("#4cd18a");
    expect(colorTasa(70)).toBe("#f0b90b");
    expect(colorTasa(77)).not.toBe(colorTasa(78));
    expect(colorTasa(30, 44)).toBe("#ff6b5e");
  });
  it("avisos al acercarse y al cruzar el mínimo", () => {
    expect(avisoMinimo(49, 44, "el cubresofá")).toBe("Tu tasa de entrega va en 49 %, se está acercando a tu límite del 44 %.");
    expect(avisoMinimo(40, 44, "el cubresofá")).toBe("Bajaste de tu tasa mínima con el cubresofá.");
    expect(avisoMinimo(80, 44, "x")).toBeNull();
  });
});
