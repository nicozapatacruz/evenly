import { supabase } from "./supabaseClient.js";
import { fetchAllRows } from "./evenCapitalData.js";
import { creditCardCycleStart } from "./helpers.jsx";

/* =========================================================================
   SINCRONIZACIÓN EVENGROUP → EVENCAPITAL — reconciliación completa del
   lado del cliente (no hay triggers de base en este proyecto). Se corre
   dentro de useEvenCapital.load(), antes del auto-pago de tarjetas (puede
   haber transferencias de préstamo que afecten el saldo de una tarjeta), y
   de nuevo justo después de guardar algo en un grupo vinculado — ver
   SPLIT_MONEY_LINK_PLAN.md para el diseño completo.

   Por qué es un diff completo cada vez (no "solo lo nuevo"): EvenGroup no
   tiene `updated_at` en expenses, y algunos borrados son físicos (DELETE, no
   un simple `deleted: true`) — no queda rastro de que algo cambió o
   desapareció. La única forma confiable de detectarlo es recalcular todo lo
   que DEBERÍA existir y compararlo contra lo que YA existe.
   ========================================================================= */

const EPSILON = 0.005;

// `payers`/`shares` ya vienen en centavos exactos (ver fairSplit en
// helpers.jsx), pero restarlos en punto flotante puede ensuciar el
// resultado (ej. 31.05 - 15.53 = 15.519999999999998) -- redondear acá, una
// sola vez justo al calcularlo, antes de que ese ruido se guarde en la base
// o se siga sumando a otra cosa (ej. el total de "Pendiente TC").
function roundCents(n) {
  return Math.round(n * 100) / 100;
}

// Si el grupo ya no es visible, ya no sos miembro vinculado, o alguna cuenta
// involucrada (propia/ajena/pseudo) fue borrada → se congela el vínculo, no
// se escribe nada (mejor no tocar nada que borrar historial por error).
// `accountsById` ya viene cargado por reconcileEvenGroup (todas las cuentas
// del usuario, una sola consulta para todos sus vínculos) -- hace falta el
// mapa completo, no solo las cuentas que ESTE vínculo señala hoy, porque
// computeLendOffsetDesired necesita poder mirar cualquier cuenta que haya
// prestado alguna vez en el historial, no solo "la actual" (ver PENDIENTES.md).
async function loadLinkContext(link, userId, accountsById) {
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, deleted")
    .eq("id", link.group_id)
    .maybeSingle();
  if (!group || group.deleted) return null;

  const { data: member } = await supabase
    .from("group_members")
    .select("id, linked_user_id")
    .eq("id", link.member_id)
    .maybeSingle();
  if (!member || member.linked_user_id !== userId) return null;

  // lend_account_id/loan_account_id/lend_offset_account_id son opcionales
  // (si nunca se configuraron, esa pata de la transferencia de préstamo
  // sigue usando "propios"/"ajenos" como siempre, o directamente no se
  // genera ninguna compensación) -- por eso no se exige que existan.
  const own = accountsById.get(link.default_own_account_id);
  const other = accountsById.get(link.default_other_account_id);
  const pseudo = accountsById.get(link.pseudo_account_id);
  const lend = link.lend_account_id ? accountsById.get(link.lend_account_id) : null;
  const loan = link.loan_account_id ? accountsById.get(link.loan_account_id) : null;
  const lendOffset = link.lend_offset_account_id ? accountsById.get(link.lend_offset_account_id) : null;
  if (!own || own.deleted || !other || other.deleted || !pseudo || pseudo.deleted
    || (link.lend_account_id && (!lend || lend.deleted))
    || (link.loan_account_id && (!loan || loan.deleted))
    || (link.lend_offset_account_id && (!lendOffset || lendOffset.deleted))) return null;

  // Desde que se vinculó (por created_at, no por la fecha propia del gasto —
  // "nada retroactivo" es sobre cuándo se CARGÓ el dato, no sobre qué fecha
  // tiene; un gasto cargado hoy con fecha de ayer sí sincroniza).
  // fetchAllRows (no un .select liso): un grupo vinculado desde hace mucho,
  // con actividad muy alta, podría superar el límite de 1000 filas que
  // PostgREST aplica por defecto a cualquier consulta sin paginar (ver el
  // comentario de fetchAllRows en evenCapitalData.js) — acá el orden no
  // afecta la reconciliación (es un diff por id, no algo secuencial), así
  // que paginar por id no cambia el resultado, solo lo hace seguro.
  const [expenses, payments] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("expenses")
      .select("id, description, amount, currency, date, payers, shares, deleted, created_at")
      .eq("group_id", link.group_id).gte("created_at", link.linked_since)
      .order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("payments")
      .select("id, from_member_id, to_member_id, amount, currency, date, note, deleted, created_at")
      .eq("group_id", link.group_id).gte("created_at", link.linked_since)
      .order("id", { ascending: true }).range(from, to)),
  ]);

  return { groupName: group.name, memberId: member.id, expenses, payments, accountsById };
}

// ¿Tiene esta fila alguna parte para mí? La moneda ya NO decide si se
// sincroniza o no (antes se ignoraba del todo si no coincidía con la
// principal) — ahora siempre se sincroniza, y si la moneda no coincide con
// tu principal, la transacción queda con `exchange_rate: null` ("pendiente
// de tasa") hasta que la abras y la completes a mano, igual que cualquier
// transacción manual en otra moneda. Ver reconcileLink más abajo.
function expenseInvolvesMe(e, memberId) {
  if (e.deleted) return false;
  const shareAmt = Number(e.shares?.[memberId] || 0);
  const paidAmt = Number(e.payers?.[memberId] || 0);
  return shareAmt > EPSILON || Math.abs(paidAmt - shareAmt) > EPSILON;
}

function paymentInvolvesMe(p, memberId) {
  if (p.deleted) return false;
  return p.from_member_id === memberId || p.to_member_id === memberId;
}

// La cuenta/categoría de un gasto puntual se fija la primera vez que se
// sincroniza (acá, si nadie la tocó todavía desde el picker de Split
// Ledger) y nunca más se recalcula sola — así cambiar los defaults del
// vínculo más tarde no mueve nada ya sincronizado. loan_account_id (la
// columna, que guarda la cuenta de la pata de préstamo sin importar la
// dirección) sigue el mismo principio: se siembra con el default del
// vínculo QUE CORRESPONDA SEGÚN LA DIRECCIÓN en ese momento (lend_account_id
// si prestás, loan_account_id si te prestan — no tiene relación lógica entre
// sí, ver TAREAS_ACTUALES.md), y de ahí en más es editable aparte, por
// transacción.
async function ensureExpenseChoices(link, ctx, involvedKeys, choicesBySourceKey) {
  const missing = involvedKeys.filter((k) => !choicesBySourceKey.has(k));
  if (!missing.length) return;
  const expenseById = new Map(ctx.expenses.map((e) => [e.id, e]));
  const paymentById = new Map(ctx.payments.map((p) => [p.id, p]));
  // "Propia" vs "ajena" según si YO pagué mi parte -- mismo criterio que ya
  // usa la pantalla (iPay en EvenGroupTab.jsx) para precargar el campo
  // "Cuenta". Antes acá siempre caía en "ajena", sin importar quién pagó.
  const rows = missing.map((key) => {
    const [source_kind, source_id] = key.split(":");
    let accountId = link.default_other_account_id;
    let loanAccountId = link.loan_account_id || null; // default: dirección "me prestan"
    if (source_kind === "expense") {
      const e = expenseById.get(source_id);
      const paidAmt = Number(e?.payers?.[ctx.memberId] || 0);
      const shareAmt = Number(e?.shares?.[ctx.memberId] || 0);
      if (paidAmt > EPSILON) accountId = link.default_own_account_id;
      if (roundCents(paidAmt - shareAmt) > EPSILON) loanAccountId = link.lend_account_id || null; // presté
    } else if (source_kind === "payment") {
      const p = paymentById.get(source_id);
      if (p?.from_member_id === ctx.memberId) {
        accountId = link.default_own_account_id; // saldo lo que debía -- dirección "me prestan"
      } else {
        loanAccountId = link.lend_account_id || null; // me saldan lo que presté
      }
    }
    return { link_id: link.id, source_kind, source_id, account_id: accountId, category_id: null, loan_account_id: loanAccountId };
  });
  const { data: inserted } = await supabase
    .from("sl_mm_expense_choices")
    .upsert(rows, { onConflict: "link_id,source_kind,source_id", ignoreDuplicates: true })
    .select();
  for (const row of inserted || []) choicesBySourceKey.set(`${row.source_kind}:${row.source_id}`, row);

  // Si el upsert descartó alguna por ya existir (otra pestaña/StrictMode se
  // adelantó), falta releerla — ignoreDuplicates no la devuelve en inserted.
  const stillMissing = missing.filter((k) => !choicesBySourceKey.has(k));
  if (stillMissing.length) {
    const { data: rest } = await supabase.from("sl_mm_expense_choices").select("*").eq("link_id", link.id);
    for (const row of rest || []) choicesBySourceKey.set(`${row.source_kind}:${row.source_id}`, row);
  }
}

// Qué transacciones DEBERÍAN existir para mí, mirando la regla (share +
// préstamo si corresponde) — nunca se mezcla con qué cuenta usar, eso ya
// viene resuelto en choicesBySourceKey.
function computeDesiredTransactions(link, ctx, choicesBySourceKey) {
  const desired = [];

  for (const e of ctx.expenses) {
    if (!expenseInvolvesMe(e, ctx.memberId)) continue;
    const shareAmt = Number(e.shares?.[ctx.memberId] || 0);
    const paidAmt = Number(e.payers?.[ctx.memberId] || 0);
    const choice = choicesBySourceKey.get(`expense:${e.id}`);
    const accountId = choice?.account_id || link.default_other_account_id;
    // La pata de préstamo usa "lo que prestás" en vez de "propios"/"ajenos"
    // cuando está configurada (global o por transacción) -- la cuenta
    // pseudo (link.pseudo_account_id) sigue siendo siempre la contraparte
    // fija del lado del grupo, nunca se reemplaza.
    const loanAccountId = choice?.loan_account_id || accountId;
    const categoryId = choice?.category_id || null;
    const common = { source_kind: "expense", source_id: e.id, currency: e.currency, title: e.description || null, memo: ctx.groupName, date: e.date };

    // Tu parte se reparte en 2 gastos (misma categoría, distinta cuenta)
    // SOLO cuando de verdad hay algo de cada lado: pagaste una parte, pero
    // menos que tu parte completa. Antes esto caía entero en "propia" como
    // si lo hubieras pagado todo -- ver TAREAS_ACTUALES.md. Los otros 2
    // casos (no pagaste nada, o pagaste tu parte completa o de más) quedan
    // EXACTAMENTE igual que siempre (mismo key/role "share"), para no tocar
    // ni un gasto ya sincronizado que no sea de este caso nuevo.
    const paidPortion = roundCents(Math.min(paidAmt, shareAmt));
    const owedPortion = roundCents(shareAmt - paidPortion);
    if (paidPortion > EPSILON && owedPortion > EPSILON) {
      desired.push({ ...common, key: `expense:${e.id}:share`, role: "share", type: "expense", account_id: accountId, to_account_id: null, amount: paidPortion, category_id: categoryId });
      desired.push({ ...common, key: `expense:${e.id}:share_owed`, role: "share_owed", type: "expense", account_id: link.default_other_account_id, to_account_id: null, amount: owedPortion, category_id: categoryId });
    } else if (shareAmt > EPSILON) {
      desired.push({ ...common, key: `expense:${e.id}:share`, role: "share", type: "expense", account_id: accountId, to_account_id: null, amount: shareAmt, category_id: categoryId });
    }
    const diff = roundCents(paidAmt - shareAmt);
    if (diff > EPSILON) {
      desired.push({ ...common, key: `expense:${e.id}:loan`, role: "loan", type: "transfer", account_id: loanAccountId, to_account_id: link.pseudo_account_id, amount: diff, category_id: null });
    } else if (diff < -EPSILON) {
      desired.push({ ...common, key: `expense:${e.id}:loan`, role: "loan", type: "transfer", account_id: link.pseudo_account_id, to_account_id: loanAccountId, amount: -diff, category_id: null });
    }
  }

  for (const p of ctx.payments) {
    if (!paymentInvolvesMe(p, ctx.memberId)) continue;
    const isFrom = p.from_member_id === ctx.memberId;
    const choice = choicesBySourceKey.get(`payment:${p.id}`);
    const accountId = choice?.account_id || link.default_other_account_id;
    // Mismo reemplazo que en gastos: un pago es, en esencia, saldar esa
    // misma pata de préstamo -- si cobro, entra a "lo que prestás" (en vez
    // de a "ajenos"); si pago, sale de "lo que prestás" (en vez de
    // "propios"/"ajenos"), revirtiendo justo la transferencia original.
    const loanAccountId = choice?.loan_account_id || accountId;
    desired.push({
      key: `payment:${p.id}:loan`, source_kind: "payment", source_id: p.id, role: "loan", type: "transfer",
      account_id: isFrom ? loanAccountId : link.pseudo_account_id,
      to_account_id: isFrom ? link.pseudo_account_id : loanAccountId,
      amount: Number(p.amount), currency: p.currency, category_id: null,
      title: p.note || "Pago", memo: ctx.groupName, date: p.date,
    });
  }

  return desired;
}

// Primer día del ciclo SIGUIENTE a `cycleStart` -- avanza de a un día hasta
// que creditCardCycleStart deja de devolver el mismo ciclo. Más simple que
// repetir el clampeo de meses cortos que ya hace creditCardCycleStart.
function nextCycleStart(statementDay, cycleStart) {
  const probe = new Date(cycleStart);
  probe.setDate(probe.getDate() + 1);
  while (creditCardCycleStart(statementDay, probe).getTime() === cycleStart.getTime()) {
    probe.setDate(probe.getDate() + 1);
  }
  return creditCardCycleStart(statementDay, probe);
}

// Agrupa los legs de préstamo (role:"loan", plata que salió hacia la cuenta
// pseudo del grupo) por (cuenta real que prestó, ciclo, moneda) -- por SU
// PROPIA cuenta (`d.account_id`, ya fijada por gasto en
// computeDesiredTransactions/sl_mm_expense_choices), nunca por "cuál es la
// cuenta configurada hoy en el vínculo". Así, si más adelante cambiás qué
// tarjeta es "Lo que prestás", los ciclos viejos de la tarjeta anterior
// siguen agrupándose bien (simplemente no les llegan legs nuevos) -- antes
// se filtraba por una sola cuenta "actual", perdiendo de vista cualquier
// cosa prestada con una tarjeta distinta a la de hoy.
// Función PURA (sin Supabase) a propósito, para poder testearla sola --
// ver src/lib/__tests__/evenGroupSync.test.js.
export function groupLendOffsetPeriods(lendLegs, accountsById, now) {
  const periods = new Map();
  for (const d of lendLegs) {
    const account = accountsById.get(d.account_id);
    if (!account?.is_credit_card || !account?.statement_day) continue; // no es una tarjeta con ciclo -- no aplica
    const statementDay = account.statement_day;
    const currentCycleStart = creditCardCycleStart(statementDay, now);
    const cycleStart = creditCardCycleStart(statementDay, new Date(d.date));
    if (cycleStart.getTime() >= currentCycleStart.getTime()) continue; // ciclo todavía abierto, no se compensa todavía
    const cycleStartKey = `${cycleStart.getFullYear()}-${String(cycleStart.getMonth() + 1).padStart(2, "0")}-${String(cycleStart.getDate()).padStart(2, "0")}`;
    const groupKey = `${d.account_id}:${cycleStartKey}:${d.currency}`;
    const entry = periods.get(groupKey) || { lendAccountId: d.account_id, statementDay, cycleStart, cycleStartKey, currency: d.currency, total: 0 };
    entry.total = roundCents(entry.total + d.amount);
    periods.set(groupKey, entry);
  }
  return [...periods.values()].filter((p) => p.total > EPSILON);
}

// Compensación por ciclo de tarjeta (ver TAREAS_ACTUALES.md, sección 1): si
// "lo que prestás" es una tarjeta de crédito y hay una "cuenta de origen"
// elegida, cada ciclo YA CERRADO de esa tarjeta genera UNA transferencia
// desde esa cuenta de origen hacia la cuenta de PAGO de la tarjeta, por el
// total prestado en ese ciclo -- así esa cuenta (la que de verdad se ve
// rebajada al pagar la tarjeta completa) no queda baja por lo que en
// realidad le toca devolver al grupo, sin ningún paso manual ni esperar a
// pagar la tarjeta.
//
// Cada ciclo ya compensado queda FIJO para siempre en `sl_mm_lend_offset_periods`
// (igual que sl_mm_expense_choices fija la cuenta de cada gasto): la
// primera vez que un ciclo necesita compensarse, se graba ahí qué cuenta
// de origen/destino se usó -- de ahí en más, cambiar la configuración del
// vínculo (otra tarjeta en "Lo que prestás", borrar la cuenta de pago) NUNCA
// mueve ni borra una compensación ya generada, solo deja de generar
// compensaciones NUEVAS hasta que se vuelva a configurar bien. Antes esto
// se recalculaba entero desde la config actual en cada corrida -- cambiarla
// más adelante borraba (soft-delete) compensaciones viejas reales. Bug de
// diseño encontrado en auditoría, 2026-10-30 (ver PENDIENTES.md).
async function computeLendOffsetDesired(link, ctx, desired) {
  const lendLegs = desired.filter((d) => d.role === "loan" && d.to_account_id === link.pseudo_account_id);
  const periods = groupLendOffsetPeriods(lendLegs, ctx.accountsById, new Date());
  if (!periods.length) return [];

  const { data: existingPeriods } = await supabase
    .from("sl_mm_lend_offset_periods")
    .select("*")
    .eq("link_id", link.id);
  const periodByKey = new Map((existingPeriods || []).map((p) => [`${p.lend_account_id}:${p.cycle_start}:${p.currency}`, p]));

  // Un período YA FIJADO (en periodByKey) nunca pasa por acá de nuevo -- la
  // config actual del vínculo (`link.lend_offset_account_id`) SOLO decide
  // si se fija un período NUEVO, nunca toca uno que ya se fijó antes. Por
  // eso este chequeo vive adentro del loop (por período), no al principio
  // de toda la función -- borrar esta config más adelante no debe perder de
  // vista lo ya fijado, solo frenar que se fije algo nuevo.
  const toPin = [];
  for (const period of periods) {
    const key = `${period.lendAccountId}:${period.cycleStartKey}:${period.currency}`;
    if (periodByKey.has(key)) continue;
    if (!link.lend_offset_account_id) continue; // sin "Compensar lo prestado" configurado -- no se fija nada nuevo
    const paymentAccountId = ctx.accountsById.get(period.lendAccountId)?.payment_account_id;
    if (!paymentAccountId) continue; // sin cuenta de pago todavía -- no se fija nada, ver aviso en EvenGroupCapitalLink
    toPin.push({
      link_id: link.id, lend_account_id: period.lendAccountId,
      cycle_start: period.cycleStartKey, currency: period.currency,
      lend_offset_account_id: link.lend_offset_account_id, payment_account_id: paymentAccountId,
    });
  }
  if (toPin.length) {
    // upsert+ignoreDuplicates -- mismo motivo de concurrencia que ensureExpenseChoices
    // (StrictMode/2 pestañas no deben poder fijar 2 veces el mismo período).
    const { data: inserted } = await supabase
      .from("sl_mm_lend_offset_periods")
      .upsert(toPin, { onConflict: "link_id,lend_account_id,cycle_start,currency", ignoreDuplicates: true })
      .select();
    for (const p of inserted || []) periodByKey.set(`${p.lend_account_id}:${p.cycle_start}:${p.currency}`, p);
    const stillMissing = toPin.filter((p) => !periodByKey.has(`${p.lend_account_id}:${p.cycle_start}:${p.currency}`));
    if (stillMissing.length) {
      const { data: rest } = await supabase.from("sl_mm_lend_offset_periods").select("*").eq("link_id", link.id);
      for (const p of rest || []) periodByKey.set(`${p.lend_account_id}:${p.cycle_start}:${p.currency}`, p);
    }
  }

  const offsetDesired = [];
  for (const period of periods) {
    const key = `${period.lendAccountId}:${period.cycleStartKey}:${period.currency}`;
    const pinned = periodByKey.get(key);
    if (!pinned) continue; // todavía sin cuenta de pago configurada -- no se genera nada
    const closeDate = nextCycleStart(period.statementDay, period.cycleStart);
    offsetDesired.push({
      key: `lend_offset:${pinned.id}:lend_offset`,
      source_kind: "lend_offset", source_id: pinned.id, role: "lend_offset", type: "transfer",
      account_id: pinned.lend_offset_account_id, to_account_id: pinned.payment_account_id,
      amount: period.total, currency: period.currency, category_id: null,
      title: "Compensación de lo prestado", memo: `Ciclo ${period.cycleStartKey}`, date: closeDate.getTime(),
    });
  }
  return offsetDesired;
}

async function reconcileLink(link, userId, mainCurrency, accountsById) {
  const ctx = await loadLinkContext(link, userId, accountsById);
  if (!ctx) return; // vínculo congelado, no se toca nada

  const { data: existingChoices } = await supabase.from("sl_mm_expense_choices").select("*").eq("link_id", link.id);
  const choicesBySourceKey = new Map((existingChoices || []).map((c) => [`${c.source_kind}:${c.source_id}`, c]));

  const involvedKeys = [
    ...ctx.expenses.filter((e) => expenseInvolvesMe(e, ctx.memberId)).map((e) => `expense:${e.id}`),
    ...ctx.payments.filter((p) => paymentInvolvesMe(p, ctx.memberId)).map((p) => `payment:${p.id}`),
  ];
  await ensureExpenseChoices(link, ctx, involvedKeys, choicesBySourceKey);

  const desired = computeDesiredTransactions(link, ctx, choicesBySourceKey);
  const lendOffsetDesired = await computeLendOffsetDesired(link, ctx, desired);
  const desiredByKey = new Map([...desired, ...lendOffsetDesired].map((d) => [d.key, d]));

  const { data: existingTx } = await supabase.from("mm_transactions").select("*").eq("sl_link_id", link.id);
  const existingByKey = new Map((existingTx || []).map((t) => [`${t.sl_source_kind}:${t.sl_source_id}:${t.sl_role}`, t]));

  // `exchange_rate` nunca lo toca la reconciliación — solo lo escribe el
  // usuario a mano (en TransactionForm) cuando la moneda del gasto no
  // coincide con su principal. Acá solo se RECALCULA amount_main con la
  // tasa que ya exista (si existe); si todavía no hay ninguna, queda en 0
  // (no corrompe los totales) hasta que la completen — nunca se resetea a
  // un valor crudo sin convertir.
  //
  // EXCEPCIÓN: si la moneda del gasto cambió desde la última vez (alguien
  // la editó en EvenGroup, ej. de USD a COP), la tasa guardada era para
  // la moneda VIEJA — aplicarla a la moneda nueva daría un total
  // completamente inventado. En ese caso se ignora (como si no hubiera
  // ninguna) y vuelve a quedar pendiente, para que carguen la tasa correcta.
  const amountMainFor = (d, existing) => {
    if (d.currency === mainCurrency) return d.amount;
    const rate = existing && existing.currency === d.currency ? existing.exchange_rate : null;
    return rate ? d.amount / rate : 0;
  };

  const toInsert = [];
  const toUpdate = [];
  for (const [key, d] of desiredByKey) {
    const existing = existingByKey.get(key);
    if (!existing) {
      toInsert.push({
        user_id: userId, sl_link_id: link.id, sl_source_kind: d.source_kind, sl_source_id: d.source_id, sl_role: d.role,
        type: d.type, account_id: d.account_id, to_account_id: d.to_account_id,
        category_id: d.category_id, currency: d.currency, amount: d.amount,
        exchange_rate: null, amount_main: amountMainFor(d, null),
        title: d.title, memo: d.memo, date: new Date(d.date).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deleted: false,
      });
      continue;
    }
    // Monto/cuenta/fecha/tipo son lo único que la reconciliación controla
    // para siempre — categoría, título y nota se setean solo al crearla acá
    // abajo (toInsert) y después quedan libres: un cambio de categoría hecho
    // a mano en EvenCapital nunca se pisa solo en la próxima vuelta.
    // EXCEPCIÓN: si todavía no tiene ninguna (null, nunca se eligió una al
    // crearla) y ahora sí hay una elegida en "Categoría personal", se rellena
    // -- si no, elegirla ahí después de guardar el gasto no hacía nada.
    const categoryNeedsFill = !existing.category_id && d.category_id;
    const amountMain = amountMainFor(d, existing);
    const needsUpdate = existing.deleted
      || existing.account_id !== d.account_id
      || existing.to_account_id !== d.to_account_id
      || Number(existing.amount) !== d.amount
      || existing.currency !== d.currency
      || Number(existing.amount_main) !== amountMain
      || new Date(existing.date).getTime() !== new Date(d.date).getTime()
      || categoryNeedsFill;
    if (needsUpdate) {
      const currencyChanged = existing.currency !== d.currency;
      toUpdate.push({
        id: existing.id,
        patch: {
          account_id: d.account_id, to_account_id: d.to_account_id,
          currency: d.currency, amount: d.amount, amount_main: amountMain,
          date: new Date(d.date).toISOString(), deleted: false,
          ...(currencyChanged ? { exchange_rate: null } : {}),
          ...(categoryNeedsFill ? { category_id: d.category_id } : {}),
        },
      });
    }
  }

  const toDelete = [];
  for (const [key, existing] of existingByKey) {
    if (!desiredByKey.has(key) && !existing.deleted) toDelete.push(existing.id);
  }

  if (toInsert.length) {
    // upsert+ignoreDuplicates, no insert liso — si StrictMode o dos pestañas
    // corren esto al mismo tiempo, la restricción unique (sl_link_id,
    // sl_source_kind, sl_source_id, sl_role) hace que la segunda inserción
    // simplemente no haga nada, en vez de fallar con un error de conflicto.
    const { error } = await supabase.from("mm_transactions")
      .upsert(toInsert, { onConflict: "sl_link_id,sl_source_kind,sl_source_id,sl_role", ignoreDuplicates: true });
    if (error) console.error("reconcileEvenGroup: no se pudo insertar", error);
  }
  for (const { id, patch } of toUpdate) {
    const { error } = await supabase.from("mm_transactions").update(patch).eq("id", id);
    if (error) console.error("reconcileEvenGroup: no se pudo actualizar", id, error);
  }
  if (toDelete.length) {
    const { error } = await supabase.from("mm_transactions").update({ deleted: true }).in("id", toDelete);
    if (error) console.error("reconcileEvenGroup: no se pudo borrar", error);
  }
}

export async function reconcileEvenGroup(userId) {
  if (!userId) return;
  const { data: links } = await supabase.from("sl_mm_links").select("*").eq("user_id", userId).eq("active", true);
  if (!links?.length) return;

  const { data: settingsRow } = await supabase.from("mm_settings").select("main_currency").eq("user_id", userId).maybeSingle();
  const mainCurrency = settingsRow?.main_currency || "EUR";

  // Una sola consulta para TODAS las cuentas del usuario (no una por
  // vínculo, como antes) -- hace falta poder mirar cualquier cuenta que
  // haya prestado alguna vez en el historial de un vínculo, no solo las que
  // ese vínculo señala hoy (ver computeLendOffsetDesired/groupLendOffsetPeriods).
  const { data: accounts } = await supabase
    .from("mm_accounts")
    .select("id, deleted, is_credit_card, statement_day, payment_account_id")
    .eq("user_id", userId);
  const accountsById = new Map((accounts || []).map((a) => [a.id, a]));

  for (const link of links) {
    try { await reconcileLink(link, userId, mainCurrency, accountsById); }
    catch (e) { console.error("reconcileEvenGroup: falló el vínculo", link.id, e); }
  }
}
