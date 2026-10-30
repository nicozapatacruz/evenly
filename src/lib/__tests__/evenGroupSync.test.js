import { describe, it, expect } from "vitest";
import { groupLendOffsetPeriods } from "../evenGroupSync.js";

// Mismo motivo que en creditCard.test.js: hora ≠ medianoche a propósito.
const at = (y, m, d, h = 12) => new Date(y, m, d, h, 0, 0);

const leg = (accountId, amount, date, currency = "EUR") => ({
  role: "loan", account_id: accountId, amount, currency, date: date.getTime(),
});

describe("groupLendOffsetPeriods", () => {
  const CARD = "card-1";
  const accountsById = new Map([
    [CARD, { is_credit_card: true, statement_day: 10, payment_account_id: "pay-1" }],
  ]);

  it("agrupa y suma los legs de un mismo ciclo ya cerrado", () => {
    const legs = [
      leg(CARD, 30, at(2026, 8, 20)), // 20 sep, ciclo que cierra el 10 oct
      leg(CARD, 20, at(2026, 9, 1)),  // 1 oct, mismo ciclo
    ];
    const periods = groupLendOffsetPeriods(legs, accountsById, at(2026, 10, 15)); // hoy: 15 nov, ciclo ya cerró
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ lendAccountId: CARD, currency: "EUR", total: 50 });
    expect(periods[0].cycleStart).toEqual(new Date(2026, 8, 10));
  });

  it("no compensa un ciclo todavía abierto", () => {
    const legs = [leg(CARD, 30, at(2026, 9, 15))]; // 15 oct, ciclo abierto (cierra el 10 nov)
    const periods = groupLendOffsetPeriods(legs, accountsById, at(2026, 9, 20)); // hoy: 20 oct, mismo ciclo
    expect(periods).toHaveLength(0);
  });

  it("separa 2 tarjetas distintas aunque el vínculo haya cambiado de cuál es 'actual'", () => {
    const CARD_B = "card-2";
    const accounts = new Map([
      ...accountsById,
      [CARD_B, { is_credit_card: true, statement_day: 5, payment_account_id: "pay-2" }],
    ]);
    const legs = [
      leg(CARD, 30, at(2026, 8, 20)),   // tarjeta vieja, ciclo cerrado
      leg(CARD_B, 15, at(2026, 9, 12)), // tarjeta nueva, ciclo cerrado (cierre día 5)
    ];
    const periods = groupLendOffsetPeriods(legs, accounts, at(2026, 10, 15));
    expect(periods).toHaveLength(2);
    expect(periods.find((p) => p.lendAccountId === CARD)?.total).toBe(30);
    expect(periods.find((p) => p.lendAccountId === CARD_B)?.total).toBe(15);
  });

  it("no mezcla monedas distintas dentro del mismo ciclo", () => {
    const legs = [
      leg(CARD, 30, at(2026, 8, 20), "EUR"),
      leg(CARD, 40, at(2026, 8, 22), "USD"),
    ];
    const periods = groupLendOffsetPeriods(legs, accountsById, at(2026, 10, 15));
    expect(periods).toHaveLength(2);
    expect(periods.find((p) => p.currency === "EUR")?.total).toBe(30);
    expect(periods.find((p) => p.currency === "USD")?.total).toBe(40);
  });

  it("ignora una cuenta que no es tarjeta de crédito, sin reventar", () => {
    const notACard = new Map([["acc-1", { is_credit_card: false }]]);
    const legs = [leg("acc-1", 30, at(2026, 8, 20))];
    const periods = groupLendOffsetPeriods(legs, notACard, at(2026, 10, 15));
    expect(periods).toHaveLength(0);
  });

  it("ignora una tarjeta sin día de corte configurado", () => {
    const noStatementDay = new Map([[CARD, { is_credit_card: true, statement_day: null }]]);
    const legs = [leg(CARD, 30, at(2026, 8, 20))];
    const periods = groupLendOffsetPeriods(legs, noStatementDay, at(2026, 10, 15));
    expect(periods).toHaveLength(0);
  });

  it("descarta un período cuyo total neto quedó en 0 (préstamo y devolución del mismo monto)", () => {
    const legs = [
      leg(CARD, 30, at(2026, 8, 20)),
      leg(CARD, -30, at(2026, 8, 21)),
    ];
    const periods = groupLendOffsetPeriods(legs, accountsById, at(2026, 10, 15));
    expect(periods).toHaveLength(0);
  });
});
