import React, { useState, useEffect } from "react";
import { Pencil, Plus, X, ChevronRight, Menu } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { RootHeader, TopBar, ConfirmInline } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { ACCOUNT_TYPES, accountBalance, groupBalance } from "../../lib/moneyManagerData.js";

/* =========================================================================
   CUENTAS — tab de Money Manager. Aislado de Split Ledger (tablas mm_*).
   list: pantalla raíz (RootHeader, igual que Config/Tus Grupos).
   manageGroups / manageAccounts: pantallas de edición (TopBar).
   ========================================================================= */

export default function CuentasTab({ session, settings, groups, accounts, transactions, reload, showError, view, setView }) {
  const balanceColor = (n) => (n > 0.004 ? "#3B6E62" : n < -0.004 ? "#B0473A" : "#6B6355");

  if (view.screen === "manageGroups") {
    return (
      <ManageGroups
        session={session}
        groups={groups}
        accounts={accounts}
        reload={reload}
        showError={showError}
        onBack={() => setView({ screen: "list" })}
        onOpenGroup={(groupId) => setView({ screen: "manageAccounts", groupId })}
      />
    );
  }

  if (view.screen === "manageAccounts") {
    const group = groups.find((g) => g.id === view.groupId);
    if (!group) { setView({ screen: "manageGroups" }); return null; }
    return (
      <ManageAccounts
        session={session}
        group={group}
        accounts={accounts}
        reload={reload}
        showError={showError}
        onBack={() => setView({ screen: "manageGroups" })}
      />
    );
  }

  const balances = accounts.map((a) => ({ account: a, balance: accountBalance(a.id, transactions, settings) }));
  const capital = balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const debt = balances.filter((b) => b.balance < 0).reduce((s, b) => s + b.balance, 0);

  return (
    <div style={styles.screen}>
      <RootHeader
        title="Cuentas"
        right={
          <div style={{ display: "flex", gap: 4 }}>
            <button style={styles.iconBtnGhost} onClick={() => setView({ screen: "manageGroups" })} aria-label="Editar cuentas">
              <Pencil size={19} />
            </button>
          </div>
        }
      />
      <div style={{ ...styles.form, paddingTop: 12 }}>
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

        {groups.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Todavía no tenés cuentas</p>
            <p style={{ ...styles.muted, padding: 0 }}>Tocá el lápiz arriba para crear tu primer grupo de cuentas.</p>
          </div>
        )}

        {groups.map((g) => {
          const groupAccounts = accounts.filter((a) => a.group_id === g.id);
          if (groupAccounts.length === 0) return null;
          const gBalance = groupBalance(g.id, accounts, transactions, settings);
          return (
            <div key={g.id} style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#FAF7F2", borderBottom: "1px solid #F0EBE2" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>{g.name}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: balanceColor(gBalance) }}>{money(gBalance, settings.main_currency)}</span>
              </div>
              {groupAccounts.map((a) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
                  <span>{a.name}</span>
                  <span style={{ color: balanceColor(accountBalance(a.id, transactions, settings)) }}>{money(accountBalance(a.id, transactions, settings), settings.main_currency)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   GESTIONAR GRUPOS DE CUENTAS
   ========================================================================= */

export function ManageGroups({ session, groups, accounts, reload, showError, onBack, onOpenGroup }) {
  const [names, setNames] = useState(() => Object.fromEntries(groups.map((g) => [g.id, g.name])));
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("other");
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [order, setOrder] = useState(() => groups.map((g) => g.id));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrder(groups.map((g) => g.id));
    setNames(Object.fromEntries(groups.map((g) => [g.id, g.name])));
  }, [groups]);

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

  const renameGroup = async (id) => {
    const name = (names[id] || "").trim();
    const group = groups.find((g) => g.id === id);
    if (!name || name === group.name) return;
    try {
      const { error } = await supabase.from("mm_account_groups").update({ name }).eq("id", id);
      if (error) throw error;
      await reload();
    } catch (e) { showError(`No se pudo renombrar: ${e?.message || e}`); }
  };

  const removeGroup = async (id) => {
    try {
      const { error } = await supabase.from("mm_account_groups").update({ deleted: true }).eq("id", id);
      if (error) throw error;
      await reload();
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setConfirmRemoveId(null);
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_account_groups").insert({
        user_id: session.userId, name: newName.trim(), type: newType, sort_order: groups.length,
      });
      if (error) throw error;
      setNewName("");
      setNewType("other");
      await reload();
    } catch (e) { showError(`No se pudo crear: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Gestionar cuentas" onBack={onBack} />
      <div style={styles.form}>
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {order.map((id) => {
                const g = groups.find((x) => x.id === id);
                if (!g) return null;
                const accCount = accounts.filter((a) => a.group_id === id).length;
                return (
                  <div key={id}>
                    <SortableGroupRow
                      group={g}
                      name={names[id] ?? g.name}
                      onChangeName={(v) => setNames((prev) => ({ ...prev, [id]: v }))}
                      onBlur={() => renameGroup(id)}
                      onOpen={() => onOpenGroup(id)}
                      onRemove={() => setConfirmRemoveId(id)}
                      accCount={accCount}
                    />
                    {confirmRemoveId === id && (
                      <ConfirmInline
                        message={accCount > 0 ? `"${g.name}" tiene ${accCount} cuenta(s) adentro — se borran juntas. ¿Continuar?` : `¿Borrar "${g.name}"?`}
                        confirmLabel="Borrar"
                        onCancel={() => setConfirmRemoveId(null)}
                        onConfirm={() => removeGroup(id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        <p style={styles.label}>Nuevo grupo</p>
        <input style={styles.input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre (ej: Santander, Efectivo)" />
        <select style={styles.input} value={newType} onChange={(e) => setNewType(e.target.value)}>
          {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button style={{ ...styles.btnPrimary, opacity: (saving || !newName.trim()) ? 0.5 : 1 }} onClick={createGroup} disabled={saving || !newName.trim()}>
          <Plus size={16} /> Crear grupo
        </button>
      </div>
    </div>
  );
}

function SortableGroupRow({ group, name, onChangeName, onBlur, onOpen, onRemove, accCount }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 6, padding: "6px 8px 6px 4px" }}>
      <span {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", width: 28, color: "#C9BBA0", cursor: "grab", touchAction: "none" }}>
        <Menu size={18} />
      </span>
      <input style={{ ...styles.input, flex: 1, padding: "7px 10px", fontSize: 14 }} value={name} onChange={(e) => onChangeName(e.target.value)} onBlur={onBlur} />
      <button style={styles.iconBtnGhost} onClick={onOpen} aria-label={`Cuentas de ${group.name} (${accCount})`}>
        <ChevronRight size={18} color="#A89A87" />
      </button>
      <button style={styles.iconBtnGhost} onClick={onRemove} aria-label="Borrar grupo">
        <X size={16} />
      </button>
    </div>
  );
}

/* =========================================================================
   GESTIONAR CUENTAS DE UN GRUPO
   ========================================================================= */

export function ManageAccounts({ session, group, accounts, reload, showError, onBack }) {
  const groupAccounts = accounts.filter((a) => a.group_id === group.id);
  const [names, setNames] = useState(() => Object.fromEntries(groupAccounts.map((a) => [a.id, a.name])));
  const [newName, setNewName] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [order, setOrder] = useState(() => groupAccounts.map((a) => a.id));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrder(groupAccounts.map((a) => a.id));
    setNames(Object.fromEntries(groupAccounts.map((a) => [a.id, a.name])));
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

  const renameAccount = async (id) => {
    const name = (names[id] || "").trim();
    const acc = groupAccounts.find((a) => a.id === id);
    if (!name || name === acc.name) return;
    try {
      const { error } = await supabase.from("mm_accounts").update({ name }).eq("id", id);
      if (error) throw error;
      await reload();
    } catch (e) { showError(`No se pudo renombrar: ${e?.message || e}`); }
  };

  const removeAccount = async (id) => {
    try {
      const { error } = await supabase.from("mm_accounts").update({ deleted: true }).eq("id", id);
      if (error) throw error;
      await reload();
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setConfirmRemoveId(null);
  };

  const createAccount = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_accounts").insert({
        user_id: session.userId, group_id: group.id, name: newName.trim(), sort_order: groupAccounts.length,
      });
      if (error) throw error;
      setNewName("");
      await reload();
    } catch (e) { showError(`No se pudo crear: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title={group.name} onBack={onBack} />
      <div style={styles.form}>
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
                      name={names[id] ?? a.name}
                      onChangeName={(v) => setNames((prev) => ({ ...prev, [id]: v }))}
                      onBlur={() => renameAccount(id)}
                      onRemove={() => setConfirmRemoveId(id)}
                    />
                    {confirmRemoveId === id && (
                      <ConfirmInline
                        message={`¿Borrar "${a.name}"?`}
                        confirmLabel="Borrar"
                        onCancel={() => setConfirmRemoveId(null)}
                        onConfirm={() => removeAccount(id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        <p style={styles.label}>Nueva cuenta</p>
        <input style={styles.input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre (ej: Saldo, Ahorros)" onKeyDown={(e) => e.key === "Enter" && newName.trim() && createAccount()} />
        <button style={{ ...styles.btnPrimary, opacity: (saving || !newName.trim()) ? 0.5 : 1 }} onClick={createAccount} disabled={saving || !newName.trim()}>
          <Plus size={16} /> Crear cuenta
        </button>
      </div>
    </div>
  );
}

function SortableAccountRow({ id, name, onChangeName, onBlur, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 6, padding: "6px 8px 6px 4px" }}>
      <span {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", width: 28, color: "#C9BBA0", cursor: "grab", touchAction: "none" }}>
        <Menu size={18} />
      </span>
      <input style={{ ...styles.input, flex: 1, padding: "7px 10px", fontSize: 14 }} value={name} onChange={(e) => onChangeName(e.target.value)} onBlur={onBlur} />
      <button style={styles.iconBtnGhost} onClick={onRemove} aria-label="Borrar cuenta">
        <X size={16} />
      </button>
    </div>
  );
}
