// Edge Function de Supabase (Deno) -- dispara un Database Webhook (ver
// PENDIENTES/BITACORA) sobre INSERT en `expenses`. Manda un push a cada
// miembro del grupo que PARTICIPA en ese gasto puntual (no a todo el
// grupo a ciegas), salvo a quien lo creó. No corre con `npx vitest` (otro
// runtime, Deno) -- se verifica desplegándola y probando en vivo, ver el
// plan.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabase = createClient(supabaseUrl, serviceRoleKey);

const EPSILON = 0.005;

// Mismo criterio que `expenseInvolvesMe` en src/lib/evenGroupSync.js --
// duplicado a mano a propósito: vive en un runtime distinto (esta función
// corre en Deno, no se puede importar directo del bundle de la app), mismo
// criterio que ya usa el repo para duplicar lógica chica entre dos lugares
// en vez de forzar un import compartido.
function involves(expense: { shares?: Record<string, number>; payers?: Record<string, number> }, memberId: string) {
  const shareAmt = Number(expense.shares?.[memberId] || 0);
  const paidAmt = Number(expense.payers?.[memberId] || 0);
  return shareAmt > EPSILON || Math.abs(paidAmt - shareAmt) > EPSILON;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const expense = payload.record;
    if (!expense || payload.type !== "INSERT") return new Response("ignored", { status: 200 });

    const [{ data: group }, { data: members }] = await Promise.all([
      supabase.from("groups").select("name").eq("id", expense.group_id).single(),
      supabase.from("group_members").select("id, linked_user_id").eq("group_id", expense.group_id),
    ]);

    const recipientUserIds = (members || [])
      .filter((m) => m.linked_user_id && m.linked_user_id !== expense.created_by && involves(expense, m.id))
      .map((m) => m.linked_user_id);

    if (!recipientUserIds.length) return new Response("no recipients", { status: 200 });

    const { data: subs } = await supabase.from("push_subscriptions").select("*").in("user_id", recipientUserIds);
    if (!subs?.length) return new Response("no subscriptions", { status: 200 });

    const notifPayload = JSON.stringify({
      title: `Nuevo gasto en ${group?.name || "tu grupo"}`,
      body: `${expense.description || "Gasto"} · ${expense.amount} ${expense.currency}`,
      url: "/evenly/",
    });

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, notifPayload);
      } catch (err: any) {
        // 404/410 = el navegador/dispositivo ya no existe o revocó el
        // permiso -- se limpia sola, para no reintentar algo que nunca va a
        // funcionar ni acumular filas muertas en push_subscriptions.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push send failed", sub.id, err);
        }
      }
    }));

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
