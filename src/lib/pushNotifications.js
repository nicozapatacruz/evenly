import { supabase } from "./supabaseClient.js";

/* =========================================================================
   NOTIFICACIONES PUSH DE EVENGROUP — gasto nuevo. Capa de datos: pedir el
   permiso del navegador, suscribirse/desuscribirse, y guardar/borrar la
   suscripción en `push_subscriptions`. El envío en sí (cuándo y a quién)
   vive del todo en supabase/functions/notify-new-expense -- acá solo se
   administra la suscripción de ESTE dispositivo.
   ========================================================================= */

// iOS solo soporta Web Push si la PWA está instalada a la pantalla de
// inicio (modo standalone) -- en una pestaña normal de Safari, la API
// existe pero `subscribe()` rechaza siempre. En desktop/Android no hay
// esta restricción. Sin este chequeo, el toggle fallaría en silencio (o
// con un error confuso) para cualquiera que todavía no instaló la app.
export function isPushSupported() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;
  if (isIos && !isStandalone) return false;
  return true;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function getCurrentSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

// Pide permiso, suscribe este dispositivo, y guarda la suscripción. Tira si
// el usuario rechaza el permiso o el navegador no soporta push -- quien
// llama (el toggle) decide cómo mostrar ese error.
export async function enablePush(userId) {
  if (!isPushSupported()) throw new Error("Este navegador no soporta notificaciones push.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permiso de notificaciones no concedido.");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
  });
  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: "user_id,endpoint" }
  );
  if (error) throw error;
  return subscription;
}

export async function disablePush(userId) {
  const subscription = await getCurrentSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
  if (error) throw error;
}
