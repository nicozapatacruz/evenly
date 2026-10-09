import React, { useState } from "react";
import { Plus, Search, SlidersHorizontal, Star } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { RootHeader, MonthNav, TodayButton, FiltersActiveBanner, PendingRateBanner, HeaderMenu, EmptyState, useMonthSwipe, useMonthSlide } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { useMonthTransactions, usePendingRateTransactions, currenciesInUse } from "../../lib/moneyManagerData.js";
import { hasActiveFilters, matchesFilters } from "../../lib/filterHelpers.js";
import { TransactionDayGroups } from "./TransactionDayGroups.jsx";

/* =========================================================================
   TRANSACCIONES (ex "Hoy"/Diario) — lista de transacciones del mes,
   agrupadas por día. Ojo: simplificado a propósito frente a la app
   original — ahí este tab también tiene sub-vistas de Calendario/Mensual/
   Resumen que acá no replicamos.
   ========================================================================= */

export default function DiarioTab({ userId, settings, groups, accounts, categories, slLinks, viewMonth, setViewMonth, onNewTransaction, onEditTransaction, onOpenSearch, onOpenBookmarks, filters, onOpenFilters, onClearFilters }) {
  // Solo pedimos las transacciones del mes visible (no toda la tabla) — se
  // refetchea solo cuando cambiás de mes.
  const { transactions: monthTx, loading } = useMonthTransactions(userId, viewMonth);
  const swipeHandlers = useMonthSwipe(viewMonth, setViewMonth);
  const slide = useMonthSlide(viewMonth);
  const filtered = hasActiveFilters(filters) ? monthTx.filter((t) => matchesFilters(t, filters)) : monthTx;
  // A propósito NO se saca del mes visible (`filtered`) — una pendiente en
  // otro mes, o una transferencia de préstamo oculta, quedaría invisible si
  // dependiera de lo que esta pantalla ya cargó. Ver usePendingRateTransactions.
  const { transactions: pendingRateTx } = usePendingRateTransactions(userId);

  // Fase 2 de multi-moneda (ver MULTI_CURRENCY_PLAN.md): el resumen del mes
  // junta transacciones de todas las cuentas en un solo número, así que
  // elegís con cuál moneda mirarlo — nunca se mezclan dos monedas en un
  // mismo total. Sin persistir: cada vez que se abre esta pantalla arranca
  // en la principal, igual que el mes mostrado.
  const [currency, setCurrency] = useState(settings.main_currency);
  const currencies = currenciesInUse(accounts, settings);
  const isSelectedCurrencyTx = (t) => (accounts.find((a) => a.id === t.account_id)?.currency || settings.main_currency) === currency;
  const monthIncome = filtered.filter((t) => t.type === "income" && isSelectedCurrencyTx(t)).reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
  const monthExpense = filtered.filter((t) => t.type === "expense" && isSelectedCurrencyTx(t)).reduce((s, t) => s + (t.amount_main ?? t.amount), 0);

  return (
    <div style={{ ...styles.screen, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5 }}>
        <RootHeader
          title="Transacciones"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <TodayButton viewMonth={viewMonth} setViewMonth={setViewMonth} />
              <HeaderMenu
                trigger={<><SlidersHorizontal size={19} />{hasActiveFilters(filters) && <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: "#C75D3B" }} />}</>}
                items={[
                  { icon: <SlidersHorizontal size={16} color="#6B6355" />, label: "Filtros", onClick: onOpenFilters, badge: hasActiveFilters(filters) },
                  { icon: <Star size={16} color="#6B6355" />, label: "Favoritos", onClick: onOpenBookmarks },
                ]}
                currencies={currencies}
                currency={currency}
                onChangeCurrency={setCurrency}
              />
              <button style={styles.iconBtnGhost} onClick={onOpenSearch} aria-label="Buscar">
                <Search size={19} />
              </button>
            </div>
          }
        />
        <div style={styles.subHeader} {...swipeHandlers}>
          <MonthNav viewMonth={viewMonth} setViewMonth={setViewMonth} />
          <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", padding: "0 4px" }}>
            <div style={{ flex: 1 }}>
              <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Ingresos</p>
              <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#3B6E62" }}>{money(monthIncome, currency)}</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Gastos</p>
              <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#B0473A" }}>{money(monthExpense, currency)}</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ ...styles.muted, padding: 0, margin: 0, fontSize: 12 }}>Balance</p>
              <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(monthIncome - monthExpense, currency)}</p>
            </div>
          </div>
        </div>
        {/* Fuera del subHeader que se desliza con el mes a propósito — esto
            no depende de qué mes estés viendo, tiene que quedar visible
            siempre que haya algo pendiente, no solo al navegar a ese mes.
            paddingTop:12 (sin padding abajo) — el mismo valor que ya tiene
            el paddingTop del body de abajo, así el banner queda con el
            mismo espacio arriba y abajo (el de abajo lo da el propio body,
            sin agregar nada extra acá) pase lo que pase con el body. Mismo
            padding horizontal (20px) que el resto del header, no el 14px
            que usan las filas del body. */}
        {pendingRateTx.length > 0 && (
          <div style={{ padding: "12px 20px 0" }}>
            <PendingRateBanner count={pendingRateTx.length} onOpen={() => onEditTransaction(pendingRateTx[0])} />
          </div>
        )}
      </div>
      <div key={slide.key} className={slide.className} style={{ ...styles.form, flex: 1, paddingTop: 12, paddingBottom: 100 }} {...swipeHandlers}>
        {/* Un solo div envolviendo banner+contenido (no 2 hijos sueltos del
            form de arriba, que tiene gap:14 — un valor distinto al que usan
            Cuentas/Tus grupos) — gap:8 acá adentro iguala el espacio entre
            tarjetas de día al resto de la app. El banner es la excepción:
            necesita 12px (no 8) hacia el contenido, así que se le suma un
            marginBottom extra de 4 (8 del gap + 4 = 12). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hasActiveFilters(filters) && <div style={{ marginBottom: 4 }}><FiltersActiveBanner onOpen={onOpenFilters} onClear={onClearFilters} /></div>}
          {loading ? (
            <EmptyState title="Cargando transacciones…" />
          ) : filtered.length === 0 ? (
            <EmptyState title={monthTx.length === 0 ? "Nada registrado este mes" : "Nada coincide con el filtro"}>
              {monthTx.length === 0 ? 'Tocá el "+" de abajo para anotar un ingreso, gasto o transferencia.' : "Probá cambiando los filtros."}
            </EmptyState>
          ) : (
            <TransactionDayGroups
              transactions={filtered}
              settings={{ ...settings, main_currency: currency }}
              accounts={accounts}
              categories={categories}
              slLinks={slLinks}
              onNewTransaction={onNewTransaction}
              onEditTransaction={onEditTransaction}
            />
          )}
        </div>
      </div>

      <button style={{ ...styles.fab, bottom: "calc(78px + env(safe-area-inset-bottom))" }} onClick={() => onNewTransaction()} aria-label="Nueva transacción">
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
