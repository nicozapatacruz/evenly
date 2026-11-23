// Edge Function de Supabase (Deno) -- login unificado (correo o usuario).
// Antes, el cliente resolvía "usuario -> correo" llamando directo a una
// función SQL (`get_email_for_username`) con la clave anon, que va dentro
// del bundle público -- cualquiera con esa clave podía sacar el correo de
// cualquier usuario sabiendo su nombre de usuario. Ahora esa resolución pasa
// acá adentro con la service role (nunca sale del servidor), y lo único que
// vuelve al cliente es la sesión (tokens), nunca el correo. Se usa también
// para login por correo (no solo por usuario), para que el límite de
// intentos aplique parejo a los dos casos.
//
// No corre con `npx vitest` (otro runtime, Deno) -- se verifica
// desplegándola y probando en vivo, ver el plan.
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const serviceClient = createClient(supabaseUrl, serviceRoleKey);
const anonClient = createClient(supabaseUrl, anonKey);

const GENERIC = "GENERIC";
const CONFIRM_EMAIL = "CONFIRM_EMAIL";
const RATE_LIMITED = "RATE_LIMITED";

// 5 intentos fallidos en 15 minutos, por identificador Y por IP (el que se
// pase primero, bloquea). El identificador se cuenta tal cual se escribió,
// exista la cuenta o no -- así probar usuarios inventados se frena igual
// que probar uno real, y el bloqueo en sí no delata cuáles existen.
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function recordAttempt(identifier: string, ip: string, success: boolean) {
  await serviceClient.from("login_attempts").insert({ identifier, ip, success });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { identifier, password } = await req.json();
    if (!identifier || !password) return json({ ok: false, code: GENERIC }, 400);

    const normalized = String(identifier).trim().toLowerCase();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const [{ count: byIdentifier }, { count: byIp }] = await Promise.all([
      serviceClient.from("login_attempts").select("*", { count: "exact", head: true }).eq("identifier", normalized).eq("success", false).gte("created_at", since),
      serviceClient.from("login_attempts").select("*", { count: "exact", head: true }).eq("ip", ip).eq("success", false).gte("created_at", since),
    ]);
    if ((byIdentifier || 0) >= MAX_ATTEMPTS || (byIp || 0) >= MAX_ATTEMPTS) {
      return json({ ok: false, code: RATE_LIMITED }, 429);
    }

    // Si no tiene @, se asume usuario -- se resuelve a su correo acá adentro
    // (service role, se salta RLS) y nunca viaja de vuelta al cliente.
    let email = normalized;
    if (!normalized.includes("@")) {
      const { data: resolvedEmail } = await serviceClient.rpc("get_email_for_username", { p_username: normalized });
      if (!resolvedEmail) {
        await recordAttempt(normalized, ip, false);
        return json({ ok: false, code: GENERIC }, 401);
      }
      email = resolvedEmail;
    }

    const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      await recordAttempt(normalized, ip, false);
      // GoTrue solo devuelve "email not confirmed" después de validar la
      // contraseña -- si la contraseña estuviera mal, devuelve "Invalid
      // login credentials" en cambio. Así que avisar esto acá nunca delata
      // una cuenta por una contraseña incorrecta, solo confirma algo que el
      // que escribe ya probó saber (la contraseña correcta).
      if (/email.*not.*confirmed|confirm.*email/i.test(error?.message || "")) {
        return json({ ok: false, code: CONFIRM_EMAIL }, 401);
      }
      return json({ ok: false, code: GENERIC }, 401);
    }

    await recordAttempt(normalized, ip, true);
    return json({ ok: true, access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (err) {
    console.error(err);
    return json({ ok: false, code: GENERIC }, 500);
  }
});
