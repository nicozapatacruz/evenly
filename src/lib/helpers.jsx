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

// Convierte lo que el usuario escribió en un input de monto a número.
// money() muestra los montos en formato es-ES (punto = miles, coma = decimal), así que si el
// texto trae una coma se asume ese formato y se limpian los puntos primero — si solo se
// reemplazara la coma por un punto ("1.234,56" -> "1.234.56"), parseFloat cortaría en el
// segundo punto y devolvería 1.234 en vez de 1234.56.
export const parseAmountInput = (raw) => {
  if (!raw) return NaN;
  let s = String(raw).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(s);
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

// Nombre de un miembro por id — compartido para que GroupView/ExpenseDetail/RecurringList
// no repitan la misma búsqueda cada uno con su propio texto de fallback.
export const nameOf = (members, id) => members.find((m) => m.id === id)?.name || "Alguien que ya no está";

// Un balance independiente por cada moneda que aparezca en el grupo — sin conversión entre
// ellas. Devuelve { [currency]: { [memberId]: balance } }. Evita a propósito el problema de
// tasas de cambio: si alguien debe COP y le deben EUR, son dos deudas separadas, no una neta.
export function computeBalances(group) {
  const { members, expenses = [], payments = [] } = group;
  const balances = {};

  const ledgerFor = (currency) => {
    if (!balances[currency]) {
      balances[currency] = {};
      members.forEach((m) => { balances[currency][m.id] = 0; });
    }
    return balances[currency];
  };

  expenses.forEach((e) => {
    if (e.deleted) return;
    const bal = ledgerFor(e.currency);
    // Retrocompatibilidad: paidBy (string) o payers (objeto {id: amount})
    const payers = e.payers || { [e.paidBy]: e.amount };
    Object.entries(payers).forEach(([payerId, paid]) => {
      bal[payerId] = (bal[payerId] || 0) + paid;
    });
    Object.entries(e.shares).forEach(([memberId, shareAmt]) => {
      bal[memberId] = (bal[memberId] || 0) - shareAmt;
    });
  });

  payments.forEach((p) => {
    if (p.deleted) return;
    const bal = ledgerFor(p.currency);
    bal[p.from] = (bal[p.from] || 0) + p.amount;
    bal[p.to] = (bal[p.to] || 0) - p.amount;
  });

  return balances;
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
  if (frequency === "weekly") { d.setDate(d.getDate() + 7); return d.getTime(); }
  if (frequency === "biweekly") { d.setDate(d.getDate() + 14); return d.getTime(); }
  if (frequency === "monthly" || frequency === "yearly") {
    // setMonth/setFullYear desbordan al mes siguiente cuando el día de anclaje (29-31) no
    // existe en el mes destino (ej. 31 de enero + 1 mes = 3 de marzo, no fin de febrero).
    // Se ancla al día 1 antes de sumar el mes/año, y se recorta al último día válido.
    const day = d.getDate();
    d.setDate(1);
    if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDayOfTargetMonth));
    return d.getTime();
  }
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
    const advanced = nextOccurrence(next, template.frequency);
    if (advanced <= next) break; // frecuencia desconocida / no avanza: cortar en vez de duplicar
    next = advanced;
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
