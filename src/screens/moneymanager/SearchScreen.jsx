import React, { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, SlidersHorizontal, Trash2, Divide, AlertCircle } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { TopBar, HeaderMenu, EmptyState } from "../../components/Shared.jsx";
import { money, dateInputValueInZone, measureTextWidth } from "../../lib/helpers.jsx";
import { useRecentNoteTitles, searchTransactions, isRatePending, currenciesInUse } from "../../lib/moneyManagerData.js";
import { EMPTY_FILTERS, hasActiveFilters } from "../../lib/filterHelpers.js";
import { FiltersPanel } from "./FiltersPanel.jsx";

const DATE_COL_FONT = "11.5px system-ui, sans-serif";

// dd/mm/yyyy en la zona propia de la transacción (no la del navegador) —
// mismo criterio que el resto de la app para decidir "a qué día pertenece".
function ddmmyyyy(ms, tz) {
  const [y, m, d] = dateInputValueInZone(ms, tz).split("-");
  return `${d}/${m}/${y}`;
}

// Fila de resultado — a propósito NO reutiliza TransactionDayGroups (la
// lista de Transacciones/drill-downs, agrupada por día sin mes/año): acá los
// resultados pueden venir de meses o años distintos mezclados, así que cada
// fila necesita su PROPIA fecha completa en vez de vivir agrupada bajo un
// encabezado de "día" ambiguo. También muestra categoría (ícono + nombre) en
// vez de solo el ícono — sin el contexto de "estás parado en Mercado" que sí
// tiene Estadísticas, un emoji solo no alcanza para identificarla.
function SearchResultRow({ t, accounts, categories, slLinks, settings, dateColWidth, onEdit }) {
  const account = accounts.find((a) => a.id === t.account_id);
  const toAccount = accounts.find((a) => a.id === t.to_account_id);
  const category = categories.find((c) => c.id === t.category_id);

  // Mismo criterio que TransactionDayGroups: el nombre/ícono del grupo sale
  // de la cuenta pseudo del vínculo, no de `memo` (libre, editable).
  const link = t.sl_link_id && slLinks?.find((l) => l.id === t.sl_link_id);
  const badge = link && accounts.find((a) => a.id === link.pseudo_account_id);
  // Compara contra la moneda de SU CUENTA, no settings.main_currency — mismo
  // motivo que TransactionDayGroups.jsx (amount_main se convierte a la
  // moneda de la cuenta, no a una principal global).
  const pending = isRatePending(t, account?.currency || settings.main_currency);

  const accountLabel = (a) => a && (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, ...(a.deleted ? { textDecoration: "line-through", color: "#B0473A" } : null) }}>
      {a.icon && <span style={{ fontSize: 11 }}>{a.icon}</span>}
      {a.name}
      {a.deleted && <Trash2 size={10} style={{ flexShrink: 0 }} />}
    </span>
  );

  return (
    <div onClick={() => onEdit(t)} style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14, cursor: "pointer", background: pending ? "#FBEDE7" : badge ? "#FBF1E0" : undefined }}>
      {/* Pendiente de tasa: el resto de la fila se atenúa y el badge queda
          centrado encima — mismo criterio que TransactionDayGroups. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flex: 1, minWidth: 0, opacity: pending ? 0.35 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        {/* Bloque fecha+categoría — reemplaza el ícono solo de TransactionDayGroups:
            acá hace falta la fecha (sin encabezado de día que agrupe) Y el
            nombre de categoría (sin el contexto de "en qué pantalla estoy",
            un emoji solo no alcanza para identificarla). */}
        <div style={{ flexShrink: 0, width: dateColWidth, minHeight: 32, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <p style={{ margin: 0, fontSize: 11.5, color: "#A8754A" }}>{ddmmyyyy(new Date(t.date).getTime(), t.timezone)}</p>
          {t.type !== "transfer" && (
            <p style={{ margin: 0, fontSize: 11.5, color: "#6B6355", display: "flex", alignItems: "center", gap: 3, overflow: "hidden" }}>
              {category?.icon && <span style={{ fontSize: 11, flexShrink: 0 }}>{category.icon}</span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{category ? category.name : "Sin categoría"}</span>
            </p>
          )}
        </div>
        {/* Bloque nota+cuenta — igual que TransactionDayGroups: si no hay
            nota, la cuenta sola queda centrada a la misma altura. */}
        <div style={{ minWidth: 0, minHeight: 32, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {t.type === "transfer" ? (
            <>
              <p style={{ margin: 0, fontWeight: 600 }}>{t.title || "Transferencia"}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#6B6355", display: "flex", alignItems: "center", gap: 4 }}>
                {accountLabel(account)} → {accountLabel(toAccount)}
              </p>
            </>
          ) : t.title ? (
            <>
              <p style={{ margin: 0, fontWeight: 600 }}>{t.title}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#6B6355" }}>{accountLabel(account)}</p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: "#6B6355" }}>{accountLabel(account)}</p>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {!pending && badge && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#A8754A", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={badge.name}>
            <Divide size={12} color="#A8754A" style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{badge.name}</span>
          </span>
        )}
        <span style={{ fontWeight: 600, color: t.type === "income" ? "#3B6E62" : t.type === "expense" ? "#B0473A" : "#4A6FA5" }}>
          {money(t.amount, t.currency)}
        </span>
      </div>
      </div>
      {pending && (
        <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: "#B0473A", background: "#fff", border: "1px solid #EBC9BA", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }} title="Moneda diferente, pendiente tasa de cambio">
          <AlertCircle size={12} style={{ flexShrink: 0 }} />
          Pendiente tasa de cambio
        </span>
      )}
    </div>
  );
}

function SearchResults({ results, settings, accounts, categories, slLinks, onEditTransaction }) {
  // Fase 2 de multi-moneda (ver MULTI_CURRENCY_PLAN.md): los resultados
  // pueden venir de cuentas de monedas distintas, así que estos totales
  // solo suman la moneda elegida en el selector — `settings` ya viene
  // "pisado" con esa moneda desde SearchScreen, como settings.main_currency.
  const isSelectedCurrencyTx = (t) => (accounts.find((a) => a.id === t.account_id)?.currency || settings.main_currency) === settings.main_currency;
  const income = results.filter((t) => t.type === "income" && isSelectedCurrencyTx(t)).reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
  const expense = results.filter((t) => t.type === "expense" && isSelectedCurrencyTx(t)).reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
  const transfer = results.filter((t) => t.type === "transfer" && isSelectedCurrencyTx(t)).reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
  // Ancho fijo = el de la fecha (siempre "dd/mm/yyyy", mismo ancho) — la
  // categoría se achica con elipsis si no entra, nunca empuja la columna.
  const dateColWidth = useMemo(() => Math.ceil(measureTextWidth("00/00/0000", DATE_COL_FONT)), []);

  return (
    // Un solo div envolviendo todo (no un Fragment con 2 raíces sueltas):
    // así el espacio entre "N resultados" y la primera fila se controla acá
    // adentro (marginTop) en vez de heredar el gap:14 del form padre —
    // tiene que medir lo mismo que el padding-top de ese form (12px), no 14.
    <div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", padding: "0 4px" }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Ingresos</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#3B6E62" }}>{money(income, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Gastos</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#B0473A" }}>{money(expense, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Transferencias</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(transfer, settings.main_currency)}</p>
          </div>
        </div>
        <p style={{ ...styles.muted, padding: 0, textAlign: "center", marginTop: 6 }}>{results.length} resultado{results.length === 1 ? "" : "s"}</p>
      </div>
      <div style={{ marginTop: 12, borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
        {results.map((t) => (
          <SearchResultRow key={t.id} t={t} accounts={accounts} categories={categories} slLinks={slLinks} settings={settings} dateColWidth={dateColWidth} onEdit={onEditTransaction} />
        ))}
      </div>
    </div>
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
  session, settings, groups, accounts, categories, slLinks, query, setQuery, filters, setFilters,
  onBack, onEditTransaction, showError,
}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [noteDismissed, setNoteDismissed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  // Fase 2 de multi-moneda (ver MULTI_CURRENCY_PLAN.md): el renglón de
  // totales mezclaría monedas distintas en un solo número si no elegís con
  // cuál mirarlo. Sin persistir, arranca en la principal.
  const [currency, setCurrency] = useState(settings.main_currency);
  const currencies = currenciesInUse(accounts, settings);

  const recentNoteTitles = useRecentNoteTitles(session.userId);
  const noteSuggestions = query.trim()
    ? recentNoteTitles.filter((t) => t.toLowerCase().includes(query.trim().toLowerCase()) && t.toLowerCase() !== query.trim().toLowerCase()).slice(0, 5)
    : [];

  // Recibe query/filters explícitos (no los lee del state del closure) para
  // los casos donde se dispara en el mismo gesto que los cambia (elegir una
  // sugerencia, aplicar filtros) — el state recién se actualiza en el
  // próximo render, así que leerlo ahí mismo traería el valor viejo.
  // El guard de "sin texto y sin filtros no busca nada" vive acá adentro
  // (no repetido en cada botón que puede disparar una búsqueda) — cubre
  // tanto Enter con la barra vacía como "Limpiar" + "Aplicar" en Filtros.
  const runSearch = async (searchQuery = query, searchFilters = filters) => {
    if (!searchQuery.trim() && !hasActiveFilters(searchFilters)) {
      setResults([]);
      setHasSearched(false);
      return;
    }
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
    void runSearch();
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
        title="Filtros de búsqueda"
        draft={draft}
        setDraft={setDraft}
        filters={filters}
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
          <HeaderMenu
            trigger={<><SlidersHorizontal size={19} />{hasActiveFilters(filters) && <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: "#C75D3B" }} />}</>}
            items={[{ icon: <SlidersHorizontal size={16} color="#6B6355" />, label: "Filtros", onClick: openFilters, badge: hasActiveFilters(filters) }]}
            currencies={currencies}
            currency={currency}
            onChangeCurrency={setCurrency}
          />
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
          <EmptyState title="Buscá por nota o descripción">Escribí algo y apretá Enter, o elegí una sugerencia.</EmptyState>
        ) : loading ? (
          <EmptyState title="Buscando…" />
        ) : results.length === 0 ? (
          <EmptyState title="Sin resultados">Probá con otro texto o revisá los filtros.</EmptyState>
        ) : (
          <SearchResults
            results={results}
            settings={{ ...settings, main_currency: currency }}
            accounts={accounts}
            categories={categories}
            slLinks={slLinks}
            onEditTransaction={onEditTransaction}
          />
        )}
      </div>
    </div>
  );
}
