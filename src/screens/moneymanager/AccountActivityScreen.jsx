import React, { useMemo } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { TopBar, MonthNav, useMonthSwipe, useMonthSlide } from "../../components/Shared.jsx";
import { money, measureTextWidth } from "../../lib/helpers.jsx";
import { useAccountMonthTransactions, useAccountMonthTotals } from "../../lib/moneyManagerData.js";
import { TransactionDayGroups } from "./TransactionDayGroups.jsx";

const MONTH_ABBR = (year, month) => new Date(year, month - 1, 1).toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
const monthKey = (year, month) => year * 100 + month;

// Suma de `net` de todos los meses ANTES de (year, month) — el saldo con el
// que arranca ese mes, sin traer nunca el historial completo transacción por
// transacción (la vista mm_account_month_totals ya viene agregada).
function balanceBefore(totals, year, month) {
  const key = monthKey(year, month);
  return totals.filter((t) => monthKey(t.year, t.month) < key).reduce((s, t) => s + t.net, 0);
}

/* =========================================================================
   EXTRACTO DE CUENTA — se abre al tocar una cuenta en el tab Cuentas.
   3 sub-vistas (Diario/Mensual/Anual), cada una con su propia granularidad
   de navegación — Diario un mes, Mensual un año completo, Anual todos los
   años con datos. Todo con saldo corriente (running balance), calculado a
   partir de los totales mensuales ya agregados en el servidor, no de traer
   cada transacción del historial completo.
   ========================================================================= */
// `tab`/`viewMonth` viven en el padre (no acá adentro) — esta pantalla se
// desmonta al abrir "nueva transacción"/"editar" (son pantallas propias) y
// se vuelve a montar al volver; si el tab/mes fueran estado local, se
// perderían en ese viaje de ida y vuelta.
export default function AccountActivityScreen({
  userId, settings, accounts, categories, slLinks, accountId, accountName, accountIcon,
  tab, setTab, viewMonth, setViewMonth, onBack, onNewTransaction, onEditTransaction,
}) {
  const { totals, loading: loadingTotals } = useAccountMonthTotals(userId, accountId);
  // Restricción dura (ver PENDIENTES.md sección B): esta pantalla siempre
  // está acotada a UNA cuenta, así que está siempre en SU moneda, nunca en
  // la principal global. En vez de tocar cada `settings.main_currency` de
  // los 3 sub-tabs de abajo (y de TransactionDayGroups, que también recibe
  // `settings`), se les pasa esta versión ya "pisada" con la moneda real de
  // la cuenta — ningún otro cambio hace falta ahí.
  const accountCurrency = accounts.find((a) => a.id === accountId)?.currency || settings.main_currency;
  const accountSettings = { ...settings, main_currency: accountCurrency };

  return (
    <div style={{ ...styles.screen, display: "flex", flexDirection: "column" }}>
      <TopBar title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{accountIcon && <span>{accountIcon}</span>} {accountName}</span>} onBack={onBack} />
      <div style={{ ...styles.tabRow, padding: "10px 14px 0" }}>
        {[
          { key: "diario", label: "Diario" },
          { key: "mensual", label: "Mensual" },
          { key: "anual", label: "Anual" },
        ].map((t) => (
          <button
            key={t.key}
            style={tab === t.key ? styles.tabActive : styles.tab}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadingTotals ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyTitle}>Cargando…</p>
        </div>
      ) : tab === "diario" ? (
        <DiarioSubTab
          userId={userId} settings={accountSettings} accounts={accounts} categories={categories} slLinks={slLinks}
          accountId={accountId} totals={totals} viewMonth={viewMonth} setViewMonth={setViewMonth}
          onNewTransaction={onNewTransaction} onEditTransaction={onEditTransaction}
        />
      ) : tab === "mensual" ? (
        <MensualSubTab
          totals={totals} settings={accountSettings} viewMonth={viewMonth} setViewMonth={setViewMonth}
          onOpenMonth={(year, month) => { setViewMonth(new Date(year, month - 1, 1)); setTab("diario"); }}
        />
      ) : (
        <AnualSubTab
          totals={totals} settings={accountSettings}
          onOpenYear={(year) => { setViewMonth(new Date(year, viewMonth.getMonth(), 1)); setTab("mensual"); }}
        />
      )}

      {tab === "diario" && (
        <button style={{ ...styles.fab, bottom: "calc(78px + env(safe-area-inset-bottom))" }} onClick={() => onNewTransaction()} aria-label="Nueva transacción">
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

function DiarioSubTab({ userId, settings, accounts, categories, slLinks, accountId, totals, viewMonth, setViewMonth, onNewTransaction, onEditTransaction }) {
  const { transactions: monthTx, loading } = useAccountMonthTransactions(userId, accountId, viewMonth);
  const swipeHandlers = useMonthSwipe(viewMonth, setViewMonth);
  const slide = useMonthSlide(viewMonth);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth() + 1;

  // Saldo corriente: arranca en el saldo de cierre del mes anterior y avanza
  // transacción por transacción en orden cronológico real (no el orden de
  // display, que es al revés) — el mapa resultante se consulta por id sin
  // importar en qué orden se termine mostrando cada fila.
  const runningBalances = useMemo(() => {
    const chronological = [...monthTx].sort((a, b) => {
      if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
      return new Date(a.created_at) - new Date(b.created_at);
    });
    let running = balanceBefore(totals, year, month);
    const map = new Map();
    for (const t of chronological) {
      const isDeposit = (t.type === "income" && t.account_id === accountId)
        || (t.type === "transfer" && t.to_account_id === accountId);
      const isWithdrawal = (t.type === "expense" && t.account_id === accountId)
        || (t.type === "transfer" && t.account_id === accountId);
      if (isDeposit) running += t.amount_main;
      else if (isWithdrawal) running -= t.amount_main;
      map.set(t.id, running);
    }
    return map;
  }, [monthTx, totals, year, month, accountId]);

  const monthDeposit = monthTx.reduce((s, t) => {
    if ((t.type === "income" && t.account_id === accountId) || (t.type === "transfer" && t.to_account_id === accountId)) return s + t.amount_main;
    return s;
  }, 0);
  const monthWithdrawal = monthTx.reduce((s, t) => {
    if ((t.type === "expense" && t.account_id === accountId) || (t.type === "transfer" && t.account_id === accountId)) return s + t.amount_main;
    return s;
  }, 0);
  const currentBalance = balanceBefore(totals, year, month) + (monthDeposit - monthWithdrawal);

  return (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#FBF8F2" }}>
        <div style={styles.subHeader} {...swipeHandlers}>
          <MonthNav viewMonth={viewMonth} setViewMonth={setViewMonth} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", padding: "8px 14px", borderBottom: "1px solid #ECE3D3" }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Depósito</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#3B6E62" }}>{money(monthDeposit, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Retiro</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#B0473A" }}>{money(monthWithdrawal, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Balance</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(monthDeposit - monthWithdrawal, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Saldo</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(currentBalance, settings.main_currency)}</p>
          </div>
        </div>
      </div>
      <div key={slide.key} className={slide.className} style={{ ...styles.form, flex: 1, paddingTop: 12, paddingBottom: 100 }} {...swipeHandlers}>
        {loading ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Cargando…</p>
          </div>
        ) : monthTx.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Nada registrado este mes</p>
          </div>
        ) : (
          <TransactionDayGroups
            transactions={monthTx}
            settings={settings}
            accounts={accounts}
            categories={categories}
            slLinks={slLinks}
            perspectiveAccountId={accountId}
            runningBalances={runningBalances}
            onNewTransaction={onNewTransaction}
            onEditTransaction={onEditTransaction}
          />
        )}
      </div>
    </>
  );
}

function MensualSubTab({ totals, settings, viewMonth, setViewMonth, onOpenMonth }) {
  const year = viewMonth.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const rows = months.map((month) => {
    const row = totals.find((t) => t.year === year && t.month === month);
    const deposits = row?.deposits || 0;
    const withdrawals = row?.withdrawals || 0;
    const endBalance = balanceBefore(totals, year, month) + (deposits - withdrawals);
    return { month, deposits, withdrawals, endBalance };
  }).sort((a, b) => b.month - a.month);

  const yearDeposits = rows.reduce((s, r) => s + r.deposits, 0);
  const yearWithdrawals = rows.reduce((s, r) => s + r.withdrawals, 0);
  const yearEndBalance = rows[0]?.endBalance || 0;
  const daysInMonth = (m) => new Date(year, m, 0).getDate();
  // Ancho fijo por columna (no "auto") — cada fila es su propio grid/flex
  // independiente, así que si una usara ancho de contenido, un monto grande
  // en una fila no alinearía con las demás. Con un ancho fijo, todas quedan
  // alineadas entre sí sin importar el tamaño del número de cada una.
  const colWidth = useMemo(
    () => Math.ceil(measureTextWidth(money(999999.99, settings.main_currency), "600 14px system-ui, sans-serif")),
    [settings.main_currency]
  );
  // "Actual" es HOY de verdad, no el mes que estás navegando en Diario —
  // por eso compara contra `new Date()`, no contra `viewMonth`.
  const today = new Date();
  const isCurrent = (month) => year === today.getFullYear() && month === today.getMonth() + 1;
  const swipeHandlers = useMonthSwipe(viewMonth, setViewMonth, "year");
  const slide = useMonthSlide(viewMonth);

  return (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#FBF8F2" }}>
        <div style={styles.subHeader} {...swipeHandlers}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button style={styles.iconBtnGhost} onClick={() => setViewMonth(new Date(year - 1, viewMonth.getMonth(), 1))} aria-label="Año anterior">
              <ChevronLeft size={20} />
            </button>
            <span style={{ fontWeight: 600, fontFamily: "system-ui, sans-serif" }}>{year}</span>
            <button style={styles.iconBtnGhost} onClick={() => setViewMonth(new Date(year + 1, viewMonth.getMonth(), 1))} aria-label="Año siguiente">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", padding: "8px 14px", borderBottom: "1px solid #ECE3D3" }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Depósito</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#3B6E62" }}>{money(yearDeposits, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Retiro</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#B0473A" }}>{money(yearWithdrawals, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Balance</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(yearDeposits - yearWithdrawals, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Saldo</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(yearEndBalance, settings.main_currency)}</p>
          </div>
        </div>
      </div>
      <div key={slide.key} className={slide.className} style={{ ...styles.form, flex: 1, paddingTop: 12, paddingBottom: 100, display: "flex", flexDirection: "column", gap: 6 }} {...swipeHandlers}>
        {rows.map((r) => (
          <div
            key={r.month}
            onClick={() => onOpenMonth(year, r.month)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 14, border: `1px solid ${isCurrent(r.month) ? "#C75D3B" : "#ECE3D3"}`, background: isCurrent(r.month) ? "#F3EFE5" : "#fff", fontFamily: "system-ui, sans-serif", fontSize: 14, cursor: "pointer" }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 700, textTransform: "capitalize" }}>{MONTH_ABBR(year, r.month)}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6B6355" }}>1/{r.month} ~ {daysInMonth(r.month)}/{r.month}</p>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: colWidth }}>
                <span style={{ color: "#3B6E62", fontWeight: 600 }}>{money(r.deposits, settings.main_currency)}</span>
                <span style={{ fontSize: 11, color: "#6B6355" }}>{money(r.deposits - r.withdrawals, settings.main_currency)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: colWidth }}>
                <span style={{ color: "#B0473A", fontWeight: 600 }}>{money(r.withdrawals, settings.main_currency)}</span>
                <span style={{ fontSize: 11, color: "#6B6355" }}>({money(r.endBalance, settings.main_currency)})</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AnualSubTab({ totals, settings, onOpenYear }) {
  const byYear = useMemo(() => {
    const map = new Map();
    for (const t of totals) {
      if (!map.has(t.year)) map.set(t.year, { year: t.year, deposits: 0, withdrawals: 0 });
      const y = map.get(t.year);
      y.deposits += t.deposits;
      y.withdrawals += t.withdrawals;
    }
    return [...map.values()].sort((a, b) => b.year - a.year);
  }, [totals]);

  const grandDeposits = byYear.reduce((s, y) => s + y.deposits, 0);
  const grandWithdrawals = byYear.reduce((s, y) => s + y.withdrawals, 0);
  // Mismo criterio que Mensual: "actual" es el año de hoy de verdad.
  const isCurrent = (year) => year === new Date().getFullYear();
  const colWidth = useMemo(
    () => Math.ceil(measureTextWidth(money(999999.99, settings.main_currency), "600 14px system-ui, sans-serif")),
    [settings.main_currency]
  );

  // Saldo al cierre de cada año = saldo antes de enero del año siguiente.
  const endBalanceForYear = (year) => balanceBefore(totals, year + 1, 1);

  return (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#FBF8F2" }}>
        <div style={styles.subHeader}>
          {/* minHeight 36 para igualar el alto de Diario/Mensual — ahí esa
              misma fila tiene botones de navegación (36px) que acá no hacen
              falta (Anual siempre muestra todos los años, no hay ida y vuelta). */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36, textAlign: "center", fontWeight: 600, fontFamily: "system-ui, sans-serif" }}>
            {byYear.length > 0 ? `${byYear[byYear.length - 1].year} ~ ${byYear[0].year}` : "—"}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", padding: "8px 14px", borderBottom: "1px solid #ECE3D3" }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Depósito</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#3B6E62" }}>{money(grandDeposits, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Retiro</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#B0473A" }}>{money(grandWithdrawals, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Balance</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(grandDeposits - grandWithdrawals, settings.main_currency)}</p>
          </div>
        </div>
      </div>
      <div style={{ ...styles.form, flex: 1, paddingTop: 12, paddingBottom: 100, display: "flex", flexDirection: "column", gap: 6 }}>
        {byYear.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Nada registrado todavía</p>
          </div>
        ) : byYear.map((y) => (
          <div
            key={y.year}
            onClick={() => onOpenYear(y.year)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 14, border: `1px solid ${isCurrent(y.year) ? "#C75D3B" : "#ECE3D3"}`, background: isCurrent(y.year) ? "#F3EFE5" : "#fff", fontFamily: "system-ui, sans-serif", fontSize: 14, cursor: "pointer" }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>{y.year}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6B6355" }}>1/1/{y.year} ~ 31/12/{y.year}</p>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: colWidth }}>
                <span style={{ color: "#3B6E62", fontWeight: 600 }}>{money(y.deposits, settings.main_currency)}</span>
                <span style={{ fontSize: 11, color: "#6B6355" }}>{money(y.deposits - y.withdrawals, settings.main_currency)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: colWidth }}>
                <span style={{ color: "#B0473A", fontWeight: 600 }}>{money(y.withdrawals, settings.main_currency)}</span>
                <span style={{ fontSize: 11, color: "#6B6355" }}>({money(endBalanceForYear(y.year), settings.main_currency)})</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
