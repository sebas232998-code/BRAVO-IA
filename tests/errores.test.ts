import { describe, expect, it } from "vitest";
import { limpiarCiudad, seParecen } from "../lib/ciudades";
import { ciudadDropi } from "../lib/dropi";
import { normalizarTelefono, primerTelefonoValido, problemaTelefono } from "../lib/telefono";
import { convertirPedido } from "../lib/shopify";
import { extraerEstados } from "../lib/whatsapp";

describe("teléfonos", () => {
  it("arregla los errores comunes", () => {
    expect(normalizarTelefono("+57 57 300 123 4567")).toBe("573001234567");
    expect(normalizarTelefono("03001234567")).toBe("573001234567");
    expect(normalizarTelefono("300 123 4567 / 310 987 6543")).toBe("573001234567");
    expect(normalizarTelefono("fijo 6044441234 o 3109876543")).toBe("573109876543");
  });
  it("usa otro número del pedido si el de envío está malo", () => {
    expect(primerTelefonoValido(["30012345", null, "310 987 6543"])).toBe("573109876543");
    const p = convertirPedido(
      {
        id: 1, name: "#1", created_at: "2026-11-16T10:00:00Z", total_price: "1000", currency: "COP",
        customer: { phone: "+573109876543" },
        shipping_address: { first_name: "Ana", city: "Cali", phone: "30012345" },
        line_items: [],
      },
      "t",
    );
    expect(p.telefono).toBe("573109876543");
    expect(p.telefono_original).toBe("+573109876543");
  });
  it("explica por qué un número no sirve", () => {
    expect(problemaTelefono("300123456")).toMatch(/falta un dígito/);
    expect(problemaTelefono("30012345678")).toMatch(/sobra un dígito/);
    expect(problemaTelefono("604 444 1234")).toMatch(/fijo/);
    expect(problemaTelefono("")).toMatch(/no escribió/);
  });
});

describe("ciudades", () => {
  it("quita el departamento pegado a la ciudad", () => {
    expect(limpiarCiudad("Cali, Valle del Cauca", "Valle del Cauca")).toBe("CALI");
    expect(limpiarCiudad("Medellín - Antioquia", "Antioquia")).toBe("MEDELLIN");
    expect(limpiarCiudad("Medellin-Antioquia", null)).toBe("MEDELLIN");
    expect(limpiarCiudad("Cali Valle", "Valle del Cauca")).toBe("CALI");
    expect(limpiarCiudad("Arauca Arauca", "Arauca")).toBe("ARAUCA");
  });
  it("no daña municipios que terminan como su departamento", () => {
    expect(limpiarCiudad("San José del Guaviare", "Guaviare")).toBe("SAN JOSE DEL GUAVIARE");
    expect(limpiarCiudad("Puerto Boyacá", "Boyacá")).toBe("PUERTO BOYACA");
    expect(limpiarCiudad("Nariño", "Nariño")).toBe("NARIÑO");
    expect(limpiarCiudad("Santander de Quilichao", "Cauca")).toBe("SANTANDER DE QUILICHAO");
  });
  it("entiende los apodos", () => {
    expect(limpiarCiudad("Medallo", "Antioquia")).toBe("MEDELLIN");
    expect(limpiarCiudad("B/quilla", null)).toBe("BARRANQUILLA");
    expect(limpiarCiudad("villavo", "Meta")).toBe("VILLAVICENCIO");
  });
  it("Bogotá sigue funcionando", () => {
    expect(ciudadDropi("Bogotá, D.C.", "Bogotá, D.C.")).toBe("BOGOTA");
  });
  it("solo aprende correcciones de ortografía, no cambios de ciudad", () => {
    expect(seParecen("Medalo", "Medellín")).toBe(true);
    expect(seParecen("Bucaramnga", "Bucaramanga")).toBe(true);
    expect(seParecen("Cali", "Palmira")).toBe(false);
    expect(seParecen("Bello", "Itagüí")).toBe(false);
  });
});

describe("avisos de entrega de Meta", () => {
  it("detecta el número sin WhatsApp", () => {
    const estados = extraerEstados({
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: "123" },
        statuses: [
          { id: "wamid.1", status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] },
          { id: "wamid.2", status: "read" },
        ],
      } }] }],
    });
    expect(estados[0]).toMatchObject({ wa_id: "wamid.1", estado: "failed" });
    expect(estados[0].error).toMatch(/no tiene WhatsApp/);
    expect(estados[1]).toMatchObject({ estado: "read", error: null });
  });
});
