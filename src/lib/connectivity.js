import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";

// navigator.onLine + los eventos online/offline del browser no alcanzan
// solos — dan falso positivo con un portal cautivo o un wifi conectado sin
// internet real (y, confirmado a mano, tampoco con el "Offline" simulado de
// DevTools: navigator.onLine se queda en true igual). Se confirma con un
// probe liviano contra Supabase.
//
// OJO: supabase-js NO tira una excepción cuando falla la red (a diferencia
// de un fetch() crudo) — la convierte en un {error} normal, con status 0
// (eso SOLO pasa cuando el pedido nunca llegó al servidor; cualquier
// respuesta real del servidor, incluso un error, trae un status HTTP real).
// Un try/catch acá no detecta nada: hay que mirar status===0 a mano.
//
// El abort a 1.8s (no más) es a propósito: supabase-js reintenta solo las
// consultas GET hasta 3 veces con espera creciente (1s, 2s, 4s) antes de
// rendirse -- sin este corte, UN solo probe tarda hasta 7s en resolverse
// aunque la falla real (sin señal) se detecta al instante. 1.8s alcanza
// para una sola reintentada de cortesía sin sentirse colgado.
//
// Exportada además del hook: syncEngine.js la usa para chequear de nuevo
// justo antes de lanzar la cascada de sincronización -- así un `isOnline`
// del lado de React que todavía no se terminó de corregir (ej. en el primer
// render de AppShell, antes de que el efecto de useConnectivity corrija el
// estado inicial) no alcanza a disparar esa cascada completa sin red real.
const PROBE_TIMEOUT_MS = 1800;

export async function probeOnline() {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const { error, status } = await supabase
    .from("mm_settings")
    .select("user_id")
    .limit(1)
    .abortSignal(controller.signal);
  clearTimeout(timeout);
  return !error || status !== 0;
}

// Último resultado conocido, para que módulos que no son componentes React
// (ej. offlineSupabase.js) puedan consultarlo de forma síncrona sin repetir
// su propio probe en cada escritura — ver getIsOnline().
let lastKnownOnline = navigator.onLine;

export function getIsOnline() {
  return lastKnownOnline;
}

// No se solapan dos probes a la vez (si uno todavía está en curso, un nuevo
// pedido de chequeo no dispara otro -- espera al siguiente disparador).
let checking = false;

// Se repite al montar, en cada evento "online" del browser, y cada 25s
// mientras la pestaña está visible — esto último cubre una reconexión
// silenciosa que el evento "online" a veces no dispara.
export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(lastKnownOnline);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const online = await probeOnline();
        lastKnownOnline = online;
        if (!cancelled) setIsOnline(online);
      } finally {
        checking = false;
      }
    };
    check();
    const onOffline = () => {
      lastKnownOnline = false;
      if (!cancelled) setIsOnline(false);
    };
    const onOnline = () => check();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, 25000);
    return () => {
      cancelled = true;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}
