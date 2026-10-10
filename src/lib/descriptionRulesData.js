import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";

/* =========================================================================
   REGLAS DE DESCRIPCIÓN — "memoria" de la importación de fotos (ver
   PENDIENTES.md): cada vez que confirmás un paso del asistente con una
   descripción + categoría, queda guardado acá, para que la próxima vez que
   aparezca esa misma descripción (ej. una foto nueva del mismo comercio) se
   autocomplete sola. No es machine learning, es una tabla de búsqueda simple
   por usuario.

   La clave de búsqueda (match_text) y el valor a mostrar (title) son dos
   cosas DISTINTAS a propósito: match_text es siempre el texto tal como lo
   extrae el OCR de la foto (lo que el banco imprime, ej. "Market
   Pamplona") — eso no cambia de una foto a otra del mismo comercio. title
   es lo que el usuario decidió que se vea (puede ser un renombre, ej.
   "Carrefour"). Si las dos fueran la misma columna, renombrar una
   descripción rompería el reconocimiento la próxima vez, porque el OCR
   nunca va a volver a leer el nombre renombrado.
   ========================================================================= */

// Tiene que ser el espejo exacto de la columna generada en SQL
// (normalized_match_text, ver el ALTER TABLE entregado): mismo trim +
// lowercase + colapso de espacios en los dos lados, o la búsqueda en
// memoria y el índice único de la base dejan de coincidir.
export function normalizeDescription(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function useDescriptionRules(userId) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from("mm_description_rules")
      .select("*")
      .eq("user_id", userId);
    setRules(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { rules, loading, reload: load };
}

// Busca una coincidencia exacta (normalizada) para la descripción que el OCR
// extrajo de la foto (candidate.description, no la línea cruda completa: esa
// trae el monto pegado, que cambia en cada transacción). Se llama una sola
// vez al mostrar cada paso del asistente, no en cada tecla mientras el
// usuario corrige la descripción.
export function findDescriptionRule(rules, matchText) {
  if (!matchText) return null;
  const normalized = normalizeDescription(matchText);
  return rules.find((r) => r.normalized_match_text === normalized) || null;
}

// "Gana la más reciente": el upsert de Supabase ya pisa las columnas no
// clave por defecto, así que alcanza con upsertear siempre que se confirma
// un paso, sin distinguir alta de actualización a mano. matchText tiene que
// ser siempre lo que el OCR extrajo originalmente (estable entre fotos),
// aunque title/categoryId/memo cambien con cada corrección del usuario.
export async function upsertDescriptionRule(userId, { matchText, type, title, categoryId, memo }) {
  const { error } = await supabase.from("mm_description_rules").upsert(
    {
      user_id: userId,
      match_text: matchText,
      title,
      type,
      category_id: categoryId || null,
      memo: memo || null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "user_id,normalized_match_text" }
  );
  if (error) throw error;
}
