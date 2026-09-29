import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabaseClient.js";
import { BookOpen, BarChart3, Coins, Divide, MoreHorizontal, MailCheck } from "lucide-react";
import { styles, globalCss } from "./lib/styles.js";
import SplitLedgerTab from "./screens/splitledger/SplitLedgerTab.jsx";
import ConfigScreen from "./screens/config/ConfigScreen.jsx";
import CuentasTab from "./screens/moneymanager/CuentasTab.jsx";
import DiarioTab from "./screens/moneymanager/DiarioTab.jsx";
import TransactionForm from "./screens/moneymanager/TransactionForm.jsx";
import EstadisticasTab from "./screens/moneymanager/EstadisticasTab.jsx";
import { useMoneyManager } from "./lib/moneyManagerData.js";

/* =========================================================================
   AUTH — usuarios, sesión, invitaciones
   ========================================================================= */

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name, photo_url, default_group_id, split_ledger_enabled")
    .eq("id", userId)
    .single();
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
    splitLedgerEnabled: profile.split_ledger_enabled !== false,
  };
}

function useAuth() {
  const [session, setSession] = useState(null); // { userId, email, username, displayName, photoUrl, defaultGroupId, splitLedgerEnabled } | null
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
          const profile = await fetchProfile(authSession.user.id);
          if (!cancelled) setSession(toSession(authSession.user, profile));
        } catch { /* perfil aún no creado por el trigger, o error de red */ }
      }
      if (!cancelled) setAuthLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (!authSession?.user) { setSession(null); return; }
      try {
        const profile = await fetchProfile(authSession.user.id);
        setSession(toSession(authSession.user, profile));
      } catch { /* ignorar, se resuelve en el próximo evento */ }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const register = useCallback(async (email, username, password, displayName) => {
    const uname = username.trim().toLowerCase();
    if (!uname || uname.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
    if (!password || password.length < 4) throw new Error("La contraseña debe tener al menos 4 caracteres.");
    if (!displayName.trim()) throw new Error("Ponle un nombre a tu perfil.");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: uname, display_name: displayName.trim() },
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

  return { session, authLoading, register, login, logout, refreshProfile, recovering, resetPassword, completeRecovery, cancelRecovery };
}

// Select con resource embedding: PostgREST expande cada FK respetando la RLS propia
// de esa tabla hija (is_group_member en todas), así que basta con pedir "groups".
const GROUP_SELECT = `
  id, name, base_currency, rates, photo_url, creator_id, created_at,
  group_members(id, name, linked_user_id, sort_order),
  categories(id, label, icon_key, sort_order),
  expenses(id, description, amount, currency, category_id, date, notes, image_url, split_mode, payers, shares, deleted, created_at),
  payments(id, from_member_id, to_member_id, amount, currency, date, note, deleted, created_at)
`;

// Traduce una fila de Supabase (snake_case, numeric como string, timestamptz como ISO)
// al shape en memoria que ya consumen GroupView/NewExpense/SettleUp/EditGroup.
function toClientGroup(row) {
  return {
    id: row.id,
    name: row.name,
    baseCurrency: row.base_currency,
    rates: row.rates || {},
    photoUrl: row.photo_url || null,
    creatorId: row.creator_id,
    createdAt: new Date(row.created_at).getTime(),
    members: (row.group_members || []).map((m) => ({
      id: m.id,
      name: m.name,
      linkedUserId: m.linked_user_id,
      sortOrder: m.sort_order,
    })),
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

  const load = useCallback(async () => {
    if (!userId) { setGroups([]); setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from("groups")
        .select(GROUP_SELECT)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setGroups(sortGroupsForUser(data.map(toClientGroup), userId));
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
    const g = toClientGroup(data);
    setGroups((prev) => {
      const next = prev ? [...prev] : [];
      const idx = next.findIndex((x) => x.id === groupId);
      if (idx >= 0) next[idx] = g;
      else next.push(g);
      return next;
    });
    return g;
  }, []);

  // Soft-delete: deja la fila en la base (recuperable a mano desde el Table Editor
  // poniendo deleted = false), la RLS de "groups" ya la oculta de cualquier query.
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
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false); // true tras mandar el correo de recuperación

  const canSubmit = mode === "login"
    ? !!email.trim() && !!password
    : mode === "forgot"
      ? !!email.trim()
      : !!displayName.trim() && !!username.trim() && !!email.trim() && !!password && !!confirmPassword;

  const switchMode = (next) => {
    setMode(next); setErr(""); setInfo(""); setPassword(""); setConfirmPassword(""); setSent(false);
  };

  const handle = async () => {
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
        const { needsEmailConfirmation } = await onRegister(email, username, password, displayName);
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
            <label style={styles.label}>
              Nombre que verán los demás
              <input style={styles.input} name="name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tu nombre" autoComplete="name" />
            </label>
          )}
          {mode === "register" && (
            <label style={styles.label}>
              Usuario
              <input style={styles.input} name="new-username" value={username} onChange={e => setUsername(e.target.value)} placeholder="nombre_de_usuario" autoCapitalize="none" autoComplete="username" />
            </label>
          )}
          <label style={styles.label}>
            Email
            <input style={styles.input} type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" autoCapitalize="none" autoComplete={mode === "login" ? "username" : "email"} />
          </label>
          {mode !== "forgot" && (
            <label style={styles.label}>
              Contraseña
              <input style={styles.input} type="password" name={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </label>
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
            <label style={styles.label}>
              Confirmar contraseña
              <input style={styles.input} type="password" name="confirm-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirmar contraseña" autoComplete="new-password" />
            </label>
          )}
          {err && <p style={styles.errText}>{err}</p>}
          {info && <p style={{ ...styles.muted, padding: 0, color: "#3B6E62" }}>{info}</p>}
          <button type="submit" style={{ ...styles.btnPrimary, marginTop: 4, opacity: (loading || !canSubmit) ? 0.5 : 1 }} disabled={loading || !canSubmit}>
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
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = newPassword.length >= 4 && confirmPassword.length >= 4;

  const handleSave = async () => {
    setErr("");
    if (newPassword.length < 4) return setErr("La contraseña debe tener al menos 4 caracteres.");
    if (newPassword !== confirmPassword) return setErr("Las contraseñas no coinciden.");
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
          <label style={styles.label}>
            Nueva contraseña
            <input style={styles.input} type="password" name="new-password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nueva contraseña" />
          </label>
          <label style={styles.label}>
            Confirmar nueva contraseña
            <input style={styles.input} type="password" name="confirm-password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirmar nueva contraseña" />
          </label>
          {err && <p style={styles.errText}>{err}</p>}
          <button type="submit" style={{ ...styles.btnPrimary, marginTop: 4, opacity: (saving || !canSave) ? 0.5 : 1 }} disabled={saving || !canSave}>
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
   BARRA DE 5 TABS (3 de Money Manager "Coming Soon" + Split Ledger + Config)
   ========================================================================= */

const TABS = [
  { key: "ledger", icon: BookOpen, comingSoon: false, label: () => new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short" }) },
  { key: "stats", icon: BarChart3, comingSoon: false, label: () => "Estadísticas" },
  { key: "accounts", icon: Coins, comingSoon: false, label: () => "Cuentas" },
  { key: "splitledger", icon: Divide, comingSoon: false, label: () => "Split Ledger" },
  { key: "config", icon: MoreHorizontal, comingSoon: false, label: () => "Config" },
];

/* =========================================================================
   APP RAÍZ (autenticada) — dueña de los grupos, la navegación de Split
   Ledger, las invitaciones y los toasts; reparte todo eso a los tabs.
   ========================================================================= */

function AppShell({ session, onLogout, refreshProfile }) {
  const { groups, loading, reloadGroup, deleteGroup, reload: reloadGroups } = useGroups(session.userId);
  const moneyManager = useMoneyManager(session.userId);
  const [activeTab, setActiveTab] = useState(() => (session.splitLedgerEnabled ? "splitledger" : "config"));
  const [splitLedgerView, setSplitLedgerView] = useState({ screen: "home" });
  const [accountsView, setAccountsView] = useState({ screen: "list" });
  const [ledgerView, setLedgerView] = useState({ screen: "list" });
  const [ledgerMonth, setLedgerMonth] = useState(() => new Date());
  const [changingPassword, setChangingPassword] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(false);
  const [creatingRecurring, setCreatingRecurring] = useState(false);
  const [moneyManagerScreen, setMoneyManagerScreen] = useState(null);
  const [toast, setToast] = useState(null); // { message, type: "error" | "success" | "info" }
  const [invites, setInvites] = useState([]); // invitaciones que ME llegaron (bandeja)

  const showError = (msg) => setToast({ message: msg, type: "error" });
  const showSuccess = (msg) => setToast({ message: msg, type: "success" });
  const showInfo = (msg) => setToast({ message: msg, type: "info" });

  // Guarda una transacción de Money Manager y, si venía con recurrencia
  // activada, también crea su plantilla en mm_recurring. Un solo lugar para
  // esto porque lo usan tanto "Hoy" (FAB) como "Transacciones repetidas" en Config.
  const saveMoneyTransaction = async ({ recurring, id, ...tx }) => {
    try {
      const payload = { ...tx, date: new Date(tx.date).toISOString() };
      const { error } = id
        ? await supabase.from("mm_transactions").update(payload).eq("id", id)
        // timezone solo se fija al crear, nunca al editar — es "dónde estabas
        // cuando pasó esto", no algo que deba cambiar si corregís el monto
        // de una transacción vieja desde otro país.
        : await supabase.from("mm_transactions").insert({ user_id: session.userId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...payload });
      if (error) throw error;
      if (recurring) {
        const { error: recError } = await supabase.from("mm_recurring").insert({
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
      await moneyManager.reload();
      return true;
    } catch (e) {
      showError(`No se pudo guardar: ${e?.message || e}`);
      return false;
    }
  };

  // Soft-delete (mismo patrón que categorías/cuentas) — mm_transactions.deleted
  // ya es lo que filtran todas las vistas/consultas existentes.
  const deleteMoneyTransaction = async (id) => {
    try {
      const { error } = await supabase.from("mm_transactions").update({ deleted: true }).eq("id", id);
      if (error) throw error;
      await moneyManager.reload();
      return true;
    } catch (e) {
      showError(`No se pudo borrar: ${e?.message || e}`);
      return false;
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const loadInvites = useCallback(async () => {
    const { data, error } = await supabase
      .from("invites")
      .select("id, group_id, member_id, groups(name), group_members(name), profiles!from_user_id(username)")
      .eq("to_user_id", session.userId)
      .eq("status", "pending");
    if (error) { setInvites([]); return; }
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

  const handleAcceptInvite = useCallback(async (invite) => {
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
      setActiveTab("splitledger");
      setSplitLedgerView({ screen: "group", groupId: invite.groupId });
    } catch (e) { showError(`No se pudo aceptar la invitación: ${e?.message || e}`); }
  }, [session.userId, session.displayName, reloadGroup, loadInvites]);

  const handleRejectInvite = useCallback(async (invite) => {
    try {
      const { error } = await supabase.from("invites").update({ status: "rejected" }).eq("id", invite.inviteId);
      if (error) throw error;
    } catch { /* si falla, igual quitamos la invitación de la bandeja */ }
    await loadInvites();
  }, [loadInvites]);

  // Si se apaga "Use Split Ledger" mientras estás parado ahí, te manda a Configuración
  useEffect(() => {
    if (!session.splitLedgerEnabled && activeTab === "splitledger") setActiveTab("config");
  }, [session.splitLedgerEnabled, activeTab]);

  // "Pantalla de inicio" de Money Manager (Detalles del período) — se aplica
  // una sola vez, apenas termina de cargar por primera vez (moneyManager.loading
  // solo pasa de true a false una vez en la vida del hook, reload() no lo
  // vuelve a poner en true), para no pisar la pestaña donde ya estés parado.
  useEffect(() => {
    if (moneyManager.loading) return;
    const tab = moneyManager.settings.startup_tab;
    const valid = ["ledger", "stats", "accounts", "splitledger"];
    if (tab && valid.includes(tab) && (tab !== "splitledger" || session.splitLedgerEnabled)) {
      setActiveTab(tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneyManager.loading]);

  const handleTabClick = (tab) => {
    if (tab.comingSoon) { showInfo("Próximamente"); return; }
    // Re-tocar la tab en la que ya estás parado (Transacciones/Estadísticas)
    // te lleva al mes actual — mismo gesto que el botón "Hoy" del header.
    if (tab.key === activeTab && (tab.key === "ledger" || tab.key === "stats")) {
      const now = new Date();
      setLedgerMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      return;
    }
    setActiveTab(tab.key);
  };

  const visibleTabs = TABS.filter((t) => t.key !== "splitledger" || session.splitLedgerEnabled);
  const showTabBar = activeTab === "config"
    ? (!changingPassword && !viewingProfile && !creatingRecurring && !moneyManagerScreen)
    : activeTab === "accounts"
      ? accountsView.screen === "list"
      : activeTab === "ledger"
        ? ledgerView.screen === "list"
        : activeTab === "stats"
          ? true
          : splitLedgerView.screen === "home";

  return (
    <div style={styles.app}>
      {toast && (
        <div
          style={{ ...styles.toast, background: toast.type === "success" ? "#3B6E62" : "#2B2620" }}
          role="alert"
        >
          {toast.message}
        </div>
      )}

      {activeTab === "splitledger" && (
        <SplitLedgerTab
          session={session}
          groups={groups}
          loading={loading}
          reloadGroup={reloadGroup}
          deleteGroup={deleteGroup}
          view={splitLedgerView}
          setView={setSplitLedgerView}
          showError={showError}
          showSuccess={showSuccess}
          showInfo={showInfo}
        />
      )}

      {activeTab === "accounts" && (
        <CuentasTab
          session={session}
          settings={moneyManager.settings}
          groups={moneyManager.groups}
          accounts={moneyManager.accounts}
          accountTotals={moneyManager.accountTotals}
          reload={moneyManager.reload}
          showError={showError}
          view={accountsView}
          setView={setAccountsView}
        />
      )}

      {activeTab === "stats" && (
        <EstadisticasTab
          userId={session.userId}
          settings={moneyManager.settings}
          categories={moneyManager.categories}
          viewMonth={ledgerMonth}
          setViewMonth={setLedgerMonth}
        />
      )}

      {activeTab === "ledger" && ledgerView.screen === "list" && (
        <DiarioTab
          userId={session.userId}
          settings={moneyManager.settings}
          groups={moneyManager.groups}
          accounts={moneyManager.accounts}
          categories={moneyManager.categories}
          viewMonth={ledgerMonth}
          setViewMonth={setLedgerMonth}
          onNewTransaction={(date) => setLedgerView({ screen: "newTransaction", date })}
          onEditTransaction={(t) => setLedgerView({ screen: "editTransaction", transaction: t })}
        />
      )}

      {activeTab === "ledger" && (ledgerView.screen === "newTransaction" || ledgerView.screen === "editTransaction") && (
        <TransactionForm
          session={session}
          settings={moneyManager.settings}
          groups={moneyManager.groups}
          accounts={moneyManager.accounts}
          categories={moneyManager.categories}
          reloadCategories={moneyManager.reload}
          showError={showError}
          editingTransaction={ledgerView.transaction}
          defaultDate={ledgerView.date}
          onCancel={() => setLedgerView({ screen: "list" })}
          onSave={async (tx) => {
            const ok = await saveMoneyTransaction(tx);
            if (ok) setLedgerView({ screen: "list" });
          }}
          onDelete={async (id) => {
            const ok = await deleteMoneyTransaction(id);
            if (ok) setLedgerView({ screen: "list" });
          }}
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
          groups={groups}
          reloadGroups={reloadGroups}
          onCreateGroup={() => { setActiveTab("splitledger"); setSplitLedgerView({ screen: "newGroup" }); }}
          onOpenGroup={(groupId) => { setActiveTab("splitledger"); setSplitLedgerView({ screen: "group", groupId }); }}
          showError={showError}
          showSuccess={showSuccess}
          changingPassword={changingPassword}
          setChangingPassword={setChangingPassword}
          viewingProfile={viewingProfile}
          setViewingProfile={setViewingProfile}
          moneyManager={moneyManager}
          onSaveMoneyTransaction={saveMoneyTransaction}
          creatingRecurring={creatingRecurring}
          setCreatingRecurring={setCreatingRecurring}
          moneyManagerScreen={moneyManagerScreen}
          setMoneyManagerScreen={setMoneyManagerScreen}
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

export default function SplitLedger() {
  const {
    session, authLoading, register, login, logout, refreshProfile,
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
            : <AppShell session={session} onLogout={logout} refreshProfile={refreshProfile} />}
    </>
  );
}
