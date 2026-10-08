# Multi-moneda completo (Money Manager)

Plan vivo de esta feature — se actualiza a medida que se construye, igual
que `SPLIT_MONEY_LINK_PLAN.md`. Arrancado 2026-10-06.

## Contexto

Hasta ahora, TODA la app convertía cada transacción a una sola "moneda
principal" global (`mm_settings.main_currency`) y guardaba ese valor en
`mm_transactions.amount_main` — es lo único que se sumaba para calcular
saldos y totales en todos lados (Cuentas, Estadísticas, Buscador). El bug
de fondo (sección B de `PENDIENTES.md`): si cambiabas la moneda principal
en Ajustes, el historial viejo quedaba con su `amount_main` calculado
contra la moneda ANTERIOR — nadie lo recalculaba, así que las cuentas
quedaban mal.

Ya existía la columna `mm_accounts.currency` (agregada para destrabar el
Milestone 5 de Split Ledger, que terminó resolviéndose sin necesitarla) —
era pura etiqueta, editable, sin ningún efecto real. Decisión tomada con
Nicolas: en vez de parchar el bug (recalcular con una tasa aproximada,
impreciso para datos viejos), se resuelve de raíz dejando de convertir todo
a un solo número — cada cuenta tiene su propia moneda FIJA de verdad (no
solo una etiqueta), y los saldos se muestran por moneda en vez de
blendeados. "Moneda principal" en Ajustes pasa a ser solo la sugerencia por
defecto al crear una cuenta nueva.

**Por qué por fases**: el cambio toca ~8 pantallas (Cuentas, extracto de
cuenta, Estadísticas, Buscador, Transacciones, el formulario), 1 vista de
Postgres, y la lógica de pago automático de tarjetas. Nicolas eligió
encarar primero solo Cuentas (lo más visible), y dejar Estadísticas/
Buscador/Transacciones (que mezclan varias cuentas en un solo número — el
mismo problema, un nivel más arriba) para una segunda vuelta.

## Decisión central: restricción dura, no solo etiqueta

La moneda de una cuenta es una restricción real. Cada transacción que
entra a una cuenta queda SIEMPRE en la moneda de esa cuenta. Si se carga en
otra moneda (ej. pagaste en USD, la cuenta es EUR), hace falta una tasa de
cambio para convertirla — mismo mecanismo ya validado en Split Ledger
(campo de tasa, "1 USD equivale a...", cálculo vía `computeAmountMain`).

**Insight clave que simplificó todo**: `amount_main` ya era "el monto
convertido" — solo cambia DE QUÉ se convierte. Antes era "convertido a la
moneda principal global"; pasa a ser "convertido a la moneda de LA CUENTA
de esa transacción". Como, antes de este cambio, todas las cuentas de un
usuario ya compartían la misma moneda (todas nacieron con el default de
`main_currency`), **ningún dato viejo se corrompió** — el `amount_main` ya
guardado seguía siendo numéricamente correcto bajo la nueva interpretación,
no hizo falta recalcular nada retroactivamente. El cambio es forward-only.

**Transferencias entre cuentas de distinta moneda: no se soportan.**
Permitirlas de verdad (ej. transferir de una cuenta EUR a una cuenta USD)
necesitaría un segundo monto (`to_amount`) porque un solo
`amount`/`exchange_rate` no alcanza para representar las dos puntas con
precisión (comisiones, redondeo bancario real) — eso es un cambio de
schema aparte, no entró en esta fase. En su lugar: el selector de "cuenta
destino" de una transferencia se filtra para solo mostrar cuentas de la
MISMA moneda que la cuenta de origen.

**Tarjetas de crédito**: la cuenta de pago de una tarjeta tiene que ser de
la MISMA moneda que la tarjeta. Si alguien intenta cambiar la moneda de una
tarjeta (o de su cuenta de pago) mientras ya están vinculadas y quedarían
en monedas distintas, el guardado se bloquea con un error explicando que
hay que quitar la cuenta de pago primero.

**Hueco encontrado durante la implementación**: dejar la moneda de una
cuenta editable para siempre (como estaba antes, cuando era solo etiqueta)
reintroducía el mismo bug de fondo a nivel de cuenta — el `amount_main` ya
guardado quedaría calculado contra la moneda vieja. Se resolvió bloqueando
la edición de moneda en cuanto la cuenta ya tiene al menos un movimiento
(`AccountDetailScreen.jsx`, `hasTransactions`) — antes de eso, sigue
editable sin restricción.

**Decisión revisada (2026-10-06)**: convertir una cuenta con movimientos en
tarjeta de crédito (o viceversa) es técnicamente posible sin corromper
datos (es solo agrupación/visualización, `amount_main` no cambia de
significado), pero no tiene sentido real de negocio — una cuenta de
ahorros con historial no se "convierte" en una tarjeta de crédito. Se
bloqueó el toggle "Tarjeta de crédito" con el mismo criterio que la
moneda: una vez que la cuenta tiene algún movimiento, queda fijo (no se
puede pasar de cuenta normal a tarjeta ni de tarjeta a cuenta normal).
Antes de eso, sigue editable sin restricción. La validación de conflicto
con la cuenta de pago de otra tarjeta (`becomingCardConflict`) sigue
existiendo para el caso límite de una cuenta SIN movimientos propios que
ya es la cuenta de pago de otra tarjeta.

**Aclaración (2026-10-06)**: el bloqueo de movimientos de arriba no es solo
para cuentas normales, también aplica a tarjetas — `hasTransactions` no
distingue `is_credit_card`, y `mm_account_totals` ya cuenta los movimientos
de una cuenta sea origen o destino de una transferencia (confirmado al
construir el vínculo con Split Ledger, ver `SPLIT_MONEY_LINK_PLAN.md`,
sección M0). Una tarjeta que ya tuvo un gasto, o que solo recibió un pago,
queda con "Moneda" y "Tarjeta de crédito" bloqueados igual que cualquier
otra cuenta, sin que hiciera falta ningún cambio de código para esto.

Como consecuencia, el error de "cuenta de pago en otra moneda" (más
arriba) en la práctica solo se puede disparar durante el SETUP de una
tarjeta (sin movimientos todavía, moneda editable) — una vez que la
tarjeta tiene movimientos, su moneda ya quedó fija por el bloqueo, y el
selector de "Cuenta de pago" ya filtra solo cuentas de esa misma moneda,
así que normalmente nunca se llega a ese conflicto después del primer
movimiento. Queda igual como validación de respaldo, no se simplificó.

## Fase 1 — Cuentas (resuelta 2026-10-06)

- [x] **SQL**: `mm_category_month_totals` agrupa ahora también por la
  moneda de la cuenta (join con `mm_accounts`, columna `currency` agregada
  al final — Postgres no deja insertarla en el medio con `create or
  replace view`). Antes mezclaba `amount_main` de cuentas de monedas
  distintas como si fueran la misma — esto era necesario YA, no solo para
  la Fase 2, para no corromper Estadísticas en silencio apenas alguien
  tuviera 2 monedas.
- [x] **`TransactionForm.jsx`**: `needsRate` compara contra la moneda de la
  cuenta elegida (`accountCurrency`), no contra la principal global. Un
  `useEffect` sugiere la moneda de la cuenta recién elegida (hasta que el
  usuario toque el selector a mano). `computeAmountMain` usa
  `accountCurrency` como destino. Transferencias: el selector de "cuenta
  destino" se filtra por la misma moneda que la cuenta de origen, con
  error si de todos modos queda en conflicto (dato viejo).
- [x] **`AccountDetailScreen.jsx`**: selector de "Cuenta de pago" filtrado
  por la moneda de la tarjeta; error de guardado si quedarían en monedas
  distintas; moneda de la cuenta bloqueada una vez que tiene movimientos
  (ver hueco de arriba).
- [x] **`moneyManagerData.js`**: `runCreditCardAutoPay` usa
  `cardAccount.currency` en vez de la principal global (ya garantizado
  que coincide con la cuenta de pago). Se eliminó `groupBalance` (quedó
  sin uso, reemplazada por el cálculo por moneda en `CuentasTab.jsx`).
- [x] **`CuentasTab.jsx`**: capital/deuda/balance de arriba, subtotal de
  cada grupo de cuentas, y el subtotal de "Cuentas eliminadas" muestran una
  línea por moneda en vez de sumar todo junto (una sola línea si, como es
  lo normal, todas las cuentas comparten moneda).
- [x] **`AccountActivityScreen.jsx`**: ya estaba acotado a una sola cuenta
  → se le pasa un `settings` "pisado" con `main_currency = accountCurrency`
  a los 3 sub-tabs (Diario/Mensual/Anual) y a `TransactionDayGroups`, sin
  tocar la lógica interna de ninguno.
- [x] **Bug encontrado probando en vivo (2026-10-06)**: la línea "= X" que
  muestra el equivalente convertido en `TransactionDayGroups.jsx` comparaba
  contra la moneda principal GLOBAL (`settings.main_currency`) en vez de
  contra la moneda de la cuenta real de esa fila — mostraba conversiones
  falsas (ej. "100 COP = 100 EUR", sin ninguna tasa de por medio) o se
  saltaba conversiones reales que sí correspondía mostrar. No era un gap de
  alcance, era directamente información falsa — se corrigió ya en esta
  fase, no se dejó para la Fase 2.
- [x] **Bug de React StrictMode encontrado probando en vivo (2026-10-06)**:
  el `useEffect` que sugiere la moneda de la cuenta recién elegida usaba un
  `useRef(true)` como "flag de primera corrida" — StrictMode (en
  desarrollo) corre cada efecto dos veces a propósito, y esa guarda se
  consumía en la primera corrida, dejando pasar la segunda igual. Al
  reabrir una transacción ya guardada en una moneda distinta a la de su
  cuenta, esto pisaba la moneda original con la de la cuenta. Reemplazado
  por una comparación contra el último `accountId` realmente procesado
  (inmune a que el mismo efecto se dispare más de una vez con el mismo
  valor).
- [x] **Parche de continuidad hasta la Fase 2** (no es la Fase 2 completa,
  solo evita que se rompa mientras tanto — encontrado probando en vivo que
  hacía falta ANTES de llegar a diseñar la Fase 2 en serio, no solo en
  Estadísticas): `useCategoryMonthTotals`/`useCategoryTimeline`
  (Estadísticas), los totales de ingreso/gasto del día y del mes en
  `DiarioTab.jsx`/`TransactionDayGroups.jsx` (Transacciones), "Total del
  mes" en `CategoryDrillDownScreen.jsx`, y los totales de resultados en
  `SearchScreen.jsx` (Buscador) ahora solo suman cuentas de tu moneda
  principal — si tenés una sola moneda no cambia nada; si tenés más de una,
  la actividad en otra moneda no se incluye en estos totales hasta la Fase
  2 (en vez de aparecer mal sumada con un símbolo equivocado).
  `aggregateByCategory` (el camino que se usa solo cuando hay filtros
  activos en Estadísticas) **todavía no tiene este filtro** — gap
  conocido, chico, documentado en el código, para resolver junto con el
  resto de la Fase 2.
- [x] **Bug encontrado probando en vivo (2026-10-06), de paginación**:
  al convertir en vivo una cuenta con mucho historial ("Saldo", grupo
  Santander) en tarjeta de crédito, el "Saldo restante" mostrado no
  coincidía con el saldo real de la cuenta (€10.084,04 contra el
  €794,46 correcto). Se investigó con SQL contra los datos reales,
  replicando a mano el algoritmo de `computeCreditCardBalance` — dio el
  número correcto, confirmando que la fórmula en sí está bien. La causa
  real: Supabase/PostgREST limita cada consulta a 1000 filas por
  defecto, y tanto `useCreditCardActivity` (el preview de saldo en la
  pantalla de cuenta) como `runCreditCardAutoPay` (el pago automático de
  verdad) traían el historial completo de una cuenta/tarjeta con un
  `.select("*")` sin `.range()` ni `.order()` — en una cuenta con más de
  1000 movimientos, se descartaba una porción ARBITRARIA en silencio,
  sin ningún error. Se agregó `fetchAllRows(buildQuery)` en
  `moneyManagerData.js` (pagina con `.range()` de a 1000 filas,
  ordenando por `id`, hasta traer todo) y se aplicó en los dos lugares.
  El de `runCreditCardAutoPay` era el más serio de los dos: podía armar
  una transferencia automática real por un monto incorrecto. Por
  prevención, se aplicó el mismo `fetchAllRows` (ahora exportado desde
  `moneyManagerData.js`) en otros dos puntos con el mismo patrón, aunque
  de riesgo mucho menor en la práctica: `usePendingRateTransactions`
  (transacciones sincronizadas con tasa pendiente) y `loadLinkContext`
  en `splitLedgerSync.js` (el diff completo de `expenses`/`payments` de
  un grupo vinculado de Split Ledger).

## Fase 2 — Transacciones, Estadísticas, Buscador (resuelta 2026-10-08)

Reemplaza el parche de continuidad de arriba por un selector de moneda de
verdad en las 4 pantallas que lo necesitaban. La moneda elegida NO se
persiste — cada vez que se abre la pantalla arranca en la principal, mismo
criterio que el mes mostrado en estas mismas pantallas.

**Diseño revisado en el camino (2026-10-08)**: la primera versión era un
toggle de botones horizontal (uno por moneda) debajo del resumen de cada
pantalla — ocupaba una fila entera y, en Transacciones, hubiera sido un
5to ícono suelto en el header (Hoy/Filtros/Favoritos/Buscar/Moneda).
Nicolas pidió agrupar en vez de sumar íconos: **`HeaderMenu`** (nuevo
componente en `Shared.jsx`, reemplaza al `CurrencyToggle` original que se
borró) es un solo ícono con un popover (mismo click-afuera-cierra +
evento `"mm-picker-open"` que ya usa `PickerField`) que agrupa acciones
del header (`items`: Filtros, Favoritos) más una sección "Moneda" al
final (lista de monedas en uso, con check en la elegida) — en vez de un
engranaje (da a entender "config de la app") o los 3 puntitos (ya
significan "Config" en la barra de pestañas de abajo), reusa el ícono que
ya tenía "Filtros" (`SlidersHorizontal`) como disparador del grupo entero.
- [x] **`currenciesInUse(accounts, settings)`** — nuevo helper en
  `moneyManagerData.js`: monedas que de verdad tienen al menos una cuenta
  no borrada, principal primero, después "Otras monedas" en orden, y al
  final cualquier moneda en uso que no estuviera en ninguna de las dos.
- [x] **`DiarioTab.jsx`**: el ícono de Filtros + el de Favoritos ahora
  viven agrupados en un solo `HeaderMenu` (header bajó de 4 íconos propios
  a 2: el grupo + Buscar, más Hoy aparte), con la sección "Moneda" al
  final del popover. El resumen de ingreso/gasto del día/mes usa esa
  moneda; a `TransactionDayGroups` se le pasa `settings` "pisado" con ella
  (mismo truco que `AccountActivityScreen` en Fase 1) — cero cambios
  adicionales en ese archivo para el resumen.
- [x] **`EstadisticasTab.jsx`**: gana el prop `accounts` (no lo recibía).
  Mismo `HeaderMenu`, con un solo ítem (Filtros) + la sección Moneda.
  `useStatsCategoryTotals` pasa a recibir la moneda elegida + `accounts`.
  Al entrar a un drill-down, la moneda elegida viaja en el payload.
- [x] **`CategoryDrillDownScreen.jsx`**: no tiene Filtros/Favoritos para
  agrupar, así que acá `HeaderMenu` se usa solo (sin `items`) con el
  símbolo de la moneda elegida como disparador (ej. "€", sin código ni
  flechita — más compacto y consistente con cómo ya se muestran los
  montos en toda la app), en el TopBar. Arranca con la moneda que traía
  Estadísticas, pero es independiente (se puede cambiar acá sin afectar
  la pantalla de origen). "Total del mes" y `useCategoryTimeline` usan
  esa moneda; a `TransactionDayGroups` se le pasa `settings` pisado,
  igual que en Diario.
- [x] **`AccountActivityScreen.jsx` confirmado sin cambios**: siempre está
  acotado a una sola cuenta, que ya tiene moneda fija por Fase 1 — no hay
  nada entre qué elegir ahí, un selector no aplicaría.
- [x] **`CuentasTab.jsx`**: el resumen de arriba (Capital/A deber/Balance)
  ya no repite los 3 títulos por cada moneda — se muestran una sola vez,
  y cada moneda es una fila compacta de números (el símbolo de `money()`
  ya identifica de cuál es, sin texto "(EUR)"/"(COP)" extra). Decidido no
  convertirlo en selector como las demás pantallas: acá las monedas son
  saldos reales que existen a la vez, no "la misma data vista con otro
  lente" — tiene sentido seguir viéndolas todas juntas.
- [x] **Gap de `aggregateByCategory` resuelto**: ya filtra por la moneda
  de la cuenta de cada transacción (recibe `accounts`+`mainCurrency` como
  parámetros nuevos), mismo criterio que `useCategoryMonthTotals` del lado
  del servidor — antes blendeaba monedas distintas cuando había filtros
  activos en Estadísticas.
- [x] **`SearchScreen.jsx`**: el ícono de Filtros pasa a ser un `HeaderMenu`
  con un ítem (Filtros) + la sección Moneda; a `SearchResults` se le pasa
  `settings` pisado con la moneda elegida (mismo truco). No hizo falta
  tocar `searchTransactions` (la query al servidor) — el filtro sigue
  siendo client-side, como ya era.
- [x] **Bug encontrado armando esta fase, no relacionado al selector en
  sí**: `isRatePending` comparaba la moneda de una transacción contra
  `settings.main_currency` (la principal GLOBAL) en vez de contra la
  moneda de SU CUENTA — desde la Fase 1, `amount_main` se convierte a la
  moneda de la cuenta, no a una principal global, así que ese chequeo
  podía marcar como "pendiente de tasa" una transacción que no lo estaba
  (o al revés) en cuanto hubiera más de una cuenta en juego. Si no se
  arreglaba, además, el selector de moneda nuevo hacía que ese error
  cambiara según qué moneda estuvieras mirando. Corregido en
  `TransactionDayGroups.jsx` y `SearchScreen.jsx` (los 2 lugares que la
  usan) para que compare contra la moneda de la cuenta de cada fila.
- Transferencias entre monedas distintas (con `to_amount` propio) — sigue
  como idea futura si hace falta, no en el alcance actual (ver
  `PENDIENTES.md` sección C).

## Verificación (Fase 1)

Con `npm run dev`:
1. Crear una cuenta nueva en COP (o la que sea distinta a tu principal) →
   cargar una transacción ahí sin tocar el selector de moneda → se guarda
   directo en COP, sin pedir tasa.
2. En esa misma cuenta, cargar una transacción escribiendo un monto en otra
   moneda (ej. EUR) → pide la tasa, se guarda convertida a COP.
3. Cuentas: confirmar que esa cuenta en COP muestra su saldo en COP, que el
   grupo que la contiene (si tiene otras cuentas en otra moneda) muestra
   las dos líneas por separado, y que el total general de arriba también.
4. Crear una tarjeta de crédito y probar que el selector de "Cuenta de
   pago" solo deja elegir cuentas de su misma moneda.
5. Con una tarjeta ya con cuenta de pago asignada, intentar cambiarle la
   moneda a la tarjeta → debe bloquear el guardado con el mensaje de error.
6. Abrir una cuenta que ya tenga movimientos → el selector de moneda y el
   toggle "Tarjeta de crédito" deben estar bloqueados.
7. Confirmar (con un usuario de una sola moneda, el caso normal hoy) que
   nada visible cambió — mismos números que antes, en todos lados.

## Verificación (Fase 2)

Con `npm run dev`, usando al menos 2 cuentas en monedas distintas:

1. Con una sola moneda en uso: confirmar que no aparece ningún selector en
   Transacciones, Estadísticas, un drill-down ni Buscador, y los números
   no cambian (como antes de esta fase).
2. Transacciones: cambiar de moneda en el toggle cambia el resumen de
   ingreso/gasto del mes Y de cada día visible, sin tocar qué
   transacciones se listan.
3. Estadísticas: cambiar de moneda cambia la torta/lista de categorías;
   entrar a un drill-down arranca en esa misma moneda, y se puede cambiar
   ahí independientemente sin afectar Estadísticas.
4. Activar un filtro en Estadísticas (fuerza el camino de
   `aggregateByCategory`) y confirmar que los totales por categoría siguen
   respetando la moneda elegida.
5. Buscador: cambiar de moneda cambia el renglón de totales sin afectar
   qué resultados aparecen.
6. Con una transacción sincronizada de Split Ledger pendiente de tasa:
   confirmar que el aviso "Pendiente tasa de cambio" se sigue viendo igual
   sin importar qué moneda esté elegida en el selector (no depende de eso).
7. (Si es viable armar datos de prueba) con 6+ monedas en uso, confirmar
   el mecanismo de los 4 botones fijos + 5to con desplegable.
