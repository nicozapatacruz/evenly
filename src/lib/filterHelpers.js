import { parseAmountInput } from "./helpers.jsx";

// Forma compartida de los filtros — usada tanto por el Buscador (filtros
// server-side, ver searchTransactions en moneyManagerData.js) como por el
// filtro persistente de Transacciones/Estadísticas (filtra en el cliente
// sobre datos ya traídos, ver matchesFilters acá abajo). Mismo shape en los
// dos casos para no mantener dos definiciones de "qué es un filtro".
export const EMPTY_FILTERS = { accountIds: [], categoryIds: [], dateFrom: "", dateTo: "", amountMin: "", amountMax: "" };

export function hasActiveFilters(f) {
  return f.accountIds.length > 0 || f.categoryIds.length > 0 || f.dateFrom || f.dateTo || f.amountMin || f.amountMax;
}

// Ordena los arrays antes de comparar — togglear cuenta/categoría en otro
// orden (ej. sacar una del medio) no debería contar como "cambio" si el
// conjunto resultante es el mismo.
export function filtersEqual(a, b) {
  return [...a.accountIds].sort().join(",") === [...b.accountIds].sort().join(",")
    && [...a.categoryIds].sort().join(",") === [...b.categoryIds].sort().join(",")
    && a.dateFrom === b.dateFrom && a.dateTo === b.dateTo
    && a.amountMin === b.amountMin && a.amountMax === b.amountMax;
}

// Mismo criterio que searchTransactions (server-side), pero como predicado
// JS sobre una transacción ya traída — para el filtro persistente de
// Transacciones/Estadísticas, que filtra sobre datos ya cargados en vez de
// pedirle al servidor una consulta nueva.
export function matchesFilters(t, f) {
  if (f.accountIds.length && !(f.accountIds.includes(t.account_id) || f.accountIds.includes(t.to_account_id))) return false;
  if (f.categoryIds.length && !f.categoryIds.includes(t.category_id)) return false;
  if (f.dateFrom && new Date(t.date) < new Date(f.dateFrom)) return false;
  if (f.dateTo) {
    const end = new Date(f.dateTo);
    end.setDate(end.getDate() + 1);
    if (new Date(t.date) >= end) return false;
  }
  const amount = t.amount_main ?? t.amount;
  if (f.amountMin && amount < parseAmountInput(f.amountMin)) return false;
  if (f.amountMax && amount > parseAmountInput(f.amountMax)) return false;
  return true;
}
