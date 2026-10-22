import { db } from "./localDb.js";
import { supabase } from "./supabaseClient.js";

// Toda escritura de EvenCapital pasa por acá (ver offlineSupabase.js) y
// queda encolada, haya o no señal — online, un drenador la vacía casi
// enseguida; offline, se acumula hasta reconectar (ver syncEngine.js).

export function generateLocalId() {
  return `tmp_${crypto.randomUUID()}`;
}

export async function enqueue(table, op, targetId, payload, meta = {}) {
  await db.write_queue.add({ table, op, targetId, payload, onConflict: meta.onConflict || null, createdAt: Date.now(), status: "pending" });
}

// Agrupa por (tabla, fila) preservando el orden de llegada — una fila nueva
// creada offline y editada offline otra vez colapsa a un solo insert con el
// payload final; un hard_delete sobre algo que nunca llegó a existir en el
// servidor descarta el grupo entero (op:"noop"); un hard_delete sobre una
// fila que YA existía gana sobre cualquier update pendiente (una vez
// borrada, el resto del grupo no importa).
export function compactQueue(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = `${e.table}::${e.targetId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const result = [];
  for (const group of groups.values()) {
    const rawIds = group.map((e) => e.id);
    const first = group[0];
    if (first.op === "upsert") {
      const merged = group.reduce((acc, e) => ({ ...acc, ...e.payload }), {});
      result.push({ table: first.table, op: "upsert", targetId: first.targetId, payload: merged, onConflict: first.onConflict, rawIds });
      continue;
    }
    const isNewRow = first.op === "insert";
    const hasHardDelete = group.some((e) => e.op === "hard_delete");
    if (isNewRow && hasHardDelete) {
      result.push({ table: first.table, op: "noop", targetId: first.targetId, payload: null, rawIds });
      continue;
    }
    if (hasHardDelete) {
      result.push({ table: first.table, op: "hard_delete", targetId: first.targetId, payload: null, rawIds });
      continue;
    }
    const merged = group.reduce((acc, e) => ({ ...acc, ...e.payload }), {});
    result.push({ table: first.table, op: isNewRow ? "insert" : "update", targetId: first.targetId, payload: merged, rawIds });
  }
  return result;
}

// Reemplaza cualquier FK que todavía apunte a un id temporal ya resuelto en
// ESTE drenado (account_id, to_account_id, category_id, payment_account_id, etc.)
function remapPayloadIds(payload, idMap) {
  if (!payload) return payload;
  const out = { ...payload };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && v.startsWith("tmp_") && idMap.has(v)) out[k] = idMap.get(v);
  }
  return out;
}

// Vacía la cola contra Supabase. Se asume llamada solo con señal real
// (el caller, syncEngine.js, ya lo confirmó vía useConnectivity). Un grupo
// que falla queda con sus entradas originales todavía "pending" — se
// reintenta solo en el próximo drenado, sin bloquear a los demás grupos
// (salvo que dependan de un id temporal que ese grupo todavía no resolvió).
export async function drainQueue() {
  const pending = await db.write_queue.where("status").equals("pending").sortBy("id");
  if (!pending.length) return;
  const compacted = compactQueue(pending);
  const idMap = new Map();

  for (const entry of compacted) {
    const { table, op, targetId, rawIds, onConflict } = entry;
    const payload = remapPayloadIds(entry.payload, idMap);
    try {
      if (op === "noop") {
        await db.write_queue.bulkDelete(rawIds);
      } else if (op === "insert") {
        const { id: _drop, ...row } = payload;
        const { data, error } = await supabase.from(table).insert(row).select().single();
        if (error) throw error;
        idMap.set(targetId, data.id);
        await db.table(table).delete(targetId);
        await db.table(table).put(data);
        await db.write_queue.bulkDelete(rawIds);
      } else if (op === "update") {
        const realId = idMap.get(targetId) || targetId;
        const { error } = await supabase.from(table).update(payload).eq("id", realId);
        if (error) throw error;
        await db.table(table).update(realId, payload).catch(() => {});
        await db.write_queue.bulkDelete(rawIds);
      } else if (op === "hard_delete") {
        const realId = idMap.get(targetId) || targetId;
        const { error } = await supabase.from(table).delete().eq("id", realId);
        if (error) throw error;
        await db.table(table).delete(realId);
        await db.write_queue.bulkDelete(rawIds);
      } else if (op === "upsert") {
        const { data, error } = await supabase.from(table).upsert(payload, { onConflict }).select().single();
        if (error) throw error;
        await db.table(table).put(data);
        await db.write_queue.bulkDelete(rawIds);
      }
    } catch (e) {
      // Queda pendiente para el próximo drenado — no se aborta el resto de
      // la cola por un grupo puntual que falló.
      console.error(`writeQueue: no se pudo sincronizar ${table}/${targetId} (${op})`, e);
    }
  }
}
