import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";
import { dateInputValueInZone } from "./helpers.jsx";

// Todo lo de Money Manager vive en tablas con prefijo mm_, separadas de las
// de Split Ledger a propósito (ver memoria "money-manager-categories-merge-pending":
// unificar categorías es una decisión pendiente, no algo ya resuelto).

const DEFAULT_SETTINGS = {
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
    const isPayment = t.type === "transfer" && t.to_account_id === accountId;
    let contribution;
    if (t.type === "income" && t.account_id === accountId) contribution = t.amount_main;
    else if ((t.type === "expense" || t.type === "transfer") && t.account_id === accountId) contribution = -t.amount_main;
    else if (isPayment) contribution = t.amount_main;
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
    await runCreditCardAutoPay(userId);
    // Los balances se agregan del lado del servidor (vista mm_account_totals,
    // ver .mm_views.sql) en vez de traer cada transacción y sumar acá — así
    // esta consulta siempre trae unas pocas filas (una por cuenta×moneda),
    // sin importar si tenés 2 mil o 20 mil transacciones.
    const [s, g, a, c, at, r] = await Promise.all([
      supabase.from("mm_settings").select("*").eq("user_id", userId).maybeSingle(),
      // Ninguna de las 3 (grupos/cuentas/categorías) filtra deleted acá a
      // propósito: un elemento eliminado tiene que seguir disponible en el
      // cliente para poder mostrar su nombre/ícono en transacciones viejas
      // que ya lo tenían asignado, y ahora también para la sección
      // "Cuentas eliminadas" de Cuentas. El filtrado de "no ofrecerlo para
      // elegir de nuevo" / "no sumar al balance" / "no listarlo como activo"
      // se hace más abajo, elemento por elemento, no acá.
      supabase.from("mm_account_groups").select("*").eq("user_id", userId).order("sort_order"),
      supabase.from("mm_accounts").select("*").eq("user_id", userId).order("sort_order"),
      supabase.from("mm_categories").select("*").eq("user_id", userId).order("sort_order"),
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
        supabase.from("mm_account_groups").select("*").eq("user_id", userId).order("sort_order"),
        supabase.from("mm_accounts").select("*").eq("user_id", userId).order("sort_order"),
        supabase.from("mm_categories").select("*").eq("user_id", userId).order("sort_order"),
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

  // Se limpia apenas cambia el mes visible (antes de que llegue la
  // respuesta) — si no, se alcanza a ver la data del mes anterior "pegada"
  // un instante mientras carga la del mes nuevo.
  useEffect(() => { setTransactions([]); }, [year, month]);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    // Rango ampliado ±1 día: a qué mes/día pertenece cada transacción se
    // decide más abajo por SU PROPIA zona horaria (columna timezone), no por
    // la del navegador de quien está mirando — este rango solo tiene que
    // cubrir de sobra el mes pedido para no perder alguna transacción justo
    // en el borde (nunca puede desplazarse más de un día por diferencia de
    // huso horario).
    const start = new Date(year, month, 1);
    start.setDate(start.getDate() - 1);
    const end = new Date(year, month + 1, 1);
    end.setDate(end.getDate() + 1);
    const { data } = await supabase
      .from("mm_transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("deleted", false)
      .gte("date", start.toISOString())
      .lt("date", end.toISOString())
      // Dentro de un mismo día, "date" solo no alcanza para ordenar (todas
      // las creadas a mano quedan ancladas al mediodía) — created_at
      // desempata para que la más nueva quede arriba.
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    // Re-acotar al mes exacto usando la zona propia de cada fila.
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const filtered = (data || []).filter((t) => dateInputValueInZone(new Date(t.date).getTime(), t.timezone).startsWith(monthKey));
    setTransactions(filtered);
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

  // Mismo fix que useMonthTransactions: se limpia apenas cambia mes/tipo,
  // antes de que llegue la respuesta — si no, se alcanza a ver la torta del
  // mes anterior "pegada" un instante mientras carga la del mes nuevo.
  useEffect(() => { setTotals([]); }, [year, month, type]);

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

// Serie mensual de una sola categoría (drill-down de Estadísticas) — trae
// TODOS los meses con movimiento de esa categoría (son pocas filas, una por
// mes, no hace falta acotar por rango) y el componente arma la ventana de
// meses a mostrar alrededor del mes elegido. `categoryId` puede ser null
// ("Sin categoría").
export function useCategoryTimeline(userId, type, categoryId) {
  const [totals, setTotals] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from("mm_category_month_totals").select("*").eq("user_id", userId).eq("type", type);
    query = categoryId ? query.eq("category_id", categoryId) : query.is("category_id", null);
    const { data } = await query;
    setTotals(data || []);
    setLoading(false);
  }, [userId, type, categoryId]);

  useEffect(() => { load(); }, [load]);

  return { totals, loading };
}

// Transacciones relevantes para calcular "saldo a pagar"/"restante" de las
// tarjetas de crédito — una sola consulta acotada a las cuentas que son
// tarjeta (no toda la tabla), sin límite de fecha (el balde "pasado" no
// tiene techo de cuánto tiempo atrás puede venir la deuda).
export function useCreditCardActivity(userId, creditCardIds) {
  const idsKey = [...creditCardIds].sort().join(",");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId || !idsKey) { setTransactions([]); setLoading(false); return; }
    setLoading(true);
    const idList = idsKey;
    const { data } = await supabase
      .from("mm_transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("deleted", false)
      .or(`account_id.in.(${idList}),to_account_id.in.(${idList})`);
    setTransactions(data || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, idsKey]);

  useEffect(() => { load(); }, [load]);

  return { transactions, loading, reload: load };
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

// Se corre en silencio antes de cada carga, después de generar las
// recurrentes vencidas (una recurrente puede ser justo un gasto de la
// tarjeta, tiene que quedar reflejada antes de calcular cuánto pagarle).
// Por cada tarjeta con auto_pay activado y next_payment_date vencida: paga el
// "saldo a pagar" de ese ciclo (transferencia real desde payment_account_id),
// fechada en el día que correspondía (no en el día en que corre el job) y
// avanza next_payment_date — mismo criterio de catch-up que generateDueRecurring
// si pasaron varios meses sin abrir la app.
async function runCreditCardAutoPay(userId) {
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
  // El `.is(...)` de la condición hace que, si dos cargas concurrentes
  // (StrictMode, dos pestañas) intentan sembrarla a la vez, solo la primera
  // gane — la segunda no encuentra la fila en null y no pisa nada.
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

  const { data: settings } = await supabase.from("mm_settings").select("main_currency").eq("user_id", userId).maybeSingle();
  const mainCurrency = settings?.main_currency || DEFAULT_SETTINGS.main_currency;

  for (const card of cards) {
    const { data: tx } = await supabase
      .from("mm_transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("deleted", false)
      .or(`account_id.eq.${card.id},to_account_id.eq.${card.id}`);
    // Copia mutable: cada pago generado en una vuelta del while tiene que
    // "verse" en la vuelta siguiente (si no, el ciclo 2 vuelve a contar como
    // pendiente lo que el ciclo 1 ya pagó, porque computeCreditCardBalance
    // mira todo el historial de una, no incrementalmente).
    const transactions = [...(tx || [])];

    let current = card.next_payment_date;
    let next = new Date(current);
    let guard = 0;
    while (next <= new Date() && guard < 60) {
      const upcoming = creditCardNextPaymentDate(card.payment_day, new Date(next.getTime() + 86400000));
      // Reclamo atómico de este ciclo antes de generar nada: si otra corrida
      // concurrente ya adelantó next_payment_date (dos pestañas, StrictMode
      // duplicando el efecto de carga), esta condición ya no matchea ninguna
      // fila y cortamos acá — sin esto, las dos corridas generarían el mismo
      // pago dos veces (justo lo que pasó en la prueba manual).
      const { data: claimed } = await supabase
        .from("mm_accounts")
        .update({ next_payment_date: upcoming.toISOString() })
        .eq("id", card.id).eq("next_payment_date", current)
        .select("id");
      if (!claimed || claimed.length === 0) break;

      const { pasado } = computeCreditCardBalance(card.id, transactions, card.statement_day, next);
      if (pasado < -0.004) {
        const amount = -pasado;
        const paymentTx = {
          user_id: userId, type: "transfer", account_id: card.payment_account_id, to_account_id: card.id,
          category_id: null, currency: mainCurrency, amount, exchange_rate: null, amount_main: amount,
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
  await supabase.from("mm_accounts")
    .update({ auto_pay: false, next_payment_date: null })
    .in("payment_account_id", deletedAccountIds);
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

// accountTotals: una fila por cuenta (vista mm_account_totals), ya sumada y
// convertida a la moneda principal del lado del servidor (suma `amount_main`,
// no `amount`) — acá no hay más conversión que hacer.
export function accountBalance(accountId, accountTotals) {
  return accountTotals.find((t) => t.account_id === accountId)?.total || 0;
}

export function groupBalance(groupId, accounts, accountTotals) {
  // Oculta sigue sumando (solo se le esconde la fila individual) — eliminada
  // no: ya no es una cuenta activa, aunque siga en memoria para poder
  // mostrar su nombre en transacciones viejas.
  return accounts
    .filter((a) => a.group_id === groupId && !a.deleted)
    .reduce((sum, a) => sum + accountBalance(a.id, accountTotals), 0);
}
