import React, { useMemo, useState } from "react";
import { styles } from "../../lib/styles.js";
import { RootHeader, MonthNav, TodayButton } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { toMainCurrency, useCategoryMonthTotals } from "../../lib/moneyManagerData.js";

const MONTH_LABEL = (d) => d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

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
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export default function EstadisticasTab({ userId, settings, categories, viewMonth, setViewMonth }) {
  const [type, setType] = useState("expense");

  // Totales ya agregados por categoría del lado del servidor (vista
  // mm_category_month_totals) — no traemos transacción por transacción.
  const { totals } = useCategoryMonthTotals(userId, viewMonth, type);

  const { rows, total } = useMemo(() => {
    const byCategory = new Map();
    for (const t of totals) {
      const amt = toMainCurrency(t.total, t.currency, settings);
      byCategory.set(t.category_id, (byCategory.get(t.category_id) || 0) + amt);
    }
    const rows = [...byCategory.entries()]
      .map(([categoryId, amount]) => ({ categoryId, name: categories.find((c) => c.id === categoryId)?.name || "Sin categoría", amount }))
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, total };
  }, [totals, categories, settings]);

  const slices = useMemo(() => {
    const head = rows.slice(0, 8).map((r, i) => ({ ...r, color: SLICE_COLORS[i] }));
    const tail = rows.slice(8);
    if (tail.length) {
      head.push({ name: "Otros", amount: tail.reduce((s, r) => s + r.amount, 0), color: OTHER_COLOR });
    }
    return head;
  }, [rows]);

  let angle = 0;
  const arcs = slices.map((s) => {
    const pct = total > 0 ? s.amount / total : 0;
    const startAngle = angle;
    const endAngle = angle + pct * 360;
    angle = endAngle;
    return { ...s, pct, startAngle, endAngle };
  });

  return (
    <div style={styles.screen}>
      <RootHeader title="Estadísticas" right={<TodayButton viewMonth={viewMonth} setViewMonth={setViewMonth} />} />
      <div style={{ ...styles.form, paddingTop: 12 }}>
        <MonthNav viewMonth={viewMonth} setViewMonth={setViewMonth} />

        <div style={styles.tabRow}>
          <button style={type === "income" ? { ...styles.tabActive, background: "#3B6E62", borderColor: "#3B6E62" } : styles.tab} onClick={() => setType("income")}>
            Ingreso
          </button>
          <button style={type === "expense" ? styles.tabActive : styles.tab} onClick={() => setType("expense")}>
            Gastos
          </button>
        </div>

        {arcs.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Nada registrado este mes</p>
            <p style={{ ...styles.muted, padding: 0 }}>{type === "income" ? "Ingresos" : "Gastos"} de {MONTH_LABEL(viewMonth)} van a aparecer acá.</p>
          </div>
        ) : (
          <>
            <svg viewBox="0 0 200 200" style={{ width: 220, height: 220, margin: "8px auto" }}>
              {arcs.map((a) => (
                <path key={a.categoryId || a.name} d={arcPath(100, 100, 96, a.startAngle, a.endAngle)} fill={a.color} stroke="#FBF8F2" strokeWidth={2} />
              ))}
              {arcs.filter((a) => a.pct >= 0.06).map((a) => {
                const mid = (a.startAngle + a.endAngle) / 2;
                const p = polarToCartesian(100, 100, 64, mid);
                return (
                  <text key={`label-${a.categoryId || a.name}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
                    {Math.round(a.pct * 100)}%
                  </text>
                );
              })}
            </svg>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {arcs.map((a) => (
                <div key={a.categoryId || a.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid #F0EBE2" }}>
                  <span style={{ width: 12, height: 12, minWidth: 12, borderRadius: 3, background: a.color }} />
                  <span style={{ flex: 1, fontSize: 14, fontFamily: "system-ui, sans-serif", minWidth: 0 }}>{a.name}</span>
                  <span style={{ fontSize: 12.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", minWidth: 38, textAlign: "right" }}>{Math.round(a.pct * 100)}%</span>
                  <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "system-ui, sans-serif", minWidth: 76, textAlign: "right" }}>{money(a.amount, settings.main_currency)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
