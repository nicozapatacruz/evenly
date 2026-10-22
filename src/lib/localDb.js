import Dexie from "dexie";

// Espejo local (IndexedDB vía Dexie) de las tablas de EvenCapital + el
// cache de solo-lectura de EvenGroup — ver OFFLINE_PLAN en el repo para
// el diseño completo. Un solo usuario a la vez usa la app en un dispositivo
// dado, así que no hace falta "limpiar" entre usuarios: cada fila ya trae
// su propio user_id y los queries siempre filtran por el userId de la
// sesión activa.
//
// Nombres de tabla (acá y en Supabase): "mm_" = EvenCapital, "sl_" = EvenGroup
// (prefijos de cuando la app se llamaba "Money Manager"/"Split Ledger" por
// dentro). A propósito NO se renombraron al rebrand 2026-10 — son nombres
// internos que el usuario nunca ve, y renombrar tablas reales en Supabase es
// una migración de verdad (riesgo real, cero beneficio visible). Si hace
// falta ubicar algo: mm_* es todo lo de EvenCapital, sl_* (y sl_mm_*, los
// vínculos entre los dos) es todo lo de EvenGroup.
export const db = new Dexie("evenly_offline");

db.version(1).stores({
  mm_settings: "user_id",
  mm_account_groups: "id, user_id",
  mm_accounts: "id, user_id, payment_account_id",
  mm_categories: "id, user_id",
  mm_recurring: "id, user_id, next_date",
  mm_transactions: "id, user_id, account_id, to_account_id, category_id, date",
  mm_bookmarks: "id, user_id, type",
  // Sin id propio del lado del cliente (la clave natural del upsert es
  // user_id+normalized_match_text, ver descriptionRulesData.js) — clave
  // primaria compuesta en vez de "id".
  mm_description_rules: "[user_id+normalized_match_text], user_id",
  sl_mm_links: "id, user_id, group_id",
  // Snapshot ya traducido (toClientGroup), no las filas crudas de
  // groups/expenses/payments — mismo shape que ya consumen GroupView/
  // SettleUp, sin reimplementar el join de GROUP_SELECT acá.
  sl_groups_cache: "id",
  write_queue: "++id, table, status, createdAt",
  sync_meta: "key",
});

// v2: solo para que offlineSupabase.js pueda encolar escrituras de "perfil"
// (nombre visible, toggle de EvenGroup, grupo por defecto, y el orden
// propio de "Tus grupos") -- esas filas son de un solo escritor (vos mismo),
// mismo criterio que ya justifica que EvenCapital sea offline completo.
// No se usan para lectura local-first (el perfil sigue viviendo en
// `session`, ver patchSession en EvenlyApp.jsx) -- están acá únicamente
// para que la cola tenga una tabla real donde apoyarse.
db.version(2).stores({
  mm_settings: "user_id",
  mm_account_groups: "id, user_id",
  mm_accounts: "id, user_id, payment_account_id",
  mm_categories: "id, user_id",
  mm_recurring: "id, user_id, next_date",
  mm_transactions: "id, user_id, account_id, to_account_id, category_id, date",
  mm_bookmarks: "id, user_id, type",
  mm_description_rules: "[user_id+normalized_match_text], user_id",
  sl_mm_links: "id, user_id, group_id",
  sl_groups_cache: "id",
  write_queue: "++id, table, status, createdAt",
  sync_meta: "key",
  profiles: "id",
  group_members: "id",
});
