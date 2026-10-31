import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { supabase } from "./lib/supabaseClient.js";
import { offlineSupabase } from "./lib/offlineSupabase.js";
import { db } from "./lib/localDb.js";
import { useConnectivity, getIsOnline } from "./lib/connectivity.js";
import { runFullSync } from "./lib/syncEngine.js";
import { BookOpen, BarChart3, Coins, Divide, MoreHorizontal, MailCheck } from "lucide-react";
import { styles, globalCss } from "./lib/styles.js";
import { Field, PasswordInput } from "./components/Shared.jsx";
import ReconnectSyncGate from "./components/ReconnectSyncGate.jsx";
import EvenGroupTab from "./screens/evengroup/EvenGroupTab.jsx";
import ConfigScreen from "./screens/config/ConfigScreen.jsx";
import CuentasTab from "./screens/evencapital/CuentasTab.jsx";
import DiarioTab from "./screens/evencapital/DiarioTab.jsx";
import TransactionForm from "./screens/evencapital/TransactionForm.jsx";
import EstadisticasTab from "./screens/evencapital/EstadisticasTab.jsx";
import CategoryDrillDownScreen from "./screens/evencapital/CategoryDrillDownScreen.jsx";
import SearchScreen from "./screens/evencapital/SearchScreen.jsx";
import BookmarksScreen from "./screens/evencapital/BookmarksScreen.jsx";
import PhotoImportEntryScreen from "./screens/evencapital/PhotoImportEntryScreen.jsx";
import PhotoImportWizardScreen from "./screens/evencapital/PhotoImportWizardScreen.jsx";
import { FiltersPanel } from "./screens/evencapital/FiltersPanel.jsx";
import { useEvenCapital } from "./lib/evenCapitalData.js";
import { createBookmark } from "./lib/bookmarksData.js";
import { EMPTY_FILTERS } from "./lib/filterHelpers.js";

// Wrapper fino: FiltersPanel necesita un "draft" propio (para poder
// Cancelar/Limpiar sin tocar el filtro ya aplicado hasta tocar Aplicar) —
// ambos entrypoints (Transacciones y Estadísticas) comparten el mismo
// filtro persistente de abajo, pero cada uno entra/sale a su propia pantalla.
function DiarioFiltersScreen({ filters, setFilters, groups, accounts, categories, onBack }) {
  const [draft, setDraft] = useState(filters);
  // system_key "split_ledger" (EvenGroup) afuera: las únicas transacciones
  // que tocan esa cuenta pseudo son role:"loan", y esas quedan excluidas del
  // feed por `sl_hidden` -- filtrar por esa cuenta acá nunca encontraría nada.
  const accountGroups = groups
    .filter((g) => !g.deleted && g.system_key !== "split_ledger")
    .map((g) => ({ label: g.name, items: accounts.filter((a) => a.group_id === g.id && !a.hidden && !a.deleted).map((a) => ({ value: a.id, label: a.name, icon: a.icon })) }))
    .filter((g) => g.items.length > 0);
  return (
    <FiltersPanel
      draft={draft}
      setDraft={setDraft}
      filters={filters}
      accountGroups={accountGroups}
      categories={categories}
      onBack={onBack}
      onApply={() => { setFilters(draft); onBack(); }}
      onClear={() => setDraft(EMPTY_FILTERS)}
    />
  );
}

/* =========================================================================
   AUTH — usuarios, sesión, invitaciones
   ========================================================================= */

// Acotada a 1.8s (mismo criterio que probeOnline en connectivity.js): sin
// esto, sin señal, esta consulta agotaba sola los 3 reintentos automáticos
// de supabase-js (1s + 2s + 4s = 7s) antes de rendirse — la pantalla de
// "Cargando…" se quedaba pegada esos 7s enteros antes de poder caer al
// fallback de sesión cacheada (ver resolveSession).
async function fetchProfile(userId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name, photo_url, default_group_id, split_ledger_enabled")
    .eq("id", userId)
    .single()
    .abortSignal(controller.signal);
  clearTimeout(timeout);
  if (error) throw error;
  return data;
}

function toSession(authUser, profile) {
  return {
    userId: authUser.id,
    email: authUser.email,
    username: profile.username,
    displayName: profile.display_name,
    photoUrl: profile.photo_url || null,
    defaultGroupId: profile.default_group_id || null,
    evenGroupEnabled: profile.split_ledger_enabled !== false,
  };
}

// Último `session` armado con éxito, para poder entrar a la app offline sin
// depender de que `fetchProfile` (una consulta de red) responda — sin esto,
// abrir la app sin señal te mandaba al login aunque tu sesión de Supabase
// (el JWT, que sí vive local) siguiera siendo válida.
const CACHED_SESSION_KEY = "evenly_cachedSession";

function loadCachedSession(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHED_SESSION_KEY) || "null");
    return cached && cached.userId === userId ? cached : null;
  } catch {
    return null;
  }
}

function saveCachedSession(session) {
  try { localStorage.setItem(CACHED_SESSION_KEY, JSON.stringify(session)); } catch { /* storage lleno o deshabilitado, no es crítico */ }
}

// `fetchProfile` + `toSession`, con fallback a la última sesión cacheada de
// ESTE mismo usuario si la consulta falla (sin señal, o cualquier otro error
// de red) — nunca se usa el cache de un usuario distinto al que ya autenticó
// Supabase. Si nunca hubo una sesión cacheada para este usuario (primera vez
// en este dispositivo, sin señal), no hay nada mejor que mostrar: se
// propaga el error y el caller cae al comportamiento de siempre.
async function resolveSession(authUser) {
  try {
    const profile = await fetchProfile(authUser.id);
    const session = toSession(authUser, profile);
    saveCachedSession(session);
    return session;
  } catch (e) {
    const cached = loadCachedSession(authUser.id);
    if (cached) return cached;
    throw e;
  }
}

function useAuth() {
  const [session, setSession] = useState(null); // { userId, email, username, displayName, photoUrl, defaultGroupId, evenGroupEnabled } | null
  const [authLoading, setAuthLoading] = useState(true);
  // true mientras el usuario llegó acá desde el link de "recuperar contraseña"
  // del correo — en ese momento Supabase ya le arma una sesión válida, pero
  // queremos mostrarle "elegí tu nueva contraseña" en vez de mandarlo directo
  // adentro de la app.
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (authSession?.user) {
        try {
          const session = await resolveSession(authSession.user);
          if (!cancelled) setSession(session);
        } catch { /* perfil aún no creado por el trigger, sin cache y sin señal */ }
      }
      if (!cancelled) setAuthLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (!authSession?.user) { setSession(null); return; }
      try {
        setSession(await resolveSession(authSession.user));
      } catch { /* ignorar, se resuelve en el próximo evento */ }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const register = useCallback(async (email, username, password) => {
    const uname = username.trim().toLowerCase();
    if (!uname || uname.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
    if (!password || password.length < 4) throw new Error("La contraseña debe tener al menos 4 caracteres.");
    // "Nombre visible" (el que ve el resto en EvenGroup) arranca igual al
    // usuario -- antes era un campo propio en el registro ("Nombre que
    // verán los demás"), pero confundía a quien se registra solo para
    // EvenCapital (sin ningún grupo todavía). Se puede cambiar después en
    // Configuración → EvenGroup.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: uname, display_name: uname },
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) {
      if (/duplicate key/i.test(error.message) && /username/i.test(error.message)) {
        throw new Error("Ese nombre de usuario ya está en uso.");
      }
      throw error;
    }
    // Si el proyecto exige confirmación de email, signUp no crea sesión todavía.
    return { needsEmailConfirmation: !data.session };
  }, []);

  const login = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (/email.*not.*confirmed|confirm.*email/i.test(error.message)) {
        throw new Error("Todavía no confirmas tu correo. Revisa tu bandeja de entrada y haz click en el enlace de confirmación.");
      }
      throw new Error("Email o contraseña incorrectos.");
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setRecovering(false);
  }, []);

  // Manda el correo con el link de "recuperar contraseña" (Supabase arma el link
  // con su propio token; redirectTo es a dónde vuelve una vez que lo clickea).
  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) throw error;
  }, []);

  // Se llama desde la pantalla que aparece al volver del link del correo.
  const completeRecovery = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setRecovering(false);
  }, []);

  const cancelRecovery = useCallback(async () => {
    await supabase.auth.signOut();
    setRecovering(false);
  }, []);

  // Vuelve a leer el profile y actualiza la sesión en memoria (evita el window.location.reload() de antes)
  const refreshProfile = useCallback(async () => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.user) return;
    const profile = await fetchProfile(authSession.user.id);
    setSession(toSession(authSession.user, profile));
  }, []);

  // Para los campos de "perfil" que ahora son offline-capaces (nombre
  // visible, toggle de EvenGroup, grupo por defecto) — actualiza la
  // sesión en memoria y el cache directo, sin pasar por fetchProfile (que
  // necesita red). El caller ya mandó la escritura real por offlineSupabase
  // (online de una, o encolada) antes de llamar esto; acá solo se refleja
  // localmente lo que ya se sabe que va a quedar así.
  const patchSession = useCallback((patch) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      saveCachedSession(next);
      return next;
    });
  }, []);

  return { session, authLoading, register, login, logout, refreshProfile, patchSession, recovering, resetPassword, completeRecovery, cancelRecovery };
}

// Select con resource embedding: PostgREST expande cada FK respetando la RLS propia
// de esa tabla hija (is_group_member en todas), así que basta con pedir "groups".
const GROUP_SELECT = `
  id, name, base_currency, rates, photo_url, creator_id, created_at,
  group_members(id, name, linked_user_id, sort_order, deleted),
  categories(id, label, icon_key, sort_order),
  expenses(id, description, amount, currency, category_id, date, notes, image_url, split_mode, payers, shares, deleted, created_at),
  payments(id, from_member_id, to_member_id, amount, currency, date, note, deleted, created_at)
`;

// Traduce una fila de Supabase (snake_case, numeric como string, timestamptz como ISO)
// al shape en memoria que ya consumen GroupView/NewExpense/SettleUp/EditGroup.
function toClientGroup(row, userId) {
  // Vos siempre primero en la lista de integrantes (pagadores, participantes,
  // "Integrantes" en Editar grupo, etc.) — `sort_order` acá NO sirve para
  // esto (es el orden de TUS grupos en la lista, guardado en tu propia fila
  // de group_members, no el orden de los miembros dentro de un grupo). El
  // resto, alfabético: sin esto, quedaban en el orden que Postgres devolviera
  // (sin ORDER BY en el embed de PostgREST), que no está garantizado y podía
  // cambiar de una consulta a otra sin motivo aparente.
  const members = (row.group_members || []).map((m) => ({
    id: m.id,
    name: m.name,
    linkedUserId: m.linked_user_id,
    sortOrder: m.sort_order,
    deleted: m.deleted,
  }));
  members.sort((a, b) => {
    if (a.linkedUserId === userId) return -1;
    if (b.linkedUserId === userId) return 1;
    return a.name.localeCompare(b.name, "es");
  });
  return {
    id: row.id,
    name: row.name,
    baseCurrency: row.base_currency,
    rates: row.rates || {},
    photoUrl: row.photo_url || null,
    creatorId: row.creator_id,
    createdAt: new Date(row.created_at).getTime(),
    members,
    categories: (row.categories || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, label: c.label, iconKey: c.icon_key })),
    expenses: (row.expenses || []).map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      currency: e.currency,
      category: e.category_id,
      date: new Date(e.date).getTime(),
      createdAt: new Date(e.created_at).getTime(),
      notes: e.notes || "",
      imageUrl: e.image_url || null,
      splitMode: e.split_mode,
      payers: e.payers,
      shares: e.shares,
      deleted: e.deleted,
    })),
    payments: (row.payments || []).map((p) => ({
      id: p.id,
      from: p.from_member_id,
      to: p.to_member_id,
      amount: Number(p.amount),
      currency: p.currency,
      date: new Date(p.date).getTime(),
      createdAt: new Date(p.created_at).getTime(),
      note: p.note || "",
      deleted: p.deleted,
    })),
  };
}

// Orden de "tus grupos": el que cada usuario arma a mano arrastrando en
// Configuración (sort_order en su propia fila de group_members). Los grupos
// que todavía no tienen ese valor (nunca se reordenaron) van al final, en el
// orden en que se crearon.
function sortGroupsForUser(list, userId) {
  return list.slice().sort((a, b) => {
    const oa = a.members.find((m) => m.linkedUserId === userId)?.sortOrder;
    const ob = b.members.find((m) => m.linkedUserId === userId)?.sortOrder;
    if (oa == null && ob == null) return a.createdAt - b.createdAt;
    if (oa == null) return 1;
    if (ob == null) return -1;
    return oa - ob;
  });
}

function useGroups(userId) {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(true);

  const useCache = useCallback(async () => {
    // Sin señal (u otro error de red): último estado cacheado, de solo
    // lectura — nunca se escribe contra esta copia.
    const cached = await db.sl_groups_cache.toArray().catch(() => []);
    setGroups(cached);
  }, []);

  const load = useCallback(async () => {
    if (!userId) { setGroups([]); setLoading(false); return; }
    // getIsOnline() (no navigator.onLine): evita intentar la red cuando ya
    // sabemos que está caída — una consulta fallida reintenta sola hasta 3
    // veces con espera creciente (1s, 2s, 4s) antes de darse por vencida, y
    // esto se llama seguido (al montar, al volver a la pestaña, etc.) — sin
    // este freno, cada llamada de esas tarda ~7s en vez de resolverse al toque.
    if (!getIsOnline()) { await useCache(); setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from("groups")
        .select(GROUP_SELECT)
        .eq("deleted", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // La RLS de "groups" también deja ver (para que la bandeja de
      // invitaciones pueda mostrar el nombre) un grupo donde solo tengo una
      // invitación pendiente, no solo donde ya soy miembro vinculado — sin
      // este filtro, ese grupo aparecía en "Tus grupos" antes de aceptar.
      const mine = data
        .map((row) => toClientGroup(row, userId))
        .filter((g) => g.members.some((m) => m.linkedUserId === userId));
      const sorted = sortGroupsForUser(mine, userId);
      setGroups(sorted);
      // EvenGroup es online-preferred: este snapshot ya traducido es el
      // único cache (sl_groups_cache), solo se lee offline como último
      // recurso — ver fallback más abajo.
      await db.sl_groups_cache.clear();
      await db.sl_groups_cache.bulkPut(sorted);
    } catch {
      await useCache();
    } finally {
      setLoading(false);
    }
  }, [userId, useCache]);

  useEffect(() => {
    load();
  }, [load]);

  // Vuelve a traer un solo grupo y reemplaza su entrada en el estado local.
  // Cada handler de mutación (insert/update/delete puntual) llama esto al terminar,
  // en vez de mantener a mano un patch optimista por cada operación posible.
  const reloadGroup = useCallback(async (groupId) => {
    const { data, error } = await supabase
      .from("groups")
      .select(GROUP_SELECT)
      .eq("id", groupId)
      .single();
    if (error) throw error;
    const g = toClientGroup(data, userId);
    setGroups((prev) => {
      const next = prev ? [...prev] : [];
      const idx = next.findIndex((x) => x.id === groupId);
      if (idx >= 0) next[idx] = g;
      else next.push(g);
      return next;
    });
    return g;
  }, []);

  // Soft-delete: deja la fila en la base (recuperable a mano desde el Table
  // Editor poniendo deleted = false) — el filtro `.eq("deleted", false)` de
  // `load()` es lo que la oculta, la RLS de "groups" no filtra por esta
  // columna (el supuesto anterior de este comentario era incorrecto: sin
  // ese filtro, un grupo "borrado" volvía a aparecer en cuanto se
  // recargaban los grupos, ej. al aceptar una invitación).
  const deleteGroup = useCallback(async (id) => {
    const { error } = await supabase.from("groups").update({ deleted: true }).eq("id", id);
    if (error) throw error;
    setGroups((prev) => (prev ? prev.filter((g) => g.id !== id) : prev));
  }, []);

  return { groups, loading, reloadGroup, deleteGroup, reload: load };
}

/* =========================================================================
   AUTH SCREEN
   ========================================================================= */

function AuthScreen({ onLogin, onRegister, onForgotPassword }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwVisible, setPwVisible] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false); // true tras mandar el correo de recuperación
  const [touched, setTouched] = useState({});
  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));

  const canSubmit = mode === "login"
    ? !!email.trim() && !!password
    : mode === "forgot"
      ? !!email.trim()
      : !!username.trim() && !!email.trim() && !!password && !!confirmPassword;

  const switchMode = (next) => {
    setMode(next); setErr(""); setInfo(""); setPassword(""); setConfirmPassword(""); setSent(false); setTouched({});
  };

  const handle = async () => {
    if (loading) return;
    if (!canSubmit) {
      setTouched({ username: true, email: true, password: true, confirmPassword: true });
      return;
    }
    setErr(""); setInfo(""); setLoading(true);
    try {
      if (mode === "forgot") {
        await onForgotPassword(email);
        setSent(true);
      } else if (mode === "register" && password !== confirmPassword) {
        throw new Error("Las contraseñas no coinciden.");
      } else if (mode === "login") {
        await onLogin(email, password);
      } else {
        const { needsEmailConfirmation } = await onRegister(email, username, password);
        if (needsEmailConfirmation) {
          setInfo("Te enviamos un correo para confirmar tu cuenta. Confírmalo y vuelve a entrar.");
          setMode("login");
        }
      }
    } catch (e) {
      setErr(e?.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  // Tras mandar el correo, reemplaza el formulario entero por una confirmación
  // — dejar el campo de email editable y el botón de "Enviar enlace" activo
  // como si nada hubiera pasado es confuso, no comunica que ya se envió.
  if (mode === "forgot" && sent) {
    return (
      <div style={{ ...styles.app, alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 400, background: "#FBF8F2", borderRadius: 20, padding: "36px 28px", boxShadow: "0 4px 32px rgba(0,0,0,0.08)", margin: "0 16px", textAlign: "center" }}>
          <div style={{ ...styles.emptyIcon, margin: "0 auto 16px" }}><MailCheck size={26} strokeWidth={1.5} /></div>
          <h1 style={{ ...styles.h1, fontSize: 22, marginBottom: 8 }}>Revisa tu correo</h1>
          <p style={{ ...styles.muted, padding: 0, marginBottom: 28 }}>
            Te enviamos un enlace a <strong>{email}</strong> para elegir una nueva contraseña.
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <button style={{ ...styles.btnPrimary, marginTop: 0, width: "100%" }} onClick={() => switchMode("login")}>
              Volver a iniciar sesión
            </button>
            <button
              type="button"
              style={{ background: "none", border: "none", fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: "#A8754A", cursor: "pointer", padding: "12px 0 0" }}
              onClick={async () => { setSent(false); await handle(); }}
            >
              ¿No te llegó? Reenviar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.app, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#FBF8F2", borderRadius: 20, padding: "36px 28px", boxShadow: "0 4px 32px rgba(0,0,0,0.08)", margin: "0 16px" }}>
        <h1 style={{ ...styles.h1, textAlign: "center", marginBottom: 4 }}>Evenly</h1>
        <p style={{ ...styles.muted, padding: 0, textAlign: "center", marginBottom: 28 }}>
          {mode === "login" ? "Bienvenido de vuelta" : mode === "forgot" ? "Recuperar contraseña" : "Crea tu cuenta"}
        </p>

        {/* Un <form> real (no solo autoComplete suelto en inputs) es lo que hace que
            Safari clasifique esto como login o registro — sin <form>, cae en su
            heurística genérica y sugiere crear contraseña nueva incluso en login. */}
        <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={e => { e.preventDefault(); if (!loading) handle(); }}>
          {mode === "register" && (
            <Field label="Usuario" required error={touched.username && !username.trim() ? "Este campo es obligatorio." : ""}>
              <input style={styles.input} name="new-username" value={username} onChange={e => setUsername(e.target.value)} onBlur={() => touch("username")} placeholder="nombre_de_usuario" autoCapitalize="none" autoComplete="username" />
            </Field>
          )}
          <Field label="Email" required error={touched.email && !email.trim() ? "Este campo es obligatorio." : ""}>
            <input style={styles.input} type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => touch("email")} placeholder="tu@email.com" autoCapitalize="none" autoComplete={mode === "login" ? "username" : "email"} />
          </Field>
          {mode !== "forgot" && (
            <Field label="Contraseña" required error={touched.password && !password ? "Este campo es obligatorio." : ""}>
              <PasswordInput style={styles.input} name={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} onBlur={() => touch("password")} placeholder="Contraseña" autoComplete={mode === "login" ? "current-password" : "new-password"} visible={mode === "register" ? pwVisible : undefined} onToggleVisible={mode === "register" ? () => setPwVisible(v => !v) : undefined} />
            </Field>
          )}
          {mode === "login" && (
            <button
              type="button"
              style={{ alignSelf: "flex-end", background: "none", border: "none", fontSize: 12.5, fontFamily: "system-ui, sans-serif", color: "#A8754A", cursor: "pointer", padding: 0, marginTop: -6 }}
              onClick={() => switchMode("forgot")}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
          {mode === "register" && (
            <Field
              label="Confirmar contraseña"
              required
              error={touched.confirmPassword
                ? (!confirmPassword ? "Este campo es obligatorio." : (password !== confirmPassword ? "Las contraseñas no coinciden." : ""))
                : ""}
            >
              <PasswordInput style={styles.input} name="confirm-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onBlur={() => touch("confirmPassword")} placeholder="Confirmar contraseña" autoComplete="new-password" visible={pwVisible} onToggleVisible={() => setPwVisible(v => !v)} />
            </Field>
          )}
          {err && <p style={styles.errText}>{err}</p>}
          {info && <p style={{ ...styles.muted, padding: 0, color: "#3B6E62" }}>{info}</p>}
          <button type="submit" style={{ ...styles.btnPrimary, marginTop: 4, opacity: (loading || !canSubmit) ? 0.5 : 1 }} disabled={loading}>
            {loading ? "Un momento…" : mode === "login" ? "Entrar" : mode === "forgot" ? "Enviar enlace" : "Crear cuenta"}
          </button>
          <button
            type="button"
            style={{ background: "none", border: "none", fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: "#A8754A", cursor: "pointer", textAlign: "center", padding: "4px 0" }}
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "¿No tienes cuenta? Regístrate" : mode === "forgot" ? "Volver a iniciar sesión" : "¿Ya tienes cuenta? Entra"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   RECUPERAR CONTRASEÑA — se muestra al volver del link del correo (en vez
   de la app normal): Supabase ya arma una sesión temporal para esto, que
   useAuth detecta vía el evento PASSWORD_RECOVERY.
   ========================================================================= */

function RecoverPasswordScreen({ onComplete, onCancel }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwVisible, setPwVisible] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});
  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));

  const canSave = newPassword.length >= 4 && confirmPassword.length >= 4 && newPassword === confirmPassword;

  const handleSave = async () => {
    if (saving) return;
    setErr("");
    if (!canSave) { setTouched({ newPassword: true, confirmPassword: true }); return; }
    setSaving(true);
    try {
      await onComplete(newPassword);
    } catch (e) {
      setErr(e?.message || "No se pudo actualizar la contraseña.");
      setSaving(false);
    }
  };

  return (
    <div style={{ ...styles.app, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#FBF8F2", borderRadius: 20, padding: "36px 28px", boxShadow: "0 4px 32px rgba(0,0,0,0.08)", margin: "0 16px" }}>
        <h1 style={{ ...styles.h1, textAlign: "center", marginBottom: 4 }}>Evenly</h1>
        <p style={{ ...styles.muted, padding: 0, textAlign: "center", marginBottom: 28 }}>Elegí tu nueva contraseña</p>

        <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={e => { e.preventDefault(); if (!saving) handleSave(); }}>
          <Field label="Nueva contraseña" required error={touched.newPassword && newPassword.length < 4 ? "Debe tener al menos 4 caracteres." : ""}>
            <PasswordInput style={styles.input} name="new-password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} onBlur={() => touch("newPassword")} placeholder="Nueva contraseña" visible={pwVisible} onToggleVisible={() => setPwVisible(v => !v)} />
          </Field>
          <Field
            label="Confirmar nueva contraseña"
            required
            error={touched.confirmPassword
              ? (confirmPassword.length < 4 ? "Debe tener al menos 4 caracteres." : (newPassword !== confirmPassword ? "Las contraseñas no coinciden." : ""))
              : ""}
          >
            <PasswordInput style={styles.input} name="confirm-password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onBlur={() => touch("confirmPassword")} placeholder="Confirmar nueva contraseña" visible={pwVisible} onToggleVisible={() => setPwVisible(v => !v)} />
          </Field>
          {err && <p style={styles.errText}>{err}</p>}
          <button type="submit" style={{ ...styles.btnPrimary, marginTop: 4, opacity: (saving || !canSave) ? 0.5 : 1 }} disabled={saving}>
            {saving ? "Guardando…" : "Guardar y entrar"}
          </button>
          <button
            type="button"
            style={{ background: "none", border: "none", fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: "#A8754A", cursor: "pointer", textAlign: "center", padding: "4px 0" }}
            onClick={onCancel}
          >
            Cancelar
          </button>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   BARRA DE 5 TABS (3 de EvenCapital "Coming Soon" + EvenGroup + Config)
   ========================================================================= */

const TABS = [
  { key: "ledger", icon: BookOpen, comingSoon: false, label: () => new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short" }) },
  { key: "stats", icon: BarChart3, comingSoon: false, label: () => "Estadísticas" },
  { key: "accounts", icon: Coins, comingSoon: false, label: () => "Cuentas" },
  { key: "evengroup", icon: Divide, comingSoon: false, label: () => "EvenGroup" },
  { key: "config", icon: MoreHorizontal, comingSoon: false, label: () => "Config" },
];

/* =========================================================================
   APP RAÍZ (autenticada) — dueña de los grupos, la navegación de Split
   Ledger, las invitaciones y los toasts; reparte todo eso a los tabs.
   ========================================================================= */

function AppShell({ session, onLogout, refreshProfile, patchSession }) {
  const { groups, loading, reloadGroup, deleteGroup, reload: reloadGroups } = useGroups(session.userId);
  const evenCapital = useEvenCapital(session.userId);
  const isOnline = useConnectivity();
  // Banner de sincronización (no bloqueante, ver ReconnectSyncGate) — al
  // arrancar (si hay señal) y en toda transición offline→online. El efecto
  // de abajo reacciona solo a
  // CAMBIOS de isOnline (incluido el primer render): arranca sincronizando
  // si ya hay señal, no hace nada si arranca sin ella, y vuelve a
  // sincronizar apenas isOnline pasa de false a true.
  const [syncing, setSyncing] = useState(isOnline);
  // Token (no un booleano "cancelled"): si isOnline parpadea (se va y vuelve
  // más de una vez seguida) y dos sincronizaciones quedan superpuestas, solo
  // la ÚLTIMA que arrancó puede apagar el cartel al terminar — así, sea cual
  // sea el orden real en que las dos terminen, la más vieja nunca apaga el
  // cartel mientras la más nueva todavía sigue corriendo. Un booleano
  // "cancelled" (lo que había antes) tiene el problema contrario: bloquea
  // TAMBIÉN el caso normal de una sola sincronización en curso cuando
  // isOnline pasa a false a mitad de camino (el caso de todos los días,
  // offline) -- bug real encontrado en vivo, el cartel se quedaba pegado
  // para siempre. AppShell no se desmonta en este flujo (confirmado), así
  // que no hace falta protegerse de eso acá tampoco.
  const syncTokenRef = useRef(0);
  useEffect(() => {
    if (!isOnline) return;
    const myToken = ++syncTokenRef.current;
    (async () => {
      setSyncing(true);
      try {
        await runFullSync(session.userId);
        await reloadGroups();
      } finally {
        if (syncTokenRef.current === myToken) setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);
  // Se guarda en localStorage para que sobreviva a cerrar y reabrir la app
  // (no solo pasar a segundo plano) — un recarga de página en frío siempre
  // vuelve a correr este useState desde cero, perdiendo cualquier estado en
  // memoria.
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem("evenly_activeTab");
    if (saved && TABS.some((t) => t.key === saved)) return saved;
    return session.evenGroupEnabled ? "evengroup" : "config";
  });
  useEffect(() => {
    localStorage.setItem("evenly_activeTab", activeTab);
  }, [activeTab]);
  const [evenGroupView, setEvenGroupView] = useState({ screen: "home" });
  const [accountsView, setAccountsView] = useState({ screen: "list" });
  const [ledgerView, setLedgerView] = useState({ screen: "list" });
  const [statsView, setStatsView] = useState({ screen: "list" });
  // Releídas en vivo de Dexie por id (no la que quedó congelada en
  // ledgerView.transaction/statsView.transaction al momento del click en la
  // lista) -- si viene de EvenGroup, la reconciliación puede actualizarla
  // mientras esta pantalla sigue montada (ej. volviste de "Original" después
  // de cambiar algo ahí), ver mismo fix en CuentasTab.jsx.
  const liveLedgerTransaction = useLiveQuery(
    () => (ledgerView.transaction?.id ? db.mm_transactions.get(ledgerView.transaction.id) : undefined),
    [ledgerView.transaction?.id]
  );
  const liveStatsTransaction = useLiveQuery(
    () => (statsView.transaction?.id ? db.mm_transactions.get(statsView.transaction.id) : undefined),
    [statsView.transaction?.id]
  );
  const [ledgerMonth, setLedgerMonth] = useState(() => new Date());
  // Viven acá (no dentro de SearchScreen) para sobrevivir el viaje de ida y
  // vuelta a "editar transacción" — ese screen desmonta SearchScreen.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState(EMPTY_FILTERS);
  // Filtro persistente de Transacciones/Estadísticas (distinto del Buscador:
  // este no busca texto, filtra lo que ya ves día a día) — en localStorage
  // para que sobreviva a cerrar la app, a propósito simple (sin "filtros
  // guardados" con nombre): es UN filtro estándar que dejás puesto, no
  // varios que alternás.
  const [diarioFilters, setDiarioFilters] = useState(() => {
    try {
      const saved = localStorage.getItem("evenly_diarioFilters");
      return saved ? JSON.parse(saved) : EMPTY_FILTERS;
    } catch {
      return EMPTY_FILTERS;
    }
  });
  useEffect(() => {
    localStorage.setItem("evenly_diarioFilters", JSON.stringify(diarioFilters));
  }, [diarioFilters]);
  const [changingPassword, setChangingPassword] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(false);
  const [creatingRecurring, setCreatingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState(null); // fila de mm_recurring, o null
  const [evenCapitalScreen, setEvenCapitalScreen] = useState(null);
  // Esta app no navega con URLs/router — cambiar de pantalla es solo React
  // mostrando otro árbol de componentes, así que el navegador nunca resetea
  // el scroll solo (eso sí pasaría con una navegación real de página). Sin
  // esto, un formulario nuevo heredaba el scroll que tenía la pantalla
  // anterior y podía arrancar mostrado desde la mitad, no desde arriba.
  // Transacciones (ledger/list) es la única excepción a propósito: esa
  // pantalla ya decide su propio scroll al entrar (día de hoy), y correr
  // esto ahí lo pisaría.
  // useLayoutEffect (no useEffect): corre ANTES de pintar, así la pantalla
  // nueva nunca llega a mostrarse (ni un instante) en la posición vieja. El
  // segundo intento en el próximo frame es por las dudas en el celular algo
  // (el teclado nativo reacomodándose, una fuente que termina de cargar)
  // vuelva a mover el scroll justo después del primero.
  useLayoutEffect(() => {
    const isTransactionsList = activeTab === "ledger" && ledgerView.screen === "list";
    if (isTransactionsList) return;
    // scrollIntoView (no window.scrollTo): en la PWA instalada de iOS,
    // scrollTo a veces no hace nada, pero scrollIntoView sí — es el mismo
    // mecanismo que ya probamos que funciona en el auto-scroll de
    // Transacciones (ver DiarioTab.jsx). #root siempre existe, no hace
    // falta un ref por pantalla.
    const scrollToTop = () => document.getElementById("root")?.scrollIntoView({ block: "start" });
    scrollToTop();
    const raf = requestAnimationFrame(scrollToTop);
    return () => cancelAnimationFrame(raf);
  }, [activeTab, evenGroupView.screen, accountsView.screen, ledgerView.screen, statsView.screen, evenCapitalScreen, changingPassword, viewingProfile, creatingRecurring, editingRecurring]);
  const [toast, setToast] = useState(null); // { message, type: "error" | "success" | "info" }
  const [invites, setInvites] = useState([]); // invitaciones que ME llegaron (bandeja)

  const showError = (msg) => setToast({ message: msg, type: "error" });
  const showSuccess = (msg) => setToast({ message: msg, type: "success" });
  const showInfo = (msg) => setToast({ message: msg, type: "info" });

  // Guarda una transacción de EvenCapital y, si venía con recurrencia
  // activada, también crea su plantilla en mm_recurring. Un solo lugar para
  // esto porque lo usan tanto "Hoy" (FAB) como "Transacciones recurrentes" en Config.
  const saveMoneyTransaction = async ({ recurring, id, ...tx }) => {
    try {
      const payload = { ...tx, date: new Date(tx.date).toISOString() };
      const { error } = id
        ? await offlineSupabase.from("mm_transactions").update(payload).eq("id", id)
        // timezone solo se fija al crear, nunca al editar — es "dónde estabas
        // cuando pasó esto", no algo que deba cambiar si corregís el monto
        // de una transacción vieja desde otro país.
        : await offlineSupabase.from("mm_transactions").insert({ user_id: session.userId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...payload });
      if (error) throw error;
      if (recurring) {
        // mm_recurring es de un solo escritor (igual que el resto de Money
        // Manager) y ya se lee local-first -- no hay motivo real para que
        // esto sea online-only, se encola igual que cualquier otra escritura.
        const { error: recError } = await offlineSupabase.from("mm_recurring").insert({
          user_id: session.userId,
          type: tx.type,
          account_id: tx.account_id,
          to_account_id: tx.to_account_id,
          category_id: tx.category_id,
          currency: tx.currency,
          amount: tx.amount,
          exchange_rate: tx.exchange_rate,
          amount_main: tx.amount_main,
          title: tx.title,
          memo: tx.memo,
          ...recurring,
        });
        if (recError) throw recError;
      }
      await evenCapital.reload();
      return true;
    } catch (e) {
      showError(`No se pudo guardar: ${e?.message || e}`);
      return false;
    }
  };

  // Edita en el lugar la plantilla de una recurrente ya existente (nunca
  // crea una transacción) -- mm_recurring es de un solo escritor, igual que
  // el resto de EvenCapital, así que esto también se encola offline.
  const saveRecurring = async (id, payload) => {
    try {
      const { error } = await offlineSupabase.from("mm_recurring").update(payload).eq("id", id);
      if (error) throw error;
      await evenCapital.reload();
      return true;
    } catch (e) {
      showError(`No se pudo guardar: ${e?.message || e}`);
      return false;
    }
  };

  // Borrado real (no soft-delete): una recurrente no tiene pantalla de
  // "papelera" que la use, a diferencia de cuentas/categorías/transacciones
  // (mismo criterio que generateDueRecurring cuando una plantilla cumple su
  // end_date). No borra las transacciones que ya generó.
  const deleteRecurring = async (id) => {
    try {
      const { error } = await offlineSupabase.from("mm_recurring").delete().eq("id", id);
      if (error) throw error;
      await evenCapital.reload();
      showInfo("Transacción recurrente eliminada.");
      return true;
    } catch (e) {
      showError(`No se pudo borrar: ${e?.message || e}`);
      return false;
    }
  };

  // Soft-delete (mismo patrón que categorías/cuentas) — mm_transactions.deleted
  // ya es lo que filtran todas las vistas/consultas existentes.
  const deleteMoneyTransaction = async (id) => {
    try {
      const { error } = await offlineSupabase.from("mm_transactions").update({ deleted: true }).eq("id", id);
      if (error) throw error;
      await evenCapital.reload();
      showInfo("Transacción eliminada.");
      return true;
    } catch (e) {
      showError(`No se pudo borrar: ${e?.message || e}`);
      return false;
    }
  };

  // Guardar como marcador — no toca mm_transactions ni navega a ningún
  // lado, el formulario que lo disparó se queda tal cual estaba.
  const bookmarkMoneyTransaction = async (tx) => {
    try {
      const { duplicate } = await createBookmark(session.userId, tx);
      showInfo(duplicate ? "Ya existe un marcador igual a este." : "Guardado como marcador.");
      return true;
    } catch (e) {
      showError(`No se pudo guardar el marcador: ${e?.message || e}`);
      return false;
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const loadInvites = useCallback(async () => {
    // Sin señal, no se toca — se deja lo que ya había en pantalla en vez de
    // reintentar contra la red (ver mismo criterio en useGroups.load más
    // arriba) y de vaciar la bandeja sin motivo real.
    if (!getIsOnline()) return;
    const { data, error } = await supabase
      .from("invites")
      .select("id, group_id, member_id, groups(name), group_members(name), profiles!from_user_id(username)")
      .eq("to_user_id", session.userId)
      .eq("status", "pending");
    if (error) return;
    setInvites(data.map((i) => ({
      inviteId: i.id,
      groupId: i.group_id,
      groupName: i.groups?.name || "—",
      memberId: i.member_id,
      memberName: i.group_members?.name || "—",
      fromUsername: i.profiles?.username || "—",
    })));
  }, [session.userId]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  // Volver a la webapp (cambiar de app y volver, o desbloquear el celular)
  // es otro momento en que una invitación nueva puede haber llegado mientras
  // no mirábamos — sin esto, solo se veía recargando la página entera.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") loadInvites(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadInvites]);

  const handleAcceptInvite = useCallback(async (invite) => {
    if (!isOnline) { showError("Estás offline, no podés aceptar invitaciones ahora."); return; }
    try {
      const { error: e1 } = await supabase
        .from("group_members")
        .update({ linked_user_id: session.userId, name: session.displayName })
        .eq("id", invite.memberId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("invites").update({ status: "accepted" }).eq("id", invite.inviteId);
      if (e2) throw e2;
      await loadInvites();
      await reloadGroup(invite.groupId);
      setActiveTab("evengroup");
      setEvenGroupView({ screen: "group", groupId: invite.groupId });
    } catch (e) { showError(`No se pudo aceptar la invitación: ${e?.message || e}`); }
  }, [session.userId, session.displayName, reloadGroup, loadInvites, isOnline]);

  // De dónde vinimos al saltar de pestaña "de golpe" (Cuentas o una
  // transacción sincronizada → EvenGroup; Estadísticas → Buscador) — para
  // que el botón de volver de ESA pantalla puntual (no cualquier otra)
  // regrese ahí en vez de a la navegación interna normal de la pestaña de
  // destino. `screens` (no un solo `screen`) porque la pantalla de destino a
  // veces navega a OTRA transitoriamente como parte de la misma tarea (ej.
  // "Editar grupo" → "Invitar" → volver; Buscador → editar una transacción
  // de un resultado → volver) — bug real encontrado 2026-10-08: con un solo
  // `screen`, esa navegación transitoria borraba el override antes de que el
  // usuario terminara, y un "atrás" posterior ya no volvía a la pestaña de
  // origen. Se borra solo cuando la pantalla cambia a una que NO está en esta
  // lista — ahí sí asumimos que el usuario se fue a navegar por su cuenta.
  // Dos pares (uno por pestaña de destino) porque cada uno mira el `view` de
  // una pestaña distinta.
  const [evenGroupReturn, setEvenGroupReturn] = useState(null); // { tab, screens }
  useEffect(() => {
    setEvenGroupReturn((r) => (r && !r.screens.includes(evenGroupView.screen) ? null : r));
  }, [evenGroupView.screen]);
  const deepLinkBack = evenGroupReturn && evenGroupReturn.screens.includes(evenGroupView.screen)
    ? () => { setActiveTab(evenGroupReturn.tab); setEvenGroupReturn(null); }
    : null;

  const [ledgerReturn, setLedgerReturn] = useState(null); // { tab, screens }
  useEffect(() => {
    setLedgerReturn((r) => (r && !r.screens.includes(ledgerView.screen) ? null : r));
  }, [ledgerView.screen]);
  const ledgerDeepLinkBack = ledgerReturn && ledgerReturn.screens.includes(ledgerView.screen)
    ? () => { setActiveTab(ledgerReturn.tab); setLedgerReturn(null); }
    : null;

  // Punto único para saltar a EvenGroup desde otra pestaña, marcando de
  // dónde volver — mirar `deepLinkBack` arriba. `alsoScreens`: otras
  // pantallas que cuentan como "la misma tarea" (ver comentario de arriba).
  const goToEvenGroup = useCallback((screen, extra = {}, alsoScreens = []) => {
    setEvenGroupReturn({ tab: activeTab, screens: [screen, ...alsoScreens] });
    setActiveTab("evengroup");
    setEvenGroupView({ screen, ...extra });
  }, [activeTab]);

  // Usado por la cuenta pseudo "EvenGroup" en Cuentas/Config — su flecha
  // no edita una cuenta real, lleva derecho a "Editar grupo" en EvenGroup.
  // "inviteScreen" cuenta como la misma tarea (se navega ahí y se vuelve sin
  // perder el hilo de "estoy editando este grupo").
  const openEvenGroup = useCallback((groupId) => goToEvenGroup("editGroup", { groupId }, ["inviteScreen"]), [goToEvenGroup]);

  // Usado por TransactionForm en una transacción sincronizada — lleva al
  // detalle (solo lectura) del gasto/pago de origen, igual que tocar esa
  // fila dentro del grupo; "Editar" desde ahí es una acción aparte, no algo
  // que "Original" haga por su cuenta. "newExpense"/"settleUp" cuentan como
  // la misma tarea para que el botón Cancelar/Guardar de esa edición (si se
  // llega a abrir desde acá) también vuelva derecho a EvenCapital.
  const openEvenGroupExpense = useCallback((groupId, sourceKind, sourceId) => {
    goToEvenGroup(
      sourceKind === "expense" ? "expenseDetail" : "paymentDetail",
      sourceKind === "expense" ? { groupId, expenseId: sourceId } : { groupId, paymentId: sourceId },
      [sourceKind === "expense" ? "newExpense" : "settleUp"]
    );
  }, [goToEvenGroup]);

  const handleRejectInvite = useCallback(async (invite) => {
    let rejected = false;
    try {
      const { error } = await supabase.from("invites").update({ status: "rejected" }).eq("id", invite.inviteId);
      if (error) throw error;
      rejected = true;
    } catch { /* si falla, igual quitamos la invitación de la bandeja */ }
    await loadInvites();
    if (rejected) showInfo("Invitación rechazada.");
  }, [loadInvites]);

  // Si se apaga "Use EvenGroup" mientras estás parado ahí, te manda a Configuración
  useEffect(() => {
    if (!session.evenGroupEnabled && activeTab === "evengroup") setActiveTab("config");
  }, [session.evenGroupEnabled, activeTab]);

  // "Pantalla de inicio" de EvenCapital (Detalles del período) — se aplica
  // una sola vez, apenas termina de cargar por primera vez (evenCapital.loading
  // solo pasa de true a false una vez en la vida del hook, reload() no lo
  // vuelve a poner en true), para no pisar la pestaña donde ya estés parado.
  useEffect(() => {
    if (evenCapital.loading) return;
    const tab = evenCapital.settings.startup_tab;
    const valid = ["ledger", "stats", "accounts", "evengroup"];
    if (tab && valid.includes(tab) && (tab !== "evengroup" || session.evenGroupEnabled)) {
      setActiveTab(tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evenCapital.loading]);

  const handleTabClick = (tab) => {
    if (tab.comingSoon) { showInfo("Próximamente"); return; }
    if (tab.key === activeTab) {
      // Re-tocar Transacciones/Estadísticas ya parado ahí te lleva al mes
      // actual — mismo gesto que el botón "Hoy" del header.
      if (tab.key === "ledger" || tab.key === "stats") {
        const now = new Date();
        setLedgerMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      }
      // Y si además estabas en un drill-down/sub-pantalla de Estadísticas o
      // Cuentas, re-tocar la tab te vuelve a la pantalla principal de esa
      // pestaña, no solo cambia el mes.
      if (tab.key === "stats") setStatsView({ screen: "list" });
      if (tab.key === "accounts") setAccountsView({ screen: "list" });
      // Mismo gesto en EvenGroup y Config: re-tocar la tab te saca de
      // cualquier drill-down/sub-pantalla y te deja en la principal.
      if (tab.key === "evengroup") setEvenGroupView({ screen: "home" });
      if (tab.key === "config") {
        setChangingPassword(false);
        setViewingProfile(false);
        setCreatingRecurring(false);
        setEditingRecurring(null);
        setEvenCapitalScreen(null);
        loadInvites();
      }
      return;
    }
    // Entrar a Config (desde otra tab) es también el momento de refrescar la
    // bandeja de invitaciones — si no, solo se actualiza al recargar la página.
    if (tab.key === "config") loadInvites();
    setActiveTab(tab.key);
  };

  const visibleTabs = TABS.filter((t) => t.key !== "evengroup" || session.evenGroupEnabled);
  const showTabBar = activeTab === "config"
    ? (!changingPassword && !viewingProfile && !creatingRecurring && !editingRecurring && (!evenCapitalScreen || evenCapitalScreen === "recurring"))
    : activeTab === "accounts"
      ? (accountsView.screen === "list" || accountsView.screen === "activity")
      : activeTab === "ledger"
        ? ledgerView.screen === "list"
        : activeTab === "stats"
          ? (statsView.screen === "list" || statsView.screen === "drilldown")
          : ["home", "group", "expenseDetail", "paymentDetail"].includes(evenGroupView.screen);

  return (
    <div style={styles.app}>
      {syncing && <ReconnectSyncGate />}
      {toast && (
        <div
          // "error" en rojo (mismo rojo que ya usa la app en el resto de
          // errores/eliminar) -- "info" vuelve al oscuro de siempre, se vio
          // mejor que el azul (ej. "sincronizando", que no pasa por acá --
          // ver ReconnectSyncGate -- igual no quedaba bien la idea en general).
          style={{ ...styles.toast, background: toast.type === "success" ? "#3B6E62" : toast.type === "error" ? "#B0473A" : "#2B2620" }}
          role="alert"
        >
          {toast.message}
        </div>
      )}

      {activeTab === "evengroup" && (
        <EvenGroupTab
          session={session}
          groups={groups}
          loading={loading}
          reloadGroup={reloadGroup}
          deleteGroup={deleteGroup}
          view={evenGroupView}
          setView={setEvenGroupView}
          showError={showError}
          showSuccess={showSuccess}
          showInfo={showInfo}
          evenCapital={evenCapital}
          onBackOverride={deepLinkBack}
          isOnline={isOnline}
        />
      )}

      {activeTab === "accounts" && (
        <CuentasTab
          session={session}
          settings={evenCapital.settings}
          groups={evenCapital.groups}
          accounts={evenCapital.accounts}
          accountTotals={evenCapital.accountTotals}
          categories={evenCapital.categories}
          slLinks={evenCapital.slLinks}
          onOpenEvenGroup={openEvenGroup}
          onOpenEvenGroupExpense={openEvenGroupExpense}
          reload={evenCapital.reload}
          reloadCategories={evenCapital.reload}
          showError={showError}
          showInfo={showInfo}
          view={accountsView}
          setView={setAccountsView}
          onSaveMoneyTransaction={saveMoneyTransaction}
          onDeleteMoneyTransaction={deleteMoneyTransaction}
          onBookmarkMoneyTransaction={bookmarkMoneyTransaction}
          isOnline={isOnline}
        />
      )}

      {activeTab === "stats" && statsView.screen === "list" && (
        <EstadisticasTab
          userId={session.userId}
          settings={evenCapital.settings}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          viewMonth={ledgerMonth}
          setViewMonth={setLedgerMonth}
          onDrillDown={(drill) => setStatsView({ screen: "drilldown", ...drill })}
          filters={diarioFilters}
          onOpenFilters={() => setStatsView({ screen: "filters" })}
          onClearFilters={() => setDiarioFilters(EMPTY_FILTERS)}
          onOpenSearch={() => { setLedgerReturn({ tab: "stats", screens: ["search", "editTransaction"] }); setActiveTab("ledger"); setLedgerView({ screen: "search" }); }}
        />
      )}

      {activeTab === "stats" && statsView.screen === "filters" && (
        <DiarioFiltersScreen
          filters={diarioFilters}
          setFilters={setDiarioFilters}
          groups={evenCapital.groups}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          onBack={() => setStatsView({ screen: "list" })}
        />
      )}

      {activeTab === "stats" && statsView.screen === "drilldown" && (
        <CategoryDrillDownScreen
          userId={session.userId}
          settings={evenCapital.settings}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          slLinks={evenCapital.slLinks}
          type={statsView.type}
          categoryId={statsView.categoryId}
          categoryName={statsView.categoryName}
          categoryIcon={statsView.categoryIcon}
          initialCurrency={statsView.currency}
          viewMonth={ledgerMonth}
          setViewMonth={setLedgerMonth}
          onBack={() => setStatsView({ screen: "list" })}
          onNewTransaction={(date) => setStatsView({ screen: "newTransaction", date, categoryId: statsView.categoryId, categoryName: statsView.categoryName, categoryIcon: statsView.categoryIcon, type: statsView.type })}
          onEditTransaction={(t) => setStatsView({ screen: "editTransaction", transaction: t, categoryId: statsView.categoryId, categoryName: statsView.categoryName, categoryIcon: statsView.categoryIcon, type: statsView.type })}
        />
      )}

      {activeTab === "stats" && (statsView.screen === "newTransaction" || statsView.screen === "editTransaction") && (
        <TransactionForm
          session={session}
          settings={evenCapital.settings}
          groups={evenCapital.groups}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          slLinks={evenCapital.slLinks}
          onOpenEvenGroupExpense={openEvenGroupExpense}
          reloadCategories={evenCapital.reload}
          showError={showError}
          showInfo={showInfo}
          isOnline={isOnline}
          editingTransaction={liveStatsTransaction || statsView.transaction}
          defaultDate={statsView.date}
          onCancel={() => setStatsView({ screen: "drilldown", categoryId: statsView.categoryId, categoryName: statsView.categoryName, categoryIcon: statsView.categoryIcon, type: statsView.type })}
          onSave={async (tx) => {
            const ok = await saveMoneyTransaction(tx);
            if (ok) setStatsView({ screen: "drilldown", categoryId: statsView.categoryId, categoryName: statsView.categoryName, categoryIcon: statsView.categoryIcon, type: statsView.type });
          }}
          onDelete={async (id) => {
            const ok = await deleteMoneyTransaction(id);
            if (ok) setStatsView({ screen: "drilldown", categoryId: statsView.categoryId, categoryName: statsView.categoryName, categoryIcon: statsView.categoryIcon, type: statsView.type });
          }}
          onBookmark={bookmarkMoneyTransaction}
        />
      )}

      {activeTab === "ledger" && ledgerView.screen === "list" && (
        <DiarioTab
          userId={session.userId}
          settings={evenCapital.settings}
          groups={evenCapital.groups}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          slLinks={evenCapital.slLinks}
          viewMonth={ledgerMonth}
          setViewMonth={setLedgerMonth}
          onNewTransaction={(date) => setLedgerView({ screen: "newTransaction", date, returnTo: "list" })}
          onEditTransaction={(t) => setLedgerView({ screen: "editTransaction", transaction: t, returnTo: "list" })}
          onOpenSearch={() => setLedgerView({ screen: "search" })}
          onOpenBookmarks={() => setLedgerView({ screen: "bookmarks" })}
          onOpenPhotoImport={() => setLedgerView({ screen: "photoImportPick" })}
          filters={diarioFilters}
          onOpenFilters={() => setLedgerView({ screen: "filters" })}
          onClearFilters={() => setDiarioFilters(EMPTY_FILTERS)}
        />
      )}

      {activeTab === "ledger" && ledgerView.screen === "bookmarks" && (
        <BookmarksScreen
          userId={session.userId}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          showError={showError}
          showInfo={showInfo}
          onBack={() => setLedgerView({ screen: "list" })}
          onUseBookmark={(bookmark) => setLedgerView({ screen: "newTransaction", prefillBookmark: bookmark, returnTo: "list" })}
        />
      )}

      {activeTab === "ledger" && ledgerView.screen === "photoImportPick" && (
        <PhotoImportEntryScreen
          groups={evenCapital.groups}
          accounts={evenCapital.accounts}
          showError={showError}
          showInfo={showInfo}
          onBack={() => setLedgerView({ screen: "list" })}
          onExtracted={(candidates, accountId, date) =>
            setLedgerView({ screen: "photoImportWizard", candidates, accountId, date, returnTo: "list" })}
        />
      )}

      {activeTab === "ledger" && ledgerView.screen === "photoImportWizard" && (
        <PhotoImportWizardScreen
          userId={session.userId}
          settings={evenCapital.settings}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          accountId={ledgerView.accountId}
          candidates={ledgerView.candidates}
          date={ledgerView.date}
          onSaveMoneyTransaction={saveMoneyTransaction}
          showError={showError}
          onBack={() => setLedgerView({ screen: "photoImportPick" })}
          onFinish={() => setLedgerView({ screen: ledgerView.returnTo })}
        />
      )}

      {activeTab === "ledger" && ledgerView.screen === "filters" && (
        <DiarioFiltersScreen
          filters={diarioFilters}
          setFilters={setDiarioFilters}
          groups={evenCapital.groups}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          onBack={() => setLedgerView({ screen: "list" })}
        />
      )}

      {activeTab === "ledger" && ledgerView.screen === "search" && (
        <SearchScreen
          session={session}
          settings={evenCapital.settings}
          groups={evenCapital.groups}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          slLinks={evenCapital.slLinks}
          query={searchQuery}
          setQuery={setSearchQuery}
          filters={searchFilters}
          setFilters={setSearchFilters}
          showError={showError}
          onBack={ledgerDeepLinkBack || (() => setLedgerView({ screen: "list" }))}
          onEditTransaction={(t) => setLedgerView({ screen: "editTransaction", transaction: t, returnTo: "search" })}
        />
      )}

      {activeTab === "ledger" && (ledgerView.screen === "newTransaction" || ledgerView.screen === "editTransaction") && (
        <TransactionForm
          session={session}
          settings={evenCapital.settings}
          groups={evenCapital.groups}
          accounts={evenCapital.accounts}
          categories={evenCapital.categories}
          slLinks={evenCapital.slLinks}
          onOpenEvenGroupExpense={openEvenGroupExpense}
          reloadCategories={evenCapital.reload}
          showError={showError}
          showInfo={showInfo}
          isOnline={isOnline}
          editingTransaction={liveLedgerTransaction || ledgerView.transaction}
          defaultDate={ledgerView.date}
          prefillBookmark={ledgerView.prefillBookmark}
          onCancel={() => setLedgerView({ screen: ledgerView.returnTo })}
          onSave={async (tx) => {
            const ok = await saveMoneyTransaction(tx);
            if (ok) setLedgerView({ screen: ledgerView.returnTo });
          }}
          onDelete={async (id) => {
            const ok = await deleteMoneyTransaction(id);
            if (ok) setLedgerView({ screen: ledgerView.returnTo });
          }}
          onBookmark={bookmarkMoneyTransaction}
        />
      )}

      {activeTab === "config" && (
        <ConfigScreen
          session={session}
          invites={invites}
          onAcceptInvite={handleAcceptInvite}
          onRejectInvite={handleRejectInvite}
          onLogout={onLogout}
          refreshProfile={refreshProfile}
          patchSession={patchSession}
          groups={groups}
          reloadGroups={reloadGroups}
          onCreateGroup={() => goToEvenGroup("newGroup")}
          onOpenGroup={(groupId) => goToEvenGroup("group", { groupId })}
          showError={showError}
          showSuccess={showSuccess}
          showInfo={showInfo}
          changingPassword={changingPassword}
          setChangingPassword={setChangingPassword}
          viewingProfile={viewingProfile}
          setViewingProfile={setViewingProfile}
          evenCapital={evenCapital}
          onSaveMoneyTransaction={saveMoneyTransaction}
          onSaveRecurring={saveRecurring}
          onDeleteRecurring={deleteRecurring}
          creatingRecurring={creatingRecurring}
          setCreatingRecurring={setCreatingRecurring}
          editingRecurring={editingRecurring}
          setEditingRecurring={setEditingRecurring}
          evenCapitalScreen={evenCapitalScreen}
          setEvenCapitalScreen={setEvenCapitalScreen}
          onOpenEvenGroup={openEvenGroup}
          isOnline={isOnline}
        />
      )}

      {showTabBar && (
        <nav style={styles.tabBar}>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                style={{ ...styles.tabBarItem, ...(active ? styles.tabBarItemActive : {}) }}
                onClick={() => handleTabClick(tab)}
              >
                <Icon size={22} />
                <span style={styles.tabBarLabel}>{tab.label()}</span>
                {tab.key === "config" && invites.length > 0 && <span style={styles.tabBarBadge} />}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export default function EvenlyApp() {
  const {
    session, authLoading, register, login, logout, refreshProfile, patchSession,
    recovering, resetPassword, completeRecovery, cancelRecovery,
  } = useAuth();

  // El <style> con html/body/#root { height: 100% } vive acá, en la raíz que
  // siempre se monta (antes vivía solo dentro de AppShell, así que en la
  // pantalla de login —sin sesión— nunca se inyectaba y el minHeight:"100%"
  // de AuthScreen no tenía de qué heredar).
  return (
    <>
      <style>{globalCss}</style>
      {authLoading
        ? <div style={{ ...styles.app, alignItems: "center", justifyContent: "center" }}><p style={styles.muted}>Cargando…</p></div>
        : recovering
          ? <RecoverPasswordScreen onComplete={completeRecovery} onCancel={cancelRecovery} />
          : !session
            ? <AuthScreen onLogin={login} onRegister={register} onForgotPassword={resetPassword} />
            : <AppShell session={session} onLogout={logout} refreshProfile={refreshProfile} patchSession={patchSession} />}
    </>
  );
}
