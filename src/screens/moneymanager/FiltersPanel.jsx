import React, { useState } from "react";
import { styles } from "../../lib/styles.js";
import { TopBar, Footer, Field, MultiPickerField } from "../../components/Shared.jsx";
import { EMPTY_FILTERS, filtersEqual } from "../../lib/filterHelpers.js";

// Compartido entre el Buscador y el filtro persistente de Transacciones/
// Estadísticas — misma UI de filtros en los dos casos, solo cambia qué hace
// "Aplicar" con el resultado (correr una búsqueda vs. filtrar en el cliente).
export function FiltersPanel({ draft, setDraft, filters, accountGroups, categories, onBack, onApply, onClear, title = "Filtros" }) {
  const [categoryFilterType, setCategoryFilterType] = useState("expense");
  const categoryItems = categories.filter((c) => c.type === categoryFilterType && !c.deleted).map((c) => ({ value: c.id, label: c.name, icon: c.icon }));
  const unchanged = filtersEqual(draft, filters);
  const empty = filtersEqual(draft, EMPTY_FILTERS);

  return (
    <div style={styles.screen}>
      <TopBar title={title} onBack={onBack} />
      <div style={styles.form}>
        {/* minWidth:0 en los dos Field de cada fila — por default un hijo de
            flex no se achica más allá del tamaño de SU contenido ("min-width:
            auto"), y un <input type="date"> vacío en iOS renderiza bastante
            más ancho que la mitad de la pantalla. Sin esto, empuja el layout
            entero más ancho que el viewport en vez de achicarse al 50%. */}
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Importe mínimo" style={{ flex: 1, minWidth: 0 }}>
            <input style={{ ...styles.input, width: "100%" }} value={draft.amountMin} onChange={(e) => setDraft((d) => ({ ...d, amountMin: e.target.value }))} placeholder="0.00" inputMode="decimal" />
          </Field>
          <Field label="Importe máximo" style={{ flex: 1, minWidth: 0 }}>
            <input style={{ ...styles.input, width: "100%" }} value={draft.amountMax} onChange={(e) => setDraft((d) => ({ ...d, amountMax: e.target.value }))} placeholder="0.00" inputMode="decimal" />
          </Field>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Desde" style={{ flex: 1, minWidth: 0 }}>
            <input style={{ ...styles.input, width: "100%" }} type="date" value={draft.dateFrom} onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))} />
          </Field>
          <Field label="Hasta" style={{ flex: 1, minWidth: 0 }}>
            <input style={{ ...styles.input, width: "100%" }} type="date" value={draft.dateTo} onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))} />
          </Field>
        </div>

        <Field label="Cuenta">
          <MultiPickerField
            value={draft.accountIds}
            onChange={(v) => setDraft((d) => ({ ...d, accountIds: v }))}
            groups={accountGroups}
            placeholder="Todas"
          />
        </Field>

        <Field label="Categoría">
          <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
            <button type="button" style={categoryFilterType === "expense" ? styles.tabActive : styles.tab} onClick={() => setCategoryFilterType("expense")}>Gastos</button>
            <button type="button" style={categoryFilterType === "income" ? styles.tabActive : styles.tab} onClick={() => setCategoryFilterType("income")}>Ingreso</button>
          </div>
          <MultiPickerField
            value={draft.categoryIds}
            onChange={(v) => setDraft((d) => ({ ...d, categoryIds: v }))}
            groups={[{ label: null, items: categoryItems }]}
            placeholder="Todas"
          />
        </Field>
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0, opacity: empty ? 0.5 : 1 }} onClick={onClear} disabled={empty}>Limpiar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: unchanged ? 0.5 : 1 }} onClick={onApply} disabled={unchanged}>Aplicar</button>
      </Footer>
    </div>
  );
}
