import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./localDb.js";
import { offlineSupabase as supabase } from "./offlineSupabase.js";

/* =========================================================================
   MARCADORES — plantillas de transacción reutilizables (Money Manager, no
   Split Ledger). A propósito NO guardan fecha: siempre se usan con "hoy" al
   crear la transacción real a partir de uno. `sort_order` es un valor
   global en la tabla, pero cada pantalla lo usa agrupado por `type` — no
   hace falta que sea contiguo entre tipos distintos, cada grupo se reordena
   mirando solo sus propias filas.
   ========================================================================= */

// Lectura local-first, igual que el resto de Money Manager (ver
// moneyManagerData.js) — la copia local la trae syncEngine.js.
export function useBookmarks(userId) {
  const rows = useLiveQuery(
    () => (userId ? db.mm_bookmarks.where("user_id").equals(userId).sortBy("sort_order") : []),
    [userId],
    undefined
  );
  return { bookmarks: rows || [], loading: rows === undefined, reload: () => {} };
}

// Crea un marcador a partir de una transacción (ya guardada, o lo que haya
// en el formulario en este momento) — va al final de su propio grupo (type).
// El conteo para decidir sort_order se calcula contra la copia local (no un
// COUNT a Supabase): funciona igual con o sin señal, y Dexie siempre está al
// día con lo que el usuario ya tiene (incluido lo creado offline todavía sin
// sincronizar). La tabla tiene un índice único del lado del servidor
// (mm_bookmarks_unique, con coalesce) que rechaza un duplicado exacto — eso
// solo se detecta de verdad con señal real (ver error.code 23505 abajo); un
// duplicado creado offline simplemente se sube igual al reconectar.
export async function createBookmark(userId, tx) {
  const sortOrder = await db.mm_bookmarks.where({ user_id: userId, type: tx.type }).count();
  const { error } = await supabase.from("mm_bookmarks").insert({
    user_id: userId,
    type: tx.type,
    account_id: tx.account_id,
    to_account_id: tx.to_account_id || null,
    category_id: tx.category_id || null,
    currency: tx.currency,
    amount: tx.amount,
    exchange_rate: tx.exchange_rate || null,
    title: tx.title || null,
    memo: tx.memo || null,
    sort_order: sortOrder,
  });
  if (error) {
    if (error.code === "23505") return { duplicate: true };
    throw error;
  }
  return { duplicate: false };
}

export async function deleteBookmark(id) {
  const { error } = await supabase.from("mm_bookmarks").delete().eq("id", id);
  if (error) throw error;
}

// `orderedIds`: ids de un solo grupo (type), ya en el orden final — se
// reasignan 0..n solo entre ellos, sin tocar los de otros grupos.
export async function reorderBookmarks(orderedIds) {
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from("mm_bookmarks").update({ sort_order: i }).eq("id", id))
  );
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}
