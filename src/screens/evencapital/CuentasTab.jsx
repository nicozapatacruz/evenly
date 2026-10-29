import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Plus, ChevronRight, ChevronUp, ChevronDown, Menu, Trash2, Eye, EyeOff, CreditCard, AlertTriangle } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { offlineSupabase as supabase } from "../../lib/offlineSupabase.js";
import { db } from "../../lib/localDb.js";
import { styles } from "../../lib/styles.js";
import { RootHeader, TopBar, ConfirmInline, FormFooter, EmptyState } from "../../components/Shared.jsx";
import { money, useScrollToTopOnChange } from "../../lib/helpers.jsx";
import { accountBalance, computeCreditCardBalance, disableAutoPayForDeletedAccounts, useCreditCardActivity } from "../../lib/evenCapitalData.js";
import { CUSTOM_USER_CONFIG } from "../../lib/customUserConfig.js";
import AccountDetailScreen from "./AccountDetailScreen.jsx";
import AccountActivityScreen from "./AccountActivityScreen.jsx";
import TransactionForm from "./TransactionForm.jsx";

/* =========================================================================
   CUENTAS — tab de EvenCapital. Aislado de EvenGroup (tablas mm_*).
   list: pantalla raíz (RootHeader, igual que Config/Tus Grupos).
   manageGroups / manageAccounts: pantallas de edición (TopBar).
   ========================================================================= */

export default function CuentasTab({ session, settings, groups, accounts, accountTotals, categories, slLinks, onOpenEvenGroup, onOpenEvenGroupExpense, reload, reloadCategories, showError, showInfo, view, setView, onSaveMoneyTransaction, onDeleteMoneyTransaction, onBookmarkMoneyTransaction, isOnline = true }) {
  const balanceColor = (n) => (n > 0.004 ? "#3B6E62" : n < -0.004 ? "#B0473A" : "#6B6355");
  const [deletedOpen, setDeletedOpen] = useState(false);

  // Antes del primer return condicional a propósito — los hooks no pueden
  // llamarse condicionalmente (esta pantalla también puede devolver
  // <ManageAllAccounts> temprano, más abajo).
  const creditCardIds = accounts.filter((a) => a.is_credit_card && !a.deleted).map((a) => a.id);
  const { transactions: ccTx } = useCreditCardActivity(session.userId, creditCardIds);

  // "Saldo Real" — solo para quienes usan este patrón puntual de reconciliar
  // a mano (Nico y Paulina, cada uno con sus propios nombres de cuenta, ver
  // customUserConfig.js). Fórmula: el balance de "Saldo" más el de la
  // tarjeta (ya negativo, es deuda) más lo que de esa deuda en realidad no
  // es suyo — las transferencias puntuales que hacen a fin de mes de la
  // tarjeta a "Pendiente" para separar gastos compartidos (ej. pagarle algo
  // a alguien o un gasto de EvenGroup). "Pendiente" como CUENTA no sirve
  // para esto (mezcla esas transferencias con otras cosas sueltas, como un
  // regalo o efectivo por sacar) — por eso se suma la transferencia
  // puntual, no el balance de la cuenta entera.
  const realBalanceConfig = CUSTOM_USER_CONFIG[session.email]?.realBalance;
  const realBalanceTcId = accounts.find((a) => a.name === realBalanceConfig?.tcName && !a.deleted)?.id;
  const realBalancePendienteId = accounts.find((a) => a.name === realBalanceConfig?.pendienteName && !a.deleted)?.id;
  // Local-first (lee de Dexie, no de red) — antes esto era una consulta
  // directa a Supabase; se quedaba pegada para siempre offline (y de hecho
  // rota incluso con señal: terminó pasando sin querer por offlineSupabase,
  // que solo sabe de escrituras, no de un SELECT liso como este). Arranca
  // en null (no en 0) a propósito: mientras no se sabe el valor real
  // todavía, mejor no mostrar la fila "Saldo Real" que mostrar un número de
  // entrada que es incompleto y después salta solo.
  const pendienteTcSum = useLiveQuery(async () => {
    if (!realBalanceTcId || !realBalancePendienteId) return null;
    const rows = await db.mm_transactions.where("account_id").equals(realBalanceTcId).toArray();
    return rows
      .filter((t) => !t.deleted && t.type === "transfer" && t.to_account_id === realBalancePendienteId && t.title === "Pendiente TC")
      .reduce((s, t) => s + t.amount, 0);
  }, [realBalanceTcId, realBalancePendienteId], null);
  const pendienteTcLoaded = pendienteTcSum !== null;

  // Transacción que se está editando, releída en vivo de Dexie por id (no la
  // que quedó congelada en view.transaction al momento del click en la
  // lista) -- si viene de EvenGroup, la reconciliación puede actualizarla
  // mientras esta pantalla sigue montada (ej. volviste de "Original"
  // después de cambiar algo ahí), y sin esto se seguía mostrando el dato
  // viejo hasta desmontar y volver a entrar. Cae a view.transaction mientras
  // la consulta en vivo todavía no resolvió (primer render).
  const liveEditingTransaction = useLiveQuery(
    () => (view.transaction?.id ? db.mm_transactions.get(view.transaction.id) : undefined),
    [view.transaction?.id]
  );

  if (view.screen === "manageAllAccounts") {
    return (
      <ManageAllAccounts
        session={session}
        groups={groups}
        accounts={accounts}
        accountTotals={accountTotals}
        settings={settings}
        slLinks={slLinks}
        onOpenEvenGroup={onOpenEvenGroup}
        reload={reload}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setView({ screen: "list" })}
        isOnline={isOnline}
      />
    );
  }

  if (view.screen === "activity" || view.screen === "newTransaction" || view.screen === "editTransaction") {
    const activityAccount = accounts.find((a) => a.id === view.accountId);
    if (!activityAccount) { setView({ screen: "list" }); return null; }

    if (view.screen === "activity") {
      // Cuenta pseudo de un grupo vinculado de EvenGroup — solo
      // informativa, no se cargan movimientos acá (se gestionan desde Split
      // Ledger), así que esta pantalla no debe ofrecer "nueva transacción".
      const isSystemAccount = groups.find((g) => g.id === activityAccount.group_id)?.system_key === "split_ledger";
      return (
        <AccountActivityScreen
          userId={session.userId}
          settings={settings}
          accounts={accounts}
          categories={categories}
          slLinks={slLinks}
          accountId={view.accountId}
          accountName={activityAccount.name}
          accountIcon={activityAccount.icon}
          isSystemAccount={isSystemAccount}
          tab={view.tab}
          setTab={(tab) => setView((v) => ({ ...v, tab }))}
          viewMonth={view.viewMonth}
          setViewMonth={(viewMonth) => setView((v) => ({ ...v, viewMonth }))}
          onBack={() => setView({ screen: "list" })}
          onNewTransaction={(date) => setView({ ...view, screen: "newTransaction", date })}
          onEditTransaction={(t) => setView({ ...view, screen: "editTransaction", transaction: t })}
        />
      );
    }

    // newTransaction / editTransaction: mismo TransactionForm de siempre —
    // Cancelar/Guardar vuelve al extracto de ESTA cuenta (mismo tab/mes en
    // que estabas), no a la lista de Cuentas.
    return (
      <TransactionForm
        session={session}
        settings={settings}
        groups={groups}
        accounts={accounts}
        categories={categories}
        slLinks={slLinks}
        onOpenEvenGroupExpense={onOpenEvenGroupExpense}
        reloadCategories={reloadCategories}
        showError={showError}
        showInfo={showInfo}
        isOnline={isOnline}
        editingTransaction={liveEditingTransaction || view.transaction}
        defaultDate={view.date}
        defaultAccountId={view.accountId}
        onCancel={() => setView({ screen: "activity", accountId: view.accountId, tab: view.tab, viewMonth: view.viewMonth })}
        onSave={async (tx) => {
          const ok = await onSaveMoneyTransaction(tx);
          if (ok) setView({ screen: "activity", accountId: view.accountId, tab: view.tab, viewMonth: view.viewMonth });
        }}
        onDelete={async (id) => {
          const ok = await onDeleteMoneyTransaction(id);
          if (ok) setView({ screen: "activity", accountId: view.accountId, tab: view.tab, viewMonth: view.viewMonth });
        }}
        onBookmark={onBookmarkMoneyTransaction}
      />
    );
  }

  const balances = accounts.filter((a) => !a.deleted).map((a) => ({ account: a, balance: accountBalance(a.id, accountTotals) }));
  // Capital/deuda ya no se suman a una sola moneda — cada cuenta tiene la
  // suya fija (ver PENDIENTES.md sección B), así que se agrupan por moneda y
  // se muestra una línea por cada una presente (una sola si, como es lo
  // normal, todas tus cuentas comparten moneda).
  const totalsByCurrency = [...new Set(balances.map((b) => b.account.currency))]
    .map((currency) => {
      const subset = balances.filter((b) => b.account.currency === currency);
      const capital = subset.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0);
      const debt = subset.filter((b) => b.balance < 0).reduce((s, b) => s + b.balance, 0);
      return { currency, capital, debt, balance: capital + debt };
    })
    .sort((a, b) => (a.currency === settings.main_currency ? -1 : b.currency === settings.main_currency ? 1 : 0));
  const activeGroups = groups.filter((g) => !g.deleted);

  // Saldo de un conjunto de cuentas, agrupado por moneda — para subtotales
  // de grupo (una línea por moneda en vez de sumarlas entre sí).
  const balancesByCurrency = (accountList) => {
    const byCurrency = new Map();
    for (const a of accountList) byCurrency.set(a.currency, (byCurrency.get(a.currency) || 0) + accountBalance(a.id, accountTotals));
    return [...byCurrency.entries()].map(([currency, total]) => ({ currency, total }));
  };

  // Solo tiene sentido mostrar una cuenta eliminada acá si alguna vez tuvo
  // movimientos (si nunca tuvo transacciones, no hay ningún total que
  // "rescatar" — no aporta nada verla en esta lista).
  const deletedAccounts = accounts.filter((a) => a.deleted && accountTotals.some((t) => t.account_id === a.id));
  const deletedByGroup = groups
    .map((g) => ({ group: g, items: deletedAccounts.filter((a) => a.group_id === g.id) }))
    .filter((x) => x.items.length > 0);

  return (
    <div style={styles.screen}>
      <div style={{ position: "sticky", top: 0, zIndex: 5 }}>
        <RootHeader
          title="Cuentas"
          right={
            <div style={{ display: "flex", gap: 4 }}>
              <button style={styles.iconBtnGhost} onClick={() => setView({ screen: "manageAllAccounts" })} aria-label="Editar cuentas">
                <Pencil size={19} />
              </button>
            </div>
          }
        />
        {totalsByCurrency.length > 0 && (
          <div style={styles.subHeader}>
            {/* Encabezados una sola vez (no por moneda) — cada fila de abajo
                ya se identifica sola por el símbolo de `money()`, no hace
                falta repetir "(EUR)"/"(COP)" al lado de cada título. */}
            <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center" }}>
              <p style={{ ...styles.muted, flex: 1, padding: 0, fontSize: 12 }}>Capital</p>
              <p style={{ ...styles.muted, flex: 1, padding: 0, fontSize: 12 }}>A deber</p>
              <p style={{ ...styles.muted, flex: 1, padding: 0, fontSize: 12 }}>Balance</p>
            </div>
            {totalsByCurrency.map(({ currency, capital, debt, balance }) => (
              <div key={currency} style={{ display: "flex", justifyContent: "space-between", textAlign: "center" }}>
                <p style={{ flex: 1, margin: "2px 0 0", fontWeight: 700, color: balanceColor(capital) }}>{money(capital, currency)}</p>
                <p style={{ flex: 1, margin: "2px 0 0", fontWeight: 700, color: balanceColor(debt) }}>{money(debt, currency)}</p>
                <p style={{ flex: 1, margin: "2px 0 0", fontWeight: 700 }}>{money(balance, currency)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ ...styles.form, paddingTop: 12, gap: 8 }}>
        {activeGroups.length === 0 && (
          <EmptyState title="Todavía no tenés cuentas">Tocá el lápiz arriba para crear tu primer grupo de cuentas.</EmptyState>
        )}

        {activeGroups.map((g) => {
          const groupAccounts = accounts.filter((a) => a.group_id === g.id && !a.deleted);
          if (groupAccounts.length === 0) return null;
          const visibleAccounts = groupAccounts.filter((a) => !a.hidden);
          const gBalances = balancesByCurrency(groupAccounts);
          // Línea divisoria (mismo borde que el header) antes del grupo
          // "EvenGroup" — para que se note que no es un grupo común, es
          // el reflejo de tus grupos compartidos vinculados.
          const isSystemGroup = g.system_key === "split_ledger";
          return (
            <React.Fragment key={g.id}>
              {isSystemGroup && <div style={{ borderTop: "1px solid #ECE3D3" }} />}
              <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#FAF7F2", borderBottom: visibleAccounts.length ? "1px solid #F0EBE2" : "none" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>{g.name}</span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  {gBalances.map(({ currency, total }) => (
                    <span key={currency} style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: balanceColor(total) }}>{money(total, currency)}</span>
                  ))}
                </span>
              </div>
              {realBalanceConfig && g.name === realBalanceConfig.group && (() => {
                const saldoAcc = accounts.find((a) => a.name === realBalanceConfig.saldoName && !a.deleted);
                const tcAcc = accounts.find((a) => a.name === realBalanceConfig.tcName && !a.deleted);
                if (!saldoAcc || !tcAcc) return null;
                const saldoReal = accountBalance(saldoAcc.id, accountTotals) + accountBalance(tcAcc.id, accountTotals) + pendienteTcSum;
                return (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14, background: "#FDFBF9", fontWeight: 700 }}>
                    <span>Saldo Real</span>
                    {pendienteTcLoaded
                      ? <span style={{ color: balanceColor(saldoReal) }}>{money(saldoReal, saldoAcc.currency)}</span>
                      : <span style={{ color: "#A89A87" }}>—</span>}
                  </div>
                );
              })()}
              {visibleAccounts.map((a) => {
                const cc = a.is_credit_card ? computeCreditCardBalance(a.id, ccTx, a.statement_day || 1) : null;
                return (
                  <div
                    key={a.id}
                    onClick={() => setView({ screen: "activity", accountId: a.id, tab: "diario", viewMonth: new Date() })}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14, cursor: "pointer" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {a.icon && <span style={{ fontSize: 16, lineHeight: 1 }}>{a.icon}</span>}
                      {a.name}
                    </span>
                    {cc ? (
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                        <span style={{ color: balanceColor(cc.actual) }}>{money(cc.actual, a.currency)}</span>
                        <span style={{ fontSize: 11, color: "#6B6355" }}>A pagar: {money(cc.pasado, a.currency)}</span>
                      </span>
                    ) : (
                      <span style={{ color: balanceColor(accountBalance(a.id, accountTotals)), flexShrink: 0 }}>{money(accountBalance(a.id, accountTotals), a.currency)}</span>
                    )}
                  </div>
                );
              })}
              </div>
            </React.Fragment>
          );
        })}

        {deletedByGroup.length > 0 && (
          <div>
            <button
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "#FAF7F2", border: "1px solid #DDD2BE", borderRadius: deletedOpen ? "10px 10px 0 0" : 10, padding: "10px 14px", cursor: "pointer" }}
              onClick={() => setDeletedOpen((v) => !v)}
              aria-expanded={deletedOpen}
            >
              <span style={styles.label}>Cuentas eliminadas ({deletedAccounts.length})</span>
              {deletedOpen ? <ChevronUp size={18} color="#6B6355" /> : <ChevronDown size={18} color="#6B6355" />}
            </button>

            {deletedOpen && (
              <div style={{ border: "1px solid #DDD2BE", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                {deletedByGroup.map(({ group, items }) => {
                  const groupTotals = balancesByCurrency(items);
                  return (
                  <div key={group.id} style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#FAF7F2", borderBottom: "1px solid #F0EBE2" }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>{group.name}</span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        {groupTotals.map(({ currency, total }) => (
                          <span key={currency} style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: balanceColor(total) }}>{money(total, currency)}</span>
                        ))}
                      </span>
                    </div>
                    {items.map((a) => (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14, opacity: 0.6 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, textDecoration: "line-through" }}>
                          {a.icon && <span style={{ fontSize: 16, lineHeight: 1 }}>{a.icon}</span>}
                          {a.name}
                        </span>
                        <span style={{ color: balanceColor(accountBalance(a.id, accountTotals)), flexShrink: 0 }}>{money(accountBalance(a.id, accountTotals), a.currency)}</span>
                      </div>
                    ))}
                  </div>
                  );
                })}
                <p style={{ ...styles.muted, padding: "0 10px" }}>Las cuentas eliminadas no suman al balance general.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   GESTIONAR GRUPOS DE CUENTAS
   ========================================================================= */

export function ManageGroups({ session, groups: allGroups, accounts, reload, showError, showInfo, onBack, onOpenGroup }) {
  const groups = allGroups.filter((g) => !g.deleted);
  const [creating, setCreating] = useState(false);
  useScrollToTopOnChange(creating);
  const [order, setOrder] = useState(() => groups.map((g) => g.id));

  useEffect(() => {
    setOrder(groups.map((g) => g.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups]);

  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const newOrder = arrayMove(order, order.indexOf(active.id), order.indexOf(over.id));
    setOrder(newOrder);
    try {
      const results = await Promise.all(newOrder.map((id, i) => supabase.from("mm_account_groups").update({ sort_order: i }).eq("id", id)));
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      await reload();
    } catch (e) { showError(`No se pudo guardar el orden: ${e?.message || e}`); await reload(); }
  };

  if (creating) {
    return (
      <ManageAccounts
        session={session}
        group={null}
        groups={groups}
        accounts={accounts}
        reload={reload}
        showError={showError}
        onBack={() => setCreating(false)}
        onCreated={(newGroupId) => onOpenGroup(newGroupId, { justCreated: true })}
      />
    );
  }

  return (
    <div style={{ ...styles.screen, paddingBottom: 0 }}>
      <TopBar
        title="Grupos de cuentas"
        onBack={onBack}
        right={<button style={styles.iconBtnGhost} onClick={() => setCreating(true)} aria-label="Nuevo grupo"><Plus size={20} /></button>}
      />
      <div style={styles.form}>
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {order.map((id) => {
                const g = groups.find((x) => x.id === id);
                if (!g) return null;
                return (
                  <div key={id}>
                    <SortableGroupRow group={g} onOpen={() => onOpenGroup(id)} draggable={order.length > 1} />
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function SortableGroupRow({ group, onOpen, draggable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 4, padding: "10px 14px", borderRadius: 10 }}>
      {/* Sin ícono de arrastrar si hay un solo ítem — no hay con qué reordenar. */}
      {draggable ? (
        <span {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", width: 28, color: "#C9BBA0", cursor: "grab", touchAction: "none" }}>
          <Menu size={18} />
        </span>
      ) : (
        <span style={{ width: 28, flexShrink: 0 }} />
      )}
      {/* gap:0 acá adentro — los dos botones ya tienen su propio padding,
          no hace falta espacio extra entre ellos. Solo el handle necesita
          los 4px del gap de la fila. */}
      <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={onOpen}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, background: "none", border: "none", padding: "7px 10px", textAlign: "left", cursor: "pointer" }}
        >
          <span style={{ fontSize: 14, fontFamily: "system-ui, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</span>
        </button>
        <button style={styles.iconBtnGhost} onClick={onOpen} aria-label={`Editar ${group.name}`}>
          <ChevronRight size={18} color="#A89A87" />
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   GESTIONAR CUENTAS DE UN GRUPO
   ========================================================================= */

// Un solo componente para crear y editar un grupo (mismo patrón que
// AccountDetailScreen/TransactionForm: `group` null es "nuevo"). Al crear,
// se guarda de una (un grupo vacío con nombre no tiene nada que "cancelar"
// después) y el padre (ManageGroups) nos manda derecho a este mismo
// componente en modo edición para esa cuenta — nunca hay una cuenta
// apuntando a un grupo que todavía no es real. Editando, además del nombre
// (Footer Cancelar/Guardar, igual que AccountDetailScreen) se administra acá
// la lista de cuentas hijas — eso sigue siendo inmediato, como el resto de
// los drag-and-drop de la app.
export function ManageAccounts({ session, group = null, groups, accounts, accountTotals, settings, slLinks, onOpenEvenGroup, reload, showError, showInfo, justCreated, onBack, onCreated, onDeleted, isOnline = true }) {
  // Solo el primer render de esta pantalla (llegando recién de "Nuevo
  // grupo") — no se recalcula después, así que un re-render por cualquier
  // otro motivo no lo hace reaparecer.
  const [showCreatedHint] = useState(!!justCreated);
  const [name, setName] = useState(group?.name || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewingAccountId, setViewingAccountId] = useState(null);
  useScrollToTopOnChange(creating, viewingAccountId);
  const [nameTouched, setNameTouched] = useState(false);

  // El grupo "EvenGroup" (auto-creado al vincular un grupo compartido) no
  // se renombra/borra a mano acá — se desvincula desde EvenGroup. Si no,
  // un cambio acá rompe la referencia que guarda el vínculo sin que se note.
  const isSystemGroup = group?.system_key === "split_ledger";

  // Al crear siempre es "dirty" (no hay un original con qué comparar).
  const isDirty = !group || name.trim() !== group.name;
  const canSave = isDirty && !!name.trim() && !isSystemGroup;

  const handleSave = async () => {
    if (saving) return;
    if (!canSave) { setNameTouched(true); return; }
    setSaving(true);
    try {
      if (group) {
        const { error } = await supabase.from("mm_account_groups").update({ name: name.trim() }).eq("id", group.id);
        if (error) throw error;
        await reload();
        onBack();
      } else {
        const { data, error } = await supabase.from("mm_account_groups").insert({
          user_id: session.userId, name: name.trim(), type: "other", sort_order: groups.length,
        }).select().single();
        if (error) throw error;
        await reload();
        onCreated(data.id);
      }
    } catch (e) { showError(`No se pudo ${group ? "guardar" : "crear"}: ${e?.message || e}`); }
    setSaving(false);
  };

  const accCount = group ? accounts.filter((a) => a.group_id === group.id && !a.deleted).length : 0;

  const remove = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("mm_account_groups").update({ deleted: true }).eq("id", group.id);
      if (error) throw error;
      // El mensaje de confirmación avisa "se borran juntas" — hay que
      // cumplirlo de verdad, si no las cuentas quedan huérfanas (activas,
      // sumando al balance, pero invisibles porque su grupo ya no existe).
      const idsToDelete = accounts.filter((a) => a.group_id === group.id && !a.deleted).map((a) => a.id);
      if (idsToDelete.length) {
        const { error: accError } = await supabase.from("mm_accounts").update({ deleted: true }).in("id", idsToDelete);
        if (accError) throw accError;
        await disableAutoPayForDeletedAccounts(idsToDelete);
      }
      await reload();
      showInfo(`"${group.name}" eliminado.`);
      onDeleted();
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setDeleting(false);
  };

  if (creating) {
    return (
      <AccountDetailScreen
        session={session}
        account={null}
        groups={groups.filter((g) => !g.deleted)}
        accounts={accounts}
        accountTotals={accountTotals}
        settings={settings}
        defaultGroupId={group.id}
        groupLocked
        reload={reload}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setCreating(false)}
      />
    );
  }

  if (viewingAccountId) {
    const acc = accounts.find((a) => a.id === viewingAccountId);
    if (acc) {
      return (
        <AccountDetailScreen
          session={session}
          account={acc}
          groups={groups}
          accounts={accounts}
          accountTotals={accountTotals}
          settings={settings}
          groupLocked
          reload={reload}
          showError={showError}
          showInfo={showInfo}
          onBack={() => setViewingAccountId(null)}
          onDeleted={() => setViewingAccountId(null)}
        />
      );
    }
    setViewingAccountId(null);
  }

  return (
    <div style={styles.screen}>
      <TopBar
        title={group ? "Editar grupo" : "Nuevo grupo"}
        onBack={onBack}
        right={group && !isSystemGroup && (
          <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(true)} aria-label="Eliminar">
            <Trash2 size={18} />
          </button>
        )}
      />
      {group && confirmDelete && (
        <ConfirmInline
          message={accCount > 0 ? `"${group.name}" tiene ${accCount} cuenta(s) adentro.\nSe borran juntas. ¿Continuar?` : `¿Eliminar "${group.name}"?`}
          confirmLabel={deleting ? "Eliminando…" : "Eliminar"}
          confirmDisabled={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
          style={{ margin: "6px 20px 12px", borderRadius: 12, borderTop: "1px solid #EBC9BA" }}
        />
      )}
      <div style={styles.form}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif" }}>
          <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 13, color: "#6B6355" }}>
            Nombre<span style={{ color: "#B0473A" }}>*</span>
          </span>
          <input
            className="row-input"
            style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13.5, fontFamily: "system-ui, sans-serif", border: "none", background: "transparent", padding: 0, color: "#2B2620", opacity: isSystemGroup ? 0.6 : 1 }}
            value={name}
            disabled={isSystemGroup}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            placeholder={group ? undefined : "Nombre (ej: Santander, Efectivo)"}
          />
        </div>
        {nameTouched && !name.trim() && (
          <p style={{ margin: "-8px 0 0", fontSize: 12, fontFamily: "system-ui, sans-serif", color: "#B0473A" }}>Este campo es obligatorio.</p>
        )}
        {isSystemGroup && (
          <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
            Se crea solo al vincular un grupo de EvenGroup. Se desvincula desde ahí, no se edita acá.
          </p>
        )}
        {group && showCreatedHint && (
          <p style={{ margin: "4px 0 -8px", fontSize: 13, fontFamily: "system-ui, sans-serif", color: "#3B6E62" }}>
            <strong>Grupo creado.</strong><br />Ahora agregá las cuentas de este grupo.
          </p>
        )}
        {group && (
          <>
            <AccountGroupEditor
              group={group}
              accounts={accounts}
              reload={reload}
              showError={showError}
              onOpenAccount={(id) => openAccountOrEvenGroup(group, id, slLinks, onOpenEvenGroup, setViewingAccountId, isOnline, showError)}
            />
            {!isSystemGroup && (
              <button style={styles.btnDashed} onClick={() => setCreating(true)}>
                <Plus size={16} /> Nueva cuenta
              </button>
            )}
          </>
        )}
      </div>
      <FormFooter
        onCancel={onBack}
        onConfirm={handleSave}
        confirmLabel={saving ? (group ? "Guardando…" : "Creando…") : (group ? "Guardar" : "Crear")}
        confirmDisabled={saving}
        confirmDim={!canSave}
      />
    </div>
  );
}

// GESTOR DE CUENTAS — todos los grupos juntos en una sola pantalla plana
// (como en la app original: el lápiz de la tab Cuentas va directo acá, no a
// "Grupos de cuentas"). Cada grupo es solo un encabezado de sección — para
// renombrar/reordenar/crear GRUPOS está la pantalla separada "Grupos de
// cuentas", reachable únicamente desde Configuración.
export function ManageAllAccounts({ session, groups, accounts, accountTotals, settings, slLinks, onOpenEvenGroup, reload, showError, showInfo, onBack, isOnline = true }) {
  const [creating, setCreating] = useState(false);
  const [viewingAccountId, setViewingAccountId] = useState(null);
  useScrollToTopOnChange(creating, viewingAccountId);

  if (creating) {
    return (
      <AccountDetailScreen
        session={session}
        account={null}
        groups={groups.filter((g) => !g.deleted)}
        accounts={accounts}
        accountTotals={accountTotals}
        settings={settings}
        reload={reload}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setCreating(false)}
      />
    );
  }

  if (viewingAccountId) {
    const acc = accounts.find((a) => a.id === viewingAccountId);
    if (acc) {
      return (
        <AccountDetailScreen
          session={session}
          account={acc}
          groups={groups}
          accounts={accounts}
          accountTotals={accountTotals}
          settings={settings}
          reload={reload}
          showError={showError}
          showInfo={showInfo}
          onBack={() => setViewingAccountId(null)}
          onDeleted={() => setViewingAccountId(null)}
        />
      );
    }
    setViewingAccountId(null);
  }

  return (
    <div style={{ ...styles.screen, paddingBottom: 0 }}>
      <TopBar
        title="Gestor de cuentas"
        onBack={onBack}
        right={<button style={styles.iconBtnGhost} onClick={() => setCreating(true)} aria-label="Nueva cuenta"><Plus size={20} /></button>}
      />
      <div style={styles.form}>
        {/* El grupo "EvenGroup" es informativo (lo gestiona el programa
            solo al vincular un grupo compartido) — no tiene nada para editar
            acá, se maneja desde EvenGroup. */}
        {groups.filter((g) => !g.deleted && g.system_key !== "split_ledger" && accounts.some((a) => a.group_id === g.id && !a.deleted)).map((g) => (
          <div key={g.id}>
            <p style={{ ...styles.label, marginBottom: 12 }}>{g.name}</p>
            <AccountGroupEditor
              group={g}
              accounts={accounts}
              reload={reload}
              showError={showError}
              onOpenAccount={(id) => openAccountOrEvenGroup(g, id, slLinks, onOpenEvenGroup, setViewingAccountId, isOnline, showError)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// La cuenta pseudo de un grupo vinculado de EvenGroup no es una cuenta de
// verdad — editarla no tiene sentido acá. Si el grupo es el sistema "Split
// Ledger", la flecha lleva al "Editar grupo" de EvenGroup en vez de abrir
// AccountDetailScreen (se busca el vínculo más reciente, activo o no, para
// no dejar la flecha muerta en una cuenta ya desvinculada).
function openAccountOrEvenGroup(group, accountId, slLinks, onOpenEvenGroup, onOpenAccount, isOnline, showError) {
  if (group?.system_key === "split_ledger") {
    // Salta directo a "Editar grupo" de EvenGroup -- online-only, mismo
    // motivo que el resto de EvenGroup (bypassearía el bloqueo de
    // GroupView si se dejara entrar offline, dejando picar la foto/nombre y
    // fallar recién al guardar).
    if (!isOnline) { showError?.("Estás offline, no podés editar este grupo ahora."); return; }
    const link = (slLinks || [])
      .filter((l) => l.pseudo_account_id === accountId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (link && onOpenEvenGroup) onOpenEvenGroup(link.group_id);
    return;
  }
  onOpenAccount(accountId);
}

// Todas las cuentas de un grupo (arrastrar, renombrar, ocultar, borrar, crear
// nueva) — sin el TopBar/wrapper de pantalla, para poder repetirlo una vez
// por grupo en "Gestor de cuentas" (todos los grupos juntos en una sola
// pantalla) y también solo, en ManageAccounts (cuando se llega desde "Tipos
// de cuentas" y elegís un único grupo).
function AccountGroupEditor({ group, accounts, reload, showError, onOpenAccount }) {
  const groupAccounts = accounts.filter((a) => a.group_id === group.id && !a.deleted);
  const [order, setOrder] = useState(() => groupAccounts.map((a) => a.id));

  useEffect(() => {
    setOrder(groupAccounts.map((a) => a.id));
  }, [accounts, group.id]);

  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const newOrder = arrayMove(order, order.indexOf(active.id), order.indexOf(over.id));
    setOrder(newOrder);
    try {
      const results = await Promise.all(newOrder.map((id, i) => supabase.from("mm_accounts").update({ sort_order: i }).eq("id", id)));
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      await reload();
    } catch (e) { showError(`No se pudo guardar el orden: ${e?.message || e}`); await reload(); }
  };

  const toggleHidden = async (id) => {
    const a = groupAccounts.find((x) => x.id === id);
    try {
      const { error } = await supabase.from("mm_accounts").update({ hidden: !a.hidden }).eq("id", id);
      if (error) throw error;
      await reload();
    } catch (e) { showError(`No se pudo actualizar: ${e?.message || e}`); }
  };

  return (
    <>
      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {order.map((id) => {
              const a = groupAccounts.find((x) => x.id === id);
              if (!a) return null;
              return (
                <div key={id}>
                  <SortableAccountRow
                    id={id}
                    name={a.name}
                    icon={a.icon}
                    hidden={a.hidden}
                    isCreditCard={a.is_credit_card}
                    paymentAccountDeleted={a.is_credit_card && !!a.payment_account_id && !!accounts.find((x) => x.id === a.payment_account_id)?.deleted}
                    onOpen={() => onOpenAccount(id)}
                    onToggleHidden={() => toggleHidden(id)}
                    draggable={order.length > 1}
                  />
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}

function SortableAccountRow({ id, name, icon, hidden, isCreditCard, paymentAccountDeleted, onOpen, onToggleHidden, draggable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 4, padding: "10px 14px", borderRadius: 10 }}>
      {/* Sin ícono de arrastrar si hay un solo ítem — no hay con qué reordenar. */}
      {draggable ? (
        <span {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", width: 28, color: "#C9BBA0", cursor: "grab", touchAction: "none" }}>
          <Menu size={18} />
        </span>
      ) : (
        <span style={{ width: 28, flexShrink: 0 }} />
      )}
      {/* gap:0 acá adentro — ojo y flecha ya tienen su propio padding, no
          hace falta espacio extra. Solo el handle necesita los 4px del gap
          de la fila. */}
      <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={onOpen}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, background: "none", border: "none", padding: "7px 10px", textAlign: "left", cursor: "pointer", opacity: hidden ? 0.5 : 1 }}
        >
          {icon && <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{icon}</span>}
          <span style={{ fontSize: 14, fontFamily: "system-ui, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        </button>
        {paymentAccountDeleted ? (
          <span style={{ display: "flex", marginRight: 4 }} title="Su cuenta de pago fue eliminada">
            <AlertTriangle size={16} color="#B0473A" />
          </span>
        ) : isCreditCard && (
          <span style={{ display: "flex", marginRight: 4 }} title="Tarjeta de crédito">
            <CreditCard size={16} color="#A89A87" />
          </span>
        )}
        <button style={styles.iconBtnGhost} onClick={onToggleHidden} aria-label={hidden ? `Mostrar ${name}` : `Ocultar ${name}`}>
          {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button style={styles.iconBtnGhost} onClick={onOpen} aria-label={`Editar ${name}`}>
          <ChevronRight size={18} color="#A89A87" />
        </button>
      </div>
    </div>
  );
}
