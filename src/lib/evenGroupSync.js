import { supabase } from "./supabaseClient.js";
import { fetchAllRows } from "./evenCapitalData.js";
import { CUSTOM_USER_CONFIG } from "./customUserConfig.js";
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

  // lend_account_id/loan_account_id/lend_offset_account_id son opcionales
  // (si nunca se configuraron, esa pata de la transferencia de préstamo
  // sigue usando "propios"/"ajenos" como siempre, o directamente no se
  // genera ninguna compensación) -- por eso no entran en el .in(...) cuando
  // son null, ni se exige que existan.
  const { data: accounts } = await supabase
    .from("mm_accounts")
    .select("id, deleted, is_credit_card, statement_day, payment_account_id")
    .in("id", [link.default_own_account_id, link.default_other_account_id, link.pseudo_account_id, link.lend_account_id, link.loan_account_id, link.lend_offset_account_id].filter(Boolean));
  const byId = new Map((accounts || []).map((a) => [a.id, a]));
  const own = byId.get(link.default_own_account_id);
  const other = byId.get(link.default_other_account_id);
  const pseudo = byId.get(link.pseudo_account_id);
  const lend = link.lend_account_id ? byId.get(link.lend_account_id) : null;
  const loan = link.loan_account_id ? byId.get(link.loan_account_id) : null;
  const lendOffset = link.lend_offset_account_id ? byId.get(link.lend_offset_account_id) : null;
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

  // La cuenta que de verdad se usa para prestar (para saber si hace falta
  // compensación por ciclo): "lo que prestás" si está configurada, si no
  // "propios" -- mismo fallback que usa ensureExpenseChoices/el sync, y que
  // ya corrige EvenGroupTab.jsx al decidir si mostrar el campo o no.
  const lendAccountRow = lend || own;

  return { groupName: group.name, memberId: member.id, expenses, payments, lendAccountRow };
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

// UUID determinístico (no aleatorio) a partir de un ciclo de tarjeta +
// moneda -- sl_source_id es `uuid` en la base, pero esto no identifica
// ningún gasto real (el período ya es único de por sí dentro de un mismo
// vínculo). Sin truncar nada (fecha y moneda entran completas, repartidas
// en distintos grupos del uuid) para que dos períodos distintos nunca
// puedan terminar generando el mismo id.
function cycleStartUuid(cycleStartKey, currency) {
  const digits = cycleStartKey.replaceAll("-", ""); // YYYYMMDD -- ya son dígitos hex válidos
  const curHex = Array.from(currency.toUpperCase().padEnd(3, "0")).map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("").slice(0, 6);
  return `${digits}-0000-4${curHex.slice(0, 3)}-8${curHex.slice(3, 6)}-000000000000`;
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

// Compensación por ciclo de tarjeta (ver TAREAS_ACTUALES.md, sección 1): si
// "lo que prestás" es una tarjeta de crédito y hay una "cuenta de origen"
// elegida, cada ciclo YA CERRADO de esa tarjeta genera UNA transferencia
// desde esa cuenta de origen hacia la cuenta de PAGO de la tarjeta, por el
// total prestado en ese ciclo -- así esa cuenta (la que de verdad se ve
// rebajada al pagar la tarjeta completa) no queda baja por lo que en
// realidad le toca devolver al grupo, sin ningún paso manual ni esperar a
// pagar la tarjeta.
// Antes esto iba hacia `default_other_account_id` ("ajenos") en vez de hacia
// `payment_account_id` -- no tiene relación con qué cuenta de verdad paga la
// tarjeta, solo "funcionaba" si esas dos cuentas coincidían de casualidad.
// Bug encontrado por Nicolas, 2026-10-29 (ver PENDIENTES.md).
//
// Se calcula por PERÍODO (no por transacción individual), para que sea
// imposible duplicar: la clave de cada fila es el propio ciclo (fecha de
// corte + moneda), así que recalcular esto de nuevo con los mismos datos da
// siempre la misma fila -- reconcileLink ya sabe actualizar en vez de
// insertar si el total de ese ciclo cambia (ej. se borra un gasto viejo).
function computeLendOffsetDesired(link, ctx, desired) {
  if (!link.lend_offset_account_id || !ctx.lendAccountRow?.is_credit_card || !ctx.lendAccountRow?.statement_day || !ctx.lendAccountRow?.payment_account_id) return [];
  const statementDay = ctx.lendAccountRow.statement_day;
  const currentCycleStart = creditCardCycleStart(statementDay, new Date());

  const lendLegs = desired.filter((d) => d.role === "loan" && d.to_account_id === link.pseudo_account_id && d.account_id === ctx.lendAccountRow.id);

  // Agrupado por (ciclo, moneda) -- un préstamo en una moneda distinta a la
  // principal no se mezcla con los demás, misma precaución que ya tiene el
  // resto de la reconciliación con `exchange_rate`.
  const byPeriod = new Map();
  for (const d of lendLegs) {
    const cycleStart = creditCardCycleStart(statementDay, new Date(d.date));
    if (cycleStart.getTime() >= currentCycleStart.getTime()) continue; // ciclo todavía abierto, no se compensa todavía
    const cycleStartKey = `${cycleStart.getFullYear()}-${String(cycleStart.getMonth() + 1).padStart(2, "0")}-${String(cycleStart.getDate()).padStart(2, "0")}`;
    const groupKey = `${cycleStartKey}:${d.currency}`;
    const entry = byPeriod.get(groupKey) || { cycleStart, cycleStartKey, currency: d.currency, total: 0 };
    entry.total = roundCents(entry.total + d.amount);
    byPeriod.set(groupKey, entry);
  }

  const offsetDesired = [];
  for (const { cycleStart, cycleStartKey, currency, total } of byPeriod.values()) {
    if (total <= EPSILON) continue;
    const closeDate = nextCycleStart(statementDay, cycleStart);
    offsetDesired.push({
      key: `lend_offset:${cycleStartKey}:${currency}:lend_offset`,
      source_kind: "lend_offset", source_id: cycleStartUuid(cycleStartKey, currency), role: "lend_offset", type: "transfer",
      account_id: link.lend_offset_account_id, to_account_id: ctx.lendAccountRow.payment_account_id,
      amount: total, currency, category_id: null,
      title: "Compensación de lo prestado", memo: `Ciclo ${cycleStartKey}`, date: closeDate.getTime(),
    });
  }
  return offsetDesired;
}

// Hecho a medida para un usuario puntual (ver customUserConfig.js) -- no es
// parte de la sincronización genérica, vive aparte a propósito para no
// contaminar la lógica de todos con un hábito personal de uno solo. Cuando
// ese usuario crea un gasto en el grupo de EvenGroup indicado, pagado con
// la cuenta indicada, y presta una parte, esa parte se suma a la
// transacción manual "Pendiente TC" que ya maneja él mismo mes a mes (en vez
// de que tenga que sumarla a mano cada vez).
//
// Nunca resta ni resetea nada sola, y nunca crea la fila "Pendiente TC" si
// no existe todavía (la maneja el usuario) -- solo suma, una vez por gasto
// (ver sl_mm_pendiente_tc_contributions, evita sumar dos veces si esto
// corre de nuevo para el mismo gasto). Si el gasto se borra después de ya
// haber sumado, NO se resta solo (podría ya haber movido/reseteado esa fila
// a un mes nuevo) -- ver la pantalla que avisa de esto para que lo corrija
// a mano.
async function applyPendienteTcAutoSum(link, userId, userEmail, ctx, choicesBySourceKey) {
  const config = CUSTOM_USER_CONFIG[userEmail]?.pendienteTcAutoSum;
  if (!config || ctx.groupName !== config.splitGroupName) return;

  // Ojo: buscar la cuenta "Pendiente" por NOMBRE (como se hacía antes) se
  // rompe en cuanto hay más de una cuenta con ese nombre (ej. una por cada
  // grupo de cuentas) -- `.find()` puede agarrar cualquiera, no
  // necesariamente la de este vínculo, y entonces la búsqueda de la
  // transacción "Pendiente TC" de más abajo no encuentra nada (se salta en
  // silencio, sin ningún error, bug real encontrado en vivo 2026-10-20). En
  // vez de eso, "tcAccount" solo sirve para el nombre (asumido único) y la
  // cuenta de "lo prestado" se resuelve IGUAL que en computeDesiredTransactions:
  // por gasto (choice.loan_account_id), nunca por nombre.
  const { data: accounts } = await supabase
    .from("mm_accounts")
    .select("id, name")
    .eq("user_id", userId)
    .eq("deleted", false)
    .eq("name", config.tcAccountName);
  const tcAccount = (accounts || [])[0];
  if (!tcAccount) return;

  // Traído una sola vez antes del loop: evita reintentar el insert (y su
  // 409 esperado, ver más abajo) para cada gasto que esta misma función ya
  // aplicó en una corrida anterior -- sin esto, cada sincronización volvía a
  // intentarlo para TODOS los gastos ya sumados desde siempre, no solo los
  // nuevos. El insert liso sigue siendo lo que de verdad protege contra una
  // doble suma (dos corridas casi simultáneas sobre un gasto recién
  // aplicado) -- este chequeo solo recorta el caso ya resuelto hace rato.
  const { data: existingContribs } = await supabase
    .from("sl_mm_pendiente_tc_contributions")
    .select("source_id")
    .eq("link_id", link.id)
    .eq("source_kind", "expense");
  const appliedExpenseIds = new Set((existingContribs || []).map((c) => c.source_id));

  for (const e of ctx.expenses) {
    if (e.deleted || !expenseInvolvesMe(e, ctx.memberId)) continue;
    if (appliedExpenseIds.has(e.id)) continue;
    const shareAmt = Number(e.shares?.[ctx.memberId] || 0);
    const paidAmt = Number(e.payers?.[ctx.memberId] || 0);
    const diff = roundCents(paidAmt - shareAmt);
    if (diff <= EPSILON) continue; // solo cuando presto (pago de más), no cuando me prestan

    const choice = choicesBySourceKey.get(`expense:${e.id}`);
    const accountId = choice?.account_id || link.default_other_account_id;
    if (accountId !== tcAccount.id) continue; // este gasto puntual no se pagó con esa cuenta
    const loanAccountId = choice?.loan_account_id || accountId;

    const { data: pendienteTcTx } = await supabase
      .from("mm_transactions")
      .select("id, amount, amount_main")
      .eq("user_id", userId).eq("account_id", tcAccount.id).eq("to_account_id", loanAccountId)
      .eq("title", config.pendienteTcTitle).eq("deleted", false)
      .maybeSingle();
    if (!pendienteTcTx) continue; // no existe todavía esa fila -- la maneja el usuario, no se auto-crea

    // Primero RESERVAR el registro (insert liso, no upsert -- si ya existe,
    // la restricción unique lo rechaza) y recién DESPUÉS sumar el monto. Al
    // revés (como estaba antes) dos corridas casi al mismo tiempo podían
    // sumar las dos antes de que ninguna llegara a guardar el registro,
    // duplicando la suma sin que quedara ningún rastro de que pasó.
    const { error: insertError } = await supabase
      .from("sl_mm_pendiente_tc_contributions")
      .insert({ link_id: link.id, source_kind: "expense", source_id: e.id, amount: diff });
    if (insertError) {
      if (insertError.code !== "23505") console.error("applyPendienteTcAutoSum: no se pudo registrar el aporte", insertError);
      continue; // 23505 = unique violation: ya se aplicó (esta misma corrida u otra), no sumar de nuevo
    }

    // amount_main (no solo amount) es lo que usa el saldo corriente de la
    // cuenta (AccountActivityScreen.jsx) -- quedarse corto acá hace que la
    // fila muestre el monto nuevo pero el saldo arrastrado siga el viejo.
    const { error: updateError } = await supabase
      .from("mm_transactions")
      .update({
        amount: Number(pendienteTcTx.amount) + diff,
        amount_main: Number(pendienteTcTx.amount_main) + diff,
      })
      .eq("id", pendienteTcTx.id);
    if (updateError) { console.error("applyPendienteTcAutoSum: no se pudo sumar", updateError); continue; }

    await updatePendienteTcNote(link, pendienteTcTx.id);
  }
}

// Nota de "Pendiente TC" con los últimos 5 aportes automáticos (fecha +
// monto) -- se regenera entera desde sl_mm_pendiente_tc_contributions cada
// vez (nunca se parsea/edita el texto anterior), así nunca se puede romper
// el formato ni duplicar una línea.
async function updatePendienteTcNote(link, pendienteTcTxId) {
  // Más de 5 a propósito: un gasto de prueba borrado después (ver el aviso
  // de "Pendiente TC" en Transacciones) no debería seguir ocupando un lugar
  // en "los últimos 5" solo porque su aporte sigue registrado -- se trae de
  // más y se filtra, para quedarse con los últimos 5 de verdad vigentes.
  const { data: recent } = await supabase
    .from("sl_mm_pendiente_tc_contributions")
    .select("source_kind, source_id, amount, created_at")
    .eq("link_id", link.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!recent?.length) return;

  // Descripción del gasto de origen, para que la nota diga de qué fue cada
  // aporte -- se lee al vuelo (no se guarda duplicada en la tabla de
  // aportes), así que si el gasto se renombra después, la nota sigue la
  // descripción actual, no la de cuando se aplicó.
  const expenseIds = recent.filter((c) => c.source_kind === "expense").map((c) => c.source_id);
  const { data: expenses } = expenseIds.length
    ? await supabase.from("expenses").select("id, description, deleted").in("id", expenseIds)
    : { data: [] };
  const expenseById = new Map((expenses || []).map((e) => [e.id, e]));

  // Un gasto borrado FÍSICAMENTE (DELETE directo, no `deleted:true`) no
  // aparece acá -- expenseById.get(...) da undefined, y "¿no está borrado?"
  // sobre undefined da true por error, dejando pasar un aporte que ya no
  // corresponde a nada real. Hace falta que el gasto EXISTA y no esté
  // borrado, no alcanza con "no está marcado como borrado".
  const active = recent.filter((c) => {
    const e = expenseById.get(c.source_id);
    return e && !e.deleted;
  }).slice(0, 5);
  if (!active.length) return;

  const lines = active.map((c) => {
    const date = new Date(c.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
    const description = expenseById.get(c.source_id)?.description;
    return `${date}: +€${Number(c.amount).toFixed(2)}${description ? ` ${description}` : ""}`;
  });
  const memo = "Últimos aportes automáticos:\n" + lines.join("\n");
  const { error } = await supabase.from("mm_transactions").update({ memo }).eq("id", pendienteTcTxId);
  if (error) console.error("updatePendienteTcNote: no se pudo actualizar la nota", error);
}

async function reconcileLink(link, userId, userEmail, mainCurrency) {
  const ctx = await loadLinkContext(link, userId);
  if (!ctx) return; // vínculo congelado, no se toca nada

  const { data: existingChoices } = await supabase.from("sl_mm_expense_choices").select("*").eq("link_id", link.id);
  const choicesBySourceKey = new Map((existingChoices || []).map((c) => [`${c.source_kind}:${c.source_id}`, c]));

  const involvedKeys = [
    ...ctx.expenses.filter((e) => expenseInvolvesMe(e, ctx.memberId)).map((e) => `expense:${e.id}`),
    ...ctx.payments.filter((p) => paymentInvolvesMe(p, ctx.memberId)).map((p) => `payment:${p.id}`),
  ];
  await ensureExpenseChoices(link, ctx, involvedKeys, choicesBySourceKey);

  const desired = computeDesiredTransactions(link, ctx, choicesBySourceKey);
  const lendOffsetDesired = computeLendOffsetDesired(link, ctx, desired);
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

  await applyPendienteTcAutoSum(link, userId, userEmail, ctx, choicesBySourceKey);
}

export async function reconcileEvenGroup(userId, userEmail) {
  if (!userId) return;
  const { data: links } = await supabase.from("sl_mm_links").select("*").eq("user_id", userId).eq("active", true);
  if (!links?.length) return;

  const { data: settingsRow } = await supabase.from("mm_settings").select("main_currency").eq("user_id", userId).maybeSingle();
  const mainCurrency = settingsRow?.main_currency || "EUR";

  for (const link of links) {
    try { await reconcileLink(link, userId, userEmail, mainCurrency); }
    catch (e) { console.error("reconcileEvenGroup: falló el vínculo", link.id, e); }
  }
}

// Aportes a "Pendiente TC" (ver applyPendienteTcAutoSum) cuyo gasto de
// origen ya fue borrado en EvenGroup -- como esa suma nunca se revierte
// sola, esto es lo que alimenta el aviso para que el usuario la corrija a
// mano. `acknowledged` los saca de la lista sin borrar el historial.
export async function getPendienteTcReviewItems(userId, userEmail) {
  const config = CUSTOM_USER_CONFIG[userEmail]?.pendienteTcAutoSum;
  if (!config) return [];

  const { data: links } = await supabase.from("sl_mm_links").select("id").eq("user_id", userId);
  const linkIds = (links || []).map((l) => l.id);
  if (!linkIds.length) return [];

  const { data: contributions } = await supabase
    .from("sl_mm_pendiente_tc_contributions")
    .select("id, source_kind, source_id, amount, created_at")
    .in("link_id", linkIds)
    .eq("acknowledged", false);
  if (!contributions?.length) return [];

  const expenseIds = contributions.filter((c) => c.source_kind === "expense").map((c) => c.source_id);
  const { data: expenses } = await supabase.from("expenses").select("id, deleted, description").in("id", expenseIds);
  const expenseById = new Map((expenses || []).map((e) => [e.id, e]));

  return contributions
    .filter((c) => {
      const e = expenseById.get(c.source_id);
      return !e || e.deleted;
    })
    .map((c) => ({ ...c, expenseDescription: expenseById.get(c.source_id)?.description || null }));
}

export async function acknowledgePendienteTcReviewItem(id) {
  const { error } = await supabase.from("sl_mm_pendiente_tc_contributions").update({ acknowledged: true }).eq("id", id);
  if (error) throw error;
}
