# Reglas de diseño

Convenciones que no son obvias con solo leer el código — para no reinventarlas
ni romperlas sin querer. Se actualiza cuando aparezca una nueva regla.

## Color de notas/textos de ayuda (`styles.muted` + color)

Los textos chicos de ayuda debajo de un campo (no el label, la explicación
opcional) usan color con significado — no es al azar:

| Color | Significado | Ejemplo |
|---|---|---|
| `#6B6355` (gris, el default de `styles.muted`) | Explicación neutral de qué hace el campo — no pasó nada | "La app va a abrir siempre en esta pestaña…" |
| `#3B6E62` (verde) | Confirmación de algo positivo que acaba de pasar | "Grupo creado." |
| `#B0473A` (rojo) | Advertencia/problema que requiere atención | "Esta categoría fue eliminada.", suma de repartos pasada del 100% |
| `#A8754A` (ámbar) | Dato/comportamiento raro, pero no es error ni requiere acción | Aviso de día 29/30/31 en "Hacer recurrente" (`TransactionForm.jsx`, `RecurringFields`) |

**Antes de agregar un aviso nuevo**, pensar a cuál de estos 4 corresponde en vez
de usar gris por descarte — el ámbar en particular se usa en un solo lugar hoy,
fácil de olvidar que existe.

## Toasts (`showSuccess` / `showInfo` / `showError`)

- **Verde (`showSuccess`)**: guardó algo con un botón explícito de Guardar/Crear.
- **Negro (`showInfo`)**: eliminar algo, o un autoguardado sin botón (ej. cambiar
  un `<select>` de Configuración) — cualquier acción que no tenga ya su propia
  señal visual de que funcionó.
- **Negro con mensaje de error (`showError`)**: algo falló. Siempre en el
  `catch` de la acción correspondiente.
- **Sin toast**: toggles tipo switch (el switch ya se ve prender/apagar) y
  reordenar por drag-and-drop (el ítem ya se ve mover) — ahí un toast sería
  ruido, no información nueva.

## Formularios: crear y editar deben ser el mismo molde

Si una pantalla edita VARIOS campos relacionados de UNA entidad (cuenta,
grupo, categoría, transacción), la versión de "editar" y la de "crear" tienen
que tener exactamente la misma estructura y los mismos campos — un Footer
Cancelar/Guardar, nada se guarda hasta tocar Guardar. Ejemplo: `TransactionForm`
ya lo hace bien (un solo componente, `editingTransaction` null o no); Cuentas
y Grupos de cuentas lo replican con `NewAccountForm`/`AccountDetailScreen` y
`NewGroupForm`/`ManageAccounts`.

Autoguardado sin botón (con toast `showInfo`) es solo para configuraciones
sueltas e independientes entre sí (ej. Detalles del período: día de inicio de
mes, de semana, pantalla de inicio — cada `<select>` no tiene relación con
los otros).

## Patrón de "eliminado pero sigue existiendo" (categorías, cuentas, grupos)

Al eliminar (soft-delete, `deleted: true`) una categoría/cuenta/grupo:
- La consulta que trae la lista **no filtra `deleted`** del lado del servidor
  — se sigue trayendo al cliente, para poder mostrar su nombre/ícono en
  transacciones viejas que ya la tenían asignada.
- Los selectores de "elegir una nueva" SÍ la excluyen — salvo que sea la ya
  asignada a lo que estás editando en ese momento (así no se pierde la
  selección al editar algo viejo).
- Donde se muestra (Transacciones, el picker del formulario), se marca
  tachada, en rojo, con el ícono `Trash2` — nunca como si no existiera.

## Nunca un `<button>` dentro de un `<label>` que envuelve el input real

Un `<label>` reenvía el click al primer elemento etiquetable que encuentra
adentro — si hay un botón (ej. `InfoTooltip`) antes que el `<input>`/`<select>`
real, tocar CUALQUIER parte del label (incluso texto plano) puede terminar
activando el botón en vez de enfocar el campo. Si un campo necesita un ícono
interactivo al lado del label (como el tooltip de info), usar un `<div>` con
el mismo estilo de `styles.label` en vez de un `<label>`.

## Botón punteado ("+ Nueva X") debajo de una lista, no un "+" en el TopBar

Un "+" en el TopBar es para crear algo nuevo a nivel de la pantalla misma
(ej. "+ Nueva transacción repetida" en su propia pantalla). Cuando lo que se
crea es un HIJO de algo específico (ej. una cuenta dentro de un grupo puntual),
va como botón punteado (`styles.btnDashed`) debajo del último ítem de la
lista, no como ícono en el TopBar.
