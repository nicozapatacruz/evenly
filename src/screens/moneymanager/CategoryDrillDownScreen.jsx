import React, { useMemo } from "react";
import { Plus } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { TopBar, MonthNav, useMonthSwipe, useMonthSlide } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { useMonthTransactions, useCategoryTimeline } from "../../lib/moneyManagerData.js";
import { TransactionDayGroups } from "./TransactionDayGroups.jsx";

const MONTH_SHORT = (year, month) => new Date(year, month - 1, 1).toLocaleDateString("es-ES", { month: "short" }).replace(".", "");

// Ventana de meses alrededor del mes visible — 3 antes, el actual, 3 después.
// No replica el scroll infinito de la app original (el botón "»"), pero sí
// lo esencial: una línea de tiempo por mes de esta categoría, clickeable
// para saltar a cualquiera de esos meses.
function buildWindow(viewMonth) {
  const months = [];
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
}

function CategoryTimelineChart({ totals, viewMonth, setViewMonth, color, settings }) {
  const monthsWindow = useMemo(() => buildWindow(viewMonth), [viewMonth]);
  const points = monthsWindow.map(({ year, month }) => ({
    year, month,
    total: totals.find((t) => t.year === year && t.month === month)?.total || 0,
  }));
  const max = Math.max(...points.map((p) => p.total), 0.01);

  const width = 320;
  const height = 150;
  const padX = 20;
  const padTop = 24;
  const padBottom = 24;
  const plotHeight = height - padTop - padBottom;
  const stepX = (width - padX * 2) / (points.length - 1);

  const coords = points.map((p, i) => ({
    ...p,
    x: padX + i * stepX,
    y: padTop + plotHeight - (p.total / max) * plotHeight,
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
      {coords.map((c) => {
        const isSelected = c.year === viewMonth.getFullYear() && c.month === viewMonth.getMonth() + 1;
        return (
          <g
            key={`${c.year}-${c.month}`}
            onClick={() => setViewMonth(new Date(c.year, c.month - 1, 1))}
            style={{ cursor: "pointer" }}
          >
            {/* Columna invisible más ancha que el puntico — hace el blanco de
                click cómodo en mobile sin agrandar el punto visualmente. */}
            <rect x={c.x - stepX / 2} y={0} width={stepX} height={height} fill="transparent" />
            <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={color} fontFamily="system-ui, sans-serif">
              {money(c.total, settings.main_currency)}
            </text>
            <circle cx={c.x} cy={c.y} r={isSelected ? 6 : 4} fill={isSelected ? "#fff" : color} stroke={color} strokeWidth={2} />
            <text x={c.x} y={height - 6} textAnchor="middle" fontSize="10" fill={isSelected ? color : "#A89A87"} fontWeight={isSelected ? 700 : 400} fontFamily="system-ui, sans-serif" style={{ textTransform: "capitalize" }}>
              {MONTH_SHORT(c.year, c.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Drill-down de una categoría puntual (Estadísticas → tocar una fila de la
// lista) — misma estructura visual que Transacciones (lista agrupada por
// día), pero filtrada a esta categoría/mes, con una línea de tiempo arriba
// para saltar entre meses sin volver atrás.
export default function CategoryDrillDownScreen({ userId, settings, accounts, categories, type, categoryId, categoryName, categoryIcon, viewMonth, setViewMonth, onBack, onNewTransaction, onEditTransaction }) {
  const { transactions: monthTx, loading: loadingMonth } = useMonthTransactions(userId, viewMonth);
  const { totals, loading: loadingTimeline } = useCategoryTimeline(userId, type, categoryId);
  const swipeHandlers = useMonthSwipe(viewMonth, setViewMonth);
  const slide = useMonthSlide(viewMonth);

  const categoryTx = monthTx.filter((t) => t.type === type && (categoryId ? t.category_id === categoryId : !t.category_id));
  const color = type === "income" ? "#3B6E62" : "#B0473A";
  const monthTotal = categoryTx.reduce((s, t) => s + (t.amount_main ?? t.amount), 0);

  return (
    <div style={{ ...styles.screen, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#FBF8F2" }}>
        <TopBar
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{categoryIcon && <span>{categoryIcon}</span>} {categoryName}</span>}
          onBack={onBack}
        />
        <div style={{ ...styles.subHeader }} {...swipeHandlers}>
          <MonthNav viewMonth={viewMonth} setViewMonth={setViewMonth} />
        </div>
        {!loadingTimeline && (
          <div style={{ padding: "4px 14px 0" }}>
            <CategoryTimelineChart totals={totals} viewMonth={viewMonth} setViewMonth={setViewMonth} color={color} settings={settings} />
          </div>
        )}
      </div>
      <div key={slide.key} className={slide.className} style={{ ...styles.form, flex: 1, paddingTop: 12, paddingBottom: 100 }} {...swipeHandlers}>
        {loadingMonth ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Cargando…</p>
          </div>
        ) : categoryTx.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Nada registrado este mes</p>
            <p style={{ ...styles.muted, padding: 0 }}>{categoryName} de {MONTH_SHORT(viewMonth.getFullYear(), viewMonth.getMonth() + 1)} va a aparecer acá.</p>
          </div>
        ) : (
          <>
            <p style={{ ...styles.muted, padding: 0, margin: "0 0 4px", textAlign: "right" }}>
              Total del mes: <strong style={{ color }}>{money(monthTotal, settings.main_currency)}</strong>
            </p>
            <TransactionDayGroups
              transactions={categoryTx}
              settings={settings}
              accounts={accounts}
              categories={categories}
              onNewTransaction={onNewTransaction}
              onEditTransaction={onEditTransaction}
            />
          </>
        )}
      </div>

      <button style={{ ...styles.fab, bottom: "calc(78px + env(safe-area-inset-bottom))" }} onClick={() => onNewTransaction()} aria-label="Nueva transacción">
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
