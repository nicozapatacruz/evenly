import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient.js";

/* =========================================================================
   MARCADORES — plantillas de transacción reutilizables (Money Manager, no
   Split Ledger). A propósito NO guardan fecha: siempre se usan con "hoy" al
   crear la transacción real a partir de uno. `sort_order` es un valor
   global en la tabla, pero cada pantalla lo usa agrupado por `type` — no
   hace falta que sea contiguo entre tipos distintos, cada grupo se reordena
   mirando solo sus propias filas.
   ========================================================================= */

export function useBookmarks(userId) {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  // Solo la carga inicial debe mostrar "Cargando…" — un reload() después de
  // borrar/reordenar no debería, porque ya hay datos en pantalla (mostrar y
  // esconder el texto empuja todo el contenido de abajo, un salto feo).
  const loadedOnceRef = useRef(false);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    if (!loadedOnceRef.current) setLoading(true);
    const { data } = await supabase
      .from("mm_bookmarks")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order");
    setBookmarks(data || []);
    setLoading(false);
    loadedOnceRef.current = true;
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { bookmarks, loading, reload: load };
}

// Crea un marcador a partir de una transacción (ya guardada, o lo que haya
// en el formulario en este momento) — va al final de su propio grupo (type).
// No depende de tener la lista ya cargada (se puede llamar desde cualquier
// formulario de transacción, no solo desde la propia pantalla de Marcadores).
// La tabla tiene un índice único (mm_bookmarks_unique, con coalesce para las
// columnas que aceptan null) que rechaza un duplicado exacto — acá solo se
// traduce ese error (23505) a { duplicate: true } en vez de tirarlo.
export async function createBookmark(userId, tx) {
  const { count } = await supabase
    .from("mm_bookmarks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", tx.type);
  const sortOrder = count || 0;
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
