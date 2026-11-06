# Bitácora

Registro corto de lo que se fue haciendo/decidiendo, para no depender de que
la conversación con Claude se acuerde sola (si se resume la charla, se puede
perder detalle). No es la lista de pendientes — eso vive en `PENDIENTES.md`.
Acá solo entra lo YA hecho/decidido.

Reglas:
- Una entrada corta por cosa (fecha + qué + por qué, si no es obvio). El
  detalle técnico completo (el cómo) vive en los comentarios del código, no
  se duplica acá.
- Más reciente arriba de todo.
- No se borra nada — si algo se revierte o cambia de opinión, se anota una
  entrada nueva, no se edita la vieja.

---

## 2026-11-06

- Login ahora acepta usuario además de email (`EvenlyApp.jsx`, campo "Email o
  usuario"): si lo que se escribe no tiene `@`, se resuelve primero a su email
  vía la función nueva `get_email_for_username` (SQL, corre Nicolas a mano en
  Supabase) y después se loguea normal. El registro no cambia, sigue pidiendo
  email y usuario por separado.

## 2026-11-05

- Reconciliación con EvenCapital ahora corre al toque después de crear,
  editar o borrar un gasto/pago en EvenGroup (`reconcileNow` en
  `EvenGroupTab.jsx`, 7 puntos), en vez de esperar a la próxima
  sincronización completa (que solo corre al abrir la app o reconectarse).
  Encontrado por Nicolas: un gasto borrado en EvenGroup se seguía viendo un
  rato en EvenCapital hasta recargar todo.
- Workflow de deploy (`.github/workflows/deploy.yml`): faltaba pasar
  `VITE_VAPID_PUBLIC_KEY` al build (secret ya creado en GitHub, pero el
  workflow nunca lo leía) -- agregado al `env:` del paso `npm run build`.
- Versión de build en Config (pie de página chico): hash corto del commit +
  fecha/hora en GMT+1 fijo (`a89b88c 5/11/26, 14:32`), calculado solo al
  compilar (`vite.config.js`, `execSync("git rev-parse --short HEAD")` +
  `define`) -- para confirmar a simple vista que un deploy se aplicó de
  verdad, sin depender de bumpear un número de versión a mano.
- Armado el código para notificaciones push de EvenGroup (gasto nuevo):
  `src/sw.js` (Service Worker propio, `vite.config.js` pasa a
  `injectManifest`), `src/lib/pushNotifications.js`, toggle en
  `ConfigScreen.jsx`, `created_by` en el insert de `EvenGroupTab.jsx`, y la
  primera Edge Function del repo
  (`supabase/functions/notify-new-expense/index.ts`). Falta todo el setup
  manual (SQL, claves VAPID, deploy, Database Webhook) antes de que
  funcione de verdad -- ver pendiente nuevo en `PENDIENTES.md` con los
  pasos exactos.

## 2026-11-04

- Bug: en un gasto/pago de EvenGroup donde pagó otra persona (no vos),
  "Cuenta de lo prestado" se quedaba pegada en el default de "¿Quién pagó?"
  con el que se abrió el formulario, sin actualizarse al cambiar de
  pagador -- a diferencia de "Cuenta" (arriba), que sí reaccionaba. Faltaba
  el efecto que la siguiera (`ExpenseForm`/`SettleUp` en
  `EvenGroupTab.jsx`), y ahora respeta si la tocaste a mano (igual que
  "Cuenta"). Encontrado por Nicolas.

## 2026-11-03

- Toggle nuevo "Mostrar categoría de grupo en gastos" en Editar grupo
  (EvenGroupTab.jsx, dentro del vínculo con EvenCapital), por defecto true.
  Si se apaga, se esconde el campo "Categoría de {grupo}" en crear/editar
  gasto y se reemplaza por el logo de EvenCapital (`EvenGroupIcon`, en
  negro) en el listado de actividad y en el detalle del gasto. Solo existe
  si el grupo está vinculado a EvenCapital -- columna nueva
  `sl_mm_links.show_group_category` (default true, corre Nicolas a mano en
  Supabase).
- Toggle "Transacción futura" oculto para transacciones sincronizadas de
  EvenGroup (`isSynced` en `TransactionForm.jsx`) — esa función era solo
  para Money Manager; antes aparecía editable ahí igual, inconsistente con
  el resto del form (que sí se bloquea cuando `isSynced`). `reconcileLink`
  nunca seteaba `is_future`, así que no afecta datos existentes.
- Redondeo a centavos en `computeCreditCardBalance` (`evenCapitalData.js`),
  `computeAmountMain` (`evenCapitalData.js`), `amountMainFor`
  (`evenGroupSync.js`) y los 3 agregados de `localAggregates.js` — evita
  ruido de punto flotante (ej. `741.960000000001`) en el pago automático de
  tarjeta y en los saldos agregados. Confirmado por SQL que no quedó ninguna
  otra transacción con el mismo problema (aparte de la de este mes, que
  Nicolas corrigió a mano reabriéndola y guardándola de nuevo).
- Logging temporal de eventos de auth (tabla `client_auth_events` +
  `EvenlyApp.jsx`, marcado `DEBUG TEMPORAL`) para investigar logouts
  inesperados en el celular de Nicolas — en espera de que vuelva a pasar
  para revisar la secuencia completa. Candidatas descartadas hasta ahora:
  "Enforce single session per user" (off), doble pestaña Safari+PWA del
  mismo origen (descartado, localhost ≠ origen de la app real), Private
  Relay marcando la IP como sospechosa (sin forma de confirmarlo). La
  sesión de las 08:06-09:06 del 2026-11-03 mostró una sola cadena de
  refresh token viva toda la hora, revocada recién al momento del único
  refresh exitoso — los 3 fallos previos usaron un token que no pertenecía
  a esa cadena (probablemente una copia vieja en memoria de la app
  congelada en segundo plano por iOS).
