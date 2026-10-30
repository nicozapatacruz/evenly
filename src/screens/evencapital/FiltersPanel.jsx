import React from "react";
import { styles } from "../../lib/styles.js";
import { TopBar, FormFooter, MultiPickerField, DateRow } from "../../components/Shared.jsx";
import { EMPTY_FILTERS, filtersEqual } from "../../lib/filterHelpers.js";

// Compartido entre el Buscador y el filtro persistente de Transacciones/
// Estadísticas — misma UI de filtros en los dos casos, solo cambia qué hace
// "Aplicar" con el resultado (correr una búsqueda vs. filtrar en el cliente).
export function FiltersPanel({ draft, setDraft, filters, accountGroups, categories, onBack, onApply, onClear, title = "Filtros" }) {
  const unchanged = filtersEqual(draft, filters);
  const empty = filtersEqual(draft, EMPTY_FILTERS);

  // `categoryIds` sigue siendo un solo array por debajo (gasto + ingreso
  // mezclados) -- acá arriba se separa solo para mostrar 2 filas
  // independientes en vez de 1 con un toggle, cada `onChange` vuelve a
  // mezclar su parte con la del otro tipo sin tocarla.
  const expenseCategoryItems = categories.filter((c) => c.type === "expense" && !c.deleted).map((c) => ({ value: c.id, label: c.name, icon: c.icon }));
  const incomeCategoryItems = categories.filter((c) => c.type === "income" && !c.deleted).map((c) => ({ value: c.id, label: c.name, icon: c.icon }));
  const selectedExpenseIds = draft.categoryIds.filter((id) => categories.find((c) => c.id === id)?.type === "expense");
  const selectedIncomeIds = draft.categoryIds.filter((id) => categories.find((c) => c.id === id)?.type === "income");

  return (
    <div style={styles.screen}>
      <TopBar title={title} onBack={onBack} />
      <div style={styles.form}>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif" }}>
            <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 13, color: "#6B6355" }}>Mínimo</span>
            <input
              className="row-input"
              style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13.5, fontFamily: "system-ui, sans-serif", border: "none", background: "transparent", padding: 0, color: "#2B2620" }}
              value={draft.amountMin}
              onChange={(e) => setDraft((d) => ({ ...d, amountMin: e.target.value }))}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif" }}>
            <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 13, color: "#6B6355" }}>Máximo</span>
            <input
              className="row-input"
              style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13.5, fontFamily: "system-ui, sans-serif", border: "none", background: "transparent", padding: 0, color: "#2B2620" }}
              value={draft.amountMax}
              onChange={(e) => setDraft((d) => ({ ...d, amountMax: e.target.value }))}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DateRow label="Desde" value={draft.dateFrom} onChange={(v) => setDraft((d) => ({ ...d, dateFrom: v }))} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DateRow label="Hasta" value={draft.dateTo} onChange={(v) => setDraft((d) => ({ ...d, dateTo: v }))} />
          </div>
        </div>

        <MultiPickerField
          rowLabel="Cuenta"
          title="Elegí una o más cuentas"
          value={draft.accountIds}
          onChange={(v) => setDraft((d) => ({ ...d, accountIds: v }))}
          groups={accountGroups}
          placeholder="Todas"
        />

        <MultiPickerField
          rowLabel="Categorías de gasto"
          title="Elegí una o más categorías"
          value={selectedExpenseIds}
          onChange={(v) => setDraft((d) => ({ ...d, categoryIds: [...v, ...selectedIncomeIds] }))}
          groups={[{ label: null, items: expenseCategoryItems }]}
          placeholder="Todas"
        />

        <MultiPickerField
          rowLabel="Categorías de ingreso"
          title="Elegí una o más categorías"
          value={selectedIncomeIds}
          onChange={(v) => setDraft((d) => ({ ...d, categoryIds: [...selectedExpenseIds, ...v] }))}
          groups={[{ label: null, items: incomeCategoryItems }]}
          placeholder="Todas"
        />
      </div>
      <FormFooter
        onCancel={onClear}
        cancelLabel="Limpiar"
        cancelDisabled={empty}
        onConfirm={onApply}
        confirmLabel="Aplicar"
        confirmDisabled={unchanged}
      />
    </div>
  );
}
