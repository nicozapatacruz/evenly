import React, { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { money, measureTextWidth, dateInputValueInZone } from "../../lib/helpers.jsx";

const DAY_AMOUNTS_FONT = "12.5px system-ui, sans-serif";
const DAY_LABEL = (d) => d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");

// Lista de transacciones agrupada por día — compartida entre Transacciones
// (el mes completo) y el drill-down de categoría de Estadísticas (una
// categoría puntual), para no duplicar el bloque de filas (ícono, cuenta
// tachada si está eliminada, montos, click-para-editar).
export function TransactionDayGroups({ transactions, settings, accounts, categories, onNewTransaction, onEditTransaction }) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const accountDeleted = (id) => !!accounts.find((a) => a.id === id)?.deleted;
  const categoryIcon = (id) => categories.find((c) => c.id === id)?.icon;
  const categoryDeleted = (id) => !!categories.find((c) => c.id === id)?.deleted;

  const accountLabel = (id) => (
    <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, ...(accountDeleted(id) ? { textDecoration: "line-through", color: "#B0473A" } : null) }}>
      {accountName(id)}
      {accountDeleted(id) && <Trash2 size={11} style={{ flexShrink: 0 }} />}
    </span>
  );

  const maxExpenseWidth = useMemo(
    () => Math.ceil(measureTextWidth(money(999999.99, settings.main_currency), DAY_AMOUNTS_FONT)),
    [settings.main_currency]
  );

  const byDay = useMemo(() => {
    const map = new Map();
    for (const t of transactions) {
      const key = dateInputValueInZone(new Date(t.date).getTime(), t.timezone);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [transactions]);

  return (
    <>
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
    </>
  );
}
