import React, { useMemo } from "react";
import { Trash2, Divide, ArrowLeftRight, AlertCircle } from "lucide-react";
import { money, measureTextWidth, dateInputValueInZone } from "../../lib/helpers.jsx";
import { isRatePending } from "../../lib/moneyManagerData.js";

const DAY_AMOUNTS_FONT = "12.5px system-ui, sans-serif";
const DAY_LABEL = (d) => d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");

// Lista de transacciones agrupada por día — compartida entre Transacciones
// (el mes completo), el drill-down de categoría de Estadísticas (una
// categoría puntual) y el extracto por cuenta, para no duplicar el bloque de
// filas (ícono, cuenta tachada si está eliminada, montos, click-para-editar).
//
// `perspectiveAccountId` cambia la clasificación de depósito/retiro: sin él
// (perspectiva de categoría, Transacciones/drill-down), las transferencias
// no cuentan ni como ingreso ni como gasto. Con él (perspectiva de cuenta,
// extracto), una transferencia que LLEGA a esa cuenta es depósito y una que
// SALE es retiro — y el monto de cada fila se colorea según si esa cuenta
// puntual ganó o perdió plata, no según el tipo de la transacción.
//
// `runningBalances` (Map id→saldo) agrega una segunda línea con el saldo
// acumulado después de esa transacción — solo tiene sentido con
// perspectiveAccountId.
export function TransactionDayGroups({ transactions, settings, accounts, categories, slLinks, onNewTransaction, onEditTransaction, perspectiveAccountId, runningBalances }) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const accountIcon = (id) => accounts.find((a) => a.id === id)?.icon;
  const accountDeleted = (id) => !!accounts.find((a) => a.id === id)?.deleted;
  const accountCurrency = (id) => accounts.find((a) => a.id === id)?.currency || settings.main_currency;
  const categoryIcon = (id) => categories.find((c) => c.id === id)?.icon;
  const categoryDeleted = (id) => !!categories.find((c) => c.id === id)?.deleted;

  // Nombre/ícono del grupo de Split Ledger — se toma de la cuenta pseudo del
  // vínculo (su nombre/ícono quedan fijos desde que se vinculó, protegidos
  // contra edición en Cuentas), no de `memo` (ese queda libre, el usuario lo
  // puede cambiar sin que la marca visual se rompa).
  const splitBadge = (t) => {
    if (!t.sl_link_id) return null;
    const link = slLinks?.find((l) => l.id === t.sl_link_id);
    const pseudo = link && accounts.find((a) => a.id === link.pseudo_account_id);
    return pseudo ? { name: pseudo.name, icon: pseudo.icon } : null;
  };

  const accountLabel = (id) => (
    <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 3, ...(accountDeleted(id) ? { textDecoration: "line-through", color: "#B0473A" } : null) }}>
      {accountIcon(id) && <span style={{ fontSize: 11 }}>{accountIcon(id)}</span>}
      {accountName(id)}
      {accountDeleted(id) && <Trash2 size={11} style={{ flexShrink: 0 }} />}
    </span>
  );

  // Contribución de una transacción sobre la cuenta en perspectiva: positivo
  // = depósito, negativo = retiro. Sin perspectiva (null), no se usa.
  const contribution = (t) => {
    if (t.type === "income" && t.account_id === perspectiveAccountId) return t.amount_main;
    if (t.type === "expense" && t.account_id === perspectiveAccountId) return -t.amount_main;
    if (t.type === "transfer") {
      if (t.account_id === perspectiveAccountId) return -t.amount_main;
      if (t.to_account_id === perspectiveAccountId) return t.amount_main;
    }
    return 0;
  };

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
    // Dentro de cada día, más reciente CARGADO primero (created_at), no por
    // la hora exacta de "date" — las cargadas a mano siempre anclan a
    // mediodía, así que ordenar por "date" las mezclaba con la hora real que
    // sí trae la data importada. "date" solo desempata created_at empatados
    // (pasa únicamente entre filas del mismo lote de importación — crear dos
    // transacciones a mano con el mismo created_at exacto no es posible).
    for (const txs of map.values()) {
      txs.sort((a, b) => {
        const createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return createdDiff !== 0 ? createdDiff : new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [transactions]);

  return (
    <>
      {byDay.map(([dayKey, txs]) => {
        const d = new Date(dayKey + "T12:00:00");
        // Sin perspectiva de cuenta (Transacciones/drill-down, puede cruzar
        // varias cuentas): parche de continuidad hasta la Fase 2, ver nota
        // igual en DiarioTab.jsx — solo suma cuentas de tu moneda principal,
        // para no blendear monedas distintas en un solo número. Con
        // perspectiva (extracto de UNA cuenta) no aplica, ya es una sola.
        const dayIncome = perspectiveAccountId
          ? txs.reduce((s, t) => { const c = contribution(t); return c > 0 ? s + c : s; }, 0)
          : txs.filter((t) => t.type === "income" && accountCurrency(t.account_id) === settings.main_currency).reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
        const dayExpense = perspectiveAccountId
          ? txs.reduce((s, t) => { const c = contribution(t); return c < 0 ? s - c : s; }, 0)
          : txs.filter((t) => t.type === "expense" && accountCurrency(t.account_id) === settings.main_currency).reduce((s, t) => s + (t.amount_main ?? t.amount), 0);
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
            {txs.map((t) => {
              const badge = splitBadge(t);
              // Compara contra la moneda de SU CUENTA (no settings.main_currency):
              // amount_main se convierte a la moneda de la cuenta, no a una
              // principal global (ver PENDIENTES.md sección B) — y así este
              // chequeo queda inmune a que settings.main_currency esté "pisado"
              // con la moneda elegida en el selector de Fase 2.
              const pending = isRatePending(t, accountCurrency(t.account_id));
              return (
              <div
                key={t.id}
                onClick={() => onEditTransaction(t)}
                style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14, cursor: "pointer", background: pending ? "#FBEDE7" : badge ? "#FBF1E0" : undefined }}
              >
                {/* Pendiente de tasa: el resto de la fila se atenúa y el badge
                    queda centrado encima, en vez de competir por espacio con
                    el ícono/nota/monto — así se nota de una que algo falta,
                    no es solo un chip más al lado de los demás. */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flex: 1, minWidth: 0, opacity: pending ? 0.35 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                    {/* Alto fijo siempre (haya ícono o no) — si no, una fila sin
                        categoría queda más baja que una con categoría, porque el
                        emoji del ícono es lo que más alto mide de toda la fila. */}
                    <span style={{ position: "relative", flexShrink: 0, display: "inline-flex", width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
                      {t.type === "transfer" ? (
                        <ArrowLeftRight size={16} color="#4A6FA5" />
                      ) : (
                        <>
                          {categoryIcon(t.category_id) && (
                            <span style={{ fontSize: 18, lineHeight: 1, opacity: categoryDeleted(t.category_id) ? 0.5 : 1 }}>{categoryIcon(t.category_id)}</span>
                          )}
                          {categoryDeleted(t.category_id) && (
                            <span style={{ position: "absolute", bottom: -3, right: -5, background: "#fff", borderRadius: "50%", padding: 1, display: "flex" }}>
                              <Trash2 size={10} color="#B0473A" />
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    {/* minHeight: 32 — una transacción sin nota (sin "título") solo
                        muestra 1 línea en vez de 2, y quedaba más baja que el
                        resto; con esto reserva el mismo alto igual. */}
                    <div style={{ minWidth: 0, minHeight: 32, display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {!pending && badge && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#A8754A", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={badge.name}>
                        <Divide size={12} color="#A8754A" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{badge.name}</span>
                      </span>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={{
                        color: perspectiveAccountId
                          ? (contribution(t) > 0 ? "#3B6E62" : contribution(t) < 0 ? "#B0473A" : "#4A6FA5")
                          : (t.type === "income" ? "#3B6E62" : t.type === "expense" ? "#B0473A" : "#4A6FA5"),
                        fontWeight: 600,
                      }}>
                        {money(t.amount, t.currency)}
                      </span>
                      {/* `amount_main` está en la moneda de la CUENTA de esta
                          fila (restricción dura, ver PENDIENTES.md sección B),
                          no en una principal global — comparar/mostrar contra
                          esa, no contra settings.main_currency (que en una
                          lista con cuentas de varias monedas puede ser
                          cualquiera de ellas, o ninguna). */}
                      {t.currency !== accountCurrency(t.account_id) && (
                        <span style={{ fontSize: 11, color: "#6B6355" }}>= {money(t.amount_main, accountCurrency(t.account_id))}</span>
                      )}
                      {runningBalances?.has(t.id) && (
                        <span style={{ fontSize: 11, color: "#6B6355" }}>{money(runningBalances.get(t.id), settings.main_currency)}</span>
                      )}
                    </div>
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
            })}
          </div>
        );
      })}
    </>
  );
}
