# Vincular Split Ledger con Money Manager

Plan vivo de esta feature — se actualiza a medida que se construye, igual que
`PENDIENTES.md`. Arrancado 2026-10-02.

## Contexto

Hoy Split Ledger (gastos compartidos) y Money Manager (finanzas personales) son
sistemas totalmente separados, a propósito. El problema: lo que pasa en un
grupo compartido (pagaste algo, te deben, le debés a alguien) no se refleja
para nada en tus cuentas reales — no hay forma de ver tu situación financiera
completa en un solo lugar.

La idea: por cada grupo de Split Ledger, cada miembro puede (si quiere)
vincularlo a una de sus propias cuentas de Money Manager. A partir de ahí,
cada gasto/pago del grupo genera automáticamente las transacciones
correspondientes en Money Manager — pero solo "lo mío" aparece en
Transacciones (nunca el monto total si no es todo tuyo), y lo que quedó
pendiente (prestaste o te prestaron) se refleja en una cuenta especial
"Split Ledger → [nombre del grupo]", creada sola, que funciona exactamente
como cualquier otra cuenta (mismo cálculo de saldo, nada especial).

## Decisión central: cómo sincroniza (y por qué)

Split Ledger es compartido entre varias personas; Money Manager es
estrictamente personal (cada fila de `mm_transactions` solo la puede escribir
su dueño, por RLS). Si otro miembro del grupo carga un gasto mientras vos no
estás usando la app, tu sesión no está ahí para crear tu transacción en ese
momento — nadie más puede escribirla por vos.

Por eso la sincronización es **del lado del cliente, en el momento en que vos
abrís la app** (no un trigger de base de datos — sería el primero en este
proyecto, que hasta ahora es 100% JS + RLS + un par de vistas). Cada vez que
tu `useMoneyManager` carga (o justo después de guardar algo en un grupo
vinculado), se corre una reconciliación: trae los gastos/pagos del grupo desde
que lo vinculaste, calcula qué transacciones DEBERÍAN existir para vos, las
compara con las que ya existen, y crea/actualiza/borra la diferencia.

Esto significa: tu vista se actualiza la próxima vez que abrís la app, no en
tiempo real si otra persona carga algo mientras estás con la app cerrada — es
un trade-off aceptable para finanzas personales, no un sistema en vivo.

**Por qué es una comparación COMPLETA cada vez (no "solo lo nuevo desde la
última vez"):** Split Ledger no tiene ninguna señal de "esto se editó" (no
existe una columna `updated_at` en `expenses`) y algunos borrados son físicos
(`DELETE`, no un simple marcador) — no queda rastro. La única forma confiable
de detectar ediciones y borrados es volver a calcular todo y comparar. Esto
resuelve de una el caso que preguntaste: **si alguien borra un gasto que vos
pagaste, la próxima vez que reconciliés, esa transacción (y la transferencia
de préstamo si la hubo) se bajan solas** porque ya no aparecen en lo que
"debería existir".

**Multi-pagador:** no hace falta ninguna lógica especial — `shares`/`payers`
en Split Ledger ya son mapas por persona (`{memberId: monto}`), así que para
vos siempre es simplemente "tu monto en `shares`" y "tu monto en `payers`",
sin importar cuántos otros pagaron o cómo se repartió.

## La regla (se aplica igual sin importar quién pagó)

Para cada gasto/pago de un grupo vinculado, mirando SOLO tu propia parte:

- **Tu parte real** (`shares[vos]`, si es > 0) → gasto normal en **tu cuenta**
  (ver "qué cuenta" más abajo — ya no es una sola cuenta fija por vínculo).
  Esto es lo único que aparece en Transacciones/Estadísticas/Buscador.
  Categoría: la que vos elijas (ver más abajo), o "Sin categoría" si nunca
  abriste ese gasto en particular.
- **Lo que pusiste de más** (`payers[vos] - shares[vos]`, si es positivo) →
  transferencia de esa misma cuenta → la cuenta del grupo, categoría oculta
  "Presté".
- **Lo que te prestaron** (si `shares[vos] > payers[vos]`, o en un pago donde
  recibís) → transferencia la cuenta del grupo → esa misma cuenta, categoría
  oculta "Me prestaron".

La dirección (Presté / Me prestaron / ninguna) **nunca se guarda** — se
recalcula en cada reconciliación comparando `shares[vos]` vs `payers[vos]` en
ese momento, igual que el monto. Lo único que sí queda fijo es la cuenta (ver
abajo).

Las transferencias Presté/Me-prestaron se ven en el extracto de tu cuenta Y
en el extracto de la cuenta del grupo, pero **nunca** en Transacciones,
Buscador ni Estadísticas.

**Qué cuenta — 2 defaults por vínculo, no 1.** Al vincular un grupo elegís 2
cuentas: una para **gastos propios** (los que cargás vos) y otra para
**gastos ajenos** (los que carga otro miembro). No es una restricción fija:
cada vez que abrís el formulario de un gasto de ese grupo (crearlo o
editarlo) — sea quien sea que lo haya cargado originalmente — ves un
selector con la cuenta a usar para TU parte, precargado con lo que ya exista
guardado para ese gasto puntual (o tu default si es la primera vez), y lo
podés cambiar ahí mismo. Mismo selector para la categoría.

Esa elección se fija para siempre en una tabla nueva, `sl_mm_expense_choices`
(un registro por vínculo+gasto, la primera vez que se sincroniza — por vos
abriendo el formulario, o por la reconciliación si nunca lo abriste). A
partir de ahí la reconciliación SIEMPRE lee esa fila, nunca vuelve a mirar
los 2 defaults para ese gasto — así cambiar tus defaults más tarde (ej.
empezás a usar otra tarjeta) solo afecta gastos nuevos, nunca mueve nada ya
sincronizado. "Nada retroactivo" se cumple sin necesitar desvincular/
revincular para cambiar de cuenta — los 2 defaults se editan en cualquier
momento desde "Editar grupo".

## Esquema nuevo (SQL — lo corrés vos a mano en el SQL Editor de Supabase)

- [x] **M0 — verificaciones.** Confirmado 2026-10-02: `mm_account_totals` y
  `mm_account_month_totals` ya cuentan las transferencias en las dos cuentas
  (origen y destino), y `mm_category_month_totals` filtra `type in (income,
  expense)`. **No hace falta tocar ninguna vista** — las transferencias
  Presté/Me-prestaron van a funcionar bien en los saldos y quedan afuera de
  Estadísticas solas.

**Tabla de vínculos** (uno por persona×grupo, no uno global por grupo —
varios miembros del mismo grupo pueden vincularlo cada uno a su propia
cuenta). `default_own_account_id`/`default_other_account_id` reemplazan lo
que originalmente iba a ser una sola `real_account_id` — ver la sección de
arriba ("Qué cuenta") para por qué son 2 y por qué se pueden editar en
cualquier momento sin romper nada retroactivo:
```sql
create table public.sl_mm_links (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users(id),
  group_id                 uuid not null references public.groups(id),
  member_id                uuid not null,              -- sin FK: group_members se borra físicamente a veces
  default_own_account_id   uuid not null references public.mm_accounts(id),
  default_other_account_id uuid not null references public.mm_accounts(id),
  pseudo_account_id        uuid not null references public.mm_accounts(id),
  fx_rates                 jsonb not null default '{}'::jsonb,
  linked_since             timestamptz not null default now(),
  active                   boolean not null default true,
  unlinked_at              timestamptz,
  created_at               timestamptz not null default now()
);
create unique index sl_mm_links_one_active on public.sl_mm_links (user_id, group_id) where active;
alter table public.sl_mm_links enable row level security;
create policy sl_mm_links_own on public.sl_mm_links for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```
Desvincular pone `active=false` (no borra nada). Volver a vincular crea un
registro nuevo y reutiliza la MISMA cuenta pseudo (el saldo pendiente no se
pierde).

**Tabla de elecciones por gasto** (cuenta + categoría elegidas para un gasto
puntual, fijas desde la primera sincronización — ver "Qué cuenta" arriba):
```sql
create table public.sl_mm_expense_choices (
  id          uuid primary key default gen_random_uuid(),
  link_id     uuid not null references public.sl_mm_links(id) on delete cascade,
  source_kind text not null check (source_kind in ('expense','payment')),
  source_id   uuid not null,
  account_id  uuid not null references public.mm_accounts(id),
  category_id uuid references public.mm_categories(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (link_id, source_kind, source_id)
);
alter table public.sl_mm_expense_choices enable row level security;
create policy sl_mm_expense_choices_own on public.sl_mm_expense_choices for all
  using (link_id in (select id from public.sl_mm_links where user_id = auth.uid()))
  with check (link_id in (select id from public.sl_mm_links where user_id = auth.uid()));
```

**Marcado de origen en `mm_transactions`:**
```sql
alter table public.mm_transactions
  add column sl_link_id     uuid references public.sl_mm_links(id),
  add column sl_source_kind text check (sl_source_kind in ('expense','payment')),
  add column sl_source_id   uuid,
  add column sl_role        text check (sl_role in ('share','loan')),
  add column sl_hidden      boolean generated always as (coalesce(sl_role = 'loan', false)) stored;

alter table public.mm_transactions add constraint mm_tx_sl_unique
  unique (sl_link_id, sl_source_kind, sl_source_id, sl_role);
create index mm_tx_sl_link_idx on public.mm_transactions (sl_link_id) where sl_link_id is not null;
```
`sl_hidden` es una columna calculada — nunca se escribe a mano, no se puede
desincronizar. Esto es lo que filtra Transacciones/Buscador (`sl_hidden =
false`), sin depender de la categoría (una categoría nula/borrada no sirve
como filtro confiable).

**Grupo de cuentas "Split Ledger" (auto-creado):**
```sql
alter table public.mm_account_groups add column system_key text;
create unique index mm_account_groups_system_key on public.mm_account_groups (user_id, system_key);
```
Se crea la primera vez que vinculás algo (`system_key = 'split_ledger'`), y
cada grupo vinculado tiene su propia cuenta adentro (`link.pseudo_account_id`).

**"Presté"/"Me prestaron" — NO como categorías reales.** Se calculan en el
cliente a partir de `sl_role='loan'` + la dirección de la transferencia. Si
fueran categorías de verdad, el formulario de transacción las borra apenas
alguien abre y guarda esa fila (las transferencias siempre fuerzan
`category_id: null`), y habría que esconderlas en 5 lugares distintos
(selector de categoría, Estadísticas, Buscador, etc.) para nada.

## Algoritmo de reconciliación

Vive en un archivo nuevo, `src/lib/splitLedgerSync.js`, con `reconcileSplitLedger(userId)`:

1. Trae tus vínculos activos (`sl_mm_links`).
2. Por cada uno: si el grupo ya no es visible, ya no sos miembro, o alguna
   cuenta involucrada fue borrada → **se congela ese vínculo, no se escribe
   nada** (mejor no tocar nada que borrar historial por error).
3. Trae los gastos/pagos del grupo desde `linked_since`.
4. Para cada uno, busca si ya existe una fila en `sl_mm_expense_choices` para
   (`link_id`, `source_kind`, `source_id`). Si no existe, la crea ahí mismo
   con `account_id = default_other_account_id` (nadie la tocó todavía) y sin
   categoría. Esa fila —exista desde antes o recién creada— es la que manda
   para la cuenta; el monto/dirección (gasto / Presté / Me prestaron) se
   recalcula siempre desde `shares`/`payers`, nunca desde la fila.
5. Con cuenta + monto + dirección ya resueltos, arma una clave estable
   (`origen + rol`) por transacción esperada.
6. Compara contra lo que ya existe (`mm_transactions` con ese `sl_link_id`):
   lo que falta se inserta, lo que cambió se actualiza, lo que ya no debería
   existir se marca `deleted: true`. Nunca se borra físicamente (si el gasto
   original vuelve a existir, la transacción revive en vez de duplicarse).

El formulario de gasto de Split Ledger (crear o editar, para cualquier
vínculo activo del usuario actual) hace un upsert directo sobre
`sl_mm_expense_choices` con la cuenta/categoría elegidas — eso es lo único
que le "avisa" a la reconciliación cuál usar de ahí en más para ese gasto
puntual.

Se corre: (a) dentro de `useMoneyManager`, apenas carga, antes del auto-pago
de tarjetas (puede haber transferencias que afecten el saldo de una tarjeta);
(b) justo después de guardar algo en un grupo vinculado, para que se vea al
toque en tu propia sesión.

Protegido contra `StrictMode` (que corre todo dos veces) y pestañas múltiples
con la restricción `unique` de la tabla — insertar dos veces lo mismo
simplemente no hace nada la segunda vez.

## Cambios de UI

- **Vincular grupo**: sección nueva en "Editar grupo" (Split Ledger) — toggle
  "Vincular grupo a Money Manager" + 2 selectores obligatorios (cuenta
  default para gastos propios / para gastos ajenos, tarjetas de crédito
  incluidas) + tasa de cambio si el grupo usa otra moneda. Es personal (no lo
  ven los demás miembros), pero se guarda con el mismo botón "Guardar" del
  formulario — no tiene un botón propio. Única excepción: desvincular queda
  inmediato, con su propia confirmación, apenas apagás el toggle. Los 2
  defaults se pueden editar en cualquier momento sin desvincular — no es
  retroactivo (ver "Qué cuenta" arriba).
- **Selector de cuenta + categoría inline**: en el formulario de gasto de
  Split Ledger, visible cada vez que el usuario actual (si tiene ese grupo
  vinculado) abre un gasto donde tiene parte — para crearlo o para editar
  uno existente, sin importar quién lo cargó originalmente.
- **Marcado visual**: en `TransactionDayGroups.jsx` (Transacciones,
  drill-downs, extracto de cuenta) y en `SearchScreen.jsx` (Buscador) — ícono
  de Split + nombre del grupo al lado del monto, fondo dorado clarito
  (`#FBF1E0`/texto `#A8754A` — un celeste probado primero no pegaba con la
  paleta cálida del resto de la app).
- **Proteger la cuenta "Split Ledger"**: no se puede borrar/renombrar a mano
  en Cuentas, ni elegir como cuenta normal al crear una transacción — se
  desvincula desde Split Ledger, no desde Cuentas.
- **Transacciones sincronizadas**: si abrís una para editarla, queda
  bloqueada en lo que la reconciliación controla (monto, cuenta, fecha, tipo)
  pero podés cambiarle la categoría o la nota libremente.

## Orden de construcción

1. - [x] **Esquema + vincular, sin sincronizar todavía.** Base resuelta
   2026-10-02 (`sl_mm_links` + columnas de marcado en `mm_transactions` +
   grupo "Split Ledger" auto-creado), después rediseñada el mismo día: 1 sola
   `real_account_id` por vínculo resultó demasiado restrictivo (no dejaba
   usar otra cuenta para un gasto puntual) → reemplazada por 2 defaults
   (`default_own_account_id`/`default_other_account_id`) + tabla nueva
   `sl_mm_expense_choices` que fija la cuenta real por gasto (ver "Qué
   cuenta" más arriba). `src/lib/splitLedgerLink.js`
   (`linkGroupToAccount`/`updateLinkDefaults`/`unlinkGroup`) + toggle "Mi
   Money Manager" en Editar grupo con los 2 selectores (con ⓘ explicando cada
   uno y validación de campo requerido) + protección del grupo/cuentas
   "Split Ledger" en Cuentas (incluida la navegación: su flecha lleva a
   "Editar grupo" de Split Ledger, no a una ficha de cuenta) y en el selector
   de cuentas de `TransactionForm`. Probado en vivo por Nicolas — vincular
   funciona.
2. - [x] **Sincronización real, misma moneda únicamente.** Implementado
   2026-10-02: `src/lib/splitLedgerSync.js` (`reconcileSplitLedger`, corrida
   dentro de `useMoneyManager.load()` antes del auto-pago de tarjetas, y de
   nuevo tras guardar/borrar un gasto o pago desde Split Ledger). Filtro
   `sl_hidden = false` agregado a Transacciones (`useMonthTransactions`,
   también usado por Estadísticas filtrada) y Buscador (`searchTransactions`)
   — el extracto de cuenta (`useAccountMonthTransactions`) queda sin este
   filtro a propósito, ahí sí se ven las transferencias de préstamo. Bloqueo
   de edición en `TransactionForm` (monto/cuenta/fecha/tipo deshabilitados,
   categoría/nota libres, sin borrar ni hacer recurrente) para toda
   transacción con `sl_link_id`. De paso, arreglado el hallazgo F7 del plan
   original: `computeCreditCardBalance` trataba cualquier transferencia
   entrante a una tarjeta como un pago real — ahora una transferencia de
   préstamo de Split Ledger se cuenta como un movimiento más del ciclo (se
   cancela contra el gasto compartido ya contado), no como un pago que
   bajaría el saldo a pagar sin que corresponda. Falta probar en vivo: cargar
   un gasto compartido 50/50 y confirmar que aparece 50% en Transacciones +
   la cuenta del grupo se mueve; borrarlo y confirmar que ambas transacciones
   desaparecen solas.
3. - [x] **Marcado visual** (ícono + nombre + fondo celeste). Implementado
   2026-10-03: en `TransactionDayGroups.jsx` (Transacciones, drill-down de
   categoría, extracto de cuenta) y `SearchScreen.jsx` (Buscador), toda fila
   con `sl_link_id` recibe fondo celeste clarito (`#EAF2F8`) y un chip con el
   ícono + nombre del grupo al lado del monto. El nombre/ícono sale de la
   cuenta pseudo del vínculo (`sl_mm_links.pseudo_account_id` → cuenta en
   `accounts`), no de `memo` — así no se rompe si el usuario edita la nota
   de esa transacción (memo queda libre, como ya estaba decidido).
4. - [x] **Selector de cuenta + categoría inline** al cargar un gasto.
   Implementado 2026-10-02, antes de lo planeado: una prueba en vivo del M2
   mostró que sin esto "gastos propios" nunca se usa (la reconciliación no
   tiene forma de saber quién cargó el gasto, siempre caía en "ajenos"). En
   `ExpenseForm` (Split Ledger): si el usuario actual tiene el grupo
   vinculado y tiene parte en este gasto (pagó algo o le toca una parte), se
   muestra "Mi Money Manager" con selector de cuenta (precargado con el
   default "propios", o con lo ya elegido antes si reabrís el mismo gasto) +
   categoría. Al guardar, se hace upsert con OVERWRITE (no
   `ignoreDuplicates`) en `sl_mm_expense_choices` — tu elección de ahora
   siempre gana, sin importar si la reconciliación ya había sembrado un
   default antes. Falta probar en vivo.
5. - [ ] **Multi-moneda** (tasa de cambio por vínculo). Bloqueado a propósito
   (2026-10-03): el chequeo "misma moneda" de M2 compara contra la moneda
   principal GLOBAL del usuario, pero lo correcto es compararlo contra la
   moneda de la cuenta elegida — y hoy las cuentas de Money Manager NO
   tienen una moneda fija propia (cada transacción trae la suya). Encararlo
   bien requiere primero resolver eso (ver PENDIENTES.md sección B, "cada
   cuenta con su propia moneda fija") — Nicolas prefiere terminar primero
   todo Split Ledger y volver a esto después.
6. - [x] Pulido. Implementado 2026-10-03:
   - **Aviso de saldo previo a vincular**: al prender el toggle para crear un
     vínculo nuevo (no al editar uno ya activo), si `computeBalances(group)`
     muestra algo pendiente para vos en cualquier moneda, se muestra un
     aviso ("Ya tenías un saldo pendiente... no se va a reflejar en Money
     Manager") en `SplitLedgerMoneyLink`.
   - **Autocompletado de notas ignora lo sincronizado**: `useRecentNoteTitles`
     agregó `.is("sl_link_id", null)` — las descripciones de gastos
     compartidos ya no aparecen como sugerencia de nota personal.
   - Quedó abierto a propósito ("etc.") por si aparece algo más chico en el
     camino — no hay nada más identificado todavía.

## Verificación

Con `npm run dev` (después de correr el SQL de cada paso):
1. Vincular un grupo de prueba a una cuenta → aparece "Split Ledger → [grupo]"
   en Cuentas con saldo 0.
2. Cargar un gasto pagado por vos, compartido 50/50 → tu cuenta real baja el
   100%, Transacciones muestra solo tu 50%, la cuenta del grupo sube +50%.
3. Borrar ese gasto desde Split Ledger → al reabrir Money Manager, ambas
   transacciones (tu gasto y el préstamo) se borran solas.
4. Cargar un gasto pagado por otro miembro, donde vos participás → no se
   mueve tu cuenta real, pero sí aparece en Transacciones (gasto normal) y la
   cuenta del grupo baja.
5. Saldar la deuda (settle up) → la cuenta del grupo vuelve a 0, tu cuenta
   real se mueve de verdad.
6. Confirmar que ninguna transferencia Presté/Me-prestaron aparece en
   Transacciones, Buscador ni Estadísticas, pero sí en los extractos de
   ambas cuentas.
