import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabaseClient.js";
import { BookOpen, BarChart3, Coins, Divide, MoreHorizontal } from "lucide-react";
import { styles, globalCss } from "./lib/styles.js";
import SplitLedgerTab from "./screens/splitledger/SplitLedgerTab.jsx";
import ConfigScreen from "./screens/config/ConfigScreen.jsx";

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

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, authSession) => {
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
  }, []);

  // Vuelve a leer el profile y actualiza la sesión en memoria (evita el window.location.reload() de antes)
  const refreshProfile = useCallback(async () => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.user) return;
    const profile = await fetchProfile(authSession.user.id);
    setSession(toSession(authSession.user, profile));
  }, []);

  return { session, authLoading, register, login, logout, refreshProfile };
}

// Select con resource embedding: PostgREST expande cada FK respetando la RLS propia
// de esa tabla hija (is_group_member en todas), así que basta con pedir "groups".
const GROUP_SELECT = `
  id, name, base_currency, rates, photo_url, creator_id, created_at,
  group_members(id, name, linked_user_id),
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
      setGroups(data.map(toClientGroup));
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

function AuthScreen({ onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr(""); setInfo(""); setLoading(true);
    try {
      if (mode === "register" && password !== confirmPassword) {
        throw new Error("Las contraseñas no coinciden.");
      }
      if (mode === "login") {
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

  return (
    <div style={{ ...styles.app, alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#F7F2E9" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#FBF8F2", borderRadius: 20, padding: "36px 28px", boxShadow: "0 4px 32px rgba(0,0,0,0.08)", margin: "0 16px" }}>
        <h1 style={{ ...styles.h1, textAlign: "center", marginBottom: 4 }}>Evenly</h1>
        <p style={{ ...styles.muted, padding: 0, textAlign: "center", marginBottom: 28 }}>
          {mode === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "register" && (
            <label style={styles.label}>
              Nombre que verán los demás
              <input style={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tu nombre" autoFocus />
            </label>
          )}
          {mode === "register" && (
            <label style={styles.label}>
              Usuario
              <input style={styles.input} value={username} onChange={e => setUsername(e.target.value)} placeholder="nombre_de_usuario" autoCapitalize="none" />
            </label>
          )}
          <label style={styles.label}>
            Email
            <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" autoCapitalize="none" autoFocus={mode === "login"} onKeyDown={e => e.key === "Enter" && handle()} />
          </label>
          <label style={styles.label}>
            Contraseña
            <input style={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" onKeyDown={e => e.key === "Enter" && handle()} />
          </label>
          {mode === "register" && (
            <label style={styles.label}>
              Confirmar contraseña
              <input style={styles.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••" onKeyDown={e => e.key === "Enter" && handle()} />
            </label>
          )}
          {err && <p style={styles.errText}>{err}</p>}
          {info && <p style={{ ...styles.muted, padding: 0, color: "#3B6E62" }}>{info}</p>}
          <button style={{ ...styles.btnPrimary, marginTop: 4 }} onClick={handle} disabled={loading}>
            {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
          <button
            style={{ background: "none", border: "none", fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: "#A8754A", cursor: "pointer", textAlign: "center", padding: "4px 0" }}
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); setInfo(""); setConfirmPassword(""); }}
          >
            {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   BARRA DE 5 TABS (3 de Money Manager "Coming Soon" + Split Ledger + Config)
   ========================================================================= */

const TABS = [
  { key: "ledger", icon: BookOpen, comingSoon: true, label: () => new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short" }) },
  { key: "stats", icon: BarChart3, comingSoon: true, label: () => "Estadísticas" },
  { key: "accounts", icon: Coins, comingSoon: true, label: () => "Cuentas" },
  { key: "splitledger", icon: Divide, comingSoon: false, label: () => "Split Ledger" },
  { key: "config", icon: MoreHorizontal, comingSoon: false, label: () => "Config" },
];

/* =========================================================================
   APP RAÍZ (autenticada) — dueña de los grupos, la navegación de Split
   Ledger, las invitaciones y los toasts; reparte todo eso a los tabs.
   ========================================================================= */

function AppShell({ session, onLogout, refreshProfile }) {
  const { groups, loading, reloadGroup, deleteGroup } = useGroups(session.userId);
  const [activeTab, setActiveTab] = useState(() => (session.splitLedgerEnabled ? "splitledger" : "config"));
  const [splitLedgerView, setSplitLedgerView] = useState({ screen: "home" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(false);
  const [toast, setToast] = useState(null); // { message, type: "error" | "success" | "info" }
  const [invites, setInvites] = useState([]); // invitaciones que ME llegaron (bandeja)

  const showError = (msg) => setToast({ message: msg, type: "error" });
  const showSuccess = (msg) => setToast({ message: msg, type: "success" });
  const showInfo = (msg) => setToast({ message: msg, type: "info" });

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

  const handleTabClick = (tab) => {
    if (tab.comingSoon) { showInfo("Próximamente"); return; }
    setActiveTab(tab.key);
  };

  const visibleTabs = TABS.filter((t) => t.key !== "splitledger" || session.splitLedgerEnabled);
  const showTabBar = activeTab === "config" ? (!changingPassword && !viewingProfile) : splitLedgerView.screen === "home";

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
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

      {activeTab === "config" && (
        <ConfigScreen
          session={session}
          invites={invites}
          onAcceptInvite={handleAcceptInvite}
          onRejectInvite={handleRejectInvite}
          onLogout={onLogout}
          refreshProfile={refreshProfile}
          groups={groups}
          onCreateGroup={() => { setActiveTab("splitledger"); setSplitLedgerView({ screen: "newGroup" }); }}
          onOpenGroup={(groupId) => { setActiveTab("splitledger"); setSplitLedgerView({ screen: "group", groupId }); }}
          showError={showError}
          showSuccess={showSuccess}
          changingPassword={changingPassword}
          setChangingPassword={setChangingPassword}
          viewingProfile={viewingProfile}
          setViewingProfile={setViewingProfile}
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
  const { session, authLoading, register, login, logout, refreshProfile } = useAuth();

  if (authLoading) {
    return <div style={{ ...styles.app, alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><p style={styles.muted}>Cargando…</p></div>;
  }

  if (!session) {
    return <AuthScreen onLogin={login} onRegister={register} />;
  }

  return <AppShell session={session} onLogout={logout} refreshProfile={refreshProfile} />;
}
