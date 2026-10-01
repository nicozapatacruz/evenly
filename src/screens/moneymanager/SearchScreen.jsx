import React, { useEffect, useState } from "react";
import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { TopBar, Footer, Field, MultiPickerField } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { useRecentNoteTitles, searchTransactions } from "../../lib/moneyManagerData.js";
import { TransactionDayGroups } from "./TransactionDayGroups.jsx";

const EMPTY_FILTERS = { accountIds: [], categoryIds: [], dateFrom: "", dateTo: "", amountMin: "", amountMax: "" };

function hasActiveFilters(f) {
  return f.accountIds.length > 0 || f.categoryIds.length > 0 || f.dateFrom || f.dateTo || f.amountMin || f.amountMax;
}

function FiltersPanel({ draft, setDraft, accountGroups, categories, onBack, onApply, onClear }) {
  const [categoryFilterType, setCategoryFilterType] = useState("expense");
  const categoryItems = categories.filter((c) => c.type === categoryFilterType && !c.deleted).map((c) => ({ value: c.id, label: c.name, icon: c.icon }));

  return (
    <div style={styles.screen}>
      <TopBar title="Filtros" onBack={onBack} />
      <div style={styles.form}>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Importe mínimo" style={{ flex: 1 }}>
            <input style={styles.input} value={draft.amountMin} onChange={(e) => setDraft((d) => ({ ...d, amountMin: e.target.value }))} placeholder="0.00" inputMode="decimal" />
          </Field>
          <Field label="Importe máximo" style={{ flex: 1 }}>
            <input style={styles.input} value={draft.amountMax} onChange={(e) => setDraft((d) => ({ ...d, amountMax: e.target.value }))} placeholder="0.00" inputMode="decimal" />
          </Field>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Desde" style={{ flex: 1 }}>
            <input style={styles.input} type="date" value={draft.dateFrom} onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))} />
          </Field>
          <Field label="Hasta" style={{ flex: 1 }}>
            <input style={styles.input} type="date" value={draft.dateTo} onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))} />
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
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onClear}>Limpiar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0 }} onClick={onApply}>Aplicar</button>
      </Footer>
    </div>
  );
}

function SearchResults({ results, settings, accounts, categories, onNewTransaction, onEditTransaction }) {
  const income = results.filter((t) => t.type === "income").reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
  const expense = results.filter((t) => t.type === "expense").reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
  const transfer = results.filter((t) => t.type === "transfer").reduce((s, t) => s + (t.amount_main ?? t.amount), 0);

  return (
    <>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", padding: "0 4px" }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Ingreso</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#3B6E62" }}>{money(income, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Gastos</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#B0473A" }}>{money(expense, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Transferencia</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(transfer, settings.main_currency)}</p>
          </div>
        </div>
        <p style={{ ...styles.muted, padding: 0, textAlign: "center", marginTop: 6 }}>{results.length} resultado{results.length === 1 ? "" : "s"}</p>
      </div>
      <TransactionDayGroups
        transactions={results}
        settings={settings}
        accounts={accounts}
        categories={categories}
        onNewTransaction={onNewTransaction}
        onEditTransaction={onEditTransaction}
      />
    </>
  );
}

/* =========================================================================
   BUSCADOR DE GASTOS — texto (nota + descripción) con filtros opcionales de
   fecha, cuenta, categoría e importe. Busca sobre todo el historial (no un
   mes como el resto de las pantallas), así que los filtros se aplican del
   lado del servidor (`searchTransactions`) en vez de traer toda la tabla.
   query/filters viven en el padre (SplitLedger.jsx) para sobrevivir el viaje
   de ida y vuelta a "editar transacción" — al volver, se re-corre la
   búsqueda sola (ver el useEffect de abajo), así el resultado queda al día
   con lo que acabás de cambiar.
   ========================================================================= */

export default function SearchScreen({
  session, settings, groups, accounts, categories, query, setQuery, filters, setFilters,
  onBack, onNewTransaction, onEditTransaction, showError,
}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [noteDismissed, setNoteDismissed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  const recentNoteTitles = useRecentNoteTitles(session.userId);
  const noteSuggestions = query.trim()
    ? recentNoteTitles.filter((t) => t.toLowerCase().includes(query.trim().toLowerCase()) && t.toLowerCase() !== query.trim().toLowerCase()).slice(0, 5)
    : [];

  // Recibe query/filters explícitos (no los lee del state del closure) para
  // los casos donde se dispara en el mismo gesto que los cambia (elegir una
  // sugerencia, aplicar filtros) — el state recién se actualiza en el
  // próximo render, así que leerlo ahí mismo traería el valor viejo.
  const runSearch = async (searchQuery = query, searchFilters = filters) => {
    setLoading(true);
    setHasSearched(true);
    setNoteDismissed(true);
    try {
      const data = await searchTransactions(session.userId, { query: searchQuery, ...searchFilters });
      setResults(data);
    } catch {
      showError("No se pudo buscar. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // Si volvés de editar una transacción con una búsqueda ya activa, se
  // vuelve a correr sola (no queda "pegada" al resultado viejo).
  useEffect(() => {
    if (query.trim() || hasActiveFilters(filters)) void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountGroups = groups
    .filter((g) => !g.deleted)
    .map((g) => ({ label: g.name, items: accounts.filter((a) => a.group_id === g.id && !a.hidden && !a.deleted).map((a) => ({ value: a.id, label: a.name, icon: a.icon })) }))
    .filter((g) => g.items.length > 0);

  const openFilters = () => { setDraft(filters); setFiltersOpen(true); };
  const applyFilters = () => { setFilters(draft); setFiltersOpen(false); void runSearch(query, draft); };
  const clearFilters = () => setDraft(EMPTY_FILTERS);

  if (filtersOpen) {
    return (
      <FiltersPanel
        draft={draft}
        setDraft={setDraft}
        accountGroups={accountGroups}
        categories={categories}
        onBack={() => setFiltersOpen(false)}
        onApply={applyFilters}
        onClear={clearFilters}
      />
    );
  }

  return (
    <div style={{ ...styles.screen, display: "flex", flexDirection: "column" }}>
      <TopBar
        title="Buscar"
        onBack={onBack}
        right={
          <button style={styles.iconBtnGhost} onClick={openFilters} aria-label="Filtros">
            <SlidersHorizontal size={19} />
            {hasActiveFilters(filters) && <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: "#C75D3B" }} />}
          </button>
        }
      />
      <div style={{ padding: "10px 20px", borderBottom: "1px solid #ECE3D3" }}>
        <div style={{ position: "relative" }}>
          <SearchIcon size={16} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#A89A87", pointerEvents: "none" }} />
          <input
            style={{ ...styles.input, width: "100%", paddingLeft: 32 }}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setNoteDismissed(false); }}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); void runSearch(); } }}
            enterKeyHint="search"
            placeholder="Buscar por nota o descripción…"
          />
          {noteFocused && !noteDismissed && noteSuggestions.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 5, border: "1px solid #DDD2BE", borderRadius: 10, background: "#fff", overflow: "hidden", boxShadow: "0 4px 10px rgba(0,0,0,0.08)" }}>
              {noteSuggestions.map((s) => (
                <button
                  type="button"
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); setQuery(s); setNoteDismissed(true); void runSearch(s, filters); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", fontSize: 13, fontFamily: "system-ui, sans-serif", border: "none", background: "#fff", color: "#2B2620", cursor: "pointer" }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...styles.form, flex: 1, paddingTop: 12, paddingBottom: 100 }}>
        {!hasSearched ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Buscá por nota o descripción</p>
            <p style={{ ...styles.muted, padding: 0 }}>Escribí algo y apretá Enter, o elegí una sugerencia.</p>
          </div>
        ) : loading ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Buscando…</p>
          </div>
        ) : results.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Sin resultados</p>
            <p style={{ ...styles.muted, padding: 0 }}>Probá con otro texto o revisá los filtros.</p>
          </div>
        ) : (
          <SearchResults
            results={results}
            settings={settings}
            accounts={accounts}
            categories={categories}
            onNewTransaction={onNewTransaction}
            onEditTransaction={onEditTransaction}
          />
        )}
      </div>
    </div>
  );
}
