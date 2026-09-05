import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, Receipt, X, ChevronRight, ArrowRight, Check, Trash2, ArrowLeft,
  Settings, RefreshCw, HandCoins, UtensilsCrossed, Car, Home as HomeIcon,
  Plug, PartyPopper, ShoppingBag, Plane, HeartPulse, MoreHorizontal,
  UserPlus, AlertCircle, Repeat, ChevronUp, ChevronDown as ChevronDownIcon,
  Coffee, Pizza, Bus, Train, Bike, Fuel, Hotel, Building2, Wrench,
  Tv, Music, Gamepad2, BookOpen, Dumbbell, Scissors, Gift, Baby,
  PawPrint, Flower2, Sun, Umbrella, Briefcase, GraduationCap, Stethoscope,
  Pill, Wine, IceCream, ShoppingCart, Wallet, CreditCard, Banknote,
  Landmark, TreePine, Waves, Mountain, Camera, Utensils, Beer, User, PenLine, Pencil, Bell, LogOut, Send
} from "lucide-react";

/* =========================================================================
   LÓGICA PURA (balances, monedas, reparto, recurrencia)
   ========================================================================= */

const uid = () => Math.random().toString(36).slice(2, 10);

const CURRENCIES = {
  USD: { symbol: "$", label: "USD" },
  EUR: { symbol: "€", label: "EUR" },
  GBP: { symbol: "£", label: "GBP" },
  MXN: { symbol: "MX$", label: "MXN" },
  ARS: { symbol: "AR$", label: "ARS" },
  COP: { symbol: "COL$", label: "COP" },
  CLP: { symbol: "CLP$", label: "CLP" },
  PEN: { symbol: "S/", label: "PEN" },
  BRL: { symbol: "R$", label: "BRL" },
};
const CURRENCY_LIST = Object.keys(CURRENCIES);

const money = (n, currency = "USD") => {
  const sym = CURRENCIES[currency]?.symbol || currency + " ";
  const fixed = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${n < 0 ? "-" : ""}${sym}${fixed}`;
};

// Mapa completo de íconos disponibles para categorías (string → componente)
const ICON_MAP = {
  Receipt, UtensilsCrossed, Car, Home: HomeIcon, Plug, PartyPopper, ShoppingBag,
  Plane, HeartPulse, MoreHorizontal, Coffee, Pizza, Bus, Train, Bike, Fuel,
  Hotel, Building2, Wrench, Tv, Music, Gamepad2, BookOpen, Dumbbell, Scissors,
  Gift, Baby, PawPrint, Flower2, Sun, Umbrella, Briefcase, GraduationCap,
  Stethoscope, Pill, Wine, IceCream, ShoppingCart, Wallet, CreditCard,
  Banknote, Landmark, TreePine, Waves, Mountain, Camera, Utensils, Beer, HandCoins,
};
const ICON_KEYS = Object.keys(ICON_MAP);

// Icono desde string key — con fallback
const IconComp = ({ iconKey, size = 16, ...rest }) => {
  const C = ICON_MAP[iconKey] || Receipt;
  return <C size={size} {...rest} />;
};

// Categorías globales por defecto (usadas si el grupo no tiene las suyas)
const DEFAULT_CATEGORIES = [
  { id: "general",       label: "General",         iconKey: "Receipt" },
  { id: "food",          label: "Comida",           iconKey: "UtensilsCrossed" },
  { id: "transport",     label: "Transporte",       iconKey: "Car" },
  { id: "housing",       label: "Alojamiento",      iconKey: "Home" },
  { id: "utilities",     label: "Servicios",        iconKey: "Plug" },
  { id: "entertainment", label: "Entretenimiento",  iconKey: "PartyPopper" },
  { id: "shopping",      label: "Compras",          iconKey: "ShoppingBag" },
  { id: "travel",        label: "Viaje",            iconKey: "Plane" },
  { id: "health",        label: "Salud",            iconKey: "HeartPulse" },
  { id: "other",         label: "Otro",             iconKey: "MoreHorizontal" },
];

// Obtiene las categorías activas de un grupo (o las globales si no tiene)
const groupCategories = (group) => group?.categories?.length ? group.categories : DEFAULT_CATEGORIES;

// Busca info de una categoría por id dentro de un grupo
const catInfo = (id, group) => {
  const cats = groupCategories(group);
  return cats.find((c) => c.id === id) || cats[0] || DEFAULT_CATEGORIES[0];
};

// Retrocompatibilidad: los gastos viejos pueden tener Icon (componente) en vez de iconKey
// catInfo devuelve siempre { id, label, iconKey } — usar <IconComp iconKey={...} />

const PALETTE = ["#C75D3B", "#3B6E62", "#9A7B4F", "#5A6B8C", "#A8516E", "#4F7942", "#7A5C99", "#B8753F"];
const colorFor = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
const shortName = (name) => {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
};

const initials = (name) =>
  (name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

function toBase(amount, currency, group) {
  if (!currency || currency === group.baseCurrency) return amount;
  const rate = group.rates?.[currency];
  if (!rate) return amount;
  return amount * rate;
}

function computeBalances(group) {
  const { members, expenses = [], payments = [] } = group;
  const bal = {};
  members.forEach((m) => (bal[m.id] = 0));

  expenses.forEach((e) => {
    if (e.deleted) return;
    // Retrocompatibilidad: paidBy (string) o payers (objeto {id: amount})
    const payers = e.payers || { [e.paidBy]: e.amount };
    Object.entries(payers).forEach(([payerId, paid]) => {
      const paidBase = toBase(paid, e.currency, group);
      bal[payerId] = (bal[payerId] || 0) + paidBase;
    });
    Object.entries(e.shares).forEach(([memberId, shareAmt]) => {
      const shareBase = toBase(shareAmt, e.currency, group);
      bal[memberId] = (bal[memberId] || 0) - shareBase;
    });
  });

  payments.forEach((p) => {
    if (p.deleted) return;
    const amtBase = toBase(p.amount, p.currency, group);
    bal[p.from] = (bal[p.from] || 0) + amtBase;
    bal[p.to] = (bal[p.to] || 0) - amtBase;
  });

  return bal;
}

function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  Object.entries(balances).forEach(([id, amt]) => {
    if (amt > 0.005) creditors.push({ id, amt });
    else if (amt < -0.005) debtors.push({ id, amt: -amt });
  });
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const txns = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0.005) txns.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.005) i++;
    if (creditors[j].amt < 0.005) j++;
  }
  return txns;
}

// Net que otherId le debe a memberId (positivo = otherId debe a memberId; negativo = memberId debe a otherId)
// Fórmula: por cada gasto, memberId pagó una fracción de la parte de otherId,
// y otherId pagó una fracción de la parte de memberId.
function pairwiseBalance(group, memberId, otherId) {
  const { expenses = [], payments = [] } = group;
  let net = 0;

  expenses.forEach((e) => {
    if (e.deleted) return;
    const toB = (amt) => toBase(amt, e.currency, group);
    const payers = e.payers || { [e.paidBy]: e.amount };

    const paidM = toB(payers[memberId] || 0);
    const paidO = toB(payers[otherId]  || 0);
    const sharesM = toB(e.shares[memberId] || 0);
    const sharesO = toB(e.shares[otherId]  || 0);
    const totalShares = Object.values(e.shares).reduce((s, v) => s + toB(v), 0) || 1;

    // memberId pagó de la parte de otherId: paidM * (sharesO / totalShares)
    // otherId pagó de la parte de memberId: paidO * (sharesM / totalShares)
    net += paidM * (sharesO / totalShares);
    net -= paidO * (sharesM / totalShares);
  });

  // Pagos directos entre los dos
  payments.forEach((p) => {
    if (p.deleted) return;
    const amtBase = toBase(p.amount, p.currency, group);
    if (p.from === otherId && p.to === memberId) net -= amtBase;
    if (p.from === memberId && p.to === otherId) net += amtBase;
  });

  return net;
}

// Distribuye `totalCents` enteros entre `n` personas de la forma más justa posible.
// Devuelve un array de valores en centavos. Los primeros (totalCents % n) reciben 1 centavo extra.
function distributeCents(totalCents, n) {
  const base = Math.floor(totalCents / n);
  const extra = totalCents - base * n; // cuántas personas reciben 1 centavo más
  return Array.from({ length: n }, (_, i) => (i < extra ? base + 1 : base));
}

// Convierte un monto float a centavos y de vuelta, distribuyendo sin perder ni ganar céntimos.
function fairSplit(amount, ratios) {
  // ratios: array de pesos proporcionales (no tienen que sumar 1)
  const totalRatio = ratios.reduce((s, r) => s + r, 0) || 1;
  const totalCents = Math.round(amount * 100);
  // Calcular cuántos centavos le tocan a cada uno por proporción
  const rawCents = ratios.map((r) => (r / totalRatio) * totalCents);
  const floorCents = rawCents.map(Math.floor);
  let remainder = totalCents - floorCents.reduce((s, c) => s + c, 0);
  // Ordenar por parte decimal descendente para dar los centavos extra a quienes más les "correspondía"
  const order = rawCents
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  order.forEach(({ i }) => {
    if (remainder > 0) { floorCents[i]++; remainder--; }
  });
  return floorCents.map((c) => c / 100);
}

function computeShares({ splitMode, amount, participantIds, exactAmounts, percentages, shareUnits }) {
  const shares = {};
  const n = participantIds.length || 1;

  if (splitMode === "equal") {
    const vals = fairSplit(amount, Array(n).fill(1));
    participantIds.forEach((id, i) => { shares[id] = vals[i]; });

  } else if (splitMode === "exact") {
    participantIds.forEach((id) => { shares[id] = exactAmounts[id] || 0; });

  } else if (splitMode === "percent") {
    const ratios = participantIds.map((id) => percentages[id] || 0);
    const vals = fairSplit(amount, ratios);
    participantIds.forEach((id, i) => { shares[id] = vals[i]; });

  } else if (splitMode === "shares") {
    const ratios = participantIds.map((id) => shareUnits[id] || 0);
    const vals = fairSplit(amount, ratios);
    participantIds.forEach((id, i) => { shares[id] = vals[i]; });
  }

  return shares;
}

function nextOccurrence(dateMs, frequency) {
  const d = new Date(dateMs);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}

function generateDueRecurring(template, now = Date.now()) {
  const instances = [];
  let next = template.nextDate;
  let guard = 0;
  while (next <= now && guard < 36) {
    instances.push({
      id: uid(),
      description: template.description,
      amount: template.amount,
      currency: template.currency,
      category: template.category,
      paidBy: template.paidBy,
      shares: template.shares,
      splitMode: template.splitMode,
      date: next,
      createdAt: Date.now(),
      notes: template.notes,
      recurringId: template.id,
    });
    next = nextOccurrence(next, template.frequency);
    guard++;
  }
  return { instances, newNextDate: next };
}

function freqLabel(f) {
  return { weekly: "Cada semana", biweekly: "Cada 2 semanas", monthly: "Cada mes", yearly: "Cada año" }[f] || f;
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateShort(ms) {
  return new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}
function todayInputValue() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function dateInputValue(ms) {
  const d = new Date(ms);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/* =========================================================================
   IMAGEN COMPARTIDA (evita duplicar handlePhoto en 4 pantallas distintas)
   ========================================================================= */

// Hook reutilizable para subir una imagen a base64 con límite de tamaño.
// onError recibe el mensaje de error a mostrar (cada pantalla decide dónde mostrarlo).
function useImageUpload(initial = null, onError) {
  const [imageBase64, setImageBase64] = useState(initial);
  const handleImageChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4_000_000) { onError?.("La imagen no puede superar 4 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setImageBase64(ev.target.result);
    reader.readAsDataURL(file);
  }, [onError]);
  return [imageBase64, setImageBase64, handleImageChange];
}

/* =========================================================================
   STORAGE
   ========================================================================= */

/* =========================================================================
   AUTH — usuarios, sesión, invitaciones
   ========================================================================= */

// Hash simple (djb2) — no criptográfico, solo para no guardar la contraseña en texto plano
function hashPassword(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// Storage de usuarios (shared = false → privado por sesión, pero necesitamos shared para que
// un usuario pueda encontrar a otro por username)
// Guardamos solo username + passwordHash + displayName en shared
// La contraseña nunca sale de texto plano; guardamos el hash

async function getUserIndex() {
  try {
    const res = await window.storage.get("users-index", true);
    return res ? JSON.parse(res.value) : {};
    // { username: { userId, passwordHash, displayName } }
  } catch { return {}; }
}

async function saveUserIndex(index) {
  await window.storage.set("users-index", JSON.stringify(index), true);
}

async function getUserData(userId) {
  try {
    const res = await window.storage.get(`userdata:${userId}`, false);
    return res ? JSON.parse(res.value) : null;
  } catch { return null; }
}

async function saveUserData(userId, data) {
  await window.storage.set(`userdata:${userId}`, JSON.stringify(data), false);
}

// Invitaciones: guardadas en shared con key invite:{userId}
// Array de { inviteId, groupId, groupName, memberId, memberName, fromUsername, createdAt }
async function getInvites(userId) {
  try {
    const res = await window.storage.get(`invites:${userId}`, true);
    return res ? JSON.parse(res.value) : [];
  } catch { return []; }
}
async function saveInvites(userId, invites) {
  await window.storage.set(`invites:${userId}`, JSON.stringify(invites), true);
}

function useAuth() {
  const [session, setSession] = useState(null); // { userId, username, displayName } | null
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Intentar restaurar sesión guardada localmente
    (async () => {
      try {
        const res = await window.storage.get("current-session", false);
        if (res) {
          const sess = JSON.parse(res.value);
          // Cargar foto y datos actualizados desde userData
          const userData = await getUserData(sess.userId);
          if (userData) {
            sess.displayName = userData.displayName || sess.displayName;
            sess.photoBase64 = userData.photoBase64 || null;
          }
          setSession(sess);
        }
      } catch {}
      setAuthLoading(false);
    })();
  }, []);

  const register = useCallback(async (username, password, displayName) => {
    const uname = username.trim().toLowerCase();
    if (!uname || uname.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
    if (!password || password.length < 4) throw new Error("La contraseña debe tener al menos 4 caracteres.");
    if (!displayName.trim()) throw new Error("Ponle un nombre a tu perfil.");
    const index = await getUserIndex();
    if (index[uname]) throw new Error("Ese nombre de usuario ya está en uso.");
    const userId = uid();
    const hash = hashPassword(password);
    index[uname] = { userId, passwordHash: hash, displayName: displayName.trim() };
    await saveUserIndex(index);
    await saveUserData(userId, { userId, username: uname, displayName: displayName.trim(), groupIds: [] });
    const sess = { userId, username: uname, displayName: displayName.trim() };
    await window.storage.set("current-session", JSON.stringify(sess), false);
    setSession(sess);
    return sess;
  }, []);

  const login = useCallback(async (username, password) => {
    const uname = username.trim().toLowerCase();
    const index = await getUserIndex();
    const entry = index[uname];
    if (!entry) throw new Error("Usuario no encontrado.");
    if (entry.passwordHash !== hashPassword(password)) throw new Error("Contraseña incorrecta.");
    const sess = { userId: entry.userId, username: uname, displayName: entry.displayName };
    await window.storage.set("current-session", JSON.stringify(sess), false);
    setSession(sess);
    return sess;
  }, []);

  const logout = useCallback(async () => {
    try { await window.storage.delete("current-session", false); } catch {}
    setSession(null);
  }, []);

  return { session, authLoading, register, login, logout };
}

function useGroups(userId) {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setGroups([]); setLoading(false); return; }
    try {
      // Cargar IDs de grupos del usuario
      const userData = await getUserData(userId);
      const ids = userData?.groupIds || [];
      const loaded = [];
      for (const id of ids) {
        try {
          const g = await window.storage.get(`group:${id}`, true);
          if (g) loaded.push(normalizeGroup(JSON.parse(g.value)));
        } catch {
          /* skip missing */
        }
      }
      setGroups(loaded);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveGroup = useCallback(async (group) => {
    const payload = JSON.stringify(group);
    if (payload.length > 4_900_000) {
      throw new Error(`El grupo es demasiado grande para guardar (${(payload.length/1000).toFixed(0)}KB, límite ~5MB). Borra gastos antiguos.`);
    }
    let res;
    try {
      res = await window.storage.set(`group:${group.id}`, payload, true);
    } catch (e) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        res = await window.storage.set(`group:${group.id}`, payload, true);
      } catch (e2) {
        throw new Error(`storage.set falló dos veces. Detalle: ${e2?.message || e2}`);
      }
    }
    if (!res) throw new Error("storage.set devolvió null (la operación no se confirmó)");
    setGroups((prev) => {
      const next = prev ? [...prev] : [];
      const idx = next.findIndex((g) => g.id === group.id);
      if (idx >= 0) next[idx] = group;
      else next.push(group);
      return next;
    });
    // Actualizar lista de grupos del usuario
    if (userId) {
      const userData = await getUserData(userId) || { userId, groupIds: [] };
      if (!userData.groupIds.includes(group.id)) {
        userData.groupIds = [...(userData.groupIds || []), group.id];
        await saveUserData(userId, userData);
      }
    }
  }, [userId]);

  const deleteGroup = useCallback(async (id) => {
    await window.storage.delete(`group:${id}`, true).catch(() => {});
    if (userId) {
      const userData = await getUserData(userId);
      if (userData) {
        userData.groupIds = (userData.groupIds || []).filter((x) => x !== id);
        await saveUserData(userId, userData);
      }
    }
    setGroups((prev) => (prev ? prev.filter((g) => g.id !== id) : prev));
  }, [userId]);

  return { groups, loading, saveGroup, deleteGroup, reload: load };
}

// Asegura que un grupo viejo (de versiones anteriores) tenga todos los campos nuevos
function normalizeGroup(g) {
  return {
    baseCurrency: "USD",
    rates: {},
    payments: [],
    recurring: [],
    categories: [],
    pendingInvites: {},
    ...g,
    expenses: (g.expenses || []).map((e) => ({
      currency: g.baseCurrency || "USD",
      category: "general",
      notes: "",
      date: e.createdAt || Date.now(),
      splitMode: "equal",
      deleted: false,
      ...e,
    })),
  };
}

/* =========================================================================
   APP RAÍZ
   ========================================================================= */

export default function SplitLedger() {
  const { session, authLoading, register, login, logout } = useAuth();

  if (authLoading) {
    return <div style={{ ...styles.app, alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><p style={styles.muted}>Cargando…</p></div>;
  }

  if (!session) {
    return <AuthScreen onLogin={login} onRegister={register} />;
  }

  return <AppMain session={session} onLogout={logout} />;
}

function AppMain({ session, onLogout }) {
  const { groups, loading, saveGroup, deleteGroup } = useGroups(session.userId);
  const [view, setView] = useState({ screen: "home" });
  const [toast, setToast] = useState(null); // { message, type: "error" | "success" }
  const [invites, setInvites] = useState([]);
  const processedRecurring = useRef(new Set());

  // Cargar invitaciones pendientes
  useEffect(() => {
    getInvites(session.userId).then(setInvites);
  }, [session.userId]);

  const refreshInvites = useCallback(async () => {
    setInvites(await getInvites(session.userId));
  }, [session.userId]);

  const activeGroup = useMemo(
    () => (groups && view.groupId ? groups.find((g) => g.id === view.groupId) : null),
    [groups, view.groupId]
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  // Procesa gastos recurrentes vencidos, una vez por grupo por sesión
  useEffect(() => {
    if (!groups) return;
    groups.forEach((g) => {
      if (processedRecurring.current.has(g.id)) return;
      const recurring = g.recurring || [];
      if (recurring.length === 0) return;
      let changed = false;
      const newExpenses = [...g.expenses];
      const newRecurring = recurring.map((tpl) => {
        if (tpl.paused) return tpl;
        const { instances, newNextDate } = generateDueRecurring(tpl);
        if (instances.length > 0) {
          changed = true;
          newExpenses.push(...instances);
          return { ...tpl, nextDate: newNextDate };
        }
        return tpl;
      });
      processedRecurring.current.add(g.id);
      if (changed) {
        saveGroup({ ...g, expenses: newExpenses, recurring: newRecurring }).catch(() => {});
      }
    });
  }, [groups, saveGroup]);

  const showError = (msg) => setToast({ message: msg, type: "error" });
  const showSuccess = (msg) => setToast({ message: msg, type: "success" });
  const showInfo = (msg) => setToast({ message: msg, type: "info" });

  const handleAcceptInvite = useCallback(async (invite) => {
    try {
      const res = await window.storage.get(`group:${invite.groupId}`, true);
      if (!res) { showError("El grupo ya no existe."); return; }
      const g = normalizeGroup(JSON.parse(res.value));
      const memberLinks = { ...(g.memberLinks || {}), [invite.memberId]: session.userId };
      const members = g.members.map((m) =>
        m.id === invite.memberId ? { ...m, name: session.displayName, linkedUserId: session.userId } : m
      );
      const pendingInvites = { ...(g.pendingInvites || {}) };
      delete pendingInvites[invite.memberId];
      await saveGroup({ ...g, memberLinks, members, pendingInvites });
      const newInvites = invites.filter((i) => i.inviteId !== invite.inviteId);
      await saveInvites(session.userId, newInvites);
      setInvites(newInvites);
      setView({ screen: "group", groupId: invite.groupId });
    } catch (e) { showError(`No se pudo aceptar la invitación: ${e?.message || e}`); }
  }, [invites, session.userId, session.displayName, saveGroup]);

  const handleRejectInvite = useCallback(async (invite) => {
    try {
      const res = await window.storage.get(`group:${invite.groupId}`, true);
      if (res) {
        const g = normalizeGroup(JSON.parse(res.value));
        const pendingInvites = { ...(g.pendingInvites || {}) };
        delete pendingInvites[invite.memberId];
        // No usamos saveGroup aquí a propósito: quien rechaza no es miembro de
        // este grupo, y saveGroup lo agregaría por error a su lista local.
        await window.storage.set(`group:${invite.groupId}`, JSON.stringify({ ...g, pendingInvites }), true);
      }
    } catch (e) { /* si falla, igual quitamos la invitación de la bandeja de quien rechaza */ }
    const newInvites = invites.filter((i) => i.inviteId !== invite.inviteId);
    await saveInvites(session.userId, newInvites);
    setInvites(newInvites);
  }, [invites, session.userId]);

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
      {toast && (
        <div
          style={{
            ...styles.toast,
            background: toast.type === "success" ? "#3B6E62" : "#2B2620",
          }}
          role="alert"
        >
          {toast.message}
        </div>
      )}

      {view.screen === "home" && (
        <Home
          groups={groups}
          loading={loading}
          session={session}
          invites={invites}
          onOpen={(id) => setView({ screen: "group", groupId: id })}
          onNew={() => setView({ screen: "newGroup" })}
          onProfile={() => setView({ screen: "profile" })}
          onAcceptInvite={handleAcceptInvite}
          onRejectInvite={handleRejectInvite}
        />
      )}

      {view.screen === "newGroup" && (
        <NewGroup
          onCancel={() => setView({ screen: "home" })}
          session={session}
          onCreate={async (group) => {
            try {
              // memberLinks: vincular el primer miembro (el creador) al userId
              const creatorMember = group.members.find(m => m.linkedUserId === session.userId);
              const memberLinks = creatorMember ? { [creatorMember.id]: session.userId } : {};
              await saveGroup({ ...group, creatorId: session.userId, memberLinks });
              setView({ screen: "group", groupId: group.id });
            } catch (e) {
              showError(`No se pudo guardar el grupo: ${e?.message || e}`);
            }
          }}
        />
      )}

      {view.screen === "group" && activeGroup && (
        <GroupView
          group={activeGroup}
          onBack={() => setView({ screen: "home" })}
          onAddExpense={() => setView({ screen: "newExpense", groupId: activeGroup.id })}
          onOpenExpense={(expenseId) => setView({ screen: "expenseDetail", groupId: activeGroup.id, expenseId })}
          onSettleUp={(prefill) => setView({ screen: "settleUp", groupId: activeGroup.id, prefill })}
          onEditGroup={() => setView({ screen: "editGroup", groupId: activeGroup.id })}
          onRecurring={() => setView({ screen: "recurring", groupId: activeGroup.id })}
          onSave={async (g) => {
            try { await saveGroup(g); } catch (e) { showError(`No se pudo guardar el cambio: ${e?.message || e}`); }
          }}
          onDeleteGroup={async () => {
            try {
              await deleteGroup(activeGroup.id);
              setView({ screen: "home" });
            } catch (e) { showError(`No se pudo borrar el grupo: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "expenseDetail" && activeGroup && (
        <ExpenseDetail
          group={activeGroup}
          expenseId={view.expenseId}
          onBack={() => setView({ screen: "group", groupId: activeGroup.id })}
          onEdit={(expenseId) => setView({ screen: "newExpense", groupId: activeGroup.id, expenseId })}
        />
      )}

      {view.screen === "newExpense" && activeGroup && (
        <NewExpense
          group={activeGroup}
          expenseId={view.expenseId}
          onCancel={() => setView(
            view.expenseId
              ? { screen: "expenseDetail", groupId: activeGroup.id, expenseId: view.expenseId }
              : { screen: "group", groupId: activeGroup.id }
          )}
          onSave={async (expense) => {
            const exists = activeGroup.expenses.some((e) => e.id === expense.id);
            const expenses = exists
              ? activeGroup.expenses.map((e) => (e.id === expense.id ? expense : e))
              : [...activeGroup.expenses, expense];
            try {
              await saveGroup({ ...activeGroup, expenses });
              setView(
                exists
                  ? { screen: "expenseDetail", groupId: activeGroup.id, expenseId: expense.id }
                  : { screen: "group", groupId: activeGroup.id }
              );
            } catch (e) { showError(`No se pudo guardar el gasto: ${e?.message || e}`); }
          }}
          onDelete={async (expenseId) => {
            const expenses = activeGroup.expenses.filter((e) => e.id !== expenseId);
            try {
              await saveGroup({ ...activeGroup, expenses });
              setView({ screen: "group", groupId: activeGroup.id });
            } catch (e) { showError(`No se pudo borrar el gasto: ${e?.message || e}`); }
          }}
          onSaveRecurring={async (template) => {
            try {
              await saveGroup({ ...activeGroup, recurring: [...(activeGroup.recurring || []), template] });
              setView({ screen: "group", groupId: activeGroup.id });
            } catch (e) { showError(`No se pudo crear el gasto recurrente: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "settleUp" && activeGroup && (
        <SettleUp
          group={activeGroup}
          prefill={view.prefill}
          onCancel={() => setView({ screen: "group", groupId: activeGroup.id })}
          onSave={async (payment) => {
            try {
              await saveGroup({ ...activeGroup, payments: [...(activeGroup.payments || []), payment] });
              setView({ screen: "group", groupId: activeGroup.id });
            } catch (e) { showError(`No se pudo registrar el pago: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "editGroup" && activeGroup && (
        <EditGroup
          key={`${JSON.stringify(activeGroup.pendingInvites || {})}-${activeGroup.members.length}`}
          group={activeGroup}
          session={session}
          onCancel={() => setView({ screen: "group", groupId: activeGroup.id })}
          onSave={async (g) => {
            try {
              await saveGroup(g);
              setView({ screen: "group", groupId: activeGroup.id });
            } catch (e) { showError(`No se pudo guardar el grupo: ${e?.message || e}`); }
          }}
          onDeleteGroup={async () => {
            try {
              await deleteGroup(activeGroup.id);
              setView({ screen: "home" });
            } catch (e) { showError(`No se pudo borrar el grupo: ${e?.message || e}`); }
          }}
          onInvite={() => setView({ screen: "inviteScreen", groupId: activeGroup.id })}
          showError={showError}
        />
      )}

      {view.screen === "inviteScreen" && activeGroup && (
        <InviteScreen
          key={JSON.stringify(activeGroup.pendingInvites || {})}
          group={activeGroup}
          session={session}
          onBack={() => setView({ screen: "editGroup", groupId: activeGroup.id })}
          onSend={async ({ memberId, targetUsername }) => {
            try {
              const index = await getUserIndex();
              const entry = index[targetUsername.trim().toLowerCase()];
              if (!entry) throw new Error(`Usuario "${targetUsername}" no encontrado.`);
              const targetId = entry.userId;
              const member = activeGroup.members.find(m => m.id === memberId);
              const existingInvites = await getInvites(targetId);
              const already = existingInvites.find(i => i.groupId === activeGroup.id && i.memberId === memberId);
              if (already) throw new Error("Ya existe una invitación para ese miembro.");
              const inviteId = uid();
              existingInvites.push({
                inviteId,
                groupId: activeGroup.id,
                groupName: activeGroup.name,
                memberId,
                memberName: member?.name || "—",
                fromUsername: session.username,
                createdAt: Date.now(),
              });
              await saveInvites(targetId, existingInvites);
              const pendingInvites = { ...(activeGroup.pendingInvites || {}), [memberId]: { username: targetUsername.trim().toLowerCase(), inviteId, targetUserId: targetId } };
              await saveGroup({ ...activeGroup, pendingInvites });
              showSuccess(`Invitación enviada a @${targetUsername.trim().toLowerCase()}`);
            } catch (e) { showError(`No se pudo enviar la invitación: ${e?.message || e}`); }
          }}
          onCancelInvite={async (memberId) => {
            try {
              const pending = activeGroup.pendingInvites?.[memberId];
              if (!pending) return;
              // Borrar del storage de invitaciones del usuario destino
              const existingInvites = await getInvites(pending.targetUserId);
              const filtered = existingInvites.filter(i => i.inviteId !== pending.inviteId);
              await saveInvites(pending.targetUserId, filtered);
              // Quitar del grupo
              const pendingInvites = { ...(activeGroup.pendingInvites || {}) };
              delete pendingInvites[memberId];
              await saveGroup({ ...activeGroup, pendingInvites });
              showInfo(`Invitación a @${pending.username} cancelada`);
            } catch (e) { showError(`No se pudo cancelar la invitación: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "recurring" && activeGroup && (
        <RecurringList
          group={activeGroup}
          onBack={() => setView({ screen: "group", groupId: activeGroup.id })}
          onSave={async (g) => {
            try { await saveGroup(g); } catch (e) { showError(`No se pudo actualizar: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "profile" && (
        <ProfileScreen
          session={session}
          invites={invites}
          onBack={() => setView({ screen: "home" })}
          onLogout={onLogout}
          onAcceptInvite={handleAcceptInvite}
          onRejectInvite={handleRejectInvite}
          onSave={async ({ displayName, newPassword, photoBase64 }) => {
            try {
              const index = await getUserIndex();
              const entry = index[session.username];
              if (newPassword) entry.passwordHash = hashPassword(newPassword);
              entry.displayName = displayName;
              await saveUserIndex(index);
              const userData = await getUserData(session.userId) || {};
              await saveUserData(session.userId, { ...userData, displayName, photoBase64: photoBase64 || null });
              // Actualizar sesión en memoria y storage
              const newSess = { ...session, displayName, photoBase64: photoBase64 || null };
              await window.storage.set("current-session", JSON.stringify(newSess), false);
              // Forzar recarga para que el session se actualice
              window.location.reload();
            } catch (e) { showError(`No se pudo guardar: ${e?.message || e}`); }
          }}
        />
      )}
    </div>
  );
}

/* =========================================================================
   HOME
   ========================================================================= */

function Home({ groups, loading, session, invites = [], onOpen, onNew, onProfile, onAcceptInvite, onRejectInvite }) {
  return (
    <div style={styles.screen}>
      <header style={styles.homeHeader}>
        <h1 style={styles.h1}>Tus grupos</h1>
        {/* Campana de notificaciones + botón de perfil arriba a la derecha */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {invites.length > 0 && (
            <button
              onClick={onProfile}
              aria-label={`${invites.length} invitación${invites.length > 1 ? "es" : ""} pendiente${invites.length > 1 ? "s" : ""}`}
              style={{ width: 40, height: 40, borderRadius: "50%", border: "2px solid #ECE3D3", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", color: "#C75D3B" }}
            >
              <Bell size={19} />
              <span style={{ position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 9, background: "#C75D3B", color: "#fff", fontSize: 10.5, fontWeight: 700, fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #FBF8F2" }}>
                {invites.length}
              </span>
            </button>
          )}
          <button
            onClick={onProfile}
            aria-label="Perfil"
            style={{ width: 40, height: 40, borderRadius: "50%", border: "2px solid #ECE3D3", overflow: "hidden", background: "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            {session?.photoBase64
              ? <img src={session.photoBase64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <User size={20} color="#A89A87" />
            }
          </button>
        </div>
      </header>

      {loading && <p style={styles.muted}>Abriendo los grupos…</p>}

      {!loading && groups && groups.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}><Receipt size={28} strokeWidth={1.5} /></div>
          <p style={styles.emptyTitle}>Todavía no hay ningún grupo</p>
          <p style={styles.muted}>Crea un grupo — un viaje, un piso, una junta — y empieza a anotar quién paga qué.</p>
          <button style={styles.btnPrimary} onClick={onNew}>Crear mi primer grupo</button>
        </div>
      )}

      {!loading && groups && groups.length > 0 && (
        <ul style={styles.groupList}>
          {groups.map((g) => {
            const bal = computeBalances(g);
            const total = g.expenses.filter(e => !e.deleted).reduce((s, e) => s + toBase(e.amount, e.currency, g), 0);
            const settled = Object.values(bal).every((v) => Math.abs(v) < 0.01);
            return (
              <li key={g.id}>
                <button style={styles.groupCard} onClick={() => onOpen(g.id)}>
                  <div style={styles.groupCardLeft}>
                    <div style={{ width: 48, height: 48, minWidth: 48, borderRadius: 12, overflow: "hidden", background: g.photoBase64 ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {g.photoBase64
                        ? <img src={g.photoBase64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <User size={22} color="#A89A87" />
                      }
                    </div>
                    <div>
                      <p style={styles.groupName}>{g.name}</p>
                      <p style={styles.groupMeta}>
                        {g.members.length} personas · {money(total, g.baseCurrency)} en total
                        {settled && g.expenses.length > 0 ? " · saldado" : ""}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={20} color="#A89A87" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* FAB flotante para crear grupo */}
      <button style={styles.fab} onClick={onNew} aria-label="Crear grupo">
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* =========================================================================
   NEW GROUP
   ========================================================================= */

function NewGroup({ onCancel, onCreate, session }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState([""]);
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [err, setErr] = useState("");
  const [photoBase64, setPhotoBase64, handlePhoto] = useImageUpload(null, setErr);
  const [saving, setSaving] = useState(false);

  const updateMember = (i, val) => setMembers((prev) => prev.map((m, idx) => (idx === i ? val : m)));
  const addMemberField = () => setMembers((prev) => [...prev, ""]);
  const removeMemberField = (i) => setMembers((prev) => prev.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    if (!name.trim()) { setErr("Ponle un nombre al grupo."); return; }
    setSaving(true);
    // Creador siempre incluido como miembro vinculado
    const myMember = { id: uid(), name: session.displayName, linkedUserId: session.userId };
    const otherMembers = members.map((n) => n.trim()).filter(Boolean).map((n) => ({ id: uid(), name: n }));
    await onCreate({
      id: uid(),
      name: name.trim(),
      members: [myMember, ...otherMembers],
      expenses: [],
      payments: [],
      recurring: [],
      baseCurrency,
      rates: {},
      photoBase64: photoBase64 || null,
      createdAt: Date.now(),
    });
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Nuevo grupo" onBack={onCancel} />
      <div style={styles.form}>
        {/* Foto del grupo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 72, height: 72, minWidth: 72, borderRadius: 16, overflow: "hidden", background: photoBase64 ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #DDD2BE" }}>
            {photoBase64
              ? <img src={photoBase64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <User size={28} color="#A89A87" />
            }
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ ...styles.btnDashed, cursor: "pointer", fontSize: 13 }}>
              <Camera size={14} /> {photoBase64 ? "Cambiar foto" : "Añadir foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
            </label>
            {photoBase64 && (
              <button style={{ ...styles.btnGhostSmall, fontSize: 12 }} onClick={() => setPhotoBase64(null)}>Quitar foto</button>
            )}
          </div>
        </div>

        <label style={styles.label}>
          Nombre del grupo
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Viaje a Lisboa, Piso compartido…" autoFocus />
        </label>

        <label style={styles.label}>
          Moneda principal del grupo
          <select style={styles.input} value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </label>
        <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
          Los balances se calculan en esta moneda. Puedes registrar gastos en otras y definir su tasa de cambio.
        </p>

        <p style={styles.label}>Integrantes</p>

        {/* Tú — fijo, no se puede quitar */}
        <div style={{ ...styles.shareRow, background: "#F3EFE5", borderColor: "#DDD2BE" }}>
          <span style={{ ...styles.avatar, background: colorFor(session.userId) }}>{initials(session.displayName)}</span>
          <span style={{ flex: 1, fontWeight: 600 }}>{session.displayName}</span>
          <span style={{ fontSize: 11, color: "#A8754A", fontFamily: "system-ui, sans-serif" }}>Tú</span>
        </div>

        {/* Otros miembros */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ ...styles.avatar, background: m.trim() ? colorFor(m + i) : "#D9CFC1" }}>
                {m.trim() ? initials(m) : i + 1}
              </span>
              <input style={{ ...styles.input, flex: 1 }} value={m} onChange={(e) => updateMember(i, e.target.value)} placeholder={`Persona ${i + 1}`} />
              {members.length > 1 && (
                <button style={styles.iconBtnGhost} onClick={() => removeMemberField(i)} aria-label="Quitar persona"><X size={16} /></button>
              )}
            </div>
          ))}
        </div>
        <button style={styles.btnDashed} onClick={addMemberField}><Plus size={16} /> Agregar persona</button>

        {err && <p style={styles.errText}>{err}</p>}
        <button style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleCreate} disabled={saving}>{saving ? "Creando…" : "Crear grupo"}</button>
      </div>
    </div>
  );
}

/* =========================================================================
   EDIT GROUP (nombre, moneda, tasas, miembros)
   ========================================================================= */

function EditGroup({ group, session, onCancel, onSave, onDeleteGroup, onInvite, showError }) {
  const [name, setName] = useState(group.name);
  const [baseCurrency, setBaseCurrency] = useState(group.baseCurrency);
  const [rates, setRates] = useState(group.rates || {});
  const [members, setMembers] = useState(group.members);
  const [newMemberName, setNewMemberName] = useState("");
  const [photoBase64, setPhotoBase64, handlePhoto] = useImageUpload(group.photoBase64 || null, showError);
  const [saving, setSaving] = useState(false);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState(null);
  const [categories, setCategories] = useState(() => groupCategories(group).map(c => ({ ...c })));
  const [editingCatId, setEditingCatId] = useState(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [confirmGroupDelete, setConfirmGroupDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const dragIdx = useRef(null);
  const balances = useMemo(() => computeBalances(group), [group]);

  const usedCurrencies = useMemo(() => {
    const set = new Set(group.expenses.filter(e => !e.deleted).map((e) => e.currency));
    set.delete(baseCurrency);
    return [...set];
  }, [group.expenses, baseCurrency]);

  const addMember = () => {
    const n = newMemberName.trim();
    if (!n) return;
    setMembers((prev) => [...prev, { id: uid(), name: n }]);
    setNewMemberName("");
  };

  const removeMember = (id) => {
    const bal = balances[id] || 0;
    if (Math.abs(bal) > 0.01) {
      showError("No puedes quitar a alguien con balance pendiente. Salda sus cuentas primero.");
      return;
    }
    setConfirmRemoveMemberId(id);
  };

  const confirmRemoveMember = (id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setConfirmRemoveMemberId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) return showError("Ponle un nombre al grupo.");
    if (members.length < 2) return showError("El grupo necesita al menos dos personas.");
    if (categories.some(c => !c.label.trim())) return showError("Todas las categorías deben tener un nombre.");
    setSaving(true);
    await onSave({ ...group, name: name.trim(), baseCurrency, rates, members, categories, photoBase64: photoBase64 || null });
    setSaving(false);
  };

  const addCategory = () => {
    setCategories(prev => [...prev, { id: uid(), label: "", iconKey: "MoreHorizontal" }]);
    setCatsOpen(true);
  };

  const removeCategory = (id) => {
    if (categories.length <= 1) return showError("El grupo necesita al menos una categoría.");
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const updateCategory = (id, patch) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  // Drag & drop handlers
  const onDragStart = (idx) => { dragIdx.current = idx; };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    setCategories(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(idx, 0, moved);
      dragIdx.current = idx;
      return next;
    });
  };
  const onDragEnd = () => { dragIdx.current = null; };

  return (
    <div style={styles.screen}>
      <TopBar title="Editar grupo" onBack={onCancel} />
      <div style={styles.form}>
        {/* Foto del grupo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 72, height: 72, minWidth: 72, borderRadius: 16, overflow: "hidden", background: photoBase64 ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #DDD2BE" }}>
            {photoBase64
              ? <img src={photoBase64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <User size={28} color="#A89A87" />
            }
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ ...styles.btnDashed, cursor: "pointer", fontSize: 13 }}>
              <Camera size={14} /> {photoBase64 ? "Cambiar foto" : "Añadir foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
            </label>
            {photoBase64 && (
              <button style={{ ...styles.btnGhostSmall, fontSize: 12 }} onClick={() => setPhotoBase64(null)}>Quitar foto</button>
            )}
          </div>
        </div>

        <label style={styles.label}>
          Nombre del grupo
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label style={styles.label}>
          Moneda principal
          <select style={styles.input} value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </label>

        {usedCurrencies.length > 0 && (
          <>
            <p style={styles.label}>Tasas de cambio a {baseCurrency}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {usedCurrencies.map((c) => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontFamily: "system-ui, sans-serif", width: 90 }}>1 {c} =</span>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    value={rates[c] ?? ""}
                    onChange={(e) => setRates((prev) => ({ ...prev, [c]: parseFloat(e.target.value) || 0 }))}
                    placeholder={`${baseCurrency} ej. 1.08`}
                    inputMode="decimal"
                  />
                </div>
              ))}
            </div>
            <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
              Esto solo afecta cómo se calculan los balances totales — los montos originales del gasto no cambian.
            </p>
          </>
        )}

        <p style={styles.label}>Personas</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {members.map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ ...styles.shareRow, borderRadius: confirmRemoveMemberId === m.id ? "10px 10px 0 0" : 10 }}>
                <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block" }}>{m.name}</span>
                  {group.pendingInvites?.[m.id] && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#3B6E62", fontFamily: "system-ui, sans-serif" }}>
                      <Send size={10} /> Invitación enviada a @{group.pendingInvites[m.id].username}
                    </span>
                  )}
                </div>
                {Math.abs(balances[m.id] || 0) > 0.01 && (
                  <span style={{ fontSize: 11, color: "#A8754A", fontFamily: "system-ui, sans-serif" }}>balance pendiente</span>
                )}
                {m.linkedUserId === session?.userId ? (
                  <span style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#A8754A" }}>Tú</span>
                ) : (
                  <button style={styles.iconBtnGhost} onClick={() => confirmRemoveMemberId === m.id ? setConfirmRemoveMemberId(null) : removeMember(m.id)} aria-label="Quitar persona">
                    <X size={16} color={confirmRemoveMemberId === m.id ? "#B0473A" : undefined} />
                  </button>
                )}
              </div>
              {confirmRemoveMemberId === m.id && (
                <div style={{ background: "#FBEDE7", border: "1px solid #EBC9BA", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>¿Quitar a {m.name} del grupo?</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={styles.btnGhostSmall} onClick={() => setConfirmRemoveMemberId(null)}>Cancelar</button>
                    <button style={styles.btnDangerSmall} onClick={() => confirmRemoveMember(m.id)}>Quitar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...styles.input, flex: 1 }} value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="Nombre de la nueva persona" onKeyDown={(e) => e.key === "Enter" && addMember()} />
          <button style={styles.btnSecondarySmall} onClick={addMember}><UserPlus size={16} /></button>
        </div>

        {/* ── Categorías colapsables ── */}
        <button
          style={styles.collapsibleHeader}
          onClick={() => setCatsOpen(v => !v)}
          aria-expanded={catsOpen}
        >
          <span style={styles.label}>Categorías de gasto ({categories.length})</span>
          {catsOpen ? <ChevronUp size={18} color="#6B6355" /> : <ChevronDownIcon size={18} color="#6B6355" />}
        </button>

        {catsOpen && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {categories.map((cat, idx) => (
                <div
                  key={cat.id}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDragEnd={onDragEnd}
                  style={{ display: "flex", flexDirection: "column", cursor: "grab" }}
                >
                  <div style={{ ...styles.shareRow, gap: 6, padding: "8px 10px" }}>
                    {/* Handle visual */}
                    <span style={{ color: "#C9BBA0", display: "flex", alignItems: "center", paddingRight: 2, cursor: "grab" }}>
                      ⠿
                    </span>
                    {/* Botón ícono */}
                    <button
                      onClick={() => setEditingCatId(editingCatId === cat.id ? null : cat.id)}
                      style={{ width: 34, height: 34, minWidth: 34, borderRadius: 8, border: "1px solid #DDD2BE", background: editingCatId === cat.id ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#544A3C", cursor: "pointer" }}
                      aria-label="Cambiar ícono"
                    >
                      <IconComp iconKey={cat.iconKey} size={16} />
                    </button>
                    {/* Nombre */}
                    <input
                      style={{ ...styles.input, flex: 1, padding: "7px 10px", fontSize: 14 }}
                      value={cat.label}
                      onChange={e => updateCategory(cat.id, { label: e.target.value })}
                      placeholder="Nombre de categoría"
                    />
                    {/* Borrar */}
                    <button style={styles.iconBtnGhost} onClick={() => removeCategory(cat.id)} aria-label="Eliminar categoría">
                      <X size={15} />
                    </button>
                  </div>
                  {/* Picker de ícono inline */}
                  {editingCatId === cat.id && (
                    <div style={{ background: "#F7F2E9", border: "1px solid #E8DFD0", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {ICON_KEYS.map(key => (
                        <button
                          key={key}
                          onClick={() => { updateCategory(cat.id, { iconKey: key }); setEditingCatId(null); }}
                          style={{ width: 34, height: 34, borderRadius: 8, border: cat.iconKey === key ? "2px solid #C75D3B" : "1px solid #DDD2BE", background: cat.iconKey === key ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#544A3C" }}
                          aria-label={key}
                        >
                          <IconComp iconKey={key} size={16} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button style={styles.btnDashed} onClick={addCategory}><Plus size={16} /> Nueva categoría</button>
          </>
        )}

        <button style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>

        {/* Invitar personas */}
        {group.creatorId === session?.userId && (
          <button style={styles.btnSecondary} onClick={onInvite}>
            <UserPlus size={16} /> Invitar a alguien al grupo
          </button>
        )}

        {/* Borrar grupo */}
        <div style={styles.dangerZone}>
          {!confirmGroupDelete ? (
            <button style={styles.btnDangerOutline} onClick={() => setConfirmGroupDelete(true)}>
              <Trash2 size={15} /> Borrar este grupo
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>
                ¿Borrar "{group.name}" y todo su historial? Esta acción no se puede deshacer.
              </p>
              <input
                style={{ ...styles.input, fontSize: 14 }}
                placeholder='Escribe "Confirmar" para continuar'
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button style={styles.btnGhostSmall} onClick={() => { setConfirmGroupDelete(false); setDeleteConfirmText(""); }}>Cancelar</button>
                <button
                  style={{ ...styles.btnDangerSmall, opacity: deleteConfirmText === "Confirmar" ? 1 : 0.4, cursor: deleteConfirmText === "Confirmar" ? "pointer" : "not-allowed" }}
                  onClick={() => deleteConfirmText === "Confirmar" && onDeleteGroup()}
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   GROUP VIEW
   ========================================================================= */

function GroupView({ group, onBack, onAddExpense, onOpenExpense, onSettleUp, onEditGroup, onRecurring, onSave, onDeleteGroup }) {
  const [tab, setTab] = useState("activity"); // activity | balances | individual
  const [selectedMember, setSelectedMember] = useState(group.members[0]?.id || null);
  const { members, expenses, payments = [], baseCurrency } = group;

  const balances = useMemo(() => computeBalances(group), [group]);
  const txns = useMemo(() => simplifyDebts(balances), [balances]);
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Alguien que ya no está";
  const allSettled = txns.length === 0;
  const activeExpenses = expenses.filter((e) => !e.deleted);

  const activityItems = useMemo(() => {
    const items = [
      ...activeExpenses.map((e) => ({ kind: "expense", ts: e.date || e.createdAt || 0, created: e.createdAt || 0, data: e })),
      ...payments.filter((p) => !p.deleted).map((p) => ({ kind: "payment", ts: p.date || p.createdAt || 0, created: p.createdAt || 0, data: p })),
    ];
    return items.sort((a, b) => {
      const dateDiff = b.ts - a.ts;
      if (Math.abs(dateDiff) > 60000) return dateDiff; // fechas distintas: ordenar por fecha
      return b.created - a.created; // misma fecha (~mismo día): el más reciente creado arriba
    });
  }, [activeExpenses, payments]);

  const handleDeleteExpense = (expenseId) => {
    onSave({ ...group, expenses: group.expenses.map((e) => (e.id === expenseId ? { ...e, deleted: true } : e)) });
  };

  return (
    <div style={styles.screen}>
      <TopBar
        title={group.name}
        onBack={onBack}
        right={
          <button style={styles.iconBtnGhost} onClick={onEditGroup} aria-label="Editar grupo">
            <Settings size={18} />
          </button>
        }
      />

      <div style={styles.quickActions}>
        <button style={styles.quickActionBtn} onClick={onRecurring}>
          <Repeat size={15} /> Recurrentes {group.recurring?.length ? `(${group.recurring.filter(r=>!r.paused).length})` : ""}
        </button>
      </div>

      {/* Fila de miembros con avatares coloreados y expandible */}
      {(() => {
        const [showAll, setShowAll] = React.useState(false);
        const visible = showAll ? members : members.slice(0, 4);
        const extra = members.length - 4;
        return (
          <div style={{ padding: "8px 20px 4px" }}>
            <div style={{ display: "flex", alignItems: showAll ? "flex-start" : "center", flexWrap: showAll ? "wrap" : "nowrap", gap: showAll ? 10 : 0 }}>
              {visible.map((m, idx) => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: showAll ? 44 : "auto", marginLeft: showAll ? 0 : idx === 0 ? 0 : -6, zIndex: showAll ? 0 : 10 - idx, flexShrink: 0 }}>
                  <span style={{ ...styles.avatar, background: colorFor(m.id), width: 34, height: 34, fontSize: 12, boxShadow: showAll ? "none" : "0 0 0 2px #FBF8F2" }}>
                    {initials(m.name)}
                  </span>
                  {showAll && (
                    <span style={{ fontSize: 10, color: "#6B6355", fontFamily: "system-ui, sans-serif", width: 44, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{m.name}</span>
                  )}
                </div>
              ))}
              {!showAll && extra > 0 && (
                <button
                  onClick={() => setShowAll(true)}
                  style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px dashed #C9BBA0", background: "#F0EBE2", fontSize: 11, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#8A7253", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: -6, zIndex: 1, cursor: "pointer", flexShrink: 0 }}
                >
                  +{extra}
                </button>
              )}
              {showAll && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 44, flexShrink: 0 }}>
                  <button
                    onClick={() => setShowAll(false)}
                    style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px dashed #C9BBA0", background: "#F0EBE2", fontSize: 20, fontWeight: 300, fontFamily: "system-ui, sans-serif", color: "#8A7253", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, lineHeight: 1, paddingBottom: 2 }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 10, color: "#6B6355", fontFamily: "system-ui, sans-serif", width: 44, textAlign: "center" }}> </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div style={styles.tabRow}>
        <button style={tab === "activity" ? styles.tabActive : styles.tab} onClick={() => setTab("activity")}>Actividad</button>
        <button style={tab === "balances" ? styles.tabActive : styles.tab} onClick={() => setTab("balances")}>Balances</button>
        <button style={tab === "individual" ? styles.tabActive : styles.tab} onClick={() => setTab("individual")}>Por persona</button>
      </div>

      {tab === "balances" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          {allSettled && (
            <div style={styles.settledBox}><Check size={18} color="#3B6E62" /><span>Todo saldado. Nadie le debe nada a nadie.</span></div>
          )}
          {!allSettled && txns.map((t, i) => (
            <div key={i} style={styles.debtCard}>
              <span style={{ ...styles.avatar, background: colorFor(t.from), width: 30, height: 30, fontSize: 11, flexShrink: 0 }}>{initials(nameOf(t.from))}</span>
              <ArrowRight size={13} color="#C9BBA0" style={{ flexShrink: 0 }} />
              <span style={{ ...styles.avatar, background: colorFor(t.to), width: 30, height: 30, fontSize: 11, flexShrink: 0 }}>{initials(nameOf(t.to))}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontFamily: "system-ui, sans-serif", fontWeight: 500, color: "#544A3C", minWidth: 0 }}>
                <strong style={{ fontWeight: 700 }}>{shortName(nameOf(t.from))}</strong>
                {" le debe a "}
                <strong style={{ fontWeight: 700 }}>{shortName(nameOf(t.to))}</strong>
              </span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#C75D3B", fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>{money(t.amount, baseCurrency)}</span>
              <button style={styles.settleSmallBtn} onClick={() => onSettleUp({ from: t.from, to: t.to, amount: t.amount })}>
                Saldar
              </button>
            </div>
          ))}
          <p style={styles.simplifyNote}>
            {txns.length === 0 ? "Sin pagos pendientes." : `Simplificado a ${txns.length} pago${txns.length > 1 ? "s" : ""} — el mínimo posible para saldar el grupo.`}
          </p>
          <button style={styles.btnSecondary} onClick={() => onSettleUp(null)}>
            <HandCoins size={16} /> Registrar un pago
          </button>
        </div>
      )}

      {tab === "individual" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 20px" }}>
            {members.map((m) => (
              <button key={m.id} onClick={() => setSelectedMember(m.id)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px 6px 6px", borderRadius: 20,
                border: `1.5px solid ${selectedMember === m.id ? colorFor(m.id) : "transparent"}`,
                background: selectedMember === m.id ? `${colorFor(m.id)}1a` : "#F0EBE2",
                fontSize: 13, fontFamily: "system-ui, sans-serif", fontWeight: 600,
              }}>
                <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>
                {m.name}
              </button>
            ))}
          </div>

          {selectedMember && (() => {
            const bal = balances[selectedMember] || 0;
            const isZero = Math.abs(bal) < 0.01;
            const isPos = bal > 0.005;

            // Usar las transacciones simplificadas globales filtradas por esta persona
            const myTxns = txns.filter(t => t.from === selectedMember || t.to === selectedMember);

            // Total puesto de su bolsillo
            const totalLent = (group.expenses || []).filter(e => !e.deleted).reduce((sum, e) => {
              const payers = e.payers || { [e.paidBy]: e.amount };
              const paid = toBase(payers[selectedMember] || 0, e.currency, group);
              const owes = toBase(e.shares[selectedMember] || 0, e.currency, group);
              return sum + Math.max(0, paid - owes);
            }, 0);

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 20px" }}>
                {/* Balance general */}
                <div style={{ padding: "14px 16px", borderRadius: 12, background: isZero ? "#F3EFE5" : isPos ? "#EAF1ED" : "#FBEDE7", border: `1px solid ${isZero ? "#DDD2BE" : isPos ? "#CFE2D7" : "#EBC9BA"}` }}>
                  <p style={{ margin: 0, fontSize: 13, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>{nameOf(selectedMember)}</p>
                  {isZero ? (
                    <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>Sin cuentas pendientes</p>
                  ) : (
                    <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: isPos ? "#3B6E62" : "#B0473A" }}>
                      {isPos ? "Le deben " : "Debe "}
                      <span>{money(Math.abs(bal), baseCurrency)}</span>
                    </p>
                  )}
                </div>

                {/* Pagos pendientes simplificados que involucran a esta persona */}
                {myTxns.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {myTxns.map((t, i) => (
                      <div key={i} style={styles.pairRow}>
                        <span style={{ ...styles.avatar, background: colorFor(t.from), width: 28, height: 28, fontSize: 11 }}>{initials(nameOf(t.from))}</span>
                        <span style={{ flex: 1, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>
                          <strong>{shortName(nameOf(t.from))}</strong> le debe a <strong>{shortName(nameOf(t.to))}</strong>
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: t.from === selectedMember ? "#B0473A" : "#3B6E62", fontFamily: "system-ui, sans-serif" }}>
                          {money(t.amount, baseCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total puesto de su bolsillo */}
                {totalLent > 0.01 && (
                  <p style={{ ...styles.muted, padding: 0, fontSize: 12.5 }}>
                    Ha puesto de su bolsillo un total de <strong>{money(totalLent, baseCurrency)}</strong> en gastos del grupo.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {tab === "activity" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {activityItems.length === 0 && <p style={styles.muted}>Aún no hay actividad registrada.</p>}
          {(() => {
            // Agrupar por mes (ya están en orden descendente por ts)
            const rows = [];
            let lastMonthKey = null;
            activityItems.forEach((item) => {
              const d = new Date(item.ts);
              const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
              const monthLabel = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
                .replace(/^./, c => c.toUpperCase());
              if (monthKey !== lastMonthKey) {
                rows.push({ kind: "separator", key: monthKey, label: monthLabel });
                lastMonthKey = monthKey;
              }
              rows.push(item);
            });

            return rows.map((row) => {
              if (row.kind === "separator") {
                return (
                  <div key={row.key} style={styles.monthSeparator}>
                    <span style={styles.monthSeparatorText}>{row.label}</span>
                  </div>
                );
              }
              if (row.kind === "expense") {
                const e = row.data;
                const cat = catInfo(e.category, group);
                return (
                  <button key={e.id} style={styles.expenseCard} onClick={() => onOpenExpense(e.id)}>
                    {/* Fecha a la izquierda */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 32, gap: 1 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#544A3C", lineHeight: 1 }}>
                        {new Date(e.date || e.createdAt).getDate()}
                      </span>
                      <span style={{ fontSize: 9.5, fontWeight: 600, fontFamily: "system-ui, sans-serif", color: "#A8967A", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {new Date(e.date || e.createdAt).toLocaleDateString("es-ES", { month: "short" })}
                      </span>
                    </div>
                    {/* Ícono de categoría */}
                    <div style={{ ...styles.expenseIcon, background: colorFor(cat.id), flexShrink: 0 }}><IconComp iconKey={cat.iconKey} size={16} /></div>
                    {/* Texto */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...styles.expenseTitle, display: "flex", alignItems: "center", gap: 4 }}>
                        {e.imageBase64 ? <Camera size={11} color="#A8967A" style={{ flexShrink: 0 }} /> : null}
                        <span>{e.description}</span>
                        {e.recurringId ? <Repeat size={11} color="#A8967A" style={{ flexShrink: 0 }} /> : null}
                      </p>
                      <p style={styles.expenseSub}>
                        {(() => {
                          const payers = e.payers || { [e.paidBy]: e.amount };
                          const payerNames = Object.keys(payers).map(id => shortName(nameOf(id)));
                          const payerStr = payerNames.length === 1
                            ? `${payerNames[0]} pagó`
                            : `${payerNames.slice(0, -1).join(", ")} y ${payerNames.at(-1)} pagaron`;
                          return `${payerStr} ${money(e.amount, e.currency)}`;
                        })()}
                      </p>
                    </div>
                    <ChevronRight size={16} color="#C9BBA0" />
                  </button>
                );
              }
              const p = row.data;
              return (
                <div key={p.id} style={styles.paymentCard}>
                  {/* Fecha */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 32, gap: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#3B6E62", lineHeight: 1 }}>
                      {new Date(p.date || p.createdAt).getDate()}
                    </span>
                    <span style={{ fontSize: 9.5, fontWeight: 600, fontFamily: "system-ui, sans-serif", color: "#3B6E62", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {new Date(p.date || p.createdAt).toLocaleDateString("es-ES", { month: "short" })}
                    </span>
                  </div>
                  <div style={{ ...styles.expenseIcon, background: "#3B6E62", flexShrink: 0 }}><HandCoins size={16} /></div>
                  <p style={{ ...styles.expenseTitle, flex: 1, minWidth: 0, margin: 0 }}>
                    {nameOf(p.from)} le pagó a {nameOf(p.to)}{p.note ? ` · ${p.note}` : ""}
                  </p>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#3B6E62", fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>
                    {money(p.amount, p.currency)}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      )}

      <button style={styles.fab} onClick={onAddExpense} aria-label="Agregar gasto"><Plus size={24} strokeWidth={2.5} /></button>
    </div>
  );
}

/* =========================================================================
   EXPENSE DETAIL (solo lectura — se abre al tocar la tarjeta de un gasto)
   ========================================================================= */

function ExpenseDetail({ group, expenseId, onBack, onEdit }) {
  const { members } = group;
  const e = group.expenses.find((x) => x.id === expenseId);
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Alguien que ya no está";

  if (!e) {
    return (
      <div style={styles.screen}>
        <TopBar title="Gasto" onBack={onBack} />
        <p style={styles.muted}>Este gasto ya no existe.</p>
      </div>
    );
  }

  const cat = catInfo(e.category, group);
  const payers = e.payers || (e.paidBy ? { [e.paidBy]: e.amount } : {});
  const payerIds = Object.keys(payers);
  const shareIds = Object.keys(e.shares || {});

  return (
    <div style={styles.screen}>
      <TopBar
        title="Detalle del gasto"
        onBack={onBack}
        right={
          <button
            onClick={() => onEdit(e.id)}
            style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: "#C75D3B", fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", padding: "6px 4px" }}
          >
            <Pencil size={15} /> Editar
          </button>
        }
      />

      <div style={styles.form}>
        {/* Cabecera: ícono, descripción, categoría y fecha */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ ...styles.expenseIcon, width: 48, height: 48, minWidth: 48, background: colorFor(cat.id) }}>
            <IconComp iconKey={cat.iconKey} size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 19, fontWeight: 700, fontFamily: "'Iowan Old Style', Georgia, serif" }}>
              {e.description}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6B6355", fontFamily: "system-ui, sans-serif" }}>
              {cat.label} · {fmtDate(e.date || e.createdAt)}
            </p>
          </div>
        </div>

        {/* Monto total */}
        <p style={{ margin: 0, fontSize: 32, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#2B2620" }}>
          {money(e.amount, e.currency)}
        </p>

        {/* Quién pagó */}
        <div>
          <p style={{ ...styles.label, marginBottom: 4 }}>{payerIds.length > 1 ? "Quiénes pagaron" : "Quién pagó"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {payerIds.map((id) => (
              <div key={id} style={styles.shareRow}>
                <span style={{ ...styles.avatar, background: colorFor(id), width: 30, height: 30, minWidth: 30, fontSize: 11 }}>
                  {initials(nameOf(id))}
                </span>
                <span style={{ flex: 1 }}>{nameOf(id)}</span>
                <span style={styles.shareAmount}>{money(payers[id], e.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cómo se divide */}
        <div>
          <p style={{ ...styles.label, marginBottom: 4 }}>Cómo se divide</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shareIds.map((id) => (
              <div key={id} style={styles.shareRow}>
                <span style={{ ...styles.avatar, background: colorFor(id), width: 30, height: 30, minWidth: 30, fontSize: 11 }}>
                  {initials(nameOf(id))}
                </span>
                <span style={{ flex: 1 }}>{nameOf(id)}</span>
                <span style={styles.shareAmount}>{money(e.shares[id], e.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {e.imageBase64 && (
          <img src={e.imageBase64} alt="" style={{ width: "100%", borderRadius: 12, border: "1px solid #ECE3D3", objectFit: "cover", maxHeight: 220 }} />
        )}

        {e.notes && (
          <div>
            <p style={{ ...styles.label, marginBottom: 4 }}>Notas</p>
            <p style={{ ...styles.muted, padding: 0, margin: 0 }}>{e.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   NEW / EDIT EXPENSE
   ========================================================================= */

function NewExpense({ group, expenseId, onCancel, onSave, onDelete, onSaveRecurring }) {
  const { members, baseCurrency } = group;
  const existing = expenseId ? group.expenses.find((e) => e.id === expenseId) : null;

  const [description, setDescription] = useState(existing?.description || "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [currency, setCurrency] = useState(existing?.currency || baseCurrency);
  const [category, setCategory] = useState(existing?.category || "general");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [date, setDate] = useState(existing ? dateInputValue(existing.date) : todayInputValue());

  // Pagadores: "single" o "multi"
  const existingPayers = existing?.payers || (existing?.paidBy ? { [existing.paidBy]: existing.amount } : null);
  const initPayerMode = existingPayers && Object.keys(existingPayers).length > 1 ? "multi" : "single";
  const [payerMode, setPayerMode] = useState(initPayerMode);
  const [singlePayer, setSinglePayer] = useState(
    existing?.paidBy || (existingPayers ? Object.keys(existingPayers)[0] : members[0]?.id || "")
  );
  const [payerAmounts, setPayerAmounts] = useState(
    () => Object.fromEntries(members.map((m) => [m.id, existingPayers?.[m.id] ? String(existingPayers[m.id]) : ""]))
  );
  const [multiPayerSelected, setMultiPayerSelected] = useState(
    () => new Set(existingPayers ? Object.keys(existingPayers) : [members[0]?.id || ""])
  );

  const [splitMode, setSplitMode] = useState(existing?.splitMode || "equal");
  const [participants, setParticipants] = useState(
    () => new Set(existing ? Object.keys(existing.shares) : members.map((m) => m.id))
  );
  const [exactAmounts, setExactAmounts] = useState(
    () => Object.fromEntries(members.map((m) => [m.id, existing?.splitMode === "exact" ? String(existing.shares[m.id] || "") : ""]))
  );
  const [percentages, setPercentages] = useState(
    () => Object.fromEntries(members.map((m) => [m.id, existing?.splitMode === "percent" ? String(Math.round(((existing.shares[m.id]||0) / existing.amount) * 100)) : ""]))
  );
  const [shareUnits, setShareUnits] = useState(
    () => Object.fromEntries(members.map((m) => [m.id, existing?.splitMode === "shares" ? String(existing.shares[m.id] || "") : "1"]))
  );
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [frequency, setFrequency] = useState("monthly");
  const [splitExpanded, setSplitExpanded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(!!(existing?.notes));
  const [err, setErr] = useState("");
  const [imageBase64, setImageBase64, handleImageChange] = useImageUpload(existing?.imageBase64 || null, setErr);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const numericAmount = parseFloat((amount || "").replace(",", "."));
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;

  // Total que han puesto los pagadores seleccionados en modo multi
  const multiPayerTotal = [...multiPayerSelected].reduce((s, id) => {
    const v = parseFloat((payerAmounts[id] || "0").replace(",", "."));
    return s + (isNaN(v) ? 0 : v);
  }, 0);

  const toggleMultiPayer = (id) => {
    setMultiPayerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  };

  const toggleParticipant = (id) => {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const participantIds = members.filter((m) => participants.has(m.id)).map((m) => m.id);
  const exactTotal = participantIds.reduce((s, id) => s + (parseFloat((exactAmounts[id] || "0").replace(",", ".")) || 0), 0);
  const percentTotal = participantIds.reduce((s, id) => s + (parseFloat(percentages[id] || "0") || 0), 0);

  // Construir objeto payers para guardar
  const buildPayers = () => {
    if (payerMode === "single") return { [singlePayer]: numericAmount };
    const result = {};
    [...multiPayerSelected].forEach((id) => {
      const v = parseFloat((payerAmounts[id] || "0").replace(",", "."));
      if (!isNaN(v) && v > 0) result[id] = v;
    });
    return result;
  };

  const buildShares = () => {
    if (splitMode === "equal") return computeShares({ splitMode: "equal", amount: numericAmount, participantIds });
    if (splitMode === "exact") {
      const exact = {};
      participantIds.forEach((id) => (exact[id] = parseFloat((exactAmounts[id] || "0").replace(",", ".")) || 0));
      return computeShares({ splitMode: "exact", amount: numericAmount, participantIds, exactAmounts: exact });
    }
    if (splitMode === "percent") {
      const pct = {};
      participantIds.forEach((id) => (pct[id] = parseFloat(percentages[id] || "0") || 0));
      return computeShares({ splitMode: "percent", amount: numericAmount, participantIds, percentages: pct });
    }
    const units = {};
    participantIds.forEach((id) => (units[id] = parseFloat(shareUnits[id] || "0") || 0));
    return computeShares({ splitMode: "shares", amount: numericAmount, participantIds, shareUnits: units });
  };

  const validate = () => {
    if (!description.trim()) return "Dale una descripción al gasto.";
    if (!validAmount) return "Ingresa un monto válido.";
    if (payerMode === "single" && !singlePayer) return "Indica quién pagó.";
    if (payerMode === "multi" && Math.abs(multiPayerTotal - numericAmount) > 0.01)
      return `Los pagadores suman ${money(multiPayerTotal, currency)}, pero el gasto es de ${money(numericAmount, currency)}.`;
    if (participantIds.length === 0) return "Selecciona al menos una persona en el reparto.";
    if (splitMode === "exact" && Math.abs(exactTotal - numericAmount) > 0.01)
      return `Los montos suman ${money(exactTotal, currency)}, pero el gasto es de ${money(numericAmount, currency)}.`;
    if (splitMode === "percent" && Math.abs(percentTotal - 100) > 0.5)
      return `Los porcentajes suman ${percentTotal.toFixed(0)}%, deben sumar 100%.`;
    return "";
  };

  const handleSave = async () => {
    const v = validate();
    if (v) return setErr(v);
    const dateMs = new Date(date + "T12:00:00").getTime();
    const payers = buildPayers();
    // paidBy legacy: el primer/único pagador (para mostrar en actividad)
    const paidBy = Object.keys(payers)[0];
    setSaving(true);

    if (makeRecurring && !existing) {
      await onSaveRecurring({
        id: uid(),
        description: description.trim(),
        amount: numericAmount,
        currency,
        category,
        notes: notes.trim(),
        paidBy,
        payers,
        splitMode,
        shares: buildShares(),
        frequency,
        nextDate: dateMs,
        paused: false,
        createdAt: Date.now(),
      });
      setSaving(false);
      return;
    }

    await onSave({
      id: existing?.id || uid(),
      description: description.trim(),
      amount: numericAmount,
      currency,
      category,
      notes: notes.trim(),
      date: dateMs,
      paidBy,
      payers,
      splitMode,
      shares: buildShares(),
      imageBase64: imageBase64 || null,
      createdAt: existing?.createdAt || Date.now(),
      recurringId: existing?.recurringId,
      deleted: false,
    });
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar
        title={existing ? "Editar gasto" : "Nuevo gasto"}
        onBack={onCancel}
        right={existing ? (
          <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(true)} aria-label="Borrar gasto"><Trash2 size={17} /></button>
        ) : (
          <button
            style={{ ...styles.btnPrimary, margin: 0, padding: "7px 14px", fontSize: 13, boxShadow: "none", borderRadius: 9, opacity: saving ? 0.6 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        )}
      />

      {confirmDelete && (
        <ConfirmInline
          message="¿Borrar este gasto?"
          confirmLabel="Borrar"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => onDelete(existing.id)}
        />
      )}

      <div style={styles.form}>
        <label style={styles.label}>
          Descripción
          <input style={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Cena, taxi, supermercado…" autoFocus={!existing} />
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <label style={{ ...styles.label, flex: 1 }}>
            Monto
            <input style={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <select
            style={{ ...styles.input, width: 80, flexShrink: 0, padding: "11px 6px", textAlign: "center", fontWeight: 600, color: "#544A3C" }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {currency !== baseCurrency && (
          <p style={{ ...styles.muted, padding: 0, marginTop: -8, display: "flex", alignItems: "center", gap: 5 }}>
            <AlertCircle size={13} /> Se convertirá a {baseCurrency} para los balances. Configura la tasa en "Editar grupo" si aún no la tiene.
          </p>
        )}

        {/* Fila: Fecha + Categoría + icono Foto + icono Nota — se pone después de dividido en */}

        <p style={styles.label}>¿Quién pagó?</p>
        <div style={styles.splitModeRow}>
          <button style={payerMode === "single" ? styles.tabActive : styles.tab} onClick={() => setPayerMode("single")}>Una persona</button>
          <button style={payerMode === "multi" ? styles.tabActive : styles.tab} onClick={() => setPayerMode("multi")}>Varias personas</button>
        </div>

        {payerMode === "single" && (
          <div style={styles.payerRow}>
            {members.map((m) => (
              <button key={m.id} onClick={() => setSinglePayer(m.id)} style={{ ...styles.payerChip, borderColor: singlePayer === m.id ? colorFor(m.id) : "transparent", background: singlePayer === m.id ? `${colorFor(m.id)}1a` : "#FAF7F2" }}>
                <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>
                {m.name}
              </button>
            ))}
          </div>
        )}

        {payerMode === "multi" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {members.map((m) => {
              const isIn = multiPayerSelected.has(m.id);
              return (
                <button key={m.id} onClick={() => toggleMultiPayer(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45, textAlign: "left" }}>
                  <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}), flexShrink: 0 }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                  <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                  <span style={{ flex: 1 }}>{m.name}</span>
                  <input
                    style={styles.customInput}
                    disabled={!isIn}
                    value={payerAmounts[m.id]}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPayerAmounts((p) => ({ ...p, [m.id]: e.target.value }))}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </button>
              );
            })}
            <p style={styles.muted}>
              Suma: {money(multiPayerTotal, currency)}{validAmount ? ` / ${money(numericAmount, currency)}` : ""}
              {validAmount && Math.abs(multiPayerTotal - numericAmount) < 0.01 ? " ✓" : ""}
            </p>
          </div>
        )}

        <div>
          {/* Fila colapsable de reparto */}
          <button
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "#FAF7F2", border: "1px solid #DDD2BE", borderRadius: splitExpanded ? "10px 10px 0 0" : 10, padding: "10px 14px", cursor: "pointer" }}
            onClick={() => setSplitExpanded(v => !v)}
          >
            <span style={{ fontSize: 13, fontFamily: "system-ui, sans-serif", color: "#6B6355" }}>Dividido en</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#544A3C" }}>
                {{ equal: "partes iguales", exact: "montos exactos", percent: "porcentajes", shares: "partes proporcionales" }[splitMode]}
              </span>
              {splitExpanded ? <ChevronUp size={15} color="#6B6355" /> : <ChevronDownIcon size={15} color="#6B6355" />}
            </div>
          </button>

          {splitExpanded && (
            <div style={{ border: "1px solid #DDD2BE", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px", display: "flex", flexDirection: "column", gap: 10, background: "#fff" }}>
              {/* Selector de modo */}
              <div style={styles.splitModeRow}>
                {[["equal", "Iguales"], ["exact", "Montos"], ["percent", "Porcentajes"], ["shares", "Partes"]].map(([id, label]) => (
                  <button key={id} style={splitMode === id ? styles.tabActive : styles.tab} onClick={() => setSplitMode(id)}>{label}</button>
                ))}
              </div>

              {splitMode === "equal" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(() => {
                    const preview = validAmount ? fairSplit(numericAmount, participantIds.map(() => 1)) : [];
                    return members.map((m) => {
                      const isIn = participants.has(m.id);
                      const previewIdx = participantIds.indexOf(m.id);
                      const myAmt = isIn && validAmount && previewIdx >= 0 ? preview[previewIdx] : null;
                      return (
                        <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45 }}>
                          <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                          <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
                          <span style={styles.shareAmount}>{myAmt !== null ? money(myAmt, currency) : "—"}</span>
                          <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}) }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        </button>
                      );
                    });
                  })()}
                </div>
              )}

              {splitMode === "exact" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {members.map((m) => {
                    const isIn = participants.has(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45, textAlign: "left" }}>
                        <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}), flexShrink: 0 }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                        <span style={{ flex: 1 }}>{m.name}</span>
                        <input style={styles.customInput} disabled={!isIn} value={exactAmounts[m.id]} onClick={(e) => e.stopPropagation()} onChange={(e) => setExactAmounts((p) => ({ ...p, [m.id]: e.target.value }))} placeholder="0.00" inputMode="decimal" />
                      </button>
                    );
                  })}
                  <p style={styles.muted}>Suma: {money(exactTotal, currency)} {validAmount ? `/ ${money(numericAmount, currency)}` : ""}</p>
                  {validAmount && (() => {
                    const remaining = numericAmount - exactTotal;
                    const isExact = Math.abs(remaining) < 0.01;
                    if (isExact) return null;
                    const isOver = remaining < -0.01;
                    return (
                      <p style={{ ...styles.muted, marginTop: -6, fontWeight: 700, color: isOver ? "#B0473A" : "#6B6355" }}>
                        Falta: {money(remaining, currency)}
                      </p>
                    );
                  })()}
                </div>
              )}

              {splitMode === "percent" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {members.map((m) => {
                    const isIn = participants.has(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45, textAlign: "left" }}>
                        <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}), flexShrink: 0 }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                        <span style={{ flex: 1 }}>{m.name}</span>
                        <input style={styles.customInput} disabled={!isIn} value={percentages[m.id]} onClick={(e) => e.stopPropagation()} onChange={(e) => setPercentages((p) => ({ ...p, [m.id]: e.target.value }))} placeholder="0" inputMode="decimal" />
                        <span style={{ fontSize: 13, color: "#6B6355" }} onClick={(e) => e.stopPropagation()}>%</span>
                      </button>
                    );
                  })}
                  <p style={styles.muted}>Suma: {percentTotal.toFixed(0)}% / 100%</p>
                </div>
              )}

              {splitMode === "shares" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {members.map((m) => {
                    const isIn = participants.has(m.id);
                    const totalUnits = participantIds.reduce((s, id) => s + (parseFloat(shareUnits[id] || "0") || 0), 0) || 1;
                    const myUnits = parseFloat(shareUnits[m.id] || "0") || 0;
                    return (
                      <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45, textAlign: "left" }}>
                        <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}), flexShrink: 0 }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                        <span style={{ flex: 1 }}>{m.name}</span>
                        <input style={{ ...styles.customInput, width: 50 }} disabled={!isIn} value={shareUnits[m.id]} onClick={(e) => e.stopPropagation()} onChange={(e) => setShareUnits((p) => ({ ...p, [m.id]: e.target.value }))} placeholder="1" inputMode="decimal" />
                        <span style={styles.shareAmount}>{isIn && validAmount ? money((numericAmount * myUnits) / totalUnits, currency) : ""}</span>
                      </button>
                    );
                  })}
                  <p style={styles.muted}>Las "partes" son proporciones — alguien con 2 partes paga el doble que alguien con 1.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fila: Fecha + Categoría + icono Foto + icono Nota */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label style={{ ...styles.label, flex: 1 }}>
            Fecha
            <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label style={{ ...styles.label, flex: 1 }}>
            Categoría
            <select style={{ ...styles.input, paddingRight: 10 }} value={category} onChange={(e) => setCategory(e.target.value)}>
              {groupCategories(group).map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label title="Añadir foto" style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${imageBase64 ? "#C75D3B" : "#DDD2BE"}`, background: imageBase64 ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: imageBase64 ? "#C75D3B" : "#6B6355" }}>
            <Camera size={18} />
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageChange} />
          </label>
          <button title="Añadir nota" onClick={() => setNotesOpen(v => !v)} style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${notesOpen || notes ? "#C75D3B" : "#DDD2BE"}`, background: notesOpen || notes ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: notesOpen || notes ? "#C75D3B" : "#6B6355" }}>
            <PenLine size={18} />
          </button>
        </div>

        {imageBase64 && (
          <div style={{ position: "relative" }}>
            <img src={imageBase64} alt="Adjunto del gasto" style={{ width: "100%", borderRadius: 12, maxHeight: 180, objectFit: "cover", border: "1px solid #ECE3D3" }} />
            <button onClick={() => setImageBase64(null)} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.5)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} aria-label="Quitar imagen">
              <X size={14} />
            </button>
          </div>
        )}

        {(notesOpen || notes) && (
          <textarea style={{ ...styles.input, minHeight: 60, resize: "vertical", fontFamily: "system-ui, sans-serif" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionales…" autoFocus={notesOpen && !notes} />
        )}

        {!existing && (
          <button style={styles.recurringToggle} onClick={() => setMakeRecurring((v) => !v)}>
            <span style={{ ...styles.checkbox, ...(makeRecurring ? styles.checkboxOn : {}) }}>{makeRecurring && <Check size={12} color="#fff" strokeWidth={3} />}</span>
            <Repeat size={15} /> Hacer este gasto recurrente
          </button>
        )}
        {makeRecurring && !existing && (
          <select style={styles.input} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="weekly">Cada semana</option>
            <option value="biweekly">Cada 2 semanas</option>
            <option value="monthly">Cada mes</option>
            <option value="yearly">Cada año</option>
          </select>
        )}

        {err && <p style={styles.errText}>{err}</p>}
        <button style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : existing ? "Guardar cambios" : makeRecurring ? "Crear gasto recurrente" : "Guardar gasto"}
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   SETTLE UP (registrar pago directo entre dos personas)
   ========================================================================= */

function SettleUp({ group, prefill, onCancel, onSave }) {
  const { members, baseCurrency } = group;
  const [from, setFrom] = useState(prefill?.from || members[0]?.id || "");
  const [to, setTo] = useState(prefill?.to || members[1]?.id || "");
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount.toFixed(2)) : "");
  const [currency, setCurrency] = useState(baseCurrency);
  const [date, setDate] = useState(todayInputValue());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const numericAmount = parseFloat((amount || "").replace(",", "."));
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;

  const handleSave = async () => {
    if (!from || !to) return setErr("Indica quién paga y quién recibe.");
    if (from === to) return setErr("Tienen que ser dos personas distintas.");
    if (!validAmount) return setErr("Ingresa un monto válido.");
    setSaving(true);
    await onSave({
      id: uid(),
      from, to,
      amount: numericAmount,
      currency,
      date: new Date(date + "T12:00:00").getTime(),
      note: note.trim(),
      createdAt: Date.now(),
      deleted: false,
    });
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Registrar un pago" onBack={onCancel} />
      <div style={styles.form}>
        <p style={{ ...styles.muted, padding: 0 }}>Esto no mueve dinero — solo anota que el pago ya se hizo fuera de la app, para saldar el balance.</p>

        <p style={styles.label}>¿Quién paga?</p>
        <div style={styles.payerRow}>
          {members.map((m) => (
            <button key={m.id} onClick={() => setFrom(m.id)} style={{ ...styles.payerChip, borderColor: from === m.id ? colorFor(m.id) : "transparent", background: from === m.id ? `${colorFor(m.id)}1a` : "#FAF7F2" }}>
              <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>{m.name}
            </button>
          ))}
        </div>

        <p style={styles.label}>¿Quién recibe?</p>
        <div style={styles.payerRow}>
          {members.filter((m) => m.id !== from).map((m) => (
            <button key={m.id} onClick={() => setTo(m.id)} style={{ ...styles.payerChip, borderColor: to === m.id ? colorFor(m.id) : "transparent", background: to === m.id ? `${colorFor(m.id)}1a` : "#FAF7F2" }}>
              <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>{m.name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...styles.label, flex: 1.4 }}>
            Monto
            <input style={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <label style={{ ...styles.label, flex: 1 }}>
            Moneda
            <select style={styles.input} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <label style={styles.label}>
          Fecha
          <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label style={styles.label}>
          Nota (opcional)
          <input style={styles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transferencia, efectivo…" />
        </label>

        {err && <p style={styles.errText}>{err}</p>}
        <button style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>{saving ? "Registrando…" : "Registrar pago"}</button>
      </div>
    </div>
  );
}

/* =========================================================================
   RECURRING LIST
   ========================================================================= */

function RecurringList({ group, onBack, onSave }) {
  const { recurring = [], members, baseCurrency } = group;
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "—";

  const togglePause = (id) => {
    onSave({ ...group, recurring: recurring.map((r) => (r.id === id ? { ...r, paused: !r.paused } : r)) });
  };
  const remove = (id) => {
    onSave({ ...group, recurring: recurring.filter((r) => r.id !== id) });
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Gastos recurrentes" onBack={onBack} />
      <div style={{ padding: "10px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {recurring.length === 0 && (
          <p style={styles.muted}>
            No tienes gastos recurrentes en este grupo. Puedes crear uno marcando "Hacer este gasto recurrente" al agregar un gasto nuevo.
          </p>
        )}
        {recurring.map((r) => {
          const cat = catInfo(r.category, group);
          return (
            <div key={r.id} style={{ ...styles.expenseCard, cursor: "default", opacity: r.paused ? 0.55 : 1 }}>
              <div style={{ ...styles.expenseIcon, background: colorFor(cat.id) }}><IconComp iconKey={cat.iconKey} size={16} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={styles.expenseTitle}>{r.description}</p>
                <p style={styles.expenseSub}>
                  {money(r.amount, r.currency)} · {nameOf(r.paidBy)} paga · {freqLabel(r.frequency)} · próximo: {fmtDate(r.nextDate)}
                  {r.paused ? " · pausado" : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={styles.iconBtnGhost} onClick={() => togglePause(r.id)} aria-label={r.paused ? "Reanudar" : "Pausar"}>
                  {r.paused ? <RefreshCw size={15} /> : <X size={15} />}
                </button>
                <button style={styles.iconBtnGhost} onClick={() => remove(r.id)} aria-label="Eliminar recurrente"><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   COMPARTIDOS
   ========================================================================= */

function TopBar({ title, onBack, right }) {
  return (
    <div style={styles.topBar}>
      <button style={styles.iconBtnGhost} onClick={onBack} aria-label="Volver"><ArrowLeft size={20} /></button>
      <h2 style={styles.topBarTitle}>{title}</h2>
      <div style={{ width: 36, display: "flex", justifyContent: "flex-end" }}>{right}</div>
    </div>
  );
}

// Regla de fricción para acciones destructivas (a propósito, dos niveles):
// 1) Confirmación de un clic (este componente): para acciones de alcance acotado
//    y que no borran historial compartido — borrar un gasto, quitar un miembro,
//    cerrar sesión, cancelar una invitación.
// 2) Escribir "Confirmar" a mano: reservado solo para borrar el grupo completo,
//    porque destruye el historial de TODOS los miembros sin posibilidad de deshacer.
function ConfirmInline({ message, confirmLabel = "Confirmar", onCancel, onConfirm, style }) {
  return (
    <div style={{ ...styles.confirmBox, ...style }}>
      <p style={{ margin: 0, fontSize: 14 }}>{message}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button style={styles.btnGhostSmall} onClick={onCancel}>Cancelar</button>
        <button style={styles.btnDangerSmall} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}

/* =========================================================================
   AUTH SCREEN
   ========================================================================= */

function AuthScreen({ onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr(""); setLoading(true);
    try {
      if (mode === "register" && password !== confirmPassword) {
        throw new Error("Las contraseñas no coinciden.");
      }
      if (mode === "login") {
        await onLogin(username, password);
      } else {
        await onRegister(username, password, displayName);
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
        <h1 style={{ ...styles.h1, textAlign: "center", marginBottom: 4 }}>SplitLedger</h1>
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
          <label style={styles.label}>
            Usuario
            <input style={styles.input} value={username} onChange={e => setUsername(e.target.value)} placeholder="nombre_de_usuario" autoCapitalize="none" autoFocus={mode === "login"} onKeyDown={e => e.key === "Enter" && handle()} />
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
          <button style={{ ...styles.btnPrimary, marginTop: 4 }} onClick={handle} disabled={loading}>
            {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
          <button
            style={{ background: "none", border: "none", fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: "#A8754A", cursor: "pointer", textAlign: "center", padding: "4px 0" }}
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); setConfirmPassword(""); }}
          >
            {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   INVITE SCREEN
   ========================================================================= */

function InviteScreen({ group, session, onBack, onSend, onCancelInvite }) {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [targetUsername, setTargetUsername] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);

  const pendingInvites = group.pendingInvites || {};
  const invitableMembers = group.members.filter(m => !m.linkedUserId);

  const handle = async () => {
    if (!selectedMemberId) return setErr("Selecciona a qué miembro corresponde esta persona.");
    if (!targetUsername.trim()) return setErr("Escribe el nombre de usuario a invitar.");
    if (targetUsername.trim().toLowerCase() === session.username) return setErr("No puedes invitarte a ti mismo.");
    setErr("");
    setSending(true);
    await onSend({ memberId: selectedMemberId, targetUsername: targetUsername.trim().toLowerCase() });
    setSelectedMemberId("");
    setTargetUsername("");
    setSending(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Invitar al grupo" onBack={onBack} />
      <div style={styles.form}>
        <p style={{ ...styles.muted, padding: 0 }}>
          Selecciona a qué miembro del grupo corresponde la persona que vas a invitar, y escribe su nombre de usuario en la app.
        </p>

        <p style={styles.label}>¿A qué miembro corresponde?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {invitableMembers.length === 0 && (
            <p style={styles.muted}>Todos los miembros ya tienen usuario vinculado.</p>
          )}
          {invitableMembers.map(m => {
            const pending = pendingInvites[m.id];
            const isSelected = selectedMemberId === m.id;
            return (
              <button key={m.id}
                onClick={() => !pending && setSelectedMemberId(m.id)}
                style={{ ...styles.shareRow, textAlign: "left", cursor: pending ? "default" : "pointer", borderColor: isSelected ? "#C75D3B" : pending ? "#CFE2D7" : "#ECE3D3", background: isSelected ? "#C75D3B0d" : pending ? "#EAF1ED" : "#fff" }}
              >
                <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block" }}>{m.name}</span>
                  {pending && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#3B6E62", fontFamily: "system-ui, sans-serif" }}>
                      <Send size={10} /> Invitación enviada a @{pending.username}
                    </span>
                  )}
                </div>
                <span style={{ width: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isSelected && <Check size={16} color="#C75D3B" />}
                  {pending && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setCancelingId(m.id);
                        await onCancelInvite(m.id);
                        setCancelingId(null);
                      }}
                      disabled={cancelingId === m.id}
                      style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: cancelingId === m.id ? "default" : "pointer", color: "#6B6355", opacity: cancelingId === m.id ? 0.6 : 1 }}
                      aria-label="Cancelar invitación"
                    >
                      {cancelingId === m.id
                        ? <RefreshCw size={14} className="spin" />
                        : <X size={14} />
                      }
                    </button>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <label style={styles.label}>
          Usuario a invitar
          <input style={styles.input} value={targetUsername} onChange={e => setTargetUsername(e.target.value)} placeholder="nombre_de_usuario" autoCapitalize="none" onKeyDown={e => e.key === "Enter" && handle()} />
        </label>

        {err && <p style={styles.errText}>{err}</p>}
        <button style={{ ...styles.btnPrimary, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: sending ? 0.6 : 1 }} onClick={handle} disabled={sending}>
          <Send size={15} /> {sending ? "Enviando…" : "Enviar invitación"}
        </button>
      </div>
    </div>
  );
}
/* =========================================================================
   PROFILE SCREEN
   ========================================================================= */

function ProfileScreen({ session, invites = [], onBack, onLogout, onAcceptInvite, onRejectInvite, onSave }) {
  const [displayName, setDisplayName] = useState(session.displayName || "");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoBase64, setPhotoBase64, handlePhoto] = useImageUpload(session.photoBase64 || null, setErr);

  const handleSave = async () => {
    setErr("");
    if (!displayName.trim()) return setErr("El nombre no puede estar vacío.");
    setSaving(true);
    try {
      await onSave({ displayName: displayName.trim(), newPassword: null, photoBase64 });
    } catch (e) { setErr(e?.message || "Error al guardar"); setSaving(false); }
  };

  const handleChangePassword = async () => {
    setErr("");
    if (!currentPassword) return setErr("Escribe tu contraseña actual.");
    if (!newPassword || newPassword.length < 4) return setErr("La nueva contraseña debe tener al menos 4 caracteres.");
    if (newPassword !== confirmPassword) return setErr("Las contraseñas no coinciden.");
    const index = await getUserIndex();
    const entry = index[session.username];
    if (entry?.passwordHash !== hashPassword(currentPassword)) return setErr("La contraseña actual es incorrecta.");
    setSaving(true);
    try {
      await onSave({ displayName: displayName.trim(), newPassword, photoBase64 });
    } catch (e) { setErr(e?.message || "Error al guardar"); setSaving(false); }
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Mi perfil" onBack={onBack} />
      <div style={styles.form}>

        {/* Foto de perfil */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 72, height: 72, minWidth: 72, borderRadius: "50%", overflow: "hidden", background: photoBase64 ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #DDD2BE" }}>
            {photoBase64
              ? <img src={photoBase64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <User size={28} color="#A89A87" />
            }
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ ...styles.btnDashed, cursor: "pointer", fontSize: 13 }}>
              <Camera size={14} /> {photoBase64 ? "Cambiar foto" : "Añadir foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
            </label>
            {photoBase64 && <button style={{ ...styles.btnGhostSmall, fontSize: 12 }} onClick={() => setPhotoBase64(null)}>Quitar foto</button>}
          </div>
        </div>

        <p style={{ ...styles.muted, padding: 0, fontSize: 12 }}>@{session.username}</p>

        <label style={styles.label}>
          Nombre visible
          <input style={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tu nombre" />
        </label>

        {err && !showPasswordForm && <p style={styles.errText}>{err}</p>}
        <button style={styles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>

        {/* Cambio de contraseña colapsable */}
        <button style={styles.collapsibleHeader} onClick={() => { setShowPasswordForm(v => !v); setErr(""); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}>
          <span style={styles.label}>Cambiar contraseña</span>
          {showPasswordForm ? <ChevronUp size={18} color="#6B6355" /> : <ChevronDownIcon size={18} color="#6B6355" />}
        </button>
        {showPasswordForm && (
          <div style={{ border: "1px solid #DDD2BE", borderRadius: "0 0 10px 10px", marginTop: -8, padding: 14, display: "flex", flexDirection: "column", gap: 12, background: "#fff" }}>
            <label style={styles.label}>
              Contraseña actual
              <input style={styles.input} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••" autoFocus />
            </label>
            <label style={styles.label}>
              Nueva contraseña
              <input style={styles.input} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••" />
            </label>
            <label style={styles.label}>
              Confirmar nueva contraseña
              <input style={styles.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••" />
            </label>
            {err && showPasswordForm && <p style={styles.errText}>{err}</p>}
            <button style={styles.btnPrimary} onClick={handleChangePassword} disabled={saving}>
              {saving ? "Guardando…" : "Actualizar contraseña"}
            </button>
          </div>
        )}

        {/* Invitaciones pendientes */}
        <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
          <p style={{ margin: 0, padding: "12px 16px 8px", fontSize: 13, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#544A3C", borderBottom: "1px solid #F0EBE2", display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={15} /> Invitaciones {invites.length === 0 ? "(ninguna)" : `(${invites.length})`}
          </p>
          {invites.length === 0 && <p style={{ ...styles.muted, padding: "10px 16px" }}>No tienes invitaciones pendientes.</p>}
          {invites.map((inv) => (
            <div key={inv.inviteId} style={{ padding: "10px 16px", borderBottom: "1px solid #F0EBE2", display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>
                <strong>{inv.fromUsername}</strong> te invitó a <strong>{inv.groupName}</strong> como <strong>{inv.memberName}</strong>
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={styles.btnGhostSmall} onClick={() => onRejectInvite(inv)}>Rechazar</button>
                <button style={{ ...styles.btnDangerSmall, background: "#3B6E62" }} onClick={() => onAcceptInvite(inv)}>Aceptar</button>
              </div>
            </div>
          ))}
        </div>

        {/* Cerrar sesión con confirmación */}
        {!showLogoutConfirm ? (
          <button style={{ ...styles.btnGhostSmall, color: "#B0473A", borderColor: "#EBC9BA", justifyContent: "center" }} onClick={() => setShowLogoutConfirm(true)}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        ) : (
          <ConfirmInline
            message="¿Cerrar sesión?"
            confirmLabel="Cerrar sesión"
            onCancel={() => setShowLogoutConfirm(false)}
            onConfirm={onLogout}
            style={{ margin: 0 }}
          />
        )}
      </div>
    </div>
  );
}
/* =========================================================================
   ESTILOS
   ========================================================================= */

const globalCss = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  input:focus, button:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: 2px solid #C75D3B;
    outline-offset: 2px;
  }
  button { font-family: inherit; cursor: pointer; }
  select { appearance: none; -webkit-appearance: none; background-image: none; }
  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
  }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }
`;

const styles = {
  app: {
    fontFamily: "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif",
    background: "#F7F2E9",
    minHeight: "100vh",
    color: "#2B2620",
    display: "flex",
    justifyContent: "center",
  },
  screen: {
    width: "100%",
    maxWidth: 480,
    minHeight: "100vh",
    background: "#FBF8F2",
    position: "relative",
    paddingBottom: 100,
    boxShadow: "0 0 0 1px #ECE3D3",
  },
  homeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "32px 20px 18px" },
  eyebrow: { margin: 0, fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#A8754A" },
  h1: { margin: "4px 0 0", fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em" },
  muted: { color: "#6B6355", fontSize: 14, padding: "0 20px", lineHeight: 1.5, fontFamily: "system-ui, sans-serif" },
  emptyState: { margin: "40px 20px", padding: "32px 20px", border: "1px dashed #D9CFC1", borderRadius: 14, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  emptyIcon: { width: 52, height: 52, borderRadius: "50%", background: "#F0E6D6", display: "flex", alignItems: "center", justifyContent: "center", color: "#C75D3B", marginBottom: 6 },
  emptyTitle: { fontWeight: 600, fontSize: 16, margin: "0 0 2px" },
  groupList: { listStyle: "none", margin: 0, padding: "4px 14px", display: "flex", flexDirection: "column", gap: 8 },
  groupCard: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "1px solid #ECE3D3", borderRadius: 14, padding: "14px 14px", textAlign: "left" },
  groupCardLeft: { display: "flex", alignItems: "center", gap: 14 },
  avatarStack: { display: "flex", alignItems: "center" },
  avatar: { width: 32, height: 32, minWidth: 32, borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, border: "2px solid #FBF8F2", fontFamily: "system-ui, sans-serif" },
  groupName: { margin: 0, fontWeight: 600, fontSize: 15.5 },
  groupMeta: { margin: "2px 0 0", fontSize: 12.5, color: "#6B6355", fontFamily: "system-ui, sans-serif" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 14px 8px", gap: 8 },
  topBarTitle: { margin: 0, fontSize: 18, fontWeight: 600, flex: 1, textAlign: "center" },
  iconBtnGhost: { width: 36, height: 36, borderRadius: "50%", border: "none", background: "transparent", color: "#544A3C", display: "flex", alignItems: "center", justifyContent: "center" },
  iconBtnPrimary: { width: 44, height: 44, borderRadius: "50%", border: "none", background: "#C75D3B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(199,93,59,0.3)" },
  form: { padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: 14 },
  label: { fontSize: 13, fontWeight: 600, color: "#544A3C", display: "flex", flexDirection: "column", gap: 6, fontFamily: "system-ui, sans-serif" },
  input: { fontFamily: "system-ui, sans-serif", fontSize: 15, padding: "11px 13px", borderRadius: 10, border: "1px solid #DDD2BE", background: "#fff", color: "#2B2620" },
  btnDashed: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 10, border: "1px dashed #C9BBA0", background: "transparent", color: "#8A7253", fontSize: 13.5, fontFamily: "system-ui, sans-serif", fontWeight: 600 },
  btnPrimary: { marginTop: 8, padding: "14px", borderRadius: 12, border: "none", background: "#C75D3B", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "system-ui, sans-serif", boxShadow: "0 6px 14px rgba(199,93,59,0.25)" },
  btnSecondary: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, margin: "4px 20px 0", padding: "12px", borderRadius: 12, border: "1px solid #DDD2BE", background: "#fff", color: "#544A3C", fontSize: 14, fontWeight: 600, fontFamily: "system-ui, sans-serif" },
  btnSecondarySmall: { width: 44, borderRadius: 10, border: "1px solid #DDD2BE", background: "#fff", color: "#544A3C", display: "flex", alignItems: "center", justifyContent: "center" },
  btnGhostSmall: { padding: "8px 14px", borderRadius: 8, border: "1px solid #DDD2BE", background: "#fff", fontSize: 13, fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", gap: 6, color: "#76695A" },
  btnDangerSmall: { padding: "8px 14px", borderRadius: 8, border: "none", background: "#B0473A", color: "#fff", fontSize: 13, fontFamily: "system-ui, sans-serif", fontWeight: 600 },
  confirmBox: { margin: "0 20px 12px", padding: 14, borderRadius: 12, background: "#FBEDE7", border: "1px solid #EBC9BA", fontFamily: "system-ui, sans-serif" },
  quickActions: { display: "flex", justifyContent: "space-between", padding: "4px 20px 8px", gap: 8 },
  quickActionBtn: { display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: "1px solid #ECE3D3", background: "#fff", fontSize: 12.5, fontFamily: "system-ui, sans-serif", fontWeight: 600, color: "#76695A" },
  avatarRow: { display: "flex", gap: 8, overflowX: "auto", padding: "10px 20px 4px" },
  memberChip: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 52 },
  memberChipName: { fontSize: 10.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tabRow: { display: "flex", gap: 6, padding: "12px 20px 4px" },
  tab: { flex: 1, padding: "9px 0", borderRadius: 9, border: "1px solid #ECE3D3", background: "#fff", color: "#6B6355", fontSize: 12.5, fontWeight: 600, fontFamily: "system-ui, sans-serif" },
  tabActive: { flex: 1, padding: "9px 0", borderRadius: 9, border: "1px solid #C75D3B", background: "#C75D3B", color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: "system-ui, sans-serif" },
  splitModeRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  settledBox: { margin: "10px 20px 0", padding: 16, borderRadius: 12, background: "#EAF1ED", border: "1px solid #CFE2D7", display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#3B6E62", fontFamily: "system-ui, sans-serif", fontWeight: 600 },
  debtCard: { margin: "0 20px", padding: "12px 14px", borderRadius: 12, background: "#fff", border: "1px solid #ECE3D3", display: "flex", alignItems: "center", gap: 8, fontFamily: "system-ui, sans-serif" },
  debtPerson: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  debtName: { fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  debtMiddle: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 70 },
  debtAmount: { fontSize: 14, fontWeight: 700, color: "#C75D3B" },
  settleSmallBtn: { padding: "6px 12px", borderRadius: 8, border: "1px solid #C75D3B", background: "transparent", color: "#C75D3B", fontSize: 12, fontWeight: 700, fontFamily: "system-ui, sans-serif", marginLeft: "auto" },
  simplifyNote: { margin: "4px 20px 0", fontSize: 12, color: "#A8967A", fontFamily: "system-ui, sans-serif", textAlign: "center" },
  dangerZone: {
    marginTop: 8,
    padding: "16px",
    borderRadius: 12,
    border: "1px solid #EBC9BA",
    background: "#FDF4F1",
  },
  dangerZoneTitle: {
    margin: "0 0 10px",
    fontSize: 11.5,
    fontWeight: 700,
    fontFamily: "system-ui, sans-serif",
    color: "#B0473A",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  btnDangerOutline: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 14px",
    borderRadius: 9,
    border: "1.5px solid #B0473A",
    background: "transparent",
    color: "#B0473A",
    fontSize: 13.5,
    fontWeight: 600,
    fontFamily: "system-ui, sans-serif",
    cursor: "pointer",
  },
  collapsibleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "transparent",
    border: "none",
    padding: "4px 0",
    width: "100%",
    cursor: "pointer",
  },
  monthSeparator: {
    margin: "6px 20px 0",
    paddingBottom: 4,
    borderBottom: "1px solid #E8DFD0",
    display: "flex",
    alignItems: "center",
  },
  monthSeparatorText: {
    fontSize: 11.5,
    fontWeight: 700,
    fontFamily: "system-ui, sans-serif",
    color: "#A8967A",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  pairRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "#fff", border: "1px solid #ECE3D3" },
  expenseCard: { margin: "0 20px", padding: "11px 12px", borderRadius: 12, background: "#fff", border: "1px solid #ECE3D3", display: "flex", alignItems: "center", gap: 12, fontFamily: "system-ui, sans-serif", textAlign: "left", width: "calc(100% - 40px)" },
  paymentCard: { margin: "0 20px", padding: "11px 12px", borderRadius: 12, background: "#F3EFE5", border: "1px dashed #D9CFC1", display: "flex", alignItems: "center", gap: 12, fontFamily: "system-ui, sans-serif" },
  expenseIcon: { width: 36, height: 36, minWidth: 36, borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" },
  expenseTitle: { margin: 0, fontSize: 14, fontWeight: 600, fontFamily: "'Iowan Old Style', Georgia, serif" },
  expenseSub: { margin: "2px 0 0", fontSize: 11.5, color: "#6B6355" },
  fab: { position: "fixed", bottom: 28, right: "max(20px, calc(50vw - 240px + 20px))", width: 56, height: 56, borderRadius: "50%", border: "none", background: "#C75D3B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(199,93,59,0.4)" },
  payerRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  payerChip: { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px 7px 7px", borderRadius: 20, border: "1.5px solid transparent", fontSize: 13, fontFamily: "system-ui, sans-serif", fontWeight: 600 },
  categoryGrid: { display: "flex", flexWrap: "wrap", gap: 6 },
  categoryChip: { display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 18, border: "1.5px solid transparent", fontSize: 12, fontFamily: "system-ui, sans-serif", fontWeight: 600, color: "#544A3C" },
  shareRow: { display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid #ECE3D3", background: "#fff", fontSize: 14, fontFamily: "system-ui, sans-serif", width: "100%" },
  shareAmount: { fontSize: 13, color: "#6B6355", fontWeight: 600 },
  checkbox: { width: 20, height: 20, minWidth: 20, borderRadius: 6, border: "1.5px solid #D9CFC1", display: "flex", alignItems: "center", justifyContent: "center" },
  checkboxOn: { background: "#C75D3B", borderColor: "#C75D3B" },
  customInput: { width: 80, fontFamily: "system-ui, sans-serif", fontSize: 14, padding: "7px 9px", borderRadius: 8, border: "1px solid #DDD2BE", textAlign: "right" },
  recurringToggle: { display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: "6px 0", fontSize: 13.5, fontWeight: 600, color: "#544A3C", fontFamily: "system-ui, sans-serif" },
  errText: { color: "#B0473A", fontSize: 13, fontFamily: "system-ui, sans-serif", margin: 0, background: "#FBEDE7", padding: "8px 12px", borderRadius: 8 },
  toast: { position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#2B2620", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontFamily: "system-ui, sans-serif", zIndex: 50, maxWidth: "90%", textAlign: "center" },
};
