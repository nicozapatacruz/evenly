import { precacheAndRoute } from "workbox-precaching";

// Mismo precache de la app shell de siempre (antes lo generaba
// vite-plugin-pwa solo, ahora vive acá porque necesitamos agregar los
// listeners de abajo -- ver vite.config.js, injectManifest).
precacheAndRoute(self.__WB_MANIFEST);

// Notificaciones de EvenGroup (gasto nuevo). El payload lo arma
// notify-new-expense (supabase/functions/) -- { title, body, url }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Evenly", {
      body: data.body || "",
      icon: "/evenly/icon-192.png",
      badge: "/evenly/icon-192.png",
      data: { url: data.url || "/evenly/" },
    })
  );
});

// Sin deep-link al gasto puntual (la app no tiene routing por URL todavía)
// -- solo enfoca una pestaña ya abierta, o abre una nueva en la base de la
// app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/evenly/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes("/evenly/") && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
