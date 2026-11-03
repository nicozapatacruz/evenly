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

## 2026-11-03

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
