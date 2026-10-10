import { describe, it, expect } from "vitest";
import { parseTransactionCandidates } from "../ocrLineParser.js";

const today = new Date(2026, 9, 10, 12); // 10 oct 2026, misma fecha "actual" usada en el resto de la sesión

describe("parseTransactionCandidates", () => {
  it("separa descripción y monto cuando están en la misma línea", () => {
    const [c] = parseTransactionCandidates("Mercadona 45,30€", { today });
    expect(c.description).toBe("Mercadona");
    expect(c.amount).toBeCloseTo(45.3);
  });

  it("acepta el monto sin símbolo de moneda", () => {
    const [c] = parseTransactionCandidates("Netflix 12,99", { today });
    expect(c.description).toBe("Netflix");
    expect(c.amount).toBeCloseTo(12.99);
  });

  it("ignora el signo: el monto siempre queda positivo", () => {
    const [c] = parseTransactionCandidates("Nómina -1.234,56", { today });
    expect(c.amount).toBeCloseTo(1234.56);
  });

  it("acepta miles con punto y decimales con coma", () => {
    const [c] = parseTransactionCandidates("Alquiler 1.234,56", { today });
    expect(c.amount).toBeCloseTo(1234.56);
  });

  it("reconoce un guión largo como el signo del monto (el OCR a veces lee el '-' de un negativo como '—')", () => {
    const [c] = parseTransactionCandidates("Market Pamplona —22,22€", { today });
    expect(c.description).toBe("Market Pamplona");
    expect(c.amount).toBeCloseTo(22.22);
  });

  it("también saca un guión largo que quedara suelto antes del monto (no solo el que hace de signo)", () => {
    const [c] = parseTransactionCandidates("Market Pamplona —-22,22€", { today });
    expect(c.description).toBe("Market Pamplona");
  });

  it("deja el monto en null si no hay nada con pinta de dinero, y no genera un candidato suelto", () => {
    // "Saldo disponible" sola, sin que después aparezca un monto, no es una
    // transacción: queda acumulada como posible descripción y se descarta.
    const candidates = parseTransactionCandidates("Saldo disponible", { today });
    expect(candidates).toHaveLength(0);
  });

  // Layout real de un banco: fecha en su propia línea, descripción+monto
  // juntos en la siguiente (ver captura "Tarjetas").
  it("layout de 2 líneas: fecha aparte, descripción+monto juntos", () => {
    const text = [
      "Jueves, 8 oct",
      "Market Pamplona                            -22,22€",
      "Miércoles, 7 oct",
      "Mercadona Avda                             -40,10€",
    ].join("\n");
    const candidates = parseTransactionCandidates(text, { today });
    expect(candidates).toHaveLength(2);
    expect(candidates[0].description).toBe("Market Pamplona");
    expect(candidates[0].amount).toBeCloseTo(22.22);
    expect(new Date(candidates[0].date).getMonth()).toBe(9); // octubre
    expect(new Date(candidates[0].date).getDate()).toBe(8);
    expect(candidates[1].description).toBe("Mercadona Avda");
  });

  // Una línea de interfaz entre dos transacciones (ej. "Ver opciones de
  // fraccionar pago") no debería generar un paso falso en el asistente.
  it("descarta texto de interfaz entre transacciones (sin monto propio)", () => {
    const text = [
      "Sábado, 3 oct",
      "El Corte Ingles                            -63,74€",
      "Ver opciones de fraccionar pago",
      "Martes, 29 sept",
      "Mercadona Avda                             -18,06€",
    ].join("\n");
    const candidates = parseTransactionCandidates(text, { today });
    expect(candidates).toHaveLength(2);
    expect(candidates.some((c) => c.description.includes("fraccionar"))).toBe(false);
  });

  // Layout real de otro banco: fecha, descripción y monto en 3 líneas
  // separadas, con el código de moneda ("COP") pegado al monto.
  it("layout de 3 líneas: fecha, descripción y monto en líneas separadas", () => {
    const text = [
      "14 SEPT 2026",
      "TRASLADO DE FONDO DE INVERS",
      "COP $ 500.000,00",
      "08 SEPT 2026",
      "PAGO QR ENTREVIDA",
      "COP -$ 125.000,00",
    ].join("\n");
    const candidates = parseTransactionCandidates(text, { today });
    expect(candidates).toHaveLength(2);
    expect(candidates[0].description).toBe("TRASLADO DE FONDO DE INVERS");
    expect(candidates[0].amount).toBeCloseTo(500000);
    expect(new Date(candidates[0].date).getFullYear()).toBe(2026);
    expect(new Date(candidates[0].date).getMonth()).toBe(8); // septiembre
    expect(candidates[1].description).toBe("PAGO QR ENTREVIDA");
    expect(candidates[1].amount).toBeCloseTo(125000);
  });

  it("un año suelto en su propia línea se usa para las fechas sin año explícito", () => {
    const text = ["Jueves, 8 oct", "2026", "Market Pamplona -22,22€"].join("\n");
    const [c] = parseTransactionCandidates(text, { today });
    expect(new Date(c.date).getFullYear()).toBe(2026);
  });

  it("sin ningún año visto, asume el actual salvo que quede en el futuro", () => {
    // "today" está en octubre 2026 — "15 nov" sin año sería futuro, así que
    // tiene que asumir 2025, no 2026.
    const text = ["15 nov", "Compra -10,00€"].join("\n");
    const [c] = parseTransactionCandidates(text, { today });
    expect(new Date(c.date).getFullYear()).toBe(2025);
  });
});
