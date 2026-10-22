import { dateInputValueInZone } from "./helpers.jsx";

// Espejo en JS de las vistas de Postgres mm_account_totals/
// mm_category_month_totals/mm_account_month_totals — ahora que la lectura
// es local-first (ver localDb.js), estos agregados se recalculan acá en vez
// de pedírselos al servidor. Mismo criterio de siempre: sumar `amount_main`
// (nunca `amount`), filtrar `deleted`, y el mismo patrón de "contribución
// por fila" que ya usaba `computeCreditCardBalance` (evenCapitalData.js).
// Con a lo sumo unos miles de transacciones por usuario, un filter/reduce
// directo alcanza de sobra — no hace falta ninguna optimización.

function monthKeyOf(t) {
  const key = dateInputValueInZone(new Date(t.date).getTime(), t.timezone); // "YYYY-MM-DD"
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

// Una fila por cuenta — toda transacción de una cuenta queda en SU moneda,
// así que este total ya está en la moneda de esa cuenta (ver comentario de
// accountBalance en evenCapitalData.js), no hace falta agrupar por moneda.
export function computeAccountTotals(transactions) {
  const map = new Map();
  const add = (accountId, amount) => map.set(accountId, (map.get(accountId) || 0) + amount);
  for (const t of transactions) {
    if (t.deleted) continue;
    if (t.type === "income" && t.account_id) add(t.account_id, t.amount_main);
    else if ((t.type === "expense" || t.type === "transfer") && t.account_id) add(t.account_id, -t.amount_main);
    if (t.type === "transfer" && t.to_account_id) add(t.to_account_id, t.amount_main);
  }
  return [...map.entries()].map(([account_id, total]) => ({ account_id, total }));
}

// Por (año, mes, categoría) de un tipo (income/expense) en una moneda
// principal — filtra por la moneda de la cuenta de cada transacción, mismo
// criterio que ya usaba `aggregateByCategory` (Fase 2 multi-moneda).
// `accounts` se pasa para resolver esa moneda; se recorta a un (year,month)
// o a un category_id puntual del lado de quien llama (useStatsCategoryTotals/
// useCategoryTimeline), acá se calculan todos de una sola pasada.
export function computeCategoryMonthTotals(transactions, accounts, type, mainCurrency) {
  const map = new Map();
  for (const t of transactions) {
    if (t.deleted || t.type !== type) continue;
    if (accounts.find((a) => a.id === t.account_id)?.currency !== mainCurrency) continue;
    const { year, month } = monthKeyOf(t);
    const categoryId = t.category_id ?? null;
    const key = `${year}-${month}-${categoryId}`;
    const amount = t.amount_main ?? t.amount;
    const prev = map.get(key);
    map.set(key, { year, month, category_id: categoryId, total: (prev?.total || 0) + amount });
  }
  return [...map.values()];
}

// Por (año, mes) de UNA cuenta puntual — deposits/withdrawals/net, mismo
// shape que ya consume AccountActivityScreen.jsx.
export function computeAccountMonthTotals(transactions, accountId) {
  const map = new Map();
  for (const t of transactions) {
    if (t.deleted) continue;
    let contribution;
    if (t.type === "income" && t.account_id === accountId) contribution = t.amount_main;
    else if ((t.type === "expense" || t.type === "transfer") && t.account_id === accountId) contribution = -t.amount_main;
    else if (t.type === "transfer" && t.to_account_id === accountId) contribution = t.amount_main;
    else continue;
    const { year, month } = monthKeyOf(t);
    const key = `${year}-${month}`;
    const row = map.get(key) || { year, month, deposits: 0, withdrawals: 0 };
    if (contribution >= 0) row.deposits += contribution;
    else row.withdrawals += -contribution;
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ ...r, net: r.deposits - r.withdrawals }));
}
