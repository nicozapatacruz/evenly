# Tareas actuales

Snapshot de en qué estamos ahora mismo (no es un historial, actualizar o borrar
secciones a medida que se resuelven — para eso ya está `PENDIENTES.md`).

## 1. Rediseño de "Saldo Real" — reemplazar "Pendiente TC" (DISEÑO CERRADO)

**Objetivo:** poder ver "cuánto tengo de dinero en realidad" sin tener que
mantener a mano la transacción "Pendiente TC" (sumar manualmente, revisar el
banner cuando se borra un gasto, etc.).

**Ya resuelto, aparte de esto:** la plata ajena a tarjeta/EvenGroup
(99,42€) se movió a una cuenta nueva, "Otros", creada por Nicolas
re-apuntando 3 ingresos (no con una transferencia).

**Diseño final acordado** (varias vueltas de análisis, incluye 2 ideas
descartadas en el camino — ver más abajo):

- **"Cuenta de lo prestado"** (lo que VOS adelantás con la tarjeta) deja de
  ser Pendiente — pasa a ser **directo TC Santander ↔ pseudo-cuenta del
  grupo** (ej. Nottinghill). Esto hace que TC refleje siempre, solo, el
  monto real cobrado en la tarjeta (tu parte + lo adelantado), sin ningún
  paso manual.
- **"Cuenta de lo que me prestan"** (cuando otro paga por vos) **no
  cambia** — sigue siendo Pendiente ↔ pseudo-cuenta, igual que hoy.
- **Nueva pieza — compensación por ciclo de tarjeta:** como lo prestado ya
  no toca Pendiente, pagar la tarjeta completa (incluyendo lo adelantado)
  hace que Saldo se vea temporalmente "mal" hasta que el grupo te repone —
  eso es correcto y esperado (para eso existe Saldo Real, no hay forma de
  evitarlo sin mentir sobre la plata real que salió). Para que Saldo
  igual se vea "limpio" (mostrando solo tu gasto real), se agrega una
  transacción automática más: al cerrarse cada ciclo de facturación de la
  tarjeta (misma lógica de fechas que ya usa `computeCreditCardBalance`),
  se suma todo lo prestado en ese ciclo y se genera una transferencia de
  **[cuenta de origen configurable] → [cuenta ajena del link, ej. Saldo]**
  por ese total. Se recalcula solo si cambian los datos del ciclo (mismo
  motor de `reconcileLink`, no hace falta marcar nada a mano para evitar
  duplicados — la clave es el período, no la transacción individual).
  - El **destino** se reusa de un campo que ya existe (`cuenta ajena` /
    `default_other_account_id`) — esa cuenta ya representa "mi líquido de
    todos los días" para ese usuario, y es, por definición, de donde sale
    la plata al pagar la tarjeta.
  - El **origen** es un campo NUEVO e independiente (no reusar "cuenta de
    lo que me prestan" — no tiene relación lógica, fue un error de diseño
    a mitad de camino, corregido). Por defecto vacío/apagado: si no se
    configura, no se genera ninguna transacción. Nicolas lo configura en
    Pendiente porque es su preferencia, no porque haya una necesidad
    estructural.

**Ideas descartadas en el camino (para no repensarlas):**
- *"Lo que me prestan" también a Saldo en vez de Pendiente* — descartado:
  Saldo nunca iba a igualar el banco real igual (el grupo Santander tiene
  otras subcuentas), así que no aportaba nada y rompía la distinción
  Saldo vs Saldo Real.
- *Transacción oculta/tercera por cada préstamo individual, calculada en
  el momento del gasto* — descartado dos veces: (a) si compensa en el
  mismo instante que el préstamo (vía TC), matemáticamente da lo mismo que
  ir directo TC↔grupo, sin aportar nada; (b) si se genera ya mismo pero el
  destino es Saldo, infla Saldo todo el mes antes de que corresponda —
  por eso se decidió atarlo al CIERRE DE CICLO de la tarjeta, no al
  momento del préstamo.

**Fórmula de Saldo Real:** sin cambios — `Saldo + Pendiente + TC (deuda) +
pseudo-cuenta del grupo`. Verificado con los números reales de Nicolas:
220,75 + 501,27 + (−653,41) + (−265,12) = **−196,51** ✓. Lo que cambia es
solo qué alimenta cada cuenta de ahí en adelante — el 501,27 actual de
Pendiente queda congelado (no retroactivo) y debería bajar con el tiempo
a medida que se liquiden los préstamos viejos, quedando solo con lo suelto
(tipo "pizza entre amigos", fuera de cualquier grupo) que se siga llevando
a mano.

**Campos nuevos en la config de un vínculo EvenGroup↔EvenCapital** (hoy
son 2: propia/ajena — pasarían a ser hasta 5, pero con *progressive
disclosure*: los 2 de siempre quedan visibles como hoy; los 3 nuevos van
detrás de "Opciones avanzadas", y el campo de origen de compensación solo
se muestra si "cuenta de lo prestado" es una tarjeta de crédito):
1. Cuenta propia (sin cambios)
2. Cuenta ajena (sin cambios)
3. Cuenta de lo prestado (nuevo default sugerido: una tarjeta de crédito)
4. Cuenta de lo que me prestan (mismo campo de siempre, renombrado)
5. Cuenta de origen para la compensación (nuevo, opcional, vacío por
   defecto — solo visible si el campo 3 es tarjeta de crédito)

**Plan de implementación:**
1. ✅ Separar el campo único `loan_account_id` en dos (`lend_account_id`
   "lo prestado" / `loan_account_id` "lo que me prestan") en `sl_mm_links`
   + un 3er campo opcional `lend_offset_account_id` ("cuenta de origen
   para compensar") + UI de configuración del vínculo (2 campos esenciales
   visibles, 3 avanzados colapsados — el de compensación solo se muestra
   si la cuenta de lo prestado, o su fallback "propios", es tarjeta de
   crédito).
2. ✅ `evenGroupSync.js`: `ensureExpenseChoices` siembra la cuenta de
   préstamo correcta según dirección (lend vs owe) al crear cada choice —
   la transferencia de "lo prestado" termina siendo directa TC ↔
   pseudo-cuenta (ya no por Pendiente, salvo que no se configure nada, en
   cuyo caso sigue el fallback de siempre). "Lo que me prestan" sin
   cambios.
3. ✅ Espejado el mismo cambio en la función de Postgres
   `sync_split_category_to_other_members` (vive solo en la DB — tiene su
   propia copia de esta lógica para replicar la config hacia otros
   miembros del grupo, ej. Paulina).
4. ✅ Compensación por ciclo de tarjeta: `computeLendOffsetDesired` en
   `evenGroupSync.js`, agregada a `reconcileLink`. Por cada ciclo YA
   CERRADO de la tarjeta usada para prestar (misma lógica de corte que
   `creditCardCycleStart`, movida a `helpers.jsx` para evitar un ciclo de
   módulos con `evenCapitalData.js`), genera UNA transferencia desde
   "cuenta de origen" hacia "ajenos" por el total prestado en ese ciclo.
   Calculada por PERÍODO (clave = ciclo + moneda, no por transacción
   individual) — se autocorrige sola si cambian los gastos de un ciclo ya
   cerrado, sin poder duplicarse.
5. ⏳ Migración de lo existente: "Pendiente TC" (236,15€) se congela tal
   cual — de acá en adelante solo se usa a mano para lo suelto (pizza).
6. ⏳ Una vez probado un ciclo completo: vaciar `pendienteTcAutoSum` del
   bloque de Nico en `src/lib/customUserConfig.js` (el auto-sumado/banner
   ya no tiene nada que hacer para Nottinghill).
7. ⏳ Probar con un ciclo real completo (un préstamo nuevo, esperar al
   corte, confirmar que la transferencia de compensación se genera sola
   con el monto correcto) antes de confiar en esto para todos los meses.

**Probado por Nicolas:** un gasto de prueba (prestando vía TC) sincronizó
bien — su parte a TC, el préstamo directo TC→Nottinghill, Pendiente sin
tocarse. Al borrarlo, ambas transacciones se autocorrigieron solas. El
paso 4 (compensación por ciclo) todavía no se probó con un ciclo real
completo — hace falta esperar a que cierre uno para confirmarlo.

## 2. Edge case: pagás una parte de tu gasto pero igual debés (RESUELTO)

Qué pasaba cuando tu parte de un gasto compartido era mayor a lo que
pagaste (ej. tu parte = 10€, pagaste 6€, debés 4€): el gasto completo
(10€) caía siempre en "propia" apenas pagabas algo (`paidAmt > 0`), aunque
fuera menos que tu parte — con "cuenta de lo que te prestan" configurada
(ej. Pendiente), eso dejaba "propia" mostrando −10 en vez de los −6 que de
verdad saliste de ahí. Era un bug, no una decisión de diseño (el chequeo
binario `paidAmt > 0 ? propia : ajena` solo daba bien en los 2 extremos:
no pagaste nada, o pagaste todo y de más).

**Arreglado en `computeDesiredTransactions` (`evenGroupSync.js`):** tu
parte ahora se reparte en 2 gastos (misma categoría, distinta cuenta) SOLO
cuando de verdad pagaste algo pero menos que tu parte completa — el resto
sigue exactamente igual que siempre (un solo gasto, mismo key/role
"share", para no tocar nada de lo ya sincronizado que no sea este caso).

- **Lo que pagaste** (6€): gasto en "propia", como siempre.
- **Lo que quedó sin pagar** (4€): gasto NUEVO, en "ajena", misma
  categoría — la transferencia de préstamo (sin cambios) sigue viajando
  por separado, a "lo que te prestan" si está configurada.

Se confirmó con un query que hoy no existe ningún gasto de este tipo
(ni de Nicolas ni de Paulina), así que el cambio no tocó retroactivamente
nada ya sincronizado.

## 3. Rediseño de formularios (en curso, retomar)

Ver la entrada completa en `PENDIENTES.md`, sección A ("Rediseño de
formularios"). Progreso: `TransactionForm.jsx` y `PhotoImportEntryScreen.jsx`
ya rediseñados. **Siguiente: `PhotoImportWizardScreen.jsx`.**

## 4. Revisar la vista de una transacción que viene de EvenGroup

Hoy no queda claro, al abrir una transacción sincronizada desde EvenGroup
(`isSynced` en `TransactionForm.jsx`), qué campos son editables y cuáles no
— monto/cuenta/fecha/tipo quedan deshabilitados (los controla la
reconciliación) pero no hay ninguna señal visual clara de eso, y para
cambiarlos hay que saber que existe un botón "Original" que te lleva al
gasto real en EvenGroup. Repensar el diseño de esta pantalla para que sea
obvio de entrada qué se puede tocar ahí mismo y qué hay que ir a editar al
"Original".

## 5. Gastos futuros, todavía no cobrados en la cuenta

Poder cargar un gasto que ya sabés que va a pasar en una fecha futura (ej.
un viaje que te van a cobrar tal día) pero que todavía no impactó el saldo
real de la cuenta — para tenerlo anotado/planeado sin que hoy ya te reste
del balance como si ya hubiera pasado. Pensar cómo se distingue esto de un
gasto normal (¿un estado "pendiente de cobro" aparte, una fecha futura que
no cuenta para el saldo corriente hasta que llega, algo manual que vos
marcás como "ya se cobró"?) y cómo interactúa con lo demás (recurrentes,
estadísticas, Saldo Real).
