import { supabase } from "./supabaseClient.js";
import { db } from "./localDb.js";
import { drainQueue } from "./writeQueue.js";
import {
  generateDueRecurring, runCreditCardAutoPay, seedDefaults, fetchAllRows, DEFAULT_SETTINGS,
} from "./evenCapitalData.js";
import { reconcileEvenGroup, getPendienteTcReviewItems } from "./evenGroupSync.js";
import { probeOnline } from "./connectivity.js";

const MM_TABLES = [
  "mm_account_groups", "mm_accounts", "mm_categories", "mm_recurring",
  "sl_mm_links", "mm_transactions", "mm_description_rules",
];

// Trae todo fresco de Supabase y reemplaza la copia local entera de este
// usuario — se llama solo cuando la cola ya está vacía (ver runFullSync),
// para no pisar con un pull viejo una escritura offline que todavía no
// llegó a subir.
async function pullEvenCapitalIntoLocal(userId) {
  const [s, g, a, c, r, sl, tx, dr] = await Promise.all([
    supabase.from("mm_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("mm_account_groups").select("*").eq("user_id", userId),
    supabase.from("mm_accounts").select("*").eq("user_id", userId),
    supabase.from("mm_categories").select("*").eq("user_id", userId),
    supabase.from("mm_recurring").select("*").eq("user_id", userId),
    supabase.from("sl_mm_links").select("*").eq("user_id", userId),
    fetchAllRows((from, to) => supabase.from("mm_transactions").select("*").eq("user_id", userId).order("id", { ascending: true }).range(from, to)),
    supabase.from("mm_description_rules").select("*").eq("user_id", userId),
  ]);

  // Cuenta recién creada, nunca usada — mismo criterio que antes tenía
  // useEvenCapital.load() (ver evenCapitalData.js).
  if ((g.data || []).length === 0 && (c.data || []).length === 0) {
    await seedDefaults(userId, s.data?.main_currency || DEFAULT_SETTINGS.main_currency);
    return pullEvenCapitalIntoLocal(userId);
  }

  const tables = MM_TABLES.map((name) => db.table(name));
  await db.transaction("rw", db.mm_settings, ...tables, async () => {
    if (s.data) await db.mm_settings.put(s.data);
    await db.mm_account_groups.where("user_id").equals(userId).delete();
    await db.mm_account_groups.bulkPut(g.data || []);
    await db.mm_accounts.where("user_id").equals(userId).delete();
    await db.mm_accounts.bulkPut(a.data || []);
    await db.mm_categories.where("user_id").equals(userId).delete();
    await db.mm_categories.bulkPut(c.data || []);
    await db.mm_recurring.where("user_id").equals(userId).delete();
    await db.mm_recurring.bulkPut(r.data || []);
    await db.sl_mm_links.where("user_id").equals(userId).delete();
    await db.sl_mm_links.bulkPut(sl.data || []);
    await db.mm_transactions.where("user_id").equals(userId).delete();
    await db.mm_transactions.bulkPut(tx);
    await db.mm_description_rules.where("user_id").equals(userId).delete();
    await db.mm_description_rules.bulkPut(dr.data || []);
  });
}

// Único punto de entrada para sincronizar EvenCapital — drena la cola
// offline, corre las tareas de mantenimiento del servidor (mismo orden que
// antes tenía useEvenCapital.load(): recurrentes vencidas → reconcile de
// EvenGroup → auto-pago de tarjetas, el auto-pago necesita ver primero
// cualquier transferencia que el reconcile recién insertó) y vuelve a traer
// todo fresco.
export async function runFullSync(userId, userEmail) {
  // Re-chequeo rápido y acotado antes de lanzar toda la cascada de
  // mantenimiento de abajo -- el `isOnline` de React que dispara esto puede
  // estar un render atrasado (ej. el primer render de AppShell, antes de
  // que useConnectivity termine de corregirlo), y sin este freno cada
  // consulta de ahí para abajo reintentaría con el backoff de supabase-js
  // contra una red que ya no está, sumando segundos reales de espera.
  if (!(await probeOnline())) return;
  await drainQueue();
  const stillPending = await db.write_queue.where("status").equals("pending").count();
  if (stillPending > 0) {
    // Algo falló al drenar (ej. se cortó la red a mitad de camino) — no se
    // pisa el estado local con un pull fresco todavía, para no perder una
    // escritura offline que no llegó a subir; se reintenta en el próximo sync.
    await db.sync_meta.put({ key: "lastSyncAt", value: Date.now() });
    return;
  }
  await generateDueRecurring(userId);
  await reconcileEvenGroup(userId, userEmail);
  await runCreditCardAutoPay(userId);
  await pullEvenCapitalIntoLocal(userId);
  const review = await getPendienteTcReviewItems(userId, userEmail);
  await db.sync_meta.put({ key: "pendienteTcReview", value: review });
  await db.sync_meta.put({ key: "lastSyncAt", value: Date.now() });
}
