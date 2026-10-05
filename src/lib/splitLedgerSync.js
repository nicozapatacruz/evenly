import { supabase } from "./supabaseClient.js";

/* =========================================================================
   SINCRONIZACIÓN SPLIT LEDGER → MONEY MANAGER — reconciliación completa del
   lado del cliente (no hay triggers de base en este proyecto). Se corre
   dentro de useMoneyManager.load(), antes del auto-pago de tarjetas (puede
   haber transferencias de préstamo que afecten el saldo de una tarjeta), y
   de nuevo justo después de guardar algo en un grupo vinculado — ver
   SPLIT_MONEY_LINK_PLAN.md para el diseño completo.

   Por qué es un diff completo cada vez (no "solo lo nuevo"): Split Ledger no
   tiene `updated_at` en expenses, y algunos borrados son físicos (DELETE, no
   un simple `deleted: true`) — no queda rastro de que algo cambió o
   desapareció. La única forma confiable de detectarlo es recalcular todo lo
   que DEBERÍA existir y compararlo contra lo que YA existe.
   ========================================================================= */

const EPSILON = 0.005;

// Si el grupo ya no es visible, ya no sos miembro vinculado, o alguna cuenta
// involucrada (propia/ajena/pseudo) fue borrada → se congela el vínculo, no
// se escribe nada (mejor no tocar nada que borrar historial por error).
async function loadLinkContext(link, userId) {
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

  const { data: accounts } = await supabase
    .from("mm_accounts")
    .select("id, deleted")
    .in("id", [link.default_own_account_id, link.default_other_account_id, link.pseudo_account_id]);
  const byId = new Map((accounts || []).map((a) => [a.id, a]));
  const own = byId.get(link.default_own_account_id);
  const other = byId.get(link.default_other_account_id);
  const pseudo = byId.get(link.pseudo_account_id);
  if (!own || own.deleted || !other || other.deleted || !pseudo || pseudo.deleted) return null;

  // Desde que se vinculó (por created_at, no por la fecha propia del gasto —
  // "nada retroactivo" es sobre cuándo se CARGÓ el dato, no sobre qué fecha
  // tiene; un gasto cargado hoy con fecha de ayer sí sincroniza).
  const [{ data: expenses }, { data: payments }] = await Promise.all([
    supabase.from("expenses")
      .select("id, description, amount, currency, date, payers, shares, deleted, created_at")
      .eq("group_id", link.group_id).gte("created_at", link.linked_since),
    supabase.from("payments")
      .select("id, from_member_id, to_member_id, amount, currency, date, note, deleted, created_at")
      .eq("group_id", link.group_id).gte("created_at", link.linked_since),
  ]);

  return { groupName: group.name, memberId: member.id, expenses: expenses || [], payments: payments || [] };
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
// vínculo más tarde no mueve nada ya sincronizado.
async function ensureExpenseChoices(link, involvedKeys, choicesBySourceKey) {
  const missing = involvedKeys.filter((k) => !choicesBySourceKey.has(k));
  if (!missing.length) return;
  const rows = missing.map((key) => {
    const [source_kind, source_id] = key.split(":");
    return { link_id: link.id, source_kind, source_id, account_id: link.default_other_account_id, category_id: null };
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
    const categoryId = choice?.category_id || null;
    const common = { source_kind: "expense", source_id: e.id, currency: e.currency, title: e.description || null, memo: ctx.groupName, date: e.date };

    if (shareAmt > EPSILON) {
      desired.push({ ...common, key: `expense:${e.id}:share`, role: "share", type: "expense", account_id: accountId, to_account_id: null, amount: shareAmt, category_id: categoryId });
    }
    const diff = paidAmt - shareAmt;
    if (diff > EPSILON) {
      desired.push({ ...common, key: `expense:${e.id}:loan`, role: "loan", type: "transfer", account_id: accountId, to_account_id: link.pseudo_account_id, amount: diff, category_id: null });
    } else if (diff < -EPSILON) {
      desired.push({ ...common, key: `expense:${e.id}:loan`, role: "loan", type: "transfer", account_id: link.pseudo_account_id, to_account_id: accountId, amount: -diff, category_id: null });
    }
  }

  for (const p of ctx.payments) {
    if (!paymentInvolvesMe(p, ctx.memberId)) continue;
    const isFrom = p.from_member_id === ctx.memberId;
    const choice = choicesBySourceKey.get(`payment:${p.id}`);
    const accountId = choice?.account_id || link.default_other_account_id;
    desired.push({
      key: `payment:${p.id}:loan`, source_kind: "payment", source_id: p.id, role: "loan", type: "transfer",
      account_id: isFrom ? accountId : link.pseudo_account_id,
      to_account_id: isFrom ? link.pseudo_account_id : accountId,
      amount: Number(p.amount), currency: p.currency, category_id: null,
      title: p.note || "Pago", memo: ctx.groupName, date: p.date,
    });
  }

  return desired;
}

async function reconcileLink(link, userId, mainCurrency) {
  const ctx = await loadLinkContext(link, userId);
  if (!ctx) return; // vínculo congelado, no se toca nada

  const { data: existingChoices } = await supabase.from("sl_mm_expense_choices").select("*").eq("link_id", link.id);
  const choicesBySourceKey = new Map((existingChoices || []).map((c) => [`${c.source_kind}:${c.source_id}`, c]));

  const involvedKeys = [
    ...ctx.expenses.filter((e) => expenseInvolvesMe(e, ctx.memberId)).map((e) => `expense:${e.id}`),
    ...ctx.payments.filter((p) => paymentInvolvesMe(p, ctx.memberId)).map((p) => `payment:${p.id}`),
  ];
  await ensureExpenseChoices(link, involvedKeys, choicesBySourceKey);

  const desired = computeDesiredTransactions(link, ctx, choicesBySourceKey);
  const desiredByKey = new Map(desired.map((d) => [d.key, d]));

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
  // la editó en Split Ledger, ej. de USD a COP), la tasa guardada era para
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
    // a mano en Money Manager (o vía el picker de Split Ledger, que escribe
    // aparte en sl_mm_expense_choices) nunca se pisa solo en la próxima vuelta.
    const amountMain = amountMainFor(d, existing);
    const needsUpdate = existing.deleted
      || existing.account_id !== d.account_id
      || existing.to_account_id !== d.to_account_id
      || Number(existing.amount) !== d.amount
      || existing.currency !== d.currency
      || Number(existing.amount_main) !== amountMain
      || new Date(existing.date).getTime() !== new Date(d.date).getTime();
    if (needsUpdate) {
      const currencyChanged = existing.currency !== d.currency;
      toUpdate.push({
        id: existing.id,
        patch: {
          account_id: d.account_id, to_account_id: d.to_account_id,
          currency: d.currency, amount: d.amount, amount_main: amountMain,
          date: new Date(d.date).toISOString(), deleted: false,
          ...(currencyChanged ? { exchange_rate: null } : {}),
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
    if (error) console.error("reconcileSplitLedger: no se pudo insertar", error);
  }
  for (const { id, patch } of toUpdate) {
    const { error } = await supabase.from("mm_transactions").update(patch).eq("id", id);
    if (error) console.error("reconcileSplitLedger: no se pudo actualizar", id, error);
  }
  if (toDelete.length) {
    const { error } = await supabase.from("mm_transactions").update({ deleted: true }).in("id", toDelete);
    if (error) console.error("reconcileSplitLedger: no se pudo borrar", error);
  }
}

export async function reconcileSplitLedger(userId) {
  if (!userId) return;
  const { data: links } = await supabase.from("sl_mm_links").select("*").eq("user_id", userId).eq("active", true);
  if (!links?.length) return;

  const { data: settingsRow } = await supabase.from("mm_settings").select("main_currency").eq("user_id", userId).maybeSingle();
  const mainCurrency = settingsRow?.main_currency || "EUR";

  for (const link of links) {
    try { await reconcileLink(link, userId, mainCurrency); }
    catch (e) { console.error("reconcileSplitLedger: falló el vínculo", link.id, e); }
  }
}
