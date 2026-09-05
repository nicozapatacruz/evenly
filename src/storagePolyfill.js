// SplitLedger.jsx fue construido originalmente como un "artifact" de Claude.ai,
// que expone una API global window.storage (get/set/delete/list) respaldada
// por el backend de Anthropic. Fuera de Claude.ai esa API no existe, así que
// este polyfill la reimplementa encima de localStorage para que el proyecto
// funcione tal cual al correrlo local o desplegarlo.
//
// IMPORTANTE — limitación real a tener en cuenta:
// localStorage es local a CADA navegador/dispositivo. Con este polyfill,
// SplitLedger seguirá funcionando para un solo usuario en un solo dispositivo,
// pero el modelo multi-usuario (invitar a otra persona, que dos personas vean
// el mismo grupo) NO funcionará de verdad hasta que reemplaces esto por un
// backend real (Supabase, Firebase, tu propia API, etc.) que sí comparta datos
// entre dispositivos/usuarios.

const PREFIX = "splitledger:";

function fullKey(key, shared) {
  return `${PREFIX}${shared ? "shared" : "private"}:${key}`;
}

function ensureValidKey(key) {
  if (typeof key !== "string" || key.length === 0 || key.length > 200 || /[\s/\\'"]/.test(key)) {
    throw new Error(`Clave de storage inválida: ${key}`);
  }
}

window.storage = {
  async get(key, shared = false) {
    ensureValidKey(key);
    const raw = localStorage.getItem(fullKey(key, shared));
    if (raw === null) return null;
    return { key, value: raw, shared };
  },

  async set(key, value, shared = false) {
    ensureValidKey(key);
    localStorage.setItem(fullKey(key, shared), value);
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    ensureValidKey(key);
    const existed = localStorage.getItem(fullKey(key, shared)) !== null;
    localStorage.removeItem(fullKey(key, shared));
    return { key, deleted: existed, shared };
  },

  async list(prefix = "", shared = false) {
    const scope = `${PREFIX}${shared ? "shared" : "private"}:`;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(scope + prefix)) keys.push(k.slice(scope.length));
    }
    return { keys, prefix, shared };
  },
};
