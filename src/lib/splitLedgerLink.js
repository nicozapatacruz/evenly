import { supabase } from "./supabaseClient.js";

/* =========================================================================
   VINCULAR SPLIT LEDGER CON MONEY MANAGER — capa de datos. Puente entre los
   dos sistemas (hoy separados a propósito), así que vive en su propio
   archivo en vez de en moneyManagerData.js o en el lado de Split Ledger.

   El vínculo es por (usuario, grupo) — varios miembros del mismo grupo
   compartido pueden vincularlo cada uno a su propia cuenta, de forma
   independiente. Acá solo se arma el vínculo y la cuenta pseudo que lo
   representa en Cuentas; la sincronización real (crear las transacciones de
   "mi parte" + los préstamos) es una pieza aparte, todavía no construida.
   ========================================================================= */

// Grupo de cuentas "Split Ledger" — uno por usuario, se crea la primera vez
// que se vincula algo. upsert+ignoreDuplicates en vez de insert+catch: si dos
// pestañas lo crean al mismo tiempo, el índice único (user_id, system_key)
// descarta la segunda sin tirar error, y después las dos vuelven a
// seleccionar la misma fila.
async function ensureSplitLedgerAccountGroup(userId) {
  const { error: upsertError } = await supabase.from("mm_account_groups").upsert(
    { user_id: userId, name: "Split Ledger", type: "other", system_key: "split_ledger", sort_order: 999 },
    { onConflict: "user_id,system_key", ignoreDuplicates: true }
  );
  if (upsertError) throw upsertError;
  const { data, error } = await supabase
    .from("mm_account_groups")
    .select("*")
    .eq("user_id", userId)
    .eq("system_key", "split_ledger")
    .single();
  if (error) throw error;
  return data;
}

// Vincular un grupo de Split Ledger a Money Manager — 2 cuentas default, no
// 1 sola: "propios" (gastos que cargo yo) y "ajenos" (gastos que carga otro
// miembro). Cuál se usa para un gasto puntual puede cambiarse después sin
// perder nada — ver sl_mm_expense_choices (la que fija la cuenta real usada
// por gasto, para que la transferencia oculta de préstamo siempre viaje
// junto con el gasto, sin importar qué default tengas hoy).
export async function linkGroupToAccount({ userId, groupId, memberId, groupName, defaultOwnAccountId, defaultOtherAccountId }) {
  const sysGroup = await ensureSplitLedgerAccountGroup(userId);

  // Si este mismo grupo ya estuvo vinculado antes (y se desvinculó), se
  // reutiliza la misma cuenta pseudo — así no se pierde el saldo pendiente
  // que ya traía. Si esa cuenta vieja se borró a mano, se crea una nueva.
  const { data: previousLinks, error: prevError } = await supabase
    .from("sl_mm_links")
    .select("pseudo_account_id")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .eq("active", false)
    .order("created_at", { ascending: false })
    .limit(1);
  if (prevError) throw prevError;

  let pseudoAccountId = null;
  if (previousLinks?.[0]) {
    const { data: pseudo } = await supabase
      .from("mm_accounts")
      .select("id, deleted")
      .eq("id", previousLinks[0].pseudo_account_id)
      .maybeSingle();
    if (pseudo && !pseudo.deleted) pseudoAccountId = pseudo.id;
  }

  if (!pseudoAccountId) {
    const { data: pseudo, error } = await supabase
      .from("mm_accounts")
      .insert({ user_id: userId, group_id: sysGroup.id, name: groupName, icon: "➗", sort_order: 999, hidden: false })
      .select()
      .single();
    if (error) throw error;
    pseudoAccountId = pseudo.id;
  }

  const { error } = await supabase.from("sl_mm_links").insert({
    user_id: userId,
    group_id: groupId,
    member_id: memberId,
    default_own_account_id: defaultOwnAccountId,
    default_other_account_id: defaultOtherAccountId,
    pseudo_account_id: pseudoAccountId,
  });
  if (error) throw error;
}

// Cambiar las cuentas default de un vínculo ya activo. Es seguro en
// cualquier momento, sin desvincular/revincular: no es retroactivo porque
// los gastos ya sincronizados tienen su cuenta fijada en
// sl_mm_expense_choices — esto solo cambia qué cuenta se usa de acá en más,
// para gastos que todavía no tienen una fila ahí.
export async function updateLinkDefaults(linkId, { defaultOwnAccountId, defaultOtherAccountId }) {
  const { error } = await supabase
    .from("sl_mm_links")
    .update({ default_own_account_id: defaultOwnAccountId, default_other_account_id: defaultOtherAccountId })
    .eq("id", linkId);
  if (error) throw error;
}

export async function unlinkGroup(linkId) {
  const { error } = await supabase
    .from("sl_mm_links")
    .update({ active: false, unlinked_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) throw error;
}
