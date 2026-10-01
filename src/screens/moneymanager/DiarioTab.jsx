import React from "react";
import { Plus, Search } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { RootHeader, MonthNav, TodayButton, useMonthSwipe, useMonthSlide } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { useMonthTransactions } from "../../lib/moneyManagerData.js";
import { TransactionDayGroups } from "./TransactionDayGroups.jsx";

/* =========================================================================
   TRANSACCIONES (ex "Hoy"/Diario) — lista de transacciones del mes,
   agrupadas por día. Ojo: simplificado a propósito frente a la app
   original — ahí este tab también tiene sub-vistas de Calendario/Mensual/
   Resumen que acá no replicamos.
   ========================================================================= */

export default function DiarioTab({ userId, settings, groups, accounts, categories, viewMonth, setViewMonth, onNewTransaction, onEditTransaction, onOpenSearch }) {
  // Solo pedimos las transacciones del mes visible (no toda la tabla) — se
  // refetchea solo cuando cambiás de mes.
  const { transactions: monthTx, loading } = useMonthTransactions(userId, viewMonth);
  const swipeHandlers = useMonthSwipe(viewMonth, setViewMonth);
  const slide = useMonthSlide(viewMonth);

  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
  const monthExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + (t.amount_main ?? t.amount), 0);

  return (
    <div style={{ ...styles.screen, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5 }}>
        <RootHeader
          title="Transacciones"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button style={styles.iconBtnGhost} onClick={onOpenSearch} aria-label="Buscar">
                <Search size={19} />
              </button>
              <TodayButton viewMonth={viewMonth} setViewMonth={setViewMonth} />
            </div>
          }
        />
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
        ) : monthTx.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Nada registrado este mes</p>
            <p style={{ ...styles.muted, padding: 0 }}>Tocá el "+" de abajo para anotar un ingreso, gasto o transferencia.</p>
          </div>
        ) : (
          <TransactionDayGroups
            transactions={monthTx}
            settings={settings}
            accounts={accounts}
            categories={categories}
            onNewTransaction={onNewTransaction}
            onEditTransaction={onEditTransaction}
          />
        )}
      </div>

      <button style={{ ...styles.fab, bottom: "calc(78px + env(safe-area-inset-bottom))" }} onClick={() => onNewTransaction()} aria-label="Nueva transacción">
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
