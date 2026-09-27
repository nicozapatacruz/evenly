import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { RootHeader } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { toMainCurrency } from "../../lib/moneyManagerData.js";

const MONTH_LABEL = (d) => d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
const DAY_LABEL = (d) => d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");

/* =========================================================================
   HOY (Diario) — lista de transacciones del mes, agrupadas por día. Ojo:
   simplificado a propósito frente a la app original — ahí este tab también
   tiene sub-vistas de Calendario/Mensual/Resumen que acá no replicamos.
   ========================================================================= */

export default function DiarioTab({ settings, groups, accounts, categories, transactions, viewMonth, setViewMonth, onNewTransaction }) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const categoryName = (id) => categories.find((c) => c.id === id)?.name || "—";

  const monthTx = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === viewMonth.getFullYear() && d.getMonth() === viewMonth.getMonth();
    });
  }, [transactions, viewMonth]);

  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + toMainCurrency(t.amount, t.currency, settings), 0);
  const monthExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + toMainCurrency(t.amount, t.currency, settings), 0);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const t of monthTx) {
      const key = new Date(t.date).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [monthTx]);

  return (
    <div style={styles.screen}>
      <RootHeader title="Hoy" />
      <div style={{ ...styles.form, paddingTop: 12, paddingBottom: 100 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button style={styles.iconBtnGhost} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} aria-label="Mes anterior">
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontWeight: 600, fontFamily: "system-ui, sans-serif", textTransform: "capitalize" }}>{MONTH_LABEL(viewMonth)}</span>
          <button style={styles.iconBtnGhost} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} aria-label="Mes siguiente">
            <ChevronRight size={20} />
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", padding: "0 4px" }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, fontSize: 12 }}>Ingreso</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#3B6E62" }}>{money(monthIncome, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, fontSize: 12 }}>Gastos</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#B0473A" }}>{money(monthExpense, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, fontSize: 12 }}>Balance</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(monthIncome - monthExpense, settings.main_currency)}</p>
          </div>
        </div>

        {byDay.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Nada registrado este mes</p>
            <p style={{ ...styles.muted, padding: 0 }}>Tocá el "+" de abajo para anotar un ingreso, gasto o transferencia.</p>
          </div>
        )}

        {byDay.map(([dayKey, txs]) => {
          const d = new Date(dayKey + "T12:00:00");
          const dayIncome = txs.filter((t) => t.type === "income").reduce((s, t) => s + toMainCurrency(t.amount, t.currency, settings), 0);
          const dayExpense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + toMainCurrency(t.amount, t.currency, settings), 0);
          return (
            <div key={dayKey} style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "#FAF7F2", borderBottom: "1px solid #F0EBE2", fontFamily: "system-ui, sans-serif" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{d.getDate()} <span style={{ fontWeight: 400, color: "#6B6355", textTransform: "capitalize" }}>{DAY_LABEL(d)}</span></span>
                <span style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: "#3B6E62" }}>{money(dayIncome, settings.main_currency)}</span>
                  <span style={{ color: "#B0473A" }}>{money(dayExpense, settings.main_currency)}</span>
                </span>
              </div>
              {txs.map((t) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{t.type === "transfer" ? (t.title || "Transferencia") : (t.title || categoryName(t.category_id))}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#6B6355" }}>
                      {t.type === "transfer" ? `${accountName(t.account_id)} → ${accountName(t.to_account_id)}` : accountName(t.account_id)}
                    </p>
                  </div>
                  <span style={{ color: t.type === "income" ? "#3B6E62" : t.type === "expense" ? "#B0473A" : "#4A6FA5", fontWeight: 600, flexShrink: 0 }}>
                    {money(t.amount, t.currency)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button style={{ ...styles.fab, bottom: "calc(78px + env(safe-area-inset-bottom))" }} onClick={onNewTransaction} aria-label="Nueva transacción">
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
