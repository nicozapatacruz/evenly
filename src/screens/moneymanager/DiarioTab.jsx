import React, { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { RootHeader, MonthNav, TodayButton, useMonthSwipe, useMonthSlide } from "../../components/Shared.jsx";
import { money, measureTextWidth, dateInputValueInZone } from "../../lib/helpers.jsx";
import { useMonthTransactions } from "../../lib/moneyManagerData.js";

const DAY_AMOUNTS_FONT = "12.5px system-ui, sans-serif";

const DAY_LABEL = (d) => d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");

/* =========================================================================
   TRANSACCIONES (ex "Hoy"/Diario) — lista de transacciones del mes,
   agrupadas por día. Ojo: simplificado a propósito frente a la app
   original — ahí este tab también tiene sub-vistas de Calendario/Mensual/
   Resumen que acá no replicamos.
   ========================================================================= */

export default function DiarioTab({ userId, settings, groups, accounts, categories, viewMonth, setViewMonth, onNewTransaction, onEditTransaction }) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const accountDeleted = (id) => !!accounts.find((a) => a.id === id)?.deleted;
  const categoryIcon = (id) => categories.find((c) => c.id === id)?.icon;
  const categoryDeleted = (id) => !!categories.find((c) => c.id === id)?.deleted;

  // Cuentas no tienen un ícono propio en esta fila (a diferencia de
  // categoría) — se marca directo sobre el texto: tachado, rojo, con el
  // ícono de basura al lado.
  const accountLabel = (id) => (
    <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, ...(accountDeleted(id) ? { textDecoration: "line-through", color: "#B0473A" } : null) }}>
      {accountName(id)}
      {accountDeleted(id) && <Trash2 size={11} style={{ flexShrink: 0 }} />}
    </span>
  );

  // Solo pedimos las transacciones del mes visible (no toda la tabla) — se
  // refetchea solo cuando cambiás de mes.
  const { transactions: monthTx, loading } = useMonthTransactions(userId, viewMonth);
  const swipeHandlers = useMonthSwipe(viewMonth, setViewMonth);
  const slide = useMonthSlide(viewMonth);

  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
  const monthExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + (t.amount_main ?? t.amount), 0);

  // Ancho reservado para el monto en rojo — el que ocuparía el máximo
  // "razonable" (999.999,99), para que el gasto de cada día empiece siempre
  // en el mismo punto y no dependa del ancho del ingreso de ese día en
  // particular. Si un monto real es más ancho que eso, no se corta — el
  // minWidth es un piso, no un techo, así que empuja el ingreso a la izquierda.
  const maxExpenseWidth = useMemo(
    () => Math.ceil(measureTextWidth(money(999999.99, settings.main_currency), DAY_AMOUNTS_FONT)),
    [settings.main_currency]
  );

  const byDay = useMemo(() => {
    const map = new Map();
    for (const t of monthTx) {
      // Agrupar por día según la zona horaria PROPIA de la transacción (con
      // la que se creó), no la de quien la está mirando ahora — así "dónde
      // estoy" solo importa al crear un registro, nunca al verlo o editarlo.
      const key = dateInputValueInZone(new Date(t.date).getTime(), t.timezone);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [monthTx]);

  return (
    <div style={{ ...styles.screen, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5 }}>
        <RootHeader title="Transacciones" right={<TodayButton viewMonth={viewMonth} setViewMonth={setViewMonth} />} />
        <div style={styles.subHeader} {...swipeHandlers}>
          <MonthNav viewMonth={viewMonth} setViewMonth={setViewMonth} />
          <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", padding: "0 4px" }}>
            <div style={{ flex: 1 }}>
              <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Ingreso</p>
              <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#3B6E62" }}>{money(monthIncome, settings.main_currency)}</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Gastos</p>
              <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#B0473A" }}>{money(monthExpense, settings.main_currency)}</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Balance</p>
              <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(monthIncome - monthExpense, settings.main_currency)}</p>
            </div>
          </div>
        </div>
      </div>
      <div key={slide.key} className={slide.className} style={{ ...styles.form, flex: 1, paddingTop: 12, paddingBottom: 100 }} {...swipeHandlers}>
        {loading ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Cargando transacciones…</p>
          </div>
        ) : byDay.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Nada registrado este mes</p>
            <p style={{ ...styles.muted, padding: 0 }}>Tocá el "+" de abajo para anotar un ingreso, gasto o transferencia.</p>
          </div>
        )}

        {byDay.map(([dayKey, txs]) => {
          const d = new Date(dayKey + "T12:00:00");
          const dayIncome = txs.filter((t) => t.type === "income").reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
          const dayExpense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
          return (
            <div key={dayKey} style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
              <div
                onClick={() => onNewTransaction(dayKey)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "#FAF7F2", borderBottom: "1px solid #F0EBE2", fontFamily: "system-ui, sans-serif", cursor: "pointer" }}
              >
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{d.getDate()} <span style={{ fontWeight: 400, color: "#6B6355", textTransform: "capitalize" }}>{DAY_LABEL(d)}</span></span>
                <span style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: "#3B6E62" }}>{money(dayIncome, settings.main_currency)}</span>
                  <span style={{ color: "#B0473A", minWidth: maxExpenseWidth, textAlign: "right" }}>{money(dayExpense, settings.main_currency)}</span>
                </span>
              </div>
              {txs.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onEditTransaction(t)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                    {t.type !== "transfer" && categoryIcon(t.category_id) && (
                      <span style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
                        <span style={{ fontSize: 18, lineHeight: 1, opacity: categoryDeleted(t.category_id) ? 0.5 : 1 }}>{categoryIcon(t.category_id)}</span>
                        {categoryDeleted(t.category_id) && (
                          <span style={{ position: "absolute", bottom: -3, right: -5, background: "#fff", borderRadius: "50%", padding: 1, display: "flex" }}>
                            <Trash2 size={10} color="#B0473A" />
                          </span>
                        )}
                      </span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      {t.type === "transfer" ? (
                        <>
                          <p style={{ margin: 0, fontWeight: 600 }}>{t.title || "Transferencia"}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#6B6355", display: "flex", alignItems: "center", gap: 4 }}>
                            {accountLabel(t.account_id)} → {accountLabel(t.to_account_id)}
                          </p>
                        </>
                      ) : t.title ? (
                        <>
                          <p style={{ margin: 0, fontWeight: 600 }}>{t.title}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#6B6355" }}>{accountLabel(t.account_id)}</p>
                        </>
                      ) : (
                        <p style={{ margin: 0, fontSize: 12, color: "#6B6355" }}>{accountLabel(t.account_id)}</p>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                    <span style={{ color: t.type === "income" ? "#3B6E62" : t.type === "expense" ? "#B0473A" : "#4A6FA5", fontWeight: 600 }}>
                      {money(t.amount, t.currency)}
                    </span>
                    {t.currency !== settings.main_currency && (
                      <span style={{ fontSize: 11, color: "#6B6355" }}>= {money(t.amount_main, settings.main_currency)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button style={{ ...styles.fab, bottom: "calc(78px + env(safe-area-inset-bottom))" }} onClick={() => onNewTransaction()} aria-label="Nueva transacción">
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
