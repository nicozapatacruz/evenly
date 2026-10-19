import { useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { supabase } from "./supabaseClient.js";
import { db } from "./localDb.js";
import { dateInputValueInZone, parseAmountInput, daysInMonth, monthsBefore, normalizeForSearch } from "./helpers.jsx";
import { hasActiveFilters, matchesFilters } from "./filterHelpers.js";
import { reconcileSplitLedger, getPendienteTcReviewItems, acknowledgePendienteTcReviewItem } from "./splitLedgerSync.js";
import { computeAccountTotals, computeCategoryMonthTotals, computeAccountMonthTotals } from "./localAggregates.js";
import { offlineSupabase } from "./offlineSupabase.js";
import { getIsOnline } from "./connectivity.js";

// Todo lo de Money Manager vive en tablas con prefijo mm_, separadas de las
// de Split Ledger a propósito (ver memoria "money-manager-categories-merge-pending":
// unificar categorías es una decisión pendiente, no algo ya resuelto).
//
// Lectura local-first (ver OFFLINE_PLAN): todos los hooks de acá abajo leen
// SIEMPRE de Dexie (localDb.js) vía useLiveQuery, nunca de Supabase directo
// — el único que trae datos frescos del servidor es syncEngine.js
// (runFullSync), disparado por `reload()`. Las escrituras pasan por
// offlineSupabase.js (ver ese archivo), nunca por `supabase` acá.

export const DEFAULT_SETTINGS = {
  main_currency: "EUR", other_currencies: [],
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

// Exportada: la llama syncEngine.js (solo durante un sync online real, nunca
// desde el cliente offline — sembrar cuentas/categorías por defecto no tiene
// sentido encolarlo, se hace una sola vez al confirmar que el usuario nunca
// tuvo nada en el servidor).
export async function seedDefaults(userId, mainCurrency) {
  const { data: newGroups, error: gError } = await supabase
    .from("mm_account_groups")
    .insert(DEFAULT_ACCOUNT_GROUPS.map((g, i) => ({ user_id: userId, name: g.name, type: g.type, sort_order: i })))
    .select("id, name");
  if (gError || !newGroups) return;

  // "currency" es NOT NULL sin default en mm_accounts -- sin esto, este
  // insert fallaba en silencio (no se chequea su error acá) y la cuenta de
  // cada grupo por defecto nunca se llegaba a crear.
  await supabase.from("mm_accounts").insert(
    newGroups.map((g, i) => ({
      user_id: userId, group_id: g.id,
      name: DEFAULT_ACCOUNT_GROUPS.find((d) => d.name === g.name).account,
      currency: mainCurrency,
      sort_order: i,
    }))
  );

  await supabase.from("mm_categories").insert([
    ...DEFAULT_INCOME_CATEGORIES.map((name, i) => ({ user_id: userId, type: "income", name, sort_order: i })),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({ user_id: userId, type: "expense", name, sort_order: i })),
  ]);
}

// Lista curada de íconos para categorías/cuentas — un select en vez de un
// input libre, porque el teclado de emoji nativo no es confiable (no abre
// solo en mobile, no existe un atajo simple en desktop).
export const ICON_OPTIONS = [
  { group: "Dinero", icons: ["💰", "💵", "💳", "🏦", "💸", "🪙", "📈", "📉", "🗳️", "🤑", "⚖️"] },
  { group: "Comida", icons: ["🛒", "🍜", "🍔", "☕", "🍕", "🍎"] },
  { group: "Transporte", icons: ["🚖", "🚗", "⛽", "🚌", "🚆", "🚲"] },
  { group: "Hogar", icons: ["🏠", "💡", "🔧", "🛋️"] },
  { group: "Compras", icons: ["🛍️", "👕", "👟", "🧥"] },
  { group: "Salud", icons: ["🧘", "💊", "🏥", "💪"] },
  { group: "Ocio", icons: ["🎬", "🎮", "🎉", "🎵", "⚽️", "🎁", "👬🏻"] },
  { group: "Educación", icons: ["📚", "🎓", "📙"] },
  { group: "Viajes", icons: ["🧳", "🏖️", "✈️"] },
  { group: "Otros", icons: ["👨‍👩‍👧", "❤️", "🐶", "🐱", "⭐", "✅", "🔔", "📌", "❕", "🔄", "📺"] },
];

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

// Arranque del ciclo actual de una tarjeta de crédito: la ocurrencia más
// reciente de `statementDay` que ya pasó (o hoy mismo). Si ese día todavía
// no llegó este mes, el corte fue el mes pasado — mismo clamp de días cortos
// que ya usa `nextOccurrence` (29/30/31 en un mes que no los tiene cae en el
// último día real de ese mes).
export function creditCardCycleStart(statementDay, now = new Date()) {
  const day = Math.min(statementDay, daysInMonth(now.getFullYear(), now.getMonth()));
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
  if (thisMonth <= now) return thisMonth;
  const prevMonthIndex = now.getMonth() - 1;
  const year = now.getFullYear() + (prevMonthIndex < 0 ? -1 : 0);
  const month = (prevMonthIndex + 12) % 12;
  return new Date(year, month, Math.min(statementDay, daysInMonth(year, month)));
}

// Próxima ocurrencia de `paymentDay` desde `now` (hoy incluido) — el espejo
// de `creditCardCycleStart`, pero mirando hacia adelante. Se usa para fijar
// `next_payment_date` cuando se activa el pago automático. Reclampea contra
// `paymentDay` (no contra el día ya clampeado de este mes) al pasar al mes
// siguiente, mismo cuidado que `creditCardCycleStart` con el mes anterior.
export function creditCardNextPaymentDate(paymentDay, now = new Date()) {
  const day = Math.min(paymentDay, daysInMonth(now.getFullYear(), now.getMonth()));
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
  // Comparación por día calendario, no por instante exacto — si no, "hoy"
  // solo contaría como vigente si se evalúa justo a medianoche (mismo cuidado
  // que ya tiene creditCardCycleStart con su `<=`, pero acá hace falta
  // normalizar "now" a medianoche porque la comparación va al revés).
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (thisMonth >= todayMidnight) return thisMonth;
  const nextMonthIndex = now.getMonth() + 1;
  const year = now.getFullYear() + (nextMonthIndex > 11 ? 1 : 0);
  const month = nextMonthIndex % 12;
  return new Date(year, month, Math.min(paymentDay, daysInMonth(year, month)));
}

// Separa el saldo de una tarjeta de crédito en "pasado" (ya facturado, se
// debe pagar) y "actual" (del ciclo abierto, todavía no factura). Reglas:
// - Un pago (transferencia QUE LLEGA a la tarjeta) siempre ataca "pasado"
//   primero, sin importar su fecha — pagás la deuda vieja, no "la de este
//   mes" en particular.
// - Todo lo demás (gastos, o una transferencia que SALE de la tarjeta) se
//   reparte por fecha: antes del corte → pasado, desde el corte en
//   adelante → actual.
// - Si "pasado" queda positivo (el pago fue mayor a la deuda), el
//   excedente pasa a "actual" — "pasado" nunca es mayor a 0.
export function computeCreditCardBalance(accountId, transactions, statementDay, now = new Date()) {
  const cycleStart = creditCardCycleStart(statementDay, now);
  const cycleStartKey = `${cycleStart.getFullYear()}-${String(cycleStart.getMonth() + 1).padStart(2, "0")}-${String(cycleStart.getDate()).padStart(2, "0")}`;
  let pasado = 0;
  let actual = 0;
  for (const t of transactions) {
    // Una transferencia de préstamo de Split Ledger (Presté/Me prestaron)
    // que llega a esta tarjeta NO es un pago real de la tarjeta — es solo la
    // otra mitad de un gasto que ya se contó acá mismo este ciclo (el gasto
    // "compartido" + el préstamo se cancelan entre sí). Si se tratara como
    // pago, se descontaría de "pasado" sin importar el ciclo, descuadrando
    // el saldo apenas alguien paga por vos con tu tarjeta vinculada.
    const isSlTransfer = !!t.sl_link_id;
    const isPayment = t.type === "transfer" && t.to_account_id === accountId && !isSlTransfer;
    let contribution;
    if (t.type === "income" && t.account_id === accountId) contribution = t.amount_main;
    else if ((t.type === "expense" || t.type === "transfer") && t.account_id === accountId) contribution = -t.amount_main;
    else if (isPayment) contribution = t.amount_main;
    else if (t.type === "transfer" && t.to_account_id === accountId && isSlTransfer) contribution = t.amount_main;
    else continue;

    if (isPayment) {
      pasado += contribution;
    } else {
      const dayKey = dateInputValueInZone(new Date(t.date).getTime(), t.timezone);
      if (dayKey < cycleStartKey) pasado += contribution;
      else actual += contribution;
    }
  }
  if (pasado > 0) {
    actual += pasado;
    pasado = 0;
  }
  return { pasado, actual };
}

const LOADING = Symbol("loading");

// `loading` acá significa "esta consulta todavía no resolvió ni una vez
// contra Dexie" (no "no hay datos" — un mes sin transacciones también
// resuelve a [] y cuenta como "ya cargó"). Una vez resuelta, queda en
// false para siempre, aunque useLiveQuery siga re-emitiendo valores nuevos
// cada vez que algo escribe en la tabla.
function useLocalTable(table, userId, sortKey) {
  const result = useLiveQuery(() => {
    if (!userId) return [];
    const q = db.table(table).where("user_id").equals(userId);
    return sortKey ? q.sortBy(sortKey) : q.toArray();
  }, [table, userId, sortKey], LOADING);
  return result === LOADING ? { rows: [], loading: true } : { rows: result, loading: false };
}

export function useMoneyManager(userId, userEmail) {
  const settingsRow = useLiveQuery(() => (userId ? db.mm_settings.get(userId) : undefined), [userId], LOADING);
  const { rows: groups } = useLocalTable("mm_account_groups", userId, "sort_order");
  const { rows: accounts } = useLocalTable("mm_accounts", userId, "sort_order");
  const { rows: categories } = useLocalTable("mm_categories", userId, "sort_order");
  const { rows: recurring } = useLocalTable("mm_recurring", userId, "next_date");
  const { rows: slLinks } = useLocalTable("sl_mm_links", userId);
  const { rows: allTransactions } = useLocalTable("mm_transactions", userId);
  const reviewMeta = useLiveQuery(() => db.sync_meta.get("pendienteTcReview"), [], undefined);

  const loading = settingsRow === LOADING;
  const settings = loading || !settingsRow ? DEFAULT_SETTINGS : settingsRow;
  const accountTotals = useMemo(() => computeAccountTotals(allTransactions), [allTransactions]);
  const pendienteTcReview = reviewMeta?.value || [];

  // Dispara un sync completo contra el servidor (drena la cola offline,
  // corre mantenimiento, trae todo fresco) — no hace nada si no hay señal,
  // en cuyo caso los datos ya mostrados son los de Dexie (último sync).
  // Import dinámico (no estático) para no crear un ciclo de módulos:
  // syncEngine.js importa de acá (generateDueRecurring/runCreditCardAutoPay/
  // seedDefaults/fetchAllRows).
  // No se dispara sola al montar (eso lo hace AppShell una sola vez, con el
  // gate de "Trayendo datos" — ver ReconnectSyncGate en SplitLedger.jsx):
  // acá queda como función para que cada pantalla la siga llamando después
  // de guardar, igual que ya hacía antes.
  const reload = useCallback(async () => {
    if (!userId || !getIsOnline()) return;
    const { runFullSync } = await import("./syncEngine.js");
    await runFullSync(userId, userEmail);
  }, [userId, userEmail]);

  // Online-only (toca una tabla de Split Ledger, no de Money Manager) — sin
  // señal falla en silencio (el aviso del banner se queda tal cual, sin
  // romper nada) en vez de quedar como una promesa rechazada sin atrapar,
  // mismo criterio que ya usa handleRejectInvite en SplitLedger.jsx.
  const acknowledgePendienteTcReview = useCallback(async (id) => {
    try {
      await acknowledgePendienteTcReviewItem(id);
      const current = (await db.sync_meta.get("pendienteTcReview"))?.value || [];
      await db.sync_meta.put({ key: "pendienteTcReview", value: current.filter((item) => item.id !== id) });
    } catch (e) {
      console.error("acknowledgePendienteTcReview: no se pudo confirmar (sin señal?)", e);
    }
  }, []);

  return {
    settings, groups, accounts, categories, accountTotals, recurring, slLinks, loading, reload,
    pendienteTcReview, acknowledgePendienteTcReview,
  };
}

// Mes exacto de una transacción según SU propia zona horaria (columna
// timezone), no la del navegador de quien mira — mismo criterio en todos
// los hooks de abajo que filtran por mes.
function inMonth(t, year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  return dateInputValueInZone(new Date(t.date).getTime(), t.timezone).startsWith(monthKey);
}

// Transacciones del mes visible (Transacciones/Diario), leídas de Dexie.
// `enabled=false` (ej. Estadísticas cuando NO hay filtros activos) evita
// calcular algo que no se va a usar — tiene que seguir siendo un hook
// llamado siempre (reglas de hooks), solo que no hace el filtrado real.
export function useMonthTransactions(userId, viewMonth, enabled = true) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const { rows: all, loading } = useLocalTable("mm_transactions", userId);
  const transactions = useMemo(() => {
    if (!enabled) return [];
    return all
      .filter((t) => !t.deleted && !t.sl_hidden && inMonth(t, year, month))
      .sort((a, b) => (new Date(b.date) - new Date(a.date)) || (new Date(b.created_at) - new Date(a.created_at)));
  }, [all, enabled, year, month]);

  return { transactions, loading: enabled && loading, reload: () => {} };
}

// Transacciones de una cuenta puntual (origen o destino de una
// transferencia) del mes visible.
export function useAccountMonthTransactions(userId, accountId, viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const { rows: all, loading } = useLocalTable("mm_transactions", userId);
  const transactions = useMemo(() => {
    if (!accountId) return [];
    return all
      .filter((t) => !t.deleted && (t.account_id === accountId || t.to_account_id === accountId) && inMonth(t, year, month))
      .sort((a, b) => (new Date(b.date) - new Date(a.date)) || (new Date(b.created_at) - new Date(a.created_at)));
  }, [all, accountId, year, month]);

  return { transactions, loading: !!accountId && loading };
}

// Depósitos/retiros/neto de una cuenta, agregados por mes — antes una vista
// de Postgres (mm_account_month_totals), ahora recalculado en JS desde la
// copia local completa de transacciones (ver localAggregates.js).
export function useAccountMonthTotals(userId, accountId) {
  const { rows: all, loading } = useLocalTable("mm_transactions", userId);
  const totals = useMemo(() => (accountId ? computeAccountMonthTotals(all, accountId) : []), [all, accountId]);
  return { totals, loading: !!accountId && loading };
}

// Arma la comparación de ritmo de gasto (Estadísticas) a partir de un
// resultado YA calculado de computeCategoryMonthTotals (no vuelve a tocar
// Dexie) -- un mapa category_id→total para viewMonth, otro para el período
// de comparación según compareSpec ({mode: "off"|"average"|"specific",
// months, specificMonth: {year,month}}). "average" cuenta $0 los meses sin
// movimiento (representa mejor "cuánto gasto normalmente" que excluirlos).
function buildComparisons(allTotals, viewMonth, compareSpec) {
  const mode = compareSpec?.mode || "off";
  if (mode === "off") return [];
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth() + 1;
  const currentMap = new Map();
  for (const r of allTotals) if (r.year === year && r.month === month) currentMap.set(r.category_id, r.total);

  const baselineMap = new Map();
  if (mode === "specific" && compareSpec.specificMonth) {
    const { year: by, month: bm } = compareSpec.specificMonth;
    for (const r of allTotals) if (r.year === by && r.month === bm) baselineMap.set(r.category_id, r.total);
  } else if (mode === "average") {
    const months = compareSpec.months || 1;
    for (const { year: by, month: bm } of monthsBefore(viewMonth, months)) {
      for (const r of allTotals) {
        if (r.year === by && r.month === bm) baselineMap.set(r.category_id, (baselineMap.get(r.category_id) || 0) + r.total);
      }
    }
    for (const [k, v] of baselineMap) baselineMap.set(k, v / months);
  }

  const ids = new Set([...currentMap.keys(), ...baselineMap.keys()]);
  return [...ids].map((category_id) => ({
    category_id,
    current: currentMap.get(category_id) || 0,
    baseline: baselineMap.get(category_id) || 0,
  }));
}

// Agrega transacciones ya traídas (crudo) por categoría — usado por
// useStatsCategoryTotals cuando hay filtros activos (fecha/cuenta/categoría/
// importe) que no contempla computeCategoryMonthTotals.
function aggregateByCategory(transactions, type, accounts, mainCurrency) {
  const map = new Map();
  for (const t of transactions) {
    if (t.type !== type) continue;
    if (accounts.find((a) => a.id === t.account_id)?.currency !== mainCurrency) continue;
    const amount = t.amount_main ?? t.amount;
    map.set(t.category_id, (map.get(t.category_id) || 0) + amount);
  }
  return [...map.entries()].map(([category_id, total]) => ({ category_id, total }));
}

// Totales por categoría para Estadísticas, con soporte de filtros (cuenta/
// categoría/importe/fecha) y de la comparación de ritmo de gasto.
// `monthTxCount` distingue "no hay nada este mes" de "el filtro no dejó
// nada" en la UI. Una sola lectura de mm_transactions para todo esto (antes
// eran 3 por separado -- ingreso, gasto, y la comparación -- cada una
// volviendo a traer y recorrer toda la historia; acá se trae y recorre una
// vez sola y se reusa, la comparación no pesa de más por estar activa).
export function useStatsCategoryTotals(userId, viewMonth, filters, mainCurrency, accounts, compareSpec) {
  const filtering = hasActiveFilters(filters);
  const { rows: all, loading: allLoading } = useLocalTable("mm_transactions", userId);

  const allIncomeTotals = useMemo(() => computeCategoryMonthTotals(all, accounts, "income", mainCurrency), [all, accounts, mainCurrency]);
  const allExpenseTotals = useMemo(() => computeCategoryMonthTotals(all, accounts, "expense", mainCurrency), [all, accounts, mainCurrency]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth() + 1;
  const incomeAgg = useMemo(() => allIncomeTotals.filter((r) => r.year === year && r.month === month).map(({ category_id, total }) => ({ category_id, total })), [allIncomeTotals, year, month]);
  const expenseAgg = useMemo(() => allExpenseTotals.filter((r) => r.year === year && r.month === month).map(({ category_id, total }) => ({ category_id, total })), [allExpenseTotals, year, month]);

  const { transactions: monthTx, loading: monthTxLoading } = useMonthTransactions(userId, viewMonth, filtering);
  const filteredTx = useMemo(() => (filtering ? monthTx.filter((t) => matchesFilters(t, filters)) : monthTx), [monthTx, filtering, filters]);

  const incomeTotals = filtering ? aggregateByCategory(filteredTx, "income", accounts, mainCurrency) : incomeAgg;
  const expenseTotals = filtering ? aggregateByCategory(filteredTx, "expense", accounts, mainCurrency) : expenseAgg;
  const incomeLoading = filtering ? monthTxLoading : allLoading;
  const expenseLoading = filtering ? monthTxLoading : allLoading;

  const comparisons = useMemo(() => ({
    income: buildComparisons(allIncomeTotals, viewMonth, compareSpec),
    expense: buildComparisons(allExpenseTotals, viewMonth, compareSpec),
  }), [allIncomeTotals, allExpenseTotals, viewMonth, compareSpec]);

  return { incomeTotals, expenseTotals, incomeLoading, expenseLoading, monthTxCount: monthTx.length, comparisons };
}

// Serie mensual de una sola categoría (drill-down de Estadísticas) — todos
// los meses con movimiento de esa categoría. `categoryId` puede ser null
// ("Sin categoría").
export function useCategoryTimeline(userId, type, categoryId, mainCurrency) {
  const { rows: all, loading } = useLocalTable("mm_transactions", userId);
  const { rows: accounts } = useLocalTable("mm_accounts", userId);
  const totals = useMemo(() => computeCategoryMonthTotals(all, accounts, type, mainCurrency)
    .filter((r) => r.category_id === (categoryId ?? null)), [all, accounts, type, mainCurrency, categoryId]);

  return { totals, loading };
}

// Títulos (campo "Descripción", columna title) de transacciones recientes,
// para el autocompletado del formulario — se trae un lote acotado (las
// últimas 300 con nota) y se dedupe preservando el orden (más reciente
// primero).
export function useRecentNoteTitles(userId) {
  const { rows: all } = useLocalTable("mm_transactions", userId);
  return useMemo(() => {
    // Sin límite de cuántas transacciones mirar hacia atrás -- ya está todo
    // en memoria (local-first), ordenar no cuesta más por no cortar antes.
    // El límite de cuántas SUGERENCIAS se muestran sigue siendo cosa de
    // cada autocompletado (.slice(0, 5) en los call-sites), esto es solo
    // el pool de candidatas de donde eligen.
    const sorted = all
      .filter((t) => !t.deleted && t.title && !t.sl_link_id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return [...new Set(sorted.map((t) => t.title))];
  }, [all]);
}

// Buscador de gastos — antes filtros server-side, ahora filtra la copia
// local completa (unos pocos miles de filas como mucho, trivial en JS).
// Sigue siendo una función imperativa (no un hook): se dispara a demanda
// (Enter / tocar una sugerencia), no reactiva a cada tecla.
export async function searchTransactions(userId, filters) {
  const all = await db.mm_transactions.where("user_id").equals(userId).toArray();
  let rows = all.filter((t) => !t.deleted && !t.sl_hidden);

  const text = filters.query?.trim() ? normalizeForSearch(filters.query.trim()) : "";
  if (text) rows = rows.filter((t) => (t.title && normalizeForSearch(t.title).includes(text)) || (t.memo && normalizeForSearch(t.memo).includes(text)));
  if (filters.accountIds?.length) {
    const ids = new Set(filters.accountIds);
    rows = rows.filter((t) => ids.has(t.account_id) || ids.has(t.to_account_id));
  }
  if (filters.categoryIds?.length) {
    const ids = new Set(filters.categoryIds);
    rows = rows.filter((t) => ids.has(t.category_id));
  }
  if (filters.dateFrom) rows = rows.filter((t) => new Date(t.date) >= new Date(filters.dateFrom));
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setDate(end.getDate() + 1);
    rows = rows.filter((t) => new Date(t.date) < end);
  }
  if (filters.amountMin) { const min = parseAmountInput(filters.amountMin); rows = rows.filter((t) => t.amount_main >= min); }
  if (filters.amountMax) { const max = parseAmountInput(filters.amountMax); rows = rows.filter((t) => t.amount_main <= max); }

  rows.sort((a, b) => (new Date(b.date) - new Date(a.date)) || (new Date(b.created_at) - new Date(a.created_at)));
  return rows.slice(0, 500);
}

// PostgREST limita cada consulta a 1000 filas por defecto — para una cuenta
// con más historial que eso, un `.select` sin paginar trae una porción
// ARBITRARIA y descarta el resto en silencio. Esta función pagina con
// `.range()` hasta traer todo — sigue usándose desde syncEngine.js (el pull
// completo de mm_transactions) y runCreditCardAutoPay (necesita el
// historial real de Supabase, no la copia local, para no reintroducir la
// misma clase de bug). `buildQuery(from, to)` tiene que devolver la MISMA
// consulta cada vez, solo cambiando el rango.
export async function fetchAllRows(buildQuery) {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// Historial completo (todas las fechas) de una o varias tarjetas, leído de
// la copia local — antes era un fetchAllRows contra Supabase, ahora Dexie ya
// tiene todo el historial (lo trajo syncEngine.js), no hace falta paginar.
export function useCreditCardActivity(userId, creditCardIds) {
  const idsKey = [...creditCardIds].sort().join(",");
  const { rows: all, loading } = useLocalTable("mm_transactions", userId);
  const transactions = useMemo(() => {
    if (!idsKey) return [];
    const ids = new Set(idsKey.split(","));
    return all.filter((t) => !t.deleted && (ids.has(t.account_id) || ids.has(t.to_account_id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, idsKey]);

  return { transactions, loading: !!idsKey && loading, reload: () => {} };
}

// Se corre en silencio antes de cada sync (syncEngine.js), nunca desde el
// cliente offline: por cada recurrente vencida, crea la transacción real y
// avanza next_date (repite si quedaron varias vencidas mientras tanto),
// hasta ponerse al día o pasar end_date.
export async function generateDueRecurring(userId) {
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
        exchange_rate: r.exchange_rate, amount_main: r.amount_main,
        title: r.title, memo: r.memo, date: next.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

// Se corre en silencio antes de cada sync (syncEngine.js), después de
// generar las recurrentes vencidas (una recurrente puede ser justo un gasto
// de la tarjeta, tiene que quedar reflejada antes de calcular cuánto
// pagarle). Por cada tarjeta con auto_pay activado y next_payment_date
// vencida: paga el "saldo a pagar" de ese ciclo (transferencia real desde
// payment_account_id), fechada en el día que correspondía (no en el día en
// que corre el job) y avanza next_payment_date — mismo criterio de catch-up
// que generateDueRecurring si pasaron varios meses sin sincronizar.
export async function runCreditCardAutoPay(userId) {
  const { data: allCards } = await supabase
    .from("mm_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_credit_card", true)
    .eq("auto_pay", true)
    .eq("deleted", false);
  if (!allCards || allCards.length === 0) return;

  // Tarjetas que nunca tuvieron next_payment_date (auto_pay activado antes de
  // que existiera esta columna, o cualquier otro caso en que no quedó
  // sembrada) — arrancan desde hoy, sin generar de golpe pagos retroactivos
  // de meses en los que el auto-pago en realidad nunca estuvo funcionando.
  // El `.is(...)` de la condición hace que, si dos corridas concurrentes
  // intentan sembrarla a la vez, solo la primera gane — la segunda no
  // encuentra la fila en null y no pisa nada.
  const uninitialized = allCards.filter((c) => !c.next_payment_date);
  if (uninitialized.length) {
    await Promise.all(uninitialized.map((c) =>
      supabase.from("mm_accounts")
        .update({ next_payment_date: creditCardNextPaymentDate(c.payment_day || 1).toISOString() })
        .eq("id", c.id).is("next_payment_date", null)
    ));
  }

  // Sin cuenta de pago no hay de dónde sacar la plata — no debería poder
  // pasar desde el formulario (ver AccountDetailScreen), pero por las dudas
  // (datos viejos, edición directa en la base) el job no revienta por eso.
  //
  // Tampoco se paga si la cuenta de pago quedó eliminada — borrar UNA cuenta
  // puntual ya apaga auto_pay en cascada (ver disableAutoPayForDeletedAccounts),
  // pero borrar el GRUPO entero que la contiene la borra en masa sin pasar
  // por esa protección, así que el job se cubre acá también: si pasa, no
  // avanza next_payment_date y reintenta en la próxima carga, en vez de
  // sacar plata de una cuenta que el usuario ya considera inexistente.
  const paymentAccountIds = [...new Set(allCards.map((c) => c.payment_account_id).filter(Boolean))];
  const { data: paymentAccounts } = paymentAccountIds.length
    ? await supabase.from("mm_accounts").select("id, deleted").in("id", paymentAccountIds)
    : { data: [] };
  const deletedPaymentAccountIds = new Set((paymentAccounts || []).filter((a) => a.deleted).map((a) => a.id));

  const cards = allCards.filter((c) =>
    c.payment_account_id && !deletedPaymentAccountIds.has(c.payment_account_id)
    && c.next_payment_date && new Date(c.next_payment_date) <= new Date()
  );
  if (cards.length === 0) return;

  for (const card of cards) {
    // fetchAllRows (no un .select liso) — ver su comentario arriba, el
    // pago automático necesita el historial COMPLETO de la tarjeta para
    // calcular bien cuánto transferir, no una porción truncada a 1000.
    const tx = await fetchAllRows((from, to) => supabase
      .from("mm_transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("deleted", false)
      .or(`account_id.eq.${card.id},to_account_id.eq.${card.id}`)
      .order("id", { ascending: true })
      .range(from, to));
    // Copia mutable: cada pago generado en una vuelta del while tiene que
    // "verse" en la vuelta siguiente (si no, el ciclo 2 vuelve a contar como
    // pendiente lo que el ciclo 1 ya pagó, porque computeCreditCardBalance
    // mira todo el historial de una, no incrementalmente).
    const transactions = [...tx];

    let current = card.next_payment_date;
    let next = new Date(current);
    let guard = 0;
    while (next <= new Date() && guard < 60) {
      const upcoming = creditCardNextPaymentDate(card.payment_day, new Date(next.getTime() + 86400000));
      // Reclamo atómico de este ciclo antes de generar nada: si otra corrida
      // concurrente ya adelantó next_payment_date, esta condición ya no
      // matchea ninguna fila y cortamos acá — sin esto, dos corridas
      // generarían el mismo pago dos veces.
      const { data: claimed } = await supabase
        .from("mm_accounts")
        .update({ next_payment_date: upcoming.toISOString() })
        .eq("id", card.id).eq("next_payment_date", current)
        .select("id");
      if (!claimed || claimed.length === 0) break;

      const { pasado } = computeCreditCardBalance(card.id, transactions, card.statement_day, next);
      if (pasado < -0.004) {
        const amount = -pasado;
        // Tarjeta y cuenta de pago son siempre la misma moneda (ver
        // AccountDetailScreen, lo valida al guardar) — se mueve el mismo
        // monto en ambas puntas, sin ninguna conversión de por medio.
        const paymentTx = {
          user_id: userId, type: "transfer", account_id: card.payment_account_id, to_account_id: card.id,
          category_id: null, currency: card.currency, amount, exchange_rate: null, amount_main: amount,
          title: "Pago automático", memo: null, date: next.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        const { error } = await supabase.from("mm_transactions").insert(paymentTx);
        // Si el pago no se pudo insertar, ya reclamamos el ciclo igual — se
        // pierde ese pago puntual en vez de reintentarlo, pero es preferible
        // a arriesgar duplicarlo; queda logueado para revisar a mano.
        if (error) { console.error("runCreditCardAutoPay: no se pudo insertar el pago", error); }
        else transactions.push(paymentTx);
      }

      current = upcoming.toISOString();
      next = upcoming;
      guard += 1;
    }
  }
}

// Se llama al borrar una o varias cuentas (borrado puntual, o en cascada al
// borrar el grupo que las contiene) — cualquier tarjeta que las tuviera como
// cuenta de pago pierde de dónde cobrar, así que se apaga su auto-pago en
// vez de dejarlo "colgado" apuntando a una cuenta inexistente.
export async function disableAutoPayForDeletedAccounts(deletedAccountIds) {
  if (!deletedAccountIds || deletedAccountIds.length === 0) return;
  // `.in()` filtra por payment_account_id, no por "id" — el shim de
  // offlineSupabase solo sabe resolver filas objetivo por "id", así que acá
  // se resuelve la lista de ids a mano antes de llamarlo.
  const dependents = await db.mm_accounts.where("payment_account_id").anyOf(deletedAccountIds).toArray();
  const ids = dependents.map((a) => a.id);
  if (!ids.length) return;
  await offlineSupabase.from("mm_accounts")
    .update({ auto_pay: false, next_payment_date: null })
    .in("id", ids);
}

// Convierte un monto a la moneda principal — se llama UNA sola vez, al
// guardar la transacción (no en cada lectura): el resultado se persiste en
// `amount_main` junto con la tasa usada (`exchange_rate`), así la tasa queda
// ligada a esa transacción puntual y no a una tasa fija global que se
// desactualiza. `rate` son unidades de la moneda secundaria por 1 de la
// principal (ej. 1 EUR = 4500 COP → rate=4500).
export function computeAmountMain(amount, currency, mainCurrency, rate) {
  if (!currency || currency === mainCurrency) return amount;
  if (rate) return amount / rate;
  return amount;
}

// Sincronizada desde Split Ledger, en una moneda distinta a la principal,
// sin tasa todavía — ver splitLedgerSync.js. Compartida entre TransactionDayGroups,
// SearchScreen y DiarioTab (banner), para no repetir la misma condición 3 veces.
export function isRatePending(t, mainCurrency) {
  return !!t.sl_link_id && t.exchange_rate == null && t.currency !== mainCurrency;
}

// Todas las transacciones pendientes de tasa, de CUALQUIER mes — leídas de
// la copia local completa.
export function usePendingRateTransactions(userId) {
  const { rows: all, loading } = useLocalTable("mm_transactions", userId);
  const settingsRow = useLiveQuery(() => (userId ? db.mm_settings.get(userId) : undefined), [userId], undefined);
  const mainCurrency = settingsRow?.main_currency || DEFAULT_SETTINGS.main_currency;
  const transactions = useMemo(() => all
    .filter((t) => !t.deleted && t.sl_link_id && t.exchange_rate == null && t.currency !== mainCurrency)
    .sort((a, b) => new Date(a.date) - new Date(b.date)), [all, mainCurrency]);

  return { transactions, loading, reload: () => {} };
}

// accountTotals: una fila por cuenta, ya calculada localmente (ver
// localAggregates.js). Restricción dura (ver PENDIENTES.md sección B): como
// toda transacción de una cuenta queda en SU moneda, este total ya está en
// la moneda de esa cuenta (`accounts.find(a => a.id === accountId).currency`),
// no en una principal global.
export function accountBalance(accountId, accountTotals) {
  return accountTotals.find((t) => t.account_id === accountId)?.total || 0;
}

// Monedas que de verdad tienen al menos una cuenta (no borrada) — para
// armar las opciones de un selector de moneda (Fase 2 de multi-moneda, ver
// MULTI_CURRENCY_PLAN.md), no las 9 fijas de CURRENCY_LIST. Orden: la
// principal primero (si está en uso), después "Otras monedas" de Ajustes en
// ese orden, y al final cualquier moneda en uso que no estuviera en
// ninguna de las dos (cuenta en una moneda que después se sacó de "Otras
// monedas").
export function currenciesInUse(accounts, settings) {
  const used = new Set(accounts.filter((a) => !a.deleted).map((a) => a.currency));
  const preferred = [settings.main_currency, ...(settings.other_currencies || [])].filter((c) => used.has(c));
  const extra = [...used].filter((c) => !preferred.includes(c));
  return [...preferred, ...extra];
}
