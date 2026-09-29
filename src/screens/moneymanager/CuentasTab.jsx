import React, { useState, useEffect } from "react";
import { Pencil, Plus, X, ChevronRight, ChevronUp, ChevronDown, Menu, Eye, EyeOff } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { RootHeader, TopBar, ConfirmInline, Footer, IconInput } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { accountBalance, groupBalance } from "../../lib/moneyManagerData.js";

/* =========================================================================
   CUENTAS — tab de Money Manager. Aislado de Split Ledger (tablas mm_*).
   list: pantalla raíz (RootHeader, igual que Config/Tus Grupos).
   manageGroups / manageAccounts: pantallas de edición (TopBar).
   ========================================================================= */

export default function CuentasTab({ session, settings, groups, accounts, accountTotals, reload, showError, showInfo, view, setView }) {
  const balanceColor = (n) => (n > 0.004 ? "#3B6E62" : n < -0.004 ? "#B0473A" : "#6B6355");
  const [deletedOpen, setDeletedOpen] = useState(false);

  if (view.screen === "manageAllAccounts") {
    return (
      <ManageAllAccounts
        session={session}
        groups={groups}
        accounts={accounts}
        reload={reload}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setView({ screen: "list" })}
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
          return (
            <div key={g.id} style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#FAF7F2", borderBottom: visibleAccounts.length ? "1px solid #F0EBE2" : "none" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>{g.name}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: balanceColor(gBalance) }}>{money(gBalance, settings.main_currency)}</span>
              </div>
              {visibleAccounts.map((a) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {a.icon && <span style={{ fontSize: 16, lineHeight: 1 }}>{a.icon}</span>}
                    {a.name}
                  </span>
                  <span style={{ color: balanceColor(accountBalance(a.id, accountTotals)), flexShrink: 0 }}>{money(accountBalance(a.id, accountTotals), settings.main_currency)}</span>
                </div>
              ))}
            </div>
          );
        })}

        {deletedByGroup.length > 0 && (
          <div>
            <button
              style={styles.collapsibleHeader}
              onClick={() => setDeletedOpen((v) => !v)}
              aria-expanded={deletedOpen}
            >
              <span style={styles.label}>Cuentas eliminadas ({deletedAccounts.length})</span>
              {deletedOpen ? <ChevronUp size={18} color="#6B6355" /> : <ChevronDown size={18} color="#6B6355" />}
            </button>

            {deletedOpen && (
              <>
                {deletedByGroup.map(({ group, items }) => {
                  const groupTotal = items.reduce((s, a) => s + accountBalance(a.id, accountTotals), 0);
                  return (
                  <div key={group.id} style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden", marginTop: 8 }}>
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
                <p style={{ ...styles.muted, padding: 0, marginTop: 8 }}>Las cuentas eliminadas no suman al balance general.</p>
              </>
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
  const [names, setNames] = useState(() => Object.fromEntries(groups.map((g) => [g.id, g.name])));
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [order, setOrder] = useState(() => groups.map((g) => g.id));

  useEffect(() => {
    setOrder(groups.map((g) => g.id));
    setNames(Object.fromEntries(groups.map((g) => [g.id, g.name])));
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

  const renameGroup = async (id) => {
    const name = (names[id] || "").trim();
    const group = groups.find((g) => g.id === id);
    if (!name || name === group.name) return;
    try {
      const { error } = await supabase.from("mm_account_groups").update({ name }).eq("id", id);
      if (error) throw error;
      await reload();
      showInfo("Nombre actualizado.");
    } catch (e) { showError(`No se pudo renombrar: ${e?.message || e}`); }
  };

  const removeGroup = async (id) => {
    const name = groups.find((g) => g.id === id)?.name;
    try {
      const { error } = await supabase.from("mm_account_groups").update({ deleted: true }).eq("id", id);
      if (error) throw error;
      // El mensaje de confirmación avisa "se borran juntas" — hay que
      // cumplirlo de verdad, si no las cuentas quedan huérfanas (activas,
      // sumando al balance, pero invisibles porque su grupo ya no existe).
      const idsToDelete = accounts.filter((a) => a.group_id === id && !a.deleted).map((a) => a.id);
      if (idsToDelete.length) {
        const { error: accError } = await supabase.from("mm_accounts").update({ deleted: true }).in("id", idsToDelete);
        if (accError) throw accError;
      }
      await reload();
      showInfo(`"${name}" eliminado.`);
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setConfirmRemoveId(null);
  };

  if (creating) {
    return (
      <NewGroupForm
        session={session}
        groups={groups}
        reload={reload}
        showError={showError}
        onCancel={() => setCreating(false)}
        onCreated={() => setCreating(false)}
      />
    );
  }

  return (
    <div style={styles.screen}>
      <TopBar
        title="Tipos de cuentas"
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
                const accCount = accounts.filter((a) => a.group_id === id && !a.deleted).length;
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
                      isConfirming={confirmRemoveId === id}
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
      </div>
    </div>
  );
}

// Formulario de "nuevo grupo" propio (TopBar + Footer), mismo patrón que
// NewAccountForm — reemplaza el input+select+botón sueltos que había abajo.
function NewGroupForm({ session, groups, reload, showError, onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = !!name.trim();

  const create = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_account_groups").insert({
        user_id: session.userId, name: name.trim(), type: "other", sort_order: groups.length,
      });
      if (error) throw error;
      await reload();
      onCreated();
    } catch (e) { showError(`No se pudo crear: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Nuevo grupo" onBack={onCancel} />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        <label style={styles.label}>
          Nombre
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Santander, Efectivo)" onKeyDown={(e) => e.key === "Enter" && canSave && create()} />
        </label>
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onCancel}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !canSave) ? 0.5 : 1 }} onClick={create} disabled={saving || !canSave}>
          {saving ? "Creando…" : "Crear"}
        </button>
      </Footer>
    </div>
  );
}

function SortableGroupRow({ group, name, onChangeName, onBlur, onOpen, onRemove, accCount, isConfirming }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 6, padding: "6px 8px 6px 4px", borderRadius: isConfirming ? "10px 10px 0 0" : 10 }}>
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

export function ManageAccounts({ session, group, accounts, reload, showError, showInfo, onBack }) {
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <NewAccountForm
        session={session}
        groups={[group]}
        defaultGroupId={group.id}
        reload={reload}
        showError={showError}
        onCancel={() => setCreating(false)}
        onCreated={() => setCreating(false)}
      />
    );
  }

  return (
    <div style={styles.screen}>
      <TopBar
        title={group.name}
        onBack={onBack}
        right={<button style={styles.iconBtnGhost} onClick={() => setCreating(true)} aria-label="Nueva cuenta"><Plus size={20} /></button>}
      />
      <div style={styles.form}>
        <AccountGroupEditor group={group} accounts={accounts} reload={reload} showError={showError} showInfo={showInfo} />
      </div>
    </div>
  );
}

// GESTOR DE CUENTAS — todos los grupos juntos en una sola pantalla plana
// (como en la app original: el lápiz de la tab Cuentas va directo acá, no a
// "Tipos de cuentas"). Cada grupo es solo un encabezado de sección — para
// renombrar/reordenar/crear GRUPOS está la pantalla separada "Tipos de
// cuentas", reachable únicamente desde Configuración.
export function ManageAllAccounts({ session, groups, accounts, reload, showError, showInfo, onBack }) {
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <NewAccountForm
        session={session}
        groups={groups.filter((g) => !g.deleted)}
        reload={reload}
        showError={showError}
        onCancel={() => setCreating(false)}
        onCreated={() => setCreating(false)}
      />
    );
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
            <AccountGroupEditor group={g} accounts={accounts} reload={reload} showError={showError} showInfo={showInfo} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Formulario de "nueva cuenta" propio (TopBar + Footer, como el resto de la
// app) — reemplaza el input+botón sueltos que había repetidos por cada grupo.
// El select de grupo solo aparece si hay más de uno para elegir (en
// ManageAccounts, llamado desde un solo grupo, no hace falta preguntarlo).
function NewAccountForm({ session, groups, defaultGroupId, reload, showError, onCancel, onCreated }) {
  const [groupId, setGroupId] = useState(defaultGroupId || groups[0]?.id || "");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = !!groupId && !!name.trim();

  const create = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_accounts").insert({
        user_id: session.userId, group_id: groupId, name: name.trim(), icon: icon || null, sort_order: 999,
      });
      if (error) throw error;
      await reload();
      onCreated();
    } catch (e) { showError(`No se pudo crear: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Nueva cuenta" onBack={onCancel} />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        {groups.length > 1 && (
          <label style={styles.label}>
            Tipo de cuenta
            <select style={styles.input} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
        <label style={styles.label}>
          Nombre
          <div style={{ display: "flex", gap: 8 }}>
            <IconInput value={icon} onChange={setIcon} />
            <input style={{ ...styles.input, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Saldo, Ahorros)" onKeyDown={(e) => e.key === "Enter" && canSave && create()} />
          </div>
        </label>
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onCancel}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !canSave) ? 0.5 : 1 }} onClick={create} disabled={saving || !canSave}>
          {saving ? "Creando…" : "Crear"}
        </button>
      </Footer>
    </div>
  );
}

// Todas las cuentas de un grupo (arrastrar, renombrar, ocultar, borrar, crear
// nueva) — sin el TopBar/wrapper de pantalla, para poder repetirlo una vez
// por grupo en "Gestor de cuentas" (todos los grupos juntos en una sola
// pantalla) y también solo, en ManageAccounts (cuando se llega desde "Tipos
// de cuentas" y elegís un único grupo).
function AccountGroupEditor({ group, accounts, reload, showError, showInfo }) {
  const groupAccounts = accounts.filter((a) => a.group_id === group.id && !a.deleted);
  const [names, setNames] = useState(() => Object.fromEntries(groupAccounts.map((a) => [a.id, a.name])));
  const [icons, setIcons] = useState(() => Object.fromEntries(groupAccounts.map((a) => [a.id, a.icon])));
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [order, setOrder] = useState(() => groupAccounts.map((a) => a.id));

  useEffect(() => {
    setOrder(groupAccounts.map((a) => a.id));
    setNames(Object.fromEntries(groupAccounts.map((a) => [a.id, a.name])));
    setIcons(Object.fromEntries(groupAccounts.map((a) => [a.id, a.icon])));
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
      showInfo("Nombre actualizado.");
    } catch (e) { showError(`No se pudo renombrar: ${e?.message || e}`); }
  };

  const saveIcon = async (id, icon) => {
    const acc = groupAccounts.find((a) => a.id === id);
    if ((icon || null) === (acc.icon || null)) return;
    try {
      const { error } = await supabase.from("mm_accounts").update({ icon: icon || null }).eq("id", id);
      if (error) throw error;
      await reload();
      showInfo("Ícono actualizado.");
    } catch (e) { showError(`No se pudo guardar el ícono: ${e?.message || e}`); }
  };

  const toggleHidden = async (id) => {
    const acc = groupAccounts.find((a) => a.id === id);
    try {
      const { error } = await supabase.from("mm_accounts").update({ hidden: !acc.hidden }).eq("id", id);
      if (error) throw error;
      await reload();
    } catch (e) { showError(`No se pudo actualizar: ${e?.message || e}`); }
  };

  const removeAccount = async (id) => {
    const name = groupAccounts.find((a) => a.id === id)?.name;
    try {
      const { error } = await supabase.from("mm_accounts").update({ deleted: true }).eq("id", id);
      if (error) throw error;
      await reload();
      showInfo(`"${name}" eliminada.`);
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setConfirmRemoveId(null);
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
                    name={names[id] ?? a.name}
                    icon={icons[id] ?? a.icon}
                    hidden={a.hidden}
                    onChangeName={(v) => setNames((prev) => ({ ...prev, [id]: v }))}
                    onBlur={() => renameAccount(id)}
                    onChangeIcon={(v) => { setIcons((prev) => ({ ...prev, [id]: v })); saveIcon(id, v); }}
                    onToggleHidden={() => toggleHidden(id)}
                    onRemove={() => setConfirmRemoveId(id)}
                    isConfirming={confirmRemoveId === id}
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
    </>
  );
}

function SortableAccountRow({ id, name, icon, hidden, onChangeName, onBlur, onChangeIcon, onToggleHidden, onRemove, isConfirming }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 6, padding: "6px 8px 6px 4px", borderRadius: isConfirming ? "10px 10px 0 0" : 10 }}>
      <span {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", width: 28, color: "#C9BBA0", cursor: "grab", touchAction: "none" }}>
        <Menu size={18} />
      </span>
      <IconInput value={icon} onChange={onChangeIcon} />
      <input style={{ ...styles.input, flex: 1, padding: "7px 10px", fontSize: 14, opacity: hidden ? 0.5 : 1 }} value={name} onChange={(e) => onChangeName(e.target.value)} onBlur={onBlur} />
      <button style={styles.iconBtnGhost} onClick={onToggleHidden} aria-label={hidden ? "Mostrar cuenta" : "Ocultar cuenta"}>
        {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      <button style={styles.iconBtnGhost} onClick={onRemove} aria-label="Borrar cuenta">
        <X size={16} />
      </button>
    </div>
  );
}
