import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";

// Todo lo de Money Manager vive en tablas con prefijo mm_, separadas de las
// de Split Ledger a propósito (ver memoria "money-manager-categories-merge-pending":
// unificar categorías es una decisión pendiente, no algo ya resuelto).

const DEFAULT_SETTINGS = {
  main_currency: "EUR", secondary_currency: null, secondary_rate: null,
  month_start_day: 1, week_start_day: "sunday", autocomplete_notes: true, startup_tab: null,
};

export const WEEKDAY_OPTIONS = [
  { value: "sunday", label: "Domingo" },
  { value: "monday", label: "Lunes" },
];

// Lo que trae la app original de fábrica en una cuenta nueva — se crea sola
// la primera vez (mismo patrón que DEFAULT_CATEGORIES en Split Ledger).
const DEFAULT_EXPENSE_CATEGORIES = [
  "Comida", "Entretenimiento", "Gastos propios", "Transporte", "Cultura",
  "Mantenimiento del hogar", "Ropa", "Productos de belleza", "Salud",
  "Educación", "Regalos", "Otros",
];
const DEFAULT_INCOME_CATEGORIES = ["Dinero mensual", "Salario", "Dinero extra", "Otro"];
const DEFAULT_ACCOUNT_GROUPS = [
  { name: "Dinero en efectivo", type: "cash", account: "Dinero en efectivo" },
  { name: "Banco", type: "bank", account: "Cuentas bancarias" },
  { name: "Tarjetas de crédito", type: "credit_card", account: "Tarjetas de crédito" },
];

async function seedDefaults(userId) {
  const { data: newGroups, error: gError } = await supabase
    .from("mm_account_groups")
    .insert(DEFAULT_ACCOUNT_GROUPS.map((g, i) => ({ user_id: userId, name: g.name, type: g.type, sort_order: i })))
    .select("id, name");
  if (gError || !newGroups) return;

  await supabase.from("mm_accounts").insert(
    newGroups.map((g, i) => ({
      user_id: userId, group_id: g.id,
      name: DEFAULT_ACCOUNT_GROUPS.find((d) => d.name === g.name).account,
      sort_order: i,
    }))
  );

  await supabase.from("mm_categories").insert([
    ...DEFAULT_INCOME_CATEGORIES.map((name, i) => ({ user_id: userId, type: "income", name, sort_order: i })),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({ user_id: userId, type: "expense", name, sort_order: i })),
  ]);
}

export const ACCOUNT_TYPES = [
  { value: "cash", label: "Efectivo" },
  { value: "bank", label: "Banco" },
  { value: "credit_card", label: "Tarjeta de crédito" },
  { value: "debit_card", label: "Tarjeta de débito" },
  { value: "loan", label: "Préstamo" },
  { value: "credit_line", label: "Línea de crédito" },
  { value: "investment", label: "Inversión" },
  { value: "savings", label: "Ahorro" },
  { value: "insurance", label: "Seguro" },
  { value: "electronic_payment", label: "Pago electrónico" },
  { value: "other", label: "Otros" },
];

// Frecuencias — modelo genérico (unidad × intervalo) en vez de los casos
// especiales sueltos (Días de la semana / Fin de semana / Al final del mes)
// que mezcla la app original. "Cada 2 semanas" es un atajo fijo para el caso
// más común, separado de "Cada X semanas" (que cubre el resto) a propósito.
export const RECURRING_FREQUENCIES = [
  { value: "day-1", unit: "day", interval: 1, label: "Diario" },
  { value: "week-1", unit: "week", interval: 1, label: "Semanal" },
  { value: "week-2", unit: "week", interval: 2, label: "Cada 2 semanas" },
  { value: "week-x", unit: "week", interval: null, label: "Cada X semanas" },
  { value: "month-1", unit: "month", interval: 1, label: "Cada mes" },
  { value: "month-x", unit: "month", interval: null, label: "Cada X meses" },
  { value: "year-1", unit: "year", interval: 1, label: "Cada año" },
];

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// El día se "clampea" hacia abajo SOLO si el mes de destino no lo tiene
// (30 en un mes de 31 días queda en 30; 31 en abril cae en 30; 29/30/31 en
// febrero caen en 28 o 29 según corresponda) — nunca hacia arriba.
function addMonthsClamped(anchorDate, totalMonths) {
  const anchorDay = anchorDate.getDate();
  const targetYear = anchorDate.getFullYear() + Math.floor((anchorDate.getMonth() + totalMonths) / 12);
  const targetMonth = ((anchorDate.getMonth() + totalMonths) % 12 + 12) % 12;
  const day = Math.min(anchorDay, daysInMonth(targetYear, targetMonth));
  return new Date(targetYear, targetMonth, day, 12, 0, 0);
}

// Calcula la próxima ocurrencia después de `currentNext`, siempre reanclada a
// `startDate` (para meses/años) — así un mes corto no "corre" permanentemente
// el día ancla (ver addMonthsClamped).
export function nextOccurrence(startDate, unit, interval, currentNext) {
  if (unit === "day") { const d = new Date(currentNext); d.setDate(d.getDate() + interval); return d; }
  if (unit === "week") { const d = new Date(currentNext); d.setDate(d.getDate() + interval * 7); return d; }
  const stepMonths = unit === "year" ? interval * 12 : interval;
  const elapsedMonths = (currentNext.getFullYear() - startDate.getFullYear()) * 12 + (currentNext.getMonth() - startDate.getMonth());
  const stepsSoFar = Math.round(elapsedMonths / stepMonths);
  return addMonthsClamped(startDate, (stepsSoFar + 1) * stepMonths);
}

export function useMoneyManager(userId) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accountTotals, setAccountTotals] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    await generateDueRecurring(userId);
    // Los balances se agregan del lado del servidor (vista mm_account_totals,
    // ver .mm_views.sql) en vez de traer cada transacción y sumar acá — así
    // esta consulta siempre trae unas pocas filas (una por cuenta×moneda),
    // sin importar si tenés 2 mil o 20 mil transacciones.
    const [s, g, a, c, at, r] = await Promise.all([
      supabase.from("mm_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("mm_account_groups").select("*").eq("user_id", userId).eq("deleted", false).order("sort_order"),
      supabase.from("mm_accounts").select("*").eq("user_id", userId).eq("deleted", false).order("sort_order"),
      supabase.from("mm_categories").select("*").eq("user_id", userId).eq("deleted", false).order("sort_order"),
      supabase.from("mm_account_totals").select("*").eq("user_id", userId),
      supabase.from("mm_recurring").select("*").eq("user_id", userId).order("next_date"),
    ]);
    setSettings(s.data || DEFAULT_SETTINGS);
    setAccountTotals(at.data || []);
    setRecurring(r.data || []);

    // Cuenta recién creada, nunca usada — la sembramos con lo que trae la
    // app original de fábrica, en vez de dejarla completamente vacía.
    if ((g.data || []).length === 0 && (c.data || []).length === 0) {
      await seedDefaults(userId);
      const [g2, a2, c2] = await Promise.all([
        supabase.from("mm_account_groups").select("*").eq("user_id", userId).eq("deleted", false).order("sort_order"),
        supabase.from("mm_accounts").select("*").eq("user_id", userId).eq("deleted", false).order("sort_order"),
        supabase.from("mm_categories").select("*").eq("user_id", userId).eq("deleted", false).order("sort_order"),
      ]);
      setGroups(g2.data || []);
      setAccounts(a2.data || []);
      setCategories(c2.data || []);
    } else {
      setGroups(g.data || []);
      setAccounts(a.data || []);
      setCategories(c.data || []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { settings, groups, accounts, categories, accountTotals, recurring, loading, reload: load };
}

// Transacciones del mes visible (Transacciones/Diario) — se pide acotado por
// rango de fechas en vez de traer toda la tabla y filtrar en el navegador.
// Se refetchea cuando cambia el mes.
export function useMonthTransactions(userId, viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 1);
    const { data } = await supabase
      .from("mm_transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("deleted", false)
      .gte("date", start.toISOString())
      .lt("date", end.toISOString());
    setTransactions(data || []);
    setLoading(false);
  }, [userId, year, month]);

  useEffect(() => { load(); }, [load]);

  return { transactions, loading, reload: load };
}

// Totales por categoría del mes visible (Estadísticas) — agregados del lado
// del servidor (vista mm_category_month_totals, ver .mm_views.sql), filtrados
// por tipo (ingreso/gasto) + año/mes. Se refetchea al cambiar mes o tipo.
export function useCategoryMonthTotals(userId, viewMonth, type) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth() + 1;
  const [totals, setTotals] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("mm_category_month_totals")
      .select("*")
      .eq("user_id", userId)
      .eq("type", type)
      .eq("year", year)
      .eq("month", month);
    setTotals(data || []);
    setLoading(false);
  }, [userId, year, month, type]);

  useEffect(() => { load(); }, [load]);

  return { totals, loading };
}

// Se corre en silencio antes de cada carga: por cada recurrente vencida,
// crea la transacción real y avanza next_date (repite si quedaron varias
// vencidas mientras tanto), hasta ponerse al día o pasar end_date.
async function generateDueRecurring(userId) {
  const { data: due } = await supabase
    .from("mm_recurring")
    .select("*")
    .eq("user_id", userId)
    .lte("next_date", new Date().toISOString());
  if (!due || due.length === 0) return;

  for (const r of due) {
    let next = new Date(r.next_date);
    const start = new Date(r.start_date);
    const end = r.end_date ? new Date(r.end_date) : null;
    const toInsert = [];
    let guard = 0;
    while (next <= new Date() && (!end || next <= end) && guard < 365) {
      toInsert.push({
        user_id: userId, type: r.type, account_id: r.account_id, to_account_id: r.to_account_id,
        category_id: r.category_id, currency: r.currency, amount: r.amount,
        title: r.title, memo: r.memo, date: next.toISOString(),
      });
      next = nextOccurrence(start, r.repeat_unit, r.repeat_interval, next);
      guard += 1;
    }
    if (toInsert.length) await supabase.from("mm_transactions").insert(toInsert);
    if (end && next > end) {
      // Ya cumplió su end_date y generó todas sus ocurrencias — se borra de
      // verdad (no soft-delete: no hay pantalla de "papelera" que la use).
      await supabase.from("mm_recurring").delete().eq("id", r.id);
    } else {
      await supabase.from("mm_recurring").update({ next_date: next.toISOString() }).eq("id", r.id);
    }
  }
}

// Convierte un monto a la moneda principal usando la tasa guardada en mm_settings
// (misma idea que baseCurrency+rates en Split Ledger, pero acá solo hay 2 monedas).
export function toMainCurrency(amount, currency, settings) {
  if (!currency || currency === settings.main_currency) return amount;
  if (currency === settings.secondary_currency && settings.secondary_rate) return amount / settings.secondary_rate;
  return amount;
}

// accountTotals: filas de la vista mm_account_totals (una por cuenta×moneda,
// ya con el signo aplicado según ingreso/gasto/transferencia) — acá solo
// falta convertir cada moneda a la principal y sumar.
export function accountBalance(accountId, accountTotals, settings) {
  return accountTotals
    .filter((t) => t.account_id === accountId)
    .reduce((sum, t) => sum + toMainCurrency(t.total, t.currency, settings), 0);
}

export function groupBalance(groupId, accounts, accountTotals, settings) {
  return accounts
    .filter((a) => a.group_id === groupId)
    .reduce((sum, a) => sum + accountBalance(a.id, accountTotals, settings), 0);
}
