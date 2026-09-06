import React, { useState, useCallback } from "react";
import { supabase } from "./supabaseClient.js";
import {
  Receipt, UtensilsCrossed, Car, Home as HomeIcon, Plug, PartyPopper, ShoppingBag,
  Plane, HeartPulse, MoreHorizontal, Coffee, Pizza, Bus, Train, Bike, Fuel,
  Hotel, Building2, Wrench, Tv, Music, Gamepad2, BookOpen, Dumbbell, Scissors,
  Gift, Baby, PawPrint, Flower2, Sun, Umbrella, Briefcase, GraduationCap,
  Stethoscope, Pill, Wine, IceCream, ShoppingCart, Wallet, CreditCard,
  Banknote, Landmark, TreePine, Waves, Mountain, Camera, Utensils, Beer, HandCoins,
} from "lucide-react";

/* =========================================================================
   LÓGICA PURA (balances, monedas, reparto, recurrencia)
   ========================================================================= */

export const uid = () => Math.random().toString(36).slice(2, 10);

export const CURRENCIES = {
  EUR: { symbol: "€", label: "EUR" },
  USD: { symbol: "$", label: "USD" },
  COP: { symbol: "COL$", label: "COP" },
  GBP: { symbol: "£", label: "GBP" },
  MXN: { symbol: "MX$", label: "MXN" },
  ARS: { symbol: "AR$", label: "ARS" },
  CLP: { symbol: "CLP$", label: "CLP" },
  PEN: { symbol: "S/", label: "PEN" },
  BRL: { symbol: "R$", label: "BRL" },
};
export const CURRENCY_LIST = Object.keys(CURRENCIES);

export const money = (n, currency = "USD") => {
  const sym = CURRENCIES[currency]?.symbol || currency + " ";
  const fixed = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${n < 0 ? "-" : ""}${sym}${fixed}`;
};

// Mapa completo de íconos disponibles para categorías (string → componente)
export const ICON_MAP = {
  Receipt, UtensilsCrossed, Car, Home: HomeIcon, Plug, PartyPopper, ShoppingBag,
  Plane, HeartPulse, MoreHorizontal, Coffee, Pizza, Bus, Train, Bike, Fuel,
  Hotel, Building2, Wrench, Tv, Music, Gamepad2, BookOpen, Dumbbell, Scissors,
  Gift, Baby, PawPrint, Flower2, Sun, Umbrella, Briefcase, GraduationCap,
  Stethoscope, Pill, Wine, IceCream, ShoppingCart, Wallet, CreditCard,
  Banknote, Landmark, TreePine, Waves, Mountain, Camera, Utensils, Beer, HandCoins,
};
export const ICON_KEYS = Object.keys(ICON_MAP);

// Icono desde string key — con fallback
export const IconComp = ({ iconKey, size = 16, ...rest }) => {
  const C = ICON_MAP[iconKey] || Receipt;
  return <C size={size} {...rest} />;
};

// Categorías globales por defecto (usadas si el grupo no tiene las suyas)
export const DEFAULT_CATEGORIES = [
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
export const groupCategories = (group) => group?.categories?.length ? group.categories : DEFAULT_CATEGORIES;

// Busca info de una categoría por id dentro de un grupo
export const catInfo = (id, group) => {
  const cats = groupCategories(group);
  return cats.find((c) => c.id === id) || cats[0] || DEFAULT_CATEGORIES[0];
};

// Retrocompatibilidad: los gastos viejos pueden tener Icon (componente) en vez de iconKey
// catInfo devuelve siempre { id, label, iconKey } — usar <IconComp iconKey={...} />

const PALETTE = ["#C75D3B", "#3B6E62", "#9A7B4F", "#5A6B8C", "#A8516E", "#4F7942", "#7A5C99", "#B8753F"];
export const colorFor = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
export const shortName = (name) => {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
};

export const initials = (name) =>
  (name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

export function toBase(amount, currency, group) {
  if (!currency || currency === group.baseCurrency) return amount;
  const rate = group.rates?.[currency];
  if (!rate) return amount;
  return amount * rate;
}

export function computeBalances(group) {
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

export function simplifyDebts(balances) {
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
export function pairwiseBalance(group, memberId, otherId) {
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
export function distributeCents(totalCents, n) {
  const base = Math.floor(totalCents / n);
  const extra = totalCents - base * n; // cuántas personas reciben 1 centavo más
  return Array.from({ length: n }, (_, i) => (i < extra ? base + 1 : base));
}

// Convierte un monto float a centavos y de vuelta, distribuyendo sin perder ni ganar céntimos.
export function fairSplit(amount, ratios) {
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

export function computeShares({ splitMode, amount, participantIds, exactAmounts, percentages, shareUnits }) {
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

export function nextOccurrence(dateMs, frequency) {
  const d = new Date(dateMs);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}

export function generateDueRecurring(template, now = Date.now()) {
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
      payers: template.payers,
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

export function freqLabel(f) {
  return { weekly: "Cada semana", biweekly: "Cada 2 semanas", monthly: "Cada mes", yearly: "Cada año" }[f] || f;
}

export function fmtDate(ms) {
  return new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateShort(ms) {
  return new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}
export function todayInputValue() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
export function dateInputValue(ms) {
  const d = new Date(ms);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/* =========================================================================
   IMAGEN COMPARTIDA (evita duplicar handlePhoto en varias pantallas)
   ========================================================================= */

// Hook reutilizable para subir una imagen a base64 con límite de tamaño.
// onError recibe el mensaje de error a mostrar (cada pantalla decide dónde mostrarlo).
// La subida real a Supabase Storage se hace recién al guardar el formulario (no al elegir el
// archivo), para no dejar imágenes huérfanas en el bucket si el usuario cancela.
export function useImageUpload(initialUrl = null, onError) {
  const [previewUrl, setPreviewUrl] = useState(initialUrl);
  const [pendingFile, setPendingFile] = useState(null);
  const [removed, setRemoved] = useState(false);
  const handleImageChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4_000_000) { onError?.("La imagen no puede superar 4 MB."); return; }
    setPendingFile(file);
    setRemoved(false);
    setPreviewUrl(URL.createObjectURL(file));
  }, [onError]);
  const clear = useCallback(() => { setPendingFile(null); setPreviewUrl(null); setRemoved(true); }, []);
  return { previewUrl, pendingFile, removed, handleImageChange, clear };
}

// Sube el archivo pendiente (si hay uno) y devuelve la URL final a guardar en la tabla.
// currentUrl es la URL ya guardada (si el usuario no tocó la foto, se conserva tal cual).
export async function resolvePhotoUrl({ pendingFile, removed, currentUrl }) {
  if (pendingFile) {
    const path = `${crypto.randomUUID()}-${pendingFile.name}`;
    const { error } = await supabase.storage.from("evenly-images").upload(path, pendingFile);
    if (error) throw error;
    return supabase.storage.from("evenly-images").getPublicUrl(path).data.publicUrl;
  }
  if (removed) return null;
  return currentUrl ?? null;
}
