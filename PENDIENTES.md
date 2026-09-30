# Pendientes de Money Manager

Lista viva de pendientes del proyecto. Reglas:

- Cuando se agregue algo nuevo (bug encontrado, feature pedida, decisión diferida), se suma acá.
- Cuando se resuelve algo, **no se borra**: se tacha (`~~texto~~`) y se le agrega la fecha de cuándo quedó resuelto.
- No depende de la memoria de Claude — este archivo es la fuente de verdad, vive en el repo.

---

## A. Funcionales — features que faltan construir

- [ ] Buscador de gastos: pantalla de búsqueda por texto/nota, con filtros de fecha, categoría y cuenta.
- [ ] Drill-down en Estadísticas: click en una categoría (torta o lista) debería llevar al listado de sus transacciones. Hoy solo resalta (pie ↔ lista), no navega a nada.
- [ ] Autocompletado de notas al escribir una transacción (ej. escribir "Mer" sugiere "Mercadona", basado en notas anteriores).
- [ ] Persistencia de tab al cerrar la app: revisar si al cerrar y reabrir en el celular se conserva la pestaña donde estabas (y, dentro de Configuración, la sub-sección Money Manager / Split Ledger).
- [ ] Campo "Comisión" (fee) en transferencias: existe en la base (`mm_transactions.fee_amount`) pero no está expuesto en el formulario.

## B. Decisiones diferidas a propósito

No tocar salvo que Nicolas las traiga de vuelta explícitamente.

- [ ] Unificar categorías de Money Manager con las de Split Ledger (hoy son sistemas totalmente separados).
- [ ] Cambiar la moneda principal en Ajustes rompe el historial viejo (`amount_main` no se recalcula). Idea de Nicolas para resolverlo: que cada cuenta tenga su propia moneda fija (no editable), la "moneda principal" pasaría a ser solo el default sugerido al crear una cuenta nueva, y los balances mostrarían un total por cada moneda presente en vez de sumar todo convertido. Cambio de arquitectura grande, explícitamente pospuesto.

## C. Bugs / cosméticos menores

- [ ] Drag-and-drop de reordenar con un solo ítem no debería mostrar el ícono de arrastrar (categorías, cuentas, grupos, "otras monedas") — no hay con qué reordenar si hay uno solo.
- [ ] El contorno de foco naranja del `ConfirmInline` no respeta las esquinas achatadas cuando está pegado a un input arriba (visto en Configuración → Split Ledger → "Nombre visible"). Puramente visual.

## D. Simplificaciones MVP vs. la app original (Realbyte Money Manager) — pendientes de revisión/aprobación de Nicolas

- [ ] Cuentas: sin tratamiento especial de tarjetas de crédito (la original separa "Saldo a pagar" / "Saldo restante"); acá todas las cuentas se muestran igual.
- [ ] Categorías: lista plana, sin jerarquía padre/subcategoría (la original sí soporta subcategorías).
- [ ] Transacciones: un solo campo "Nota" corto. No se replicó "Descripción" con foto adjunta, ni la nota larga (`memo`) editable desde el formulario (memo solo se llena vía import masivo).
- [ ] Tab Transacciones: solo existe la sub-vista "Diario". No se construyeron Calendario/Mensual/Resumen/Descripción.
- [ ] Sin presupuestos (Budgets) ni Tags — excluidos porque la data real de Nicolas casi no los usaba.
- [ ] Sin fotos adjuntas a transacciones (la data real solo tenía 1 foto en total).
- [ ] Estadísticas: solo 2 sub-tabs (Ingreso/Gastos) — la original también tiene "Presupuesto" y "Nota" ahí.

## E. Cambios de diseño (no son "menos funciones", son decisiones distintas a propósito)

- [ ] Transferencias modeladas como una sola fila (`account_id` + `to_account_id`) en vez de las 2 filas espejo que usa internamente la app original.
- [ ] Esquema relacional (Postgres/UUIDs) en vez del modelo Core Data/SQLite original.
- [ ] Colores del toggle Ingreso/Gasto/Transferencia adaptados a la paleta de Evenly, no los colores literales originales.
- [ ] Torta de Estadísticas con la paleta categórica validada (máx. 8 colores + gris para "el resto"), no los colores literales de la original.
