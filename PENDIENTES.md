# Pendientes de Money Manager

Lista viva de pendientes del proyecto. Reglas:

- Cuando se agregue algo nuevo (bug encontrado, feature pedida, decisión diferida), se suma acá.
- Cuando se resuelve algo, **no se borra**: se tacha (`~~texto~~`) y se le agrega la fecha de cuándo quedó resuelto.
- No depende de la memoria de Claude — este archivo es la fuente de verdad, vive en el repo.

---

## A. Cambios de diseño (no son "menos funciones", son decisiones distintas a propósito)

- [ ] Transferencias modeladas como una sola fila (`account_id` + `to_account_id`) en vez de las 2 filas espejo que usa internamente la app original.
- [ ] Esquema relacional (Postgres/UUIDs) en vez del modelo Core Data/SQLite original.
- [ ] Colores del toggle Ingreso/Gasto/Transferencia adaptados a la paleta de Evenly, no los colores literales originales.
- [ ] Torta de Estadísticas con la paleta categórica validada (máx. 8 colores + gris para "el resto"), no los colores literales de la original.

## B. Decisiones diferidas a propósito

No tocar salvo que Nicolas las traiga de vuelta explícitamente.

- [ ] Cambiar la moneda principal en Ajustes rompe el historial viejo (`amount_main` no se recalcula). Sigue sin resolver. Lo único construido hasta ahora (2026-10-05): la columna `currency` en `mm_accounts` (versión acotada, editable en cualquier momento — es una etiqueta, no dispara ninguna conversión), pensada en su momento para destrabar el Milestone 5 de Split Ledger. Resultó innecesaria para eso: el M5 se resolvió por otro lado (ver `SPLIT_MONEY_LINK_PLAN.md`), así que esta columna hoy no la usa nada — queda ahí como groundwork para el día que se encare la versión completa (sección C).
- [ ] Permitir transacciones con importe 0, para usarlas como nota/recordatorio de algo que falta cargar (ej. "falta anotar el gasto de X") sin que sea un movimiento de dinero real. Nicolas lo usaba así en la app anterior, a principio de mes, para marcar pendientes. Duda sin resolver: ensucia los listados/conteo de transacciones si se modela como una transacción de verdad — capaz lo correcto es una funcionalidad de notas/recordatorios separada, no relajar la validación de monto. Sin urgencia, revisar si se repite el caso de uso.
- [x] ~~Unificar categorías de Money Manager con las de Split Ledger (hoy son sistemas totalmente separados).~~ Resuelto de hecho 2026-10-03, no como "unificación" literal: al construir el vínculo Split↔Money (ver `SPLIT_MONEY_LINK_PLAN.md`), cada gasto compartido terminó con sus DOS categorías visibles por separado cuando corresponde — "Categoría personal" (Money, privada) y "Categoría de {grupo}" (Split, la ve todo el grupo) — en vez de fusionar ambos sistemas en uno. Se deja marcado como resuelto porque responde la pregunta original (si debían unificarse) con un "no, pero conviven mostrándose juntas".

## C. Posibles mejoras a futuro (sin compromiso de construirlas — ideas, no backlog)

- [ ] Subcategorías (jerarquía padre/hijo en Categorías). Sacado del backlog activo 2026-09-30 por no ser útil hoy.
- [ ] Fotos adjuntas a transacciones. Sacado del backlog activo 2026-09-30 — sin señal de uso real, pero barato de agregar después.
- [ ] Extender el autocompletado de notas (E) a Split Ledger — hoy solo vive en Money Manager. Decisión 2026-10-01: Nicolas pidió explícitamente no agregarlo ahora, pero dejarlo anotado como idea.
- [ ] Campo "Comisión" (fee) en transferencias: existe en la base (`mm_transactions.fee_amount`) pero no está expuesto en el formulario. Sacado del backlog activo 2026-10-01 — dudas sin resolver sobre si afecta el saldo origen o destino, y si siempre es en la misma moneda que el monto transferido. Alternativa más simple que ya cubre el caso real: cargar la comisión como un gasto aparte (categorizado) en vez de un campo dentro de la transferencia — así sí aparece en Estadísticas por categoría. Queda como idea, estudiar primero qué tan útil sería de verdad antes de retomarla.
- [ ] Intereses en tarjetas de crédito: modelar de alguna forma el interés que cobra una tarjeta sobre el saldo no pagado (hoy el sistema de pago automático/catch-up no contempla intereses, solo el monto adeudado).
- [ ] Multi-moneda completo: cada cuenta con su propia moneda fija (ver B), pero además los balances de Cuentas/Estadísticas/Buscador muestran un total POR MONEDA en vez de convertir todo a la principal (ej. "3.000 EUR + 2.000 USD" en vez de un solo número). La "moneda principal" pasaría a ser solo el default sugerido al crear una cuenta nueva. Nicolas plantea ir más allá incluso: poder cambiar de "perfil" (ej. perfil EUR / perfil COP) como si fueran 2 vistas separadas de la misma cuenta, relacionadas entre sí, sin que la UI se complique demasiado — sin diseñar todavía, es la idea más grande detrás de esto. Separado 2026-10-05 de la versión acotada (B) para no bloquear el destrabe de Split Ledger con una decisión de este tamaño.
- [ ] Modo offline: poder ver transacciones ya cargadas y seguir usando la app sin señal (ej. viajando). Nicolas entiende que sincronizar con la base igual requiere conexión, pero plantea que la data se guarde localmente y las transacciones nuevas/ediciones queden en una cola que se sube sola apenas vuelve la señal. Agregado 2026-10-05, sin diseño todavía (requeriría algo tipo IndexedDB/service worker + resolución de conflictos si hubo cambios en paralelo desde otro dispositivo).

## D. Descartados (se evaluaron y se decidió no construirlos)

- [ ] Sub-vistas Calendario/Mensual/Resumen/Descripción en el tab Transacciones (solo queda "Diario"). Descartado 2026-09-30.
- [ ] Presupuestos (Budgets) y Tags. Descartado 2026-09-30 — la data real de Nicolas casi no los usaba.
- [ ] Sub-tabs "Presupuesto" y "Nota" en Estadísticas. Descartado 2026-09-30 — el caso de uso real lo cubre el Buscador de gastos (E).

## E. Funcionales — features que faltan construir

- [x] ~~Buscador de gastos: pantalla de búsqueda por texto/nota, con filtros de fecha, categoría y cuenta. Cubre también el caso de "¿cuántas veces fui a Mercadona?" buscando por nota, sin necesidad de una sub-vista nueva en Estadísticas (ver decisión G-6 más abajo).~~ Resuelto 2026-10-01: ícono de lupa en el header de Transacciones abre `SearchScreen` — busca en título+memo sobre todo el historial (filtros server-side, `searchTransactions` en `moneyManagerData.js`), con autocompletado de notas reutilizado, filtros de importe/fecha/cuenta/categoría (`MultiPickerField`, nuevo componente de selección múltiple), totales + contador de resultados, y una fila propia por transacción (fecha dd/mm/yyyy + categoría a la izquierda, nota/cuenta al centro, monto a la derecha) en vez de reusar el agrupado-por-día de Diario, que no tiene sentido cuando los resultados cruzan meses distintos.
- [x] ~~Autocompletado de notas al escribir una transacción (ej. escribir "Mer" sugiere "Mercadona", basado en notas anteriores).~~ Resuelto 2026-10-01: `useRecentNoteTitles` trae las últimas 300 notas (deduplicadas, más reciente primero), se filtran por coincidencia y se muestran hasta 5 sugerencias bajo el campo "Nota" de `TransactionForm` — respeta el toggle "Autocompletar notas" que ya existía en Configuración. Solo en Money Manager, no en Split Ledger (ver C).
- [x] ~~Persistencia de tab al cerrar la app: revisar si al cerrar y reabrir en el celular se conserva la pestaña donde estabas (y, dentro de Configuración, la sub-sección Money Manager / Split Ledger).~~ Resuelto 2026-10-01: `activeTab` (shell raíz) y `section` (`ConfigScreen`) se guardan en `localStorage` — sobreviven a un cierre real de la app, no solo a pasar a segundo plano. Convive con "Pantalla de inicio" (`startup_tab`): si está en "Sin preferencia", gana la última pestaña recordada; si tiene una fija, esa gana siempre. Confirmado funcionando por Nicolas.
- [x] ~~Nota larga (`memo`) editable desde el formulario de transacción, a modo de "Descripción" — hoy `memo` solo se llena vía import masivo.~~ Resuelto 2026-09-30: campo "Descripción" (textarea) agregado bajo "Nota" en `TransactionForm`.
- [x] ~~Drill-down en Estadísticas: click en una categoría (torta o lista) debería llevar al listado de sus transacciones. Hoy solo resalta (pie ↔ lista), no navega a nada.~~ Resuelto 2026-09-30: la porción de la torta sigue resaltando, la fila de la lista navega a `CategoryDrillDownScreen` (línea de tiempo por mes + listado filtrado). De paso se agregó también el extracto por cuenta (Diario/Mensual/Anual) en el tab Cuentas, no estaba pedido acá pero es la misma idea aplicada a cuentas.

## F. Bugs / cosméticos menores

- [x] ~~Los grupos de Split Ledger no se están borrando.~~ Resuelto
      2026-10-03: reportado 2026-10-02. Causa real: `deleteGroup` sí marca
      `deleted = true`, pero `useGroups().load()` traía TODOS los grupos sin
      filtrar esa columna — confiaba en un supuesto (nunca verificado) de
      que la RLS de `groups` ocultaba los borrados sola. No es así: el grupo
      desaparecía un instante (filtro optimista local) y volvía a aparecer
      en la próxima recarga de la lista (ej. al aceptar una invitación).
      Arreglado agregando `.eq("deleted", false)` a esa consulta en
      `SplitLedger.jsx`.
- [x] ~~Drag-and-drop de reordenar con un solo ítem no debería mostrar el ícono de arrastrar (categorías, cuentas, grupos, "otras monedas") — no hay con qué reordenar si hay uno solo.~~ Resuelto 2026-10-02: eran 6 listas arrastrables en total (categorías de Money Manager, categorías de grupo en Split Ledger, "tus grupos", grupos de cuentas, cuentas dentro de un grupo, "otras monedas") — todas reciben ahora un `draggable={lista.length > 1}` que, cuando es `false`, oculta el ícono (deja un espacio vacío del mismo ancho para no desalinear la fila) y además pasa `disabled` a `useSortable` para que tampoco funcione el arrastre por teclado.
- [x] ~~El contorno de foco naranja del `ConfirmInline` no respeta las esquinas achatadas cuando está pegado a un input arriba (visto en Configuración → Split Ledger → "Nombre visible"). Puramente visual.~~ Resuelto 2026-09-30: los botones ya no llevan anillo de foco, y los inputs pasaron de `outline` a `box-shadow` (ver `DESIGN_NOTES.md`), que sí respeta bordes asimétricos.

## G. Simplificaciones MVP vs. la app original (Realbyte Money Manager) — ya revisadas con Nicolas

- [x] ~~Cuentas: sin tratamiento especial de tarjetas de crédito (la original separa "Saldo a pagar" / "Saldo restante"); acá todas las cuentas se muestran igual.~~ Resuelto 2026-09-30: split pasado/actual, cuenta de pago, ciclo de facturación y pago automático con catch-up.
- [x] ~~Categorías: lista plana, sin jerarquía padre/subcategoría (la original sí soporta subcategorías).~~ Decidido 2026-09-30: no es útil por ahora — pasa a "posibles mejoras a futuro" (sección C).
- [x] ~~Transacciones: un solo campo "Nota" corto. No se replicó "Descripción" con foto adjunta, ni la nota larga (`memo`) editable desde el formulario.~~ Decidido 2026-09-30: el `memo` como "Descripción" sí es útil — pasa a construir (sección E). La foto adjunta queda aparte, ver G-5.
- [x] ~~Tab Transacciones: solo existe la sub-vista "Diario". No se construyeron Calendario/Mensual/Resumen/Descripción.~~ Decidido 2026-09-30: descartado, no es útil — sección D.
- [x] ~~Sin presupuestos (Budgets) ni Tags.~~ Decidido 2026-09-30: descartado — sección D.
- [x] ~~Sin fotos adjuntas a transacciones (la data real solo tenía 1 foto en total).~~ Decidido 2026-09-30: pasa a "posibles mejoras a futuro" (sección C) — la infraestructura ya existe (mismo `PhotoPicker`/`useImageUpload` de Split Ledger), barata de agregar si cambia el uso real, pero sin señal de que haga falta hoy.
- [x] ~~Estadísticas: solo 2 sub-tabs (Ingreso/Gastos) — la original también tiene "Presupuesto" y "Nota" ahí.~~ Decidido 2026-09-30: descartado — sección D. El caso de uso real ("¿cuántas veces fui a X?") lo cubre el Buscador de gastos (E), no hace falta una sub-vista de Estadísticas para eso.
