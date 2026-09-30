import { describe, it, expect } from "vitest";
import { creditCardCycleStart, creditCardNextPaymentDate, computeCreditCardBalance } from "../moneyManagerData.js";

// Fecha de referencia con hora ≠ medianoche a propósito — las funciones bajo
// prueba construyen "hoy" a medianoche (new Date(y, m, day)), así que si
// comparáramos siempre contra medianoche no detectaríamos un `<` vs `<=`
// invertido por accidente.
const at = (y, m, d, h = 12) => new Date(y, m, d, h, 0, 0);

describe("creditCardCycleStart", () => {
  it("usa este mes si el día de corte ya pasó", () => {
    const start = creditCardCycleStart(10, at(2026, 2, 15)); // 15 mar, corte día 10
    expect(start).toEqual(new Date(2026, 2, 10));
  });

  it("hoy mismo cuenta como 'ya pasó'", () => {
    const start = creditCardCycleStart(15, at(2026, 2, 15));
    expect(start).toEqual(new Date(2026, 2, 15));
  });

  it("usa el mes anterior si el día de corte todavía no llega este mes", () => {
    const start = creditCardCycleStart(20, at(2026, 2, 15)); // 15 mar, corte día 20 → aún no llega
    expect(start).toEqual(new Date(2026, 1, 20)); // 20 feb
  });

  it("clampea el corte al último día real de un mes corto (mes anterior)", () => {
    // 5 mar, corte día 31 → todavía no llegó marzo 31, cae en febrero, que
    // en 2026 (no bisiesto) tiene 28 días.
    const start = creditCardCycleStart(31, at(2026, 2, 5));
    expect(start).toEqual(new Date(2026, 1, 28));
  });
});

describe("creditCardNextPaymentDate", () => {
  it("usa este mes si el día de pago todavía no llega", () => {
    const next = creditCardNextPaymentDate(20, at(2026, 2, 15)); // 15 mar, pago día 20
    expect(next).toEqual(new Date(2026, 2, 20));
  });

  it("hoy mismo cuenta como 'todavía no pasó' (paga hoy)", () => {
    const next = creditCardNextPaymentDate(15, at(2026, 2, 15));
    expect(next).toEqual(new Date(2026, 2, 15));
  });

  it("pasa al mes siguiente si el día de pago ya pasó este mes", () => {
    const next = creditCardNextPaymentDate(5, at(2026, 2, 15)); // 15 mar, pago día 5 → ya pasó
    expect(next).toEqual(new Date(2026, 3, 5)); // 5 abr
  });

  it("clampea al pasar a un mes siguiente más corto", () => {
    // 31 ene (enero tiene 31 días, día 30 no se clampea acá), pago día 30 ya
    // pasó → pasa a febrero, que en 2026 solo tiene 28.
    const next = creditCardNextPaymentDate(30, at(2026, 0, 31));
    expect(next).toEqual(new Date(2026, 1, 28));
  });

  it("cruza de diciembre a enero del año siguiente", () => {
    const next = creditCardNextPaymentDate(15, at(2026, 11, 20)); // 20 dic, pago día 15 → ya pasó
    expect(next).toEqual(new Date(2027, 0, 15));
  });

  it("no depende de la hora del día, solo del día calendario", () => {
    // Mismo día que "hoy", a las 23:50 — sigue contando como vigente, no
    // como "ya pasó" (comparación por día calendario, no por instante).
    const next = creditCardNextPaymentDate(15, new Date(2026, 2, 15, 23, 50));
    expect(next).toEqual(new Date(2026, 2, 15));
  });
});

describe("computeCreditCardBalance", () => {
  const CARD = "card-1";
  const tx = (overrides) => ({
    type: "expense", account_id: CARD, to_account_id: null,
    amount_main: 0, date: at(2026, 2, 1).toISOString(), timezone: "Europe/Madrid",
    ...overrides,
  });

  it("reparte gastos antes/después del corte en pasado/actual", () => {
    const transactions = [
      tx({ amount_main: 100, date: at(2026, 1, 20).toISOString() }), // antes del corte (10 mar)
      tx({ amount_main: 40, date: at(2026, 2, 15).toISOString() }),  // después del corte
    ];
    const { pasado, actual } = computeCreditCardBalance(CARD, transactions, 10, at(2026, 2, 20));
    expect(pasado).toBeCloseTo(-100);
    expect(actual).toBeCloseTo(-40);
  });

  it("un pago siempre reduce lo pasado, sin importar su fecha", () => {
    const transactions = [
      tx({ amount_main: 100, date: at(2026, 1, 20).toISOString() }), // deuda vieja
      tx({ type: "transfer", account_id: null, to_account_id: CARD, amount_main: 60, date: at(2026, 2, 18).toISOString() }), // pago, ya en el ciclo actual
    ];
    const { pasado, actual } = computeCreditCardBalance(CARD, transactions, 10, at(2026, 2, 20));
    expect(pasado).toBeCloseTo(-40); // 100 de deuda - 60 pagados
    expect(actual).toBeCloseTo(0);
  });

  it("si el pago excede lo pasado, el excedente pasa a actual", () => {
    const transactions = [
      tx({ amount_main: 100, date: at(2026, 1, 20).toISOString() }),
      tx({ type: "transfer", account_id: null, to_account_id: CARD, amount_main: 150, date: at(2026, 2, 18).toISOString() }),
    ];
    const { pasado, actual } = computeCreditCardBalance(CARD, transactions, 10, at(2026, 2, 20));
    expect(pasado).toBe(0);
    expect(actual).toBeCloseTo(50);
  });

  it("ignora transacciones que no tocan la cuenta", () => {
    const transactions = [tx({ account_id: "otra-cuenta", amount_main: 999 })];
    const { pasado, actual } = computeCreditCardBalance(CARD, transactions, 10, at(2026, 2, 20));
    expect(pasado).toBe(0);
    expect(actual).toBe(0);
  });
});
