import React, { useState, useEffect } from "react";
import { Pencil, Plus, ChevronRight, ChevronUp, ChevronDown, Menu, Trash2, Eye, EyeOff, CreditCard, AlertTriangle } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { RootHeader, TopBar, ConfirmInline, Footer, Field } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { accountBalance, groupBalance, computeCreditCardBalance, disableAutoPayForDeletedAccounts, useCreditCardActivity } from "../../lib/moneyManagerData.js";
import AccountDetailScreen from "./AccountDetailScreen.jsx";
import AccountActivityScreen from "./AccountActivityScreen.jsx";
import TransactionForm from "./TransactionForm.jsx";

/* =========================================================================
   CUENTAS — tab de Money Manager. Aislado de Split Ledger (tablas mm_*).
   list: pantalla raíz (RootHeader, igual que Config/Tus Grupos).
   manageGroups / manageAccounts: pantallas de edición (TopBar).
   ========================================================================= */

export default function CuentasTab({ session, settings, groups, accounts, accountTotals, categories, slLinks, onOpenSplitLedgerGroup, onOpenSplitLedgerExpense, reload, reloadCategories, showError, showInfo, view, setView, onSaveMoneyTransaction, onDeleteMoneyTransaction, onBookmarkMoneyTransaction }) {
  const balanceColor = (n) => (n > 0.004 ? "#3B6E62" : n < -0.004 ? "#B0473A" : "#6B6355");
  const [deletedOpen, setDeletedOpen] = useState(false);

  // Antes del primer return condicional a propósito — los hooks no pueden
  // llamarse condicionalmente (esta pantalla también puede devolver
  // <ManageAllAccounts> temprano, más abajo).
  const creditCardIds = accounts.filter((a) => a.is_credit_card && !a.deleted).map((a) => a.id);
  const { transactions: ccTx } = useCreditCardActivity(session.userId, creditCardIds);

  if (view.screen === "manageAllAccounts") {
    return (
      <ManageAllAccounts
        session={session}
        groups={groups}
        accounts={accounts}
        accountTotals={accountTotals}
        settings={settings}
        slLinks={slLinks}
        onOpenSplitLedgerGroup={onOpenSplitLedgerGroup}
        reload={reload}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setView({ screen: "list" })}
      />
    );
  }

  if (view.screen === "activity" || view.screen === "newTransaction" || view.screen === "editTransaction") {
    const activityAccount = accounts.find((a) => a.id === view.accountId);
    if (!activityAccount) { setView({ screen: "list" }); return null; }

    if (view.screen === "activity") {
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
        onOpenSplitLedgerExpense={onOpenSplitLedgerExpense}
        reloadCategories={reloadCategories}
        showError={showError}
        showInfo={showInfo}
        editingTransaction={view.transaction}
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
  const capital = balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const debt = balances.filter((b) => b.balance < 0).reduce((s, b) => s + b.balance, 0);
  const activeGroups = groups.filter((g) => !g.deleted);

  // Solo tiene sentido mostrar una cuenta eliminada acá si alguna vez tuvo
  // movimientos (si nunca tuvo transacciones, no hay ningún total que
  // "rescatar" — no aporta nada verla en esta lista).
  const deletedAccounts = accounts.filter((a) => a.deleted && accountTotals.some((t) => t.account_id === a.id));
  const deletedByGroup = groups
    .map((g) => ({ group: g, items: deletedAccounts.filter((a) => a.group_id === g.id) }))
    .filter((x) => x.items.length > 0);

  return (
    <div style={styles.screen}>
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
      <div style={{ ...styles.form, paddingTop: 12, gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", padding: "0 4px 8px" }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, fontSize: 12 }}>Capital</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: balanceColor(capital) }}>{money(capital, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, fontSize: 12 }}>A deber</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700, color: balanceColor(debt) }}>{money(debt, settings.main_currency)}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...styles.muted, padding: 0, fontSize: 12 }}>Balance</p>
            <p style={{ margin: "2px 0 0", fontWeight: 700 }}>{money(capital + debt, settings.main_currency)}</p>
          </div>
        </div>

        {activeGroups.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Todavía no tenés cuentas</p>
            <p style={{ ...styles.muted, padding: 0 }}>Tocá el lápiz arriba para crear tu primer grupo de cuentas.</p>
          </div>
        )}

        {activeGroups.map((g) => {
          const groupAccounts = accounts.filter((a) => a.group_id === g.id && !a.deleted);
          if (groupAccounts.length === 0) return null;
          const visibleAccounts = groupAccounts.filter((a) => !a.hidden);
          const gBalance = groupBalance(g.id, accounts, accountTotals);
          // Línea divisoria (mismo borde que el header) antes del grupo
          // "Split Ledger" — para que se note que no es un grupo común, es
          // el reflejo de tus grupos compartidos vinculados.
          const isSystemGroup = g.system_key === "split_ledger";
          return (
            <React.Fragment key={g.id}>
              {isSystemGroup && <div style={{ borderTop: "1px solid #ECE3D3" }} />}
              <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#FAF7F2", borderBottom: visibleAccounts.length ? "1px solid #F0EBE2" : "none" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>{g.name}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: balanceColor(gBalance) }}>{money(gBalance, settings.main_currency)}</span>
              </div>
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
                        <span style={{ color: balanceColor(cc.actual) }}>{money(cc.actual, settings.main_currency)}</span>
                        <span style={{ fontSize: 11, color: "#6B6355" }}>A pagar: {money(cc.pasado, settings.main_currency)}</span>
                      </span>
                    ) : (
                      <span style={{ color: balanceColor(accountBalance(a.id, accountTotals)), flexShrink: 0 }}>{money(accountBalance(a.id, accountTotals), settings.main_currency)}</span>
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
                  const groupTotal = items.reduce((s, a) => s + accountBalance(a.id, accountTotals), 0);
                  return (
                  <div key={group.id} style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#FAF7F2", borderBottom: "1px solid #F0EBE2" }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>{group.name}</span>
                      <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: balanceColor(groupTotal) }}>{money(groupTotal, settings.main_currency)}</span>
                    </div>
                    {items.map((a) => (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14, opacity: 0.6 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, textDecoration: "line-through" }}>
                          {a.icon && <span style={{ fontSize: 16, lineHeight: 1 }}>{a.icon}</span>}
                          {a.name}
                        </span>
                        <span style={{ color: balanceColor(accountBalance(a.id, accountTotals)), flexShrink: 0 }}>{money(accountBalance(a.id, accountTotals), settings.main_currency)}</span>
                      </div>
                    ))}
                  </div>
                  );
                })}
                <p style={{ ...styles.muted, padding: 0 }}>Las cuentas eliminadas no suman al balance general.</p>
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
    <div style={styles.screen}>
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
export function ManageAccounts({ session, group = null, groups, accounts, accountTotals, settings, slLinks, onOpenSplitLedgerGroup, reload, showError, showInfo, justCreated, onBack, onCreated, onDeleted }) {
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
  const [nameTouched, setNameTouched] = useState(false);

  // El grupo "Split Ledger" (auto-creado al vincular un grupo compartido) no
  // se renombra/borra a mano acá — se desvincula desde Split Ledger. Si no,
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
          confirmLabel="Eliminar"
          confirmDisabled={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
          style={{ margin: "6px 20px 12px", borderRadius: 12, borderTop: "1px solid #EBC9BA" }}
        />
      )}
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        <Field label="Nombre" required error={nameTouched && !name.trim() ? "Este campo es obligatorio." : ""}>
          <input style={styles.input} value={name} disabled={isSystemGroup} onChange={(e) => setName(e.target.value)} onBlur={() => setNameTouched(true)} placeholder={group ? undefined : "Nombre (ej: Santander, Efectivo)"} />
        </Field>
        {isSystemGroup && (
          <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
            Se crea solo al vincular un grupo de Split Ledger — se desvincula desde ahí, no se edita acá.
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
              onOpenAccount={(id) => openAccountOrSplitLedgerGroup(group, id, slLinks, onOpenSplitLedgerGroup, setViewingAccountId)}
            />
            {!isSystemGroup && (
              <button style={styles.btnDashed} onClick={() => setCreating(true)}>
                <Plus size={16} /> Nueva cuenta
              </button>
            )}
          </>
        )}
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onBack}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !canSave) ? 0.5 : 1 }} onClick={handleSave} disabled={saving}>
          {saving ? (group ? "Guardando…" : "Creando…") : (group ? "Guardar" : "Crear")}
        </button>
      </Footer>
    </div>
  );
}

// GESTOR DE CUENTAS — todos los grupos juntos en una sola pantalla plana
// (como en la app original: el lápiz de la tab Cuentas va directo acá, no a
// "Grupos de cuentas"). Cada grupo es solo un encabezado de sección — para
// renombrar/reordenar/crear GRUPOS está la pantalla separada "Grupos de
// cuentas", reachable únicamente desde Configuración.
export function ManageAllAccounts({ session, groups, accounts, accountTotals, settings, slLinks, onOpenSplitLedgerGroup, reload, showError, showInfo, onBack }) {
  const [creating, setCreating] = useState(false);
  const [viewingAccountId, setViewingAccountId] = useState(null);

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
    <div style={styles.screen}>
      <TopBar
        title="Gestor de cuentas"
        onBack={onBack}
        right={<button style={styles.iconBtnGhost} onClick={() => setCreating(true)} aria-label="Nueva cuenta"><Plus size={20} /></button>}
      />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        {groups.filter((g) => !g.deleted && accounts.some((a) => a.group_id === g.id && !a.deleted)).map((g) => (
          <div key={g.id}>
            <p style={styles.label}>{g.name}</p>
            <AccountGroupEditor
              group={g}
              accounts={accounts}
              reload={reload}
              showError={showError}
              onOpenAccount={(id) => openAccountOrSplitLedgerGroup(g, id, slLinks, onOpenSplitLedgerGroup, setViewingAccountId)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// La cuenta pseudo de un grupo vinculado de Split Ledger no es una cuenta de
// verdad — editarla no tiene sentido acá. Si el grupo es el sistema "Split
// Ledger", la flecha lleva al "Editar grupo" de Split Ledger en vez de abrir
// AccountDetailScreen (se busca el vínculo más reciente, activo o no, para
// no dejar la flecha muerta en una cuenta ya desvinculada).
function openAccountOrSplitLedgerGroup(group, accountId, slLinks, onOpenSplitLedgerGroup, onOpenAccount) {
  if (group?.system_key === "split_ledger") {
    const link = (slLinks || [])
      .filter((l) => l.pseudo_account_id === accountId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (link && onOpenSplitLedgerGroup) onOpenSplitLedgerGroup(link.group_id);
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
