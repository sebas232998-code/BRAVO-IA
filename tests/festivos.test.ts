import { describe, expect, it } from "vitest";
import { domingoDePascua, esDiaHabil, esFestivo, festivosDe, hoyColombia, sumarDiasHabiles } from "../lib/festivos";

describe("festivos de Colombia", () => {
  it("calcula la Pascua", () => {
    expect(domingoDePascua(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(domingoDePascua(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
  });

  it("2026 tiene los 18 festivos oficiales", () => {
    expect([...festivosDe(2026).keys()].sort()).toEqual([
      "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18",
      "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12",
      "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
    ]);
  });

  it("los que se corren al lunes", () => {
    expect(esFestivo("2026-11-16")).toBe("Independencia de Cartagena"); // 11 de nov cayó miércoles
    expect(esFestivo("2026-11-11")).toBeNull();
  });
});

describe("días hábiles", () => {
  it("salta fines de semana y festivos", () => {
    expect(esDiaHabil("2026-11-14")).toBe(false); // sábado
    expect(esDiaHabil("2026-11-16")).toBe(false); // festivo
    expect(esDiaHabil("2026-11-17")).toBe(true);
    // Viernes 13 + 2 días hábiles: salta sábado, domingo y el lunes festivo → miércoles 18
    expect(sumarDiasHabiles("2026-11-13", 2)).toBe("2026-11-18");
  });

  it("hoy en Colombia", () => {
    expect(hoyColombia(new Date("2026-11-17T03:00:00Z"))).toBe("2026-11-16"); // 10 p. m. en Colombia
  });
});
