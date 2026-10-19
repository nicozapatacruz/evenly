import React, { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, GitCompare, Minus, Plus } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { RootHeader, MonthNav, TodayButton, FiltersActiveBanner, CompareActiveBanner, HeaderMenu, EmptyState, Modal, SegmentedControl, useMonthSwipe, useMonthSlide } from "../../components/Shared.jsx";
import { money, monthProgressPct } from "../../lib/helpers.jsx";
import { useStatsCategoryTotals, currenciesInUse } from "../../lib/moneyManagerData.js";
import { hasActiveFilters } from "../../lib/filterHelpers.js";

const COMPARE_KEY = "evenly_statsCompare";
const DEFAULT_COMPARE = { mode: "off", months: 1, specificMonth: null };
// ±10 puntos porcentuales de margen antes de juzgar "por encima"/"por
// debajo" del ritmo esperado -- sin esto, estar a 1pp de diferencia ya
// pintaría rojo/verde, demasiado sensible para ser útil de un vistazo.
const PACE_MARGIN = 0.10;
// Ancho fijo (no minWidth) de la columna de la derecha, compartido entre el
// encabezado (CompareHeader) y cada fila (ComparisonBar) -- tiene que ser
// IGUAL en los dos para que la barra mida lo mismo en ambos y la marca de
// "Hoy" quede alineada. Ahora que acá se muestra "monto (porcentaje)" en
// vez de solo "105%", no alcanza con un minWidth chico como antes.
const COMPARE_TRAIL_WIDTH = 100;

function loadCompareSpec() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPARE_KEY));
    return saved && typeof saved === "object" ? { ...DEFAULT_COMPARE, ...saved } : DEFAULT_COMPARE;
  } catch {
    return DEFAULT_COMPARE;
  }
}

// null (mes ya cerrado, sin juicio de ritmo) se pinta neutro, sin importar
// el valor -- ver monthProgressPct.
function paceColor(ratio, expectedPct) {
  if (expectedPct === null) return "#A8754A";
  const diff = ratio - expectedPct;
  if (diff <= -PACE_MARGIN) return "#3B6E62";
  if (diff >= PACE_MARGIN) return "#B0473A";
  return "#C9A24B";
}

// Barra de comparación de ritmo -- una por categoría, debajo de su fila ya
// existente. `baseline === 0` con gasto este mes es una categoría nueva (no
// hay con qué comparar, un "0%" ahí sería al revés de la realidad).
function ComparisonBar({ current, baseline, expectedPct, currency }) {
  // Mismo mensaje sea porque la categoría es nueva o porque simplemente no
  // hubo gasto ahí en el período comparado -- en la práctica da lo mismo
  // (no hay con qué comparar), no hace falta distinguir el motivo.
  if (baseline === 0) {
    if (current <= 0) return null;
    // Mismo layout (flex 1 + columna derecha de ancho fijo) que el caso con
    // datos, con un "—" en vez de "monto (%)" -- así esta fila no queda más
    // liviana que el resto, el guión cae justo debajo del monto de arriba.
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 11.5, color: "#A8754A", fontFamily: "system-ui, sans-serif" }}>Sin gastos para comparar</p>
        <span style={{ fontSize: 11, color: "#6B6355", fontFamily: "system-ui, sans-serif", textAlign: "right", flexShrink: 0, width: COMPARE_TRAIL_WIDTH }}>—</span>
      </div>
    );
  }
  const ratio = current / baseline;
  const fillPct = Math.min(ratio, 1) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
      <div style={{ position: "relative", flex: 1, height: 6, borderRadius: 3, background: "#ECE3D3", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fillPct}%`, background: paceColor(ratio, expectedPct), borderRadius: 3 }} />
        {expectedPct !== null && (
          <div style={{ position: "absolute", left: `${expectedPct * 100}%`, top: -1, bottom: -1, width: 2, background: "#2B2620" }} />
        )}
      </div>
      <span style={{
        fontSize: 11, color: "#6B6355", fontFamily: "system-ui, sans-serif", textAlign: "right", flexShrink: 0,
        width: COMPARE_TRAIL_WIDTH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {money(baseline, currency)} ({Math.round(ratio * 100)}%)
      </span>
    </div>
  );
}

// Encabezado de la comparación -- explica UNA sola vez (no por fila) qué es
// la marca negra ("Hoy", mismo punto que la marca de cada ComparisonBar) y
// contra qué se compara cada "%" de abajo. A propósito más fina y sin
// relleno de color que las barras reales (es una regla de referencia, no
// una barra de progreso).
function CompareHeader({ expectedPct, label }) {
  return (
    <div style={{ padding: "0 4px 10px" }}>
      {/* El label va absolute (right:0), NO adentro del flex row de la
          barra -- así su ancho (variable, ej. "vs prom. de 12 meses") nunca
          afecta el flex:1 de la barra. La barra queda con la MISMA
          estructura (flex:1 + gap 8 + spacer de ancho COMPARE_TRAIL_WIDTH)
          que cada ComparisonBar, así la marca de "Hoy" cae exactamente
          alineada con la de cada fila -- eso es lo que garantiza la
          alineación, no el texto de arriba. */}
      <div style={{ position: "relative", marginTop: expectedPct !== null ? 16 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative", flex: 1, height: 2, borderRadius: 1, background: "#DDD2BE" }}>
            {expectedPct !== null && (
              <>
                <span style={{ position: "absolute", left: `${expectedPct * 100}%`, bottom: 7, transform: "translateX(-50%)", fontSize: 10.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap" }}>
                  Hoy
                </span>
                <div style={{ position: "absolute", left: `${expectedPct * 100}%`, top: -4, bottom: -4, width: 2, background: "#2B2620" }} />
              </>
            )}
          </div>
          <span style={{ width: COMPARE_TRAIL_WIDTH, flexShrink: 0 }} />
        </div>
        <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", fontSize: 11.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap", background: "#FBF8F2", paddingLeft: 6 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

const MONTH_LABEL = (d) => d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => {
  const name = new Date(2000, i, 1).toLocaleDateString("es-ES", { month: "long" });
  return name.charAt(0).toUpperCase() + name.slice(1);
});

// Paleta categórica validada (orden fijo, no ciclar) — ver skill de dataviz.
// Pasado el 8vo puesto, todo cae en "Otros" con el gris neutro en vez de
// inventar una 9na tonalidad (indistinguible bajo daltonismo).
const SLICE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const OTHER_COLOR = "#898781";

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  // Un solo arco no puede dibujar 360° exactos (el punto de inicio y fin
  // coinciden, el área queda en cero) — si una sola categoría es el 100%,
  // se arma el círculo completo con dos semicírculos en vez de uno.
  if (endAngle - startAngle >= 359.99) {
    const p1 = polarToCartesian(cx, cy, r, startAngle);
    const p2 = polarToCartesian(cx, cy, r, startAngle + 180);
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 1 0 ${p2.x} ${p2.y} A ${r} ${r} 0 1 0 ${p1.x} ${p1.y} Z`;
  }
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export default function EstadisticasTab({ userId, settings, accounts, categories, viewMonth, setViewMonth, onDrillDown, filters, onOpenFilters, onClearFilters, onOpenSearch }) {
  const [type, setType] = useState("expense");
  const [selectedKey, setSelectedKey] = useState(null);
  const filtering = hasActiveFilters(filters);

  // Comparación de ritmo de gasto -- se recuerda entre sesiones (igual que
  // activeTab/configSection), no hay que re-elegirla cada vez que se abre
  // la app.
  const [compareSpec, setCompareSpec] = useState(loadCompareSpec);
  const [compareOpen, setCompareOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(compareSpec));
  }, [compareSpec]);
  const monthProgress = useMemo(() => monthProgressPct(viewMonth), [viewMonth]);

  // Se escribe una sola vez acá (encabezado), no por fila -- por eso puede
  // ser explícito sin preocuparse de saturar la lista de categorías.
  const compareLabel = useMemo(() => {
    if (compareSpec.mode === "specific" && compareSpec.specificMonth) {
      const { year, month } = compareSpec.specificMonth;
      const name = new Date(year, month - 1, 1).toLocaleDateString("es-ES", { month: "short" });
      return `vs ${name} ${year}`;
    }
    if (compareSpec.mode === "average") {
      return compareSpec.months === 1 ? "vs mes anterior" : `vs prom. de ${compareSpec.months} meses`;
    }
    return "";
  }, [compareSpec]);

  // Campos del modal -- son borrador, no se aplican solos: "Aplicar" es lo
  // único que los sube a compareSpec (así no queda ambiguo cuál de los 2
  // modos rige si tocás los controles de los dos). Arrancan en lo ya
  // aplicado antes, o en valores por defecto razonables si no había nada.
  const [localMode, setLocalMode] = useState(compareSpec.mode === "specific" ? "specific" : "average");
  const [months, setMonths] = useState(compareSpec.months || 1);
  const [specMonth, setSpecMonth] = useState(() => compareSpec.specificMonth?.month
    || (viewMonth.getMonth() === 0 ? 12 : viewMonth.getMonth()));
  const [specYear, setSpecYear] = useState(() => compareSpec.specificMonth?.year
    || (viewMonth.getMonth() === 0 ? viewMonth.getFullYear() - 1 : viewMonth.getFullYear()));

  // No tiene sentido comparar viewMonth contra sí mismo ni contra algo
  // futuro -- maxYear/lastValidMonthIndex acotan las opciones de "mes
  // específico" a estrictamente antes de viewMonth. getMonth() es 0-based,
  // así que para viewMonth=octubre (9) los meses válidos del año actual son
  // 1..9 (ene-sep).
  const maxYear = viewMonth.getFullYear();
  const lastValidMonthIndex = viewMonth.getMonth(); // 0 = ningún mes válido en maxYear (enero)
  const yearOptions = Array.from({ length: 6 }, (_, i) => maxYear - i).filter((y) => y < maxYear || lastValidMonthIndex > 0);
  const monthOptions = specYear === maxYear ? MONTH_NAMES.slice(0, lastValidMonthIndex) : MONTH_NAMES;

  // Si viewMonth cambia (navegás de mes) y lo ya elegido queda fuera de
  // rango, lo corrige solo en vez de dejar un select con un valor que ya no
  // está entre sus opciones.
  useEffect(() => {
    if (!yearOptions.includes(specYear)) {
      setSpecYear(yearOptions[0]);
      return;
    }
    const maxMonth = specYear === maxYear ? lastValidMonthIndex : 12;
    if (specMonth > maxMonth) setSpecMonth(maxMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth]);

  // Si se cierra el modal sin "Aplicar" (X, click afuera), lo que se haya
  // tocado en los controles queda descartado -- al volver a abrirlo tiene
  // que reflejar lo que de verdad está aplicado (compareSpec), no un
  // cambio a medio hacer que se abandonó la vez anterior.
  useEffect(() => {
    if (!compareOpen) return;
    setLocalMode(compareSpec.mode === "specific" ? "specific" : "average");
    setMonths(compareSpec.months || 1);
    setSpecMonth(compareSpec.specificMonth?.month || (viewMonth.getMonth() === 0 ? 12 : viewMonth.getMonth()));
    setSpecYear(compareSpec.specificMonth?.year || (viewMonth.getMonth() === 0 ? viewMonth.getFullYear() - 1 : viewMonth.getFullYear()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareOpen]);

  // Si cambiás de mes o de tipo, las porciones son otras — no tiene sentido
  // que quede resaltada una selección de un gráfico que ya no existe.
  useEffect(() => setSelectedKey(null), [type, viewMonth]);

  const swipeHandlers = useMonthSwipe(viewMonth, setViewMonth);
  const slide = useMonthSlide(viewMonth);

  // Fase 2 de multi-moneda (ver MULTI_CURRENCY_PLAN.md): la torta mezclaría
  // categorías de monedas distintas en un solo número si no elegís con
  // cuál mirarla. Sin persistir, arranca en la principal.
  const [currency, setCurrency] = useState(settings.main_currency);
  const currencies = currenciesInUse(accounts, settings);

  const { incomeTotals, expenseTotals, incomeLoading, expenseLoading, monthTxCount, comparisons } = useStatsCategoryTotals(userId, viewMonth, filters, currency, accounts, compareSpec);
  const totals = type === "income" ? incomeTotals : expenseTotals;
  const loading = type === "income" ? incomeLoading : expenseLoading;
  const incomeSum = useMemo(() => incomeTotals.reduce((s, t) => s + t.total, 0), [incomeTotals]);
  const expenseSum = useMemo(() => expenseTotals.reduce((s, t) => s + t.total, 0), [expenseTotals]);

  const comparisonMap = useMemo(() => {
    const m = new Map();
    for (const c of (type === "income" ? comparisons.income : comparisons.expense)) m.set(c.category_id, c);
    return m;
  }, [comparisons, type]);

  const { rows, total } = useMemo(() => {
    // Una fila por categoría ya (la vista agrega por categoría/tipo/mes y ya
    // viene convertida a la moneda principal — `total` acá es `amount_main`).
    const rows = totals
      .map((t) => {
        const cat = categories.find((c) => c.id === t.category_id);
        return { categoryId: t.category_id, name: cat?.name || "Sin categoría", icon: cat?.icon, amount: t.total };
      })
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, total };
  }, [totals, categories]);

  // Cada categoría se muestra individualmente (nunca se pierde su ícono/
  // nombre) — lo único limitado es la cantidad de COLORES distintos en la
  // torta: pasado el 8vo puesto se repite el gris neutro en vez de inventar
  // una 9na tonalidad (indistinguible bajo daltonismo), pero cada una sigue
  // siendo su propia porción/fila.
  const slices = useMemo(() => rows.map((r, i) => ({ ...r, color: i < 8 ? SLICE_COLORS[i] : OTHER_COLOR })), [rows]);

  let angle = 0;
  const arcs = slices.map((s) => {
    const pct = total > 0 ? s.amount / total : 0;
    const startAngle = angle;
    const endAngle = angle + pct * 360;
    angle = endAngle;
    return { ...s, pct, startAngle, endAngle };
  });

  return (
    <div style={{ ...styles.screen, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5 }}>
        <RootHeader
          title="Estadísticas"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <TodayButton viewMonth={viewMonth} setViewMonth={setViewMonth} />
              {/* Con una sola moneda en uso, el popover de HeaderMenu termina
                  mostrando una sola fila ("Filtros") -- indirección sin
                  motivo, mejor ir directo. Con más de una moneda sí hace
                  falta el popover (ahí también vive el selector de moneda). */}
              {currencies.length > 1 ? (
                <HeaderMenu
                  trigger={<><SlidersHorizontal size={19} />{filtering && <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: "#C75D3B" }} />}</>}
                  items={[{ icon: <SlidersHorizontal size={16} color="#6B6355" />, label: "Filtros", onClick: onOpenFilters, badge: filtering }]}
                  currencies={currencies}
                  currency={currency}
                  onChangeCurrency={setCurrency}
                />
              ) : (
                <button style={{ ...styles.iconBtnGhost, position: "relative" }} onClick={onOpenFilters} aria-label="Filtros">
                  <SlidersHorizontal size={19} />
                  {filtering && <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: "#C75D3B" }} />}
                </button>
              )}
              <button style={{ ...styles.iconBtnGhost, position: "relative" }} onClick={() => setCompareOpen(true)} aria-label="Comparar">
                <GitCompare size={19} />
                {compareSpec.mode !== "off" && <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: "#C75D3B" }} />}
              </button>
              <button style={styles.iconBtnGhost} onClick={onOpenSearch} aria-label="Buscar">
                <Search size={19} />
              </button>
            </div>
          }
        />
        <div style={styles.subHeader} {...swipeHandlers}>
          <MonthNav viewMonth={viewMonth} setViewMonth={setViewMonth} />
          <SegmentedControl
            options={[
              {
                value: "income", color: "#3B6E62",
                label: () => (
                  <>
                    <span>Ingresos</span>
                    {/* El monto siempre va en su color semántico (verde),
                        esté o no activa esta opción -- a diferencia del
                        diseño viejo (relleno sólido), acá la píldora activa
                        ya es blanca, no hace falta pasar a blanco el texto
                        para que se siga leyendo. */}
                    <span style={{ color: "#3B6E62" }}>{money(incomeSum, currency)}</span>
                  </>
                ),
              },
              {
                value: "expense",
                label: () => (
                  <>
                    <span>Gastos</span>
                    <span style={{ color: "#B0473A" }}>{money(expenseSum, currency)}</span>
                  </>
                ),
              },
            ]}
            value={type}
            onChange={setType}
          />
        </div>
      </div>
      <div key={slide.key} className={slide.className} style={{ ...styles.form, flex: 1, paddingTop: 12 }} {...swipeHandlers}>
        {/* Un solo div envolviendo banner+contenido — mismo motivo que en
            DiarioTab: así el espacio de abajo del banner se controla acá
            (marginBottom) en vez de heredar también el gap:14 del form
            padre, y mide lo mismo que el padding-top de arriba (12px). */}
        <div>
        {(filtering || compareSpec.mode !== "off") && (
          <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
            {filtering && <div style={{ flex: 1 }}><FiltersActiveBanner onOpen={onOpenFilters} onClear={onClearFilters} /></div>}
            {compareSpec.mode !== "off" && (
              <div style={{ flex: 1 }}>
                <CompareActiveBanner onOpen={() => setCompareOpen(true)} onClear={() => setCompareSpec((s) => ({ ...s, mode: "off" }))} />
              </div>
            )}
          </div>
        )}
        {loading ? (
          <EmptyState title="Cargando…" />
        ) : arcs.length === 0 ? (
          <EmptyState title={filtering && monthTxCount > 0 ? "Nada coincide con el filtro" : "Nada registrado este mes"}>
            {filtering && monthTxCount > 0 ? "Probá cambiando los filtros." : `${type === "income" ? "Ingresos" : "Gastos"} de ${MONTH_LABEL(viewMonth)} van a aparecer acá.`}
          </EmptyState>
        ) : (
          <div onClick={() => setSelectedKey(null)}>
            <svg viewBox="0 0 200 200" style={{ display: "block", width: 220, height: 220, margin: "8px auto" }}>
              {arcs.map((a) => {
                const key = a.categoryId || a.name;
                return (
                  <path
                    key={key}
                    d={arcPath(100, 100, 96, a.startAngle, a.endAngle)}
                    fill={a.color}
                    stroke="#FBF8F2"
                    strokeWidth={selectedKey === key ? 4 : 2}
                    opacity={selectedKey && selectedKey !== key ? 0.5 : 1}
                    onClick={(e) => { e.stopPropagation(); setSelectedKey((prev) => (prev === key ? null : key)); }}
                    style={{ cursor: "pointer" }}
                  />
                );
              })}
              {arcs.filter((a) => a.pct >= 0.06).map((a) => {
                // Con un solo valor (100%) no hay "medio del arco" — el
                // punto va directo al centro, no desplazado hacia un ángulo.
                const isFullCircle = a.endAngle - a.startAngle >= 359.99;
                const mid = (a.startAngle + a.endAngle) / 2;
                const p = isFullCircle ? { x: 100, y: 100 } : polarToCartesian(100, 100, 64, mid);
                return (
                  <text key={`label-${a.categoryId || a.name}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none" }}>
                    {Math.round(a.pct * 100)}%
                  </text>
                );
              })}
            </svg>

            {compareSpec.mode !== "off" && <CompareHeader expectedPct={monthProgress} label={compareLabel} />}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {arcs.map((a) => {
                const key = a.categoryId || a.name;
                const isSelected = selectedKey === key;
                const comparison = compareSpec.mode !== "off" ? comparisonMap.get(a.categoryId ?? null) : null;
                return (
                  <div
                    key={key}
                    onClick={(e) => { e.stopPropagation(); onDrillDown({ categoryId: a.categoryId || null, categoryName: a.name, categoryIcon: a.icon, type, currency }); }}
                    style={{
                      padding: "8px 4px", borderBottom: "1px solid #F0EBE2",
                      background: isSelected ? "#F3EFE5" : "transparent", borderRadius: isSelected ? 8 : 0, cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 12, height: 12, minWidth: 12, borderRadius: 3, background: a.color }} />
                      <span style={{ width: 18, minWidth: 18, fontSize: 15, textAlign: "center", lineHeight: 1 }}>{a.icon || ""}</span>
                      <span style={{ flex: 1, fontSize: 14, fontFamily: "system-ui, sans-serif", minWidth: 0 }}>{a.name}</span>
                      {compareSpec.mode === "off" && (
                        <span style={{ fontSize: 12.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", minWidth: 38, textAlign: "right" }}>{Math.round(a.pct * 100)}%</span>
                      )}
                      <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "system-ui, sans-serif", minWidth: 76, textAlign: "right" }}>{money(a.amount, currency)}</span>
                    </div>
                    {comparison && (
                      <ComparisonBar current={comparison.current} baseline={comparison.baseline} expectedPct={monthProgress} currency={currency} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>

      {compareOpen && (
        <Modal title="Comparar con" onClose={() => setCompareOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Selector de modo tipo pestañas -- solo uno de los dos está
                "activo" a la vez acá adentro, para que no quede ambiguo cuál
                de los dos se aplica si tocás los dos controles (ver feedback
                de Nicolas). "Aplicar" siempre usa el que está seleccionado
                acá, no el que tenía cargado antes. */}
            <SegmentedControl
              options={[
                { value: "average", label: "Promedio de N meses" },
                { value: "specific", label: "Mes específico" },
              ]}
              value={localMode}
              onChange={setLocalMode}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", lineHeight: 1.4 }}>
                {localMode === "average"
                  ? (months === 1 ? "Promedio de gasto del último mes." : `Promedio de gasto de los últimos ${months} meses.`)
                  : "Compara el gasto de este mes contra el mes que elijas."}
              </p>
              {localMode === "average" ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, height: 44, boxSizing: "border-box" }}>
                  <button style={styles.iconBtnGhost} onClick={() => setMonths((m) => Math.max(1, m - 1))} aria-label="Menos meses">
                    <Minus size={16} />
                  </button>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "system-ui, sans-serif", minWidth: 70, textAlign: "center" }}>
                    {months} {months === 1 ? "mes" : "meses"}
                  </span>
                  <button style={styles.iconBtnGhost} onClick={() => setMonths((m) => Math.min(24, m + 1))} aria-label="Más meses">
                    <Plus size={16} />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, height: 44, boxSizing: "border-box" }}>
                  <select style={{ ...styles.input, flex: 1.4, height: 44, boxSizing: "border-box" }} value={specMonth} onChange={(e) => setSpecMonth(parseInt(e.target.value, 10))}>
                    {monthOptions.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                  </select>
                  <select
                    style={{ ...styles.input, flex: 1, height: 44, boxSizing: "border-box" }}
                    value={specYear}
                    onChange={(e) => {
                      const y = parseInt(e.target.value, 10);
                      setSpecYear(y);
                      const maxMonth = y === maxYear ? lastValidMonthIndex : 12;
                      if (specMonth > maxMonth) setSpecMonth(maxMonth);
                    }}
                  >
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Mockup de ejemplo, con números para explicar cada parte de
                una fila real -- datos inventados, no se recalculan con
                nada real de la app. */}
            <div style={{ border: "1px solid #ECE3D3", borderRadius: 12, padding: "12px 14px", background: "#FAF7F2", display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "#544A3C", fontFamily: "system-ui, sans-serif" }}>
                Así se ve cada categoría con la comparación activa:
              </p>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 12, height: 12, minWidth: 12, borderRadius: 3, background: "#2a78d6" }} />
                  <span style={{ width: 18, minWidth: 18, fontSize: 15, textAlign: "center", lineHeight: 1 }}>🏠</span>
                  <span style={{ flex: 1, fontSize: 14, fontFamily: "system-ui, sans-serif" }}>Categoría ①</span>
                  <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap" }}>€150,00 ②</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <div style={{ position: "relative", flex: 1, height: 6, borderRadius: 3, background: "#ECE3D3", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "65%", background: "#C9A24B", borderRadius: 3 }} />
                    <div style={{ position: "absolute", left: "55%", top: -1, bottom: -1, width: 2, background: "#2B2620" }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#6B6355", fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>③</span>
                  <span style={{ fontSize: 11, color: "#6B6355", fontFamily: "system-ui, sans-serif", flexShrink: 0, whiteSpace: "nowrap" }}>€120,00 (125%) ④</span>
                </div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
                <li style={{ fontSize: 11.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", lineHeight: 1.4 }}>① Ícono y nombre de la categoría.</li>
                <li style={{ fontSize: 11.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", lineHeight: 1.4 }}>② Cuánto gastaste ahí este mes.</li>
                <li style={{ fontSize: 11.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", lineHeight: 1.4 }}>③ Tu ritmo: el color dice si vas bien (verde), al día (ámbar) o alto (rojo); la marca negra señala qué tan avanzado está el mes (lo mismo que "Hoy" arriba de la lista).</li>
                <li style={{ fontSize: 11.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", lineHeight: 1.4 }}>④ Cuánto gastaste ahí en el período de comparación, y qué porcentaje de eso ya llevás.</li>
              </ul>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }}
                onClick={() => { setCompareSpec((s) => ({ ...s, mode: "off" })); setCompareOpen(false); }}
              >
                Quitar
              </button>
              <button
                style={{ ...styles.btnPrimary, flex: 1, marginTop: 0 }}
                onClick={() => {
                  setCompareSpec((s) => (localMode === "average"
                    ? { ...s, mode: "average", months }
                    : { ...s, mode: "specific", specificMonth: { year: specYear, month: specMonth } }));
                  setCompareOpen(false);
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
