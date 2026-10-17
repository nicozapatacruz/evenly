import { supabase } from "./supabaseClient.js";
import { db } from "./localDb.js";
import { enqueue, generateLocalId } from "./writeQueue.js";
import { getIsOnline } from "./connectivity.js";

// Shim de escritura: misma forma encadenable que ya usa todo el repo hoy
// (`.from(t).insert(x)`, `.update(x).eq(col,val)`, `.delete().eq(col,val)`,
// `.upsert(x,{onConflict})`, con `.in()` para el caso de borrado en cascada
// de cuentas) — cubre exactamente el subconjunto de llamadas que existen en
// el proyecto (confirmado por grep, nada más exótico). Con señal: pasa
// directo a Supabase y espeja el resultado real en Dexie (para que los
// hooks, que ahora SIEMPRE leen de Dexie, vean el cambio al instante). Sin
// señal (o si la red falla a mitad de camino, ej. portal cautivo): escribe
// optimista en Dexie y encola en write_queue para drenar al reconectar (ver
// syncEngine.js). Solo tablas mm_* y sl_mm_links pasan por acá — Split
// Ledger en sí sigue yendo directo a `supabase` (es online-only).
class OfflineQueryBuilder {
  constructor(table) {
    this.table = table;
    this._op = null;
    this._payload = null;
    this._opts = null;
    this._filters = [];
    this._select = false;
    this._single = false;
  }

  insert(payload) { this._op = "insert"; this._payload = payload; return this; }
  update(payload) { this._op = "update"; this._payload = payload; return this; }
  delete() { this._op = "delete"; return this; }
  upsert(payload, opts = {}) { this._op = "upsert"; this._payload = payload; this._opts = opts; return this; }
  eq(col, val) { this._filters.push({ col, mode: "eq", val }); return this; }
  in(col, vals) { this._filters.push({ col, mode: "in", vals }); return this; }
  select() { this._select = true; return this; }
  single() { this._single = true; return this; }

  // Thenable: awaitable igual que el query builder real de supabase-js, sin
  // tener que agregar un .exec()/.run() a cada call site existente.
  then(resolve, reject) { return this._execute().then(resolve, reject); }

  _resolveTargetIds() {
    const idFilter = this._filters.find((f) => f.col === "id");
    if (!idFilter) return [];
    return idFilter.mode === "in" ? idFilter.vals : [idFilter.val];
  }

  async _mirrorToLocal(rows) {
    const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
    for (const row of list) {
      if (this._op === "delete") await db.table(this.table).delete(row.id);
      else await db.table(this.table).put(row);
    }
  }

  async _executeOnline(signal) {
    let q = supabase.from(this.table);
    if (this._op === "insert") q = q.insert(this._payload);
    else if (this._op === "update") { q = q.update(this._payload); for (const f of this._filters) q = f.mode === "in" ? q.in(f.col, f.vals) : q.eq(f.col, f.val); }
    else if (this._op === "delete") { q = q.delete(); for (const f of this._filters) q = f.mode === "in" ? q.in(f.col, f.vals) : q.eq(f.col, f.val); }
    else if (this._op === "upsert") q = q.upsert(this._payload, { onConflict: this._opts?.onConflict });
    // Siempre pedimos la fila real de vuelta (aunque el caller no haya
    // encadenado .select()), para poder espejarla completa en Dexie.
    q = q.select().abortSignal(signal);
    const { data, error, status } = await q;
    if (!error) await this._mirrorToLocal(data);
    const shaped = this._single ? (Array.isArray(data) ? data[0] : data) : data;
    return { data: shaped, error, status };
  }

  async _executeOffline() {
    if (this._op === "insert") {
      const row = { id: generateLocalId(), ...this._payload };
      await db.table(this.table).put(row);
      await enqueue(this.table, "insert", row.id, row);
      return { data: this._single ? row : [row], error: null };
    }
    if (this._op === "update") {
      const ids = this._resolveTargetIds();
      for (const id of ids) {
        await db.table(this.table).update(id, this._payload).catch(() => {});
        await enqueue(this.table, "update", id, this._payload);
      }
      return { data: null, error: null };
    }
    if (this._op === "delete") {
      const ids = this._resolveTargetIds();
      for (const id of ids) {
        await db.table(this.table).delete(id);
        await enqueue(this.table, "hard_delete", id, null);
      }
      return { data: null, error: null };
    }
    if (this._op === "upsert") {
      const onConflict = this._opts?.onConflict || "id";
      const keyValues = this._opts?.localKeyValues
        || Object.fromEntries(onConflict.split(",").map((c) => [c, this._payload[c]]));
      const targetId = `upsert::${onConflict}::${Object.values(keyValues).join("||")}`;
      const row = { ...this._payload, ...keyValues };
      await db.table(this.table).put(row);
      await enqueue(this.table, "upsert", targetId, this._payload, { onConflict });
      return { data: this._single ? row : [row], error: null };
    }
    return { data: null, error: null };
  }

  async _execute() {
    // getIsOnline(): último resultado conocido del probe de connectivity.js,
    // no navigator.onLine solo — evita reintentar (y esperar los reintentos
    // con backoff de supabase-js) contra una red que ya sabemos caída.
    if (getIsOnline()) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1800);
      const { data, error, status } = await this._executeOnline(controller.signal);
      clearTimeout(timeout);
      // status===0: el pedido nunca llegó al servidor (red caída a mitad de
      // camino, ej. portal cautivo) -- supabase-js NO tira excepción en ese
      // caso, solo así se distingue de un error real de Postgres (que sí
      // trae un status HTTP real y hay que propagar, no encolar).
      if (!error || status !== 0) return { data, error };
    }
    return await this._executeOffline();
  }
}

export const offlineSupabase = {
  from(table) { return new OfflineQueryBuilder(table); },
};
