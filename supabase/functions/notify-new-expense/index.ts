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

// Mismo formato que `money()` en src/lib/helpers.jsx (coma decimal,
// siempre 2 decimales) -- duplicado por el mismo motivo que `involves`.
// Usa el código de moneda (EUR) en vez del símbolo (€) para no tener que
// duplicar también la tabla CURRENCIES acá.
function formatMoney(amount: number, currency: string) {
  const formatted = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount));
  return `${amount < 0 ? "-" : ""}${formatted} ${currency}`;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const expense = payload.record;
    if (!expense || payload.type !== "INSERT") return new Response("ignored", { status: 200 });

    const [{ data: group }, { data: members }] = await Promise.all([
      supabase.from("groups").select("name").eq("id", expense.group_id).single(),
      supabase.from("group_members").select("id, name, linked_user_id").eq("group_id", expense.group_id),
    ]);

    const recipients = (members || []).filter((m) => m.linked_user_id && m.linked_user_id !== expense.created_by && involves(expense, m.id));
    if (!recipients.length) return new Response("no recipients", { status: 200 });

    const { data: subs } = await supabase.from("push_subscriptions").select("*").in("user_id", recipients.map((m) => m.linked_user_id));
    if (!subs?.length) return new Response("no subscriptions", { status: 200 });
    const subsByUser = new Map<string, typeof subs>();
    for (const sub of subs) subsByUser.set(sub.user_id, [...(subsByUser.get(sub.user_id) || []), sub]);

    const title = `Nuevo gasto en ${group?.name || "tu grupo"}`;
    // Con un solo pagador (el caso de todos los días) se nombra -- con
    // varios, se deja el monto solo, decir "Fulano y Mengano pagaron" no
    // suma claridad para una notificación tan corta.
    const payerIds = Object.keys(expense.payers || {});
    const singlePayerName = payerIds.length === 1 ? members?.find((m) => m.id === payerIds[0])?.name : null;

    const sends = recipients.flatMap((m) => {
      const mySubs = subsByUser.get(m.linked_user_id) || [];
      if (!mySubs.length) return [];
      // Mismo cálculo y misma redacción que `loanDiff`/`showLoanSummary` en
      // ExpenseDetail (EvenGroupTab.jsx): positivo = prestaste (pagaste de
      // más), negativo = te prestaron (pagaste de menos, otro cubrió tu
      // parte) -- así la notificación habla igual que el resto de la app.
      const myPaid = Number(expense.payers?.[m.id] || 0);
      const diff = myPaid - Number(expense.shares?.[m.id] || 0);
      // Si pagaste algo vos (sea el único pagador o uno de varios), siempre
      // se muestra tu propio monto -- es el dato más relevante para VOS,
      // sin importar si hay otros pagadores. Si no pagaste nada, se nombra
      // a quien sí pagó (si fue uno solo) o "Pago total" (si fueron
      // varios y ninguno sos vos). Pedido de Nicolas 2026-11-05.
      let body = myPaid > EPSILON
        ? `${expense.description || "Gasto"} · Pagaste ${formatMoney(myPaid, expense.currency)}`
        : singlePayerName
          ? `${expense.description || "Gasto"} · ${singlePayerName} pagó ${formatMoney(expense.amount, expense.currency)}`
          : `${expense.description || "Gasto"} · Pago total ${formatMoney(expense.amount, expense.currency)}`;
      if (Math.abs(diff) > EPSILON) body += ` · ${diff > 0 ? "Prestaste" : "Te prestaron"} ${formatMoney(Math.abs(diff), expense.currency)}`;
      const notifPayload = JSON.stringify({ title, body, url: "/evenly/" });
      return mySubs.map((sub) => ({ sub, notifPayload }));
    });

    await Promise.all(sends.map(async ({ sub, notifPayload }) => {
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
