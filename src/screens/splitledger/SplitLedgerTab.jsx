import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../../lib/supabaseClient.js";
import {
  Plus, Receipt, X, ChevronRight, ArrowRight, Check, Trash2, Settings,
  RefreshCw, HandCoins, UserPlus, AlertCircle, Repeat, ChevronUp,
  ChevronDown as ChevronDownIcon, Camera, User, PenLine, Pencil, Send,
} from "lucide-react";
import { styles } from "../../lib/styles.js";
import { TopBar, ConfirmInline, Modal, Footer } from "../../components/Shared.jsx";
import {
  uid, CURRENCIES, CURRENCY_LIST, money, ICON_KEYS, IconComp,
  DEFAULT_CATEGORIES, groupCategories, catInfo, colorFor, initials, shortName,
  computeBalances, simplifyDebts, toBase, fairSplit, computeShares,
  dateInputValue, todayInputValue, fmtDate, freqLabel,
  useImageUpload, resolvePhotoUrl,
} from "../../lib/helpers.jsx";

/* =========================================================================
   TAB DE SPLIT LEDGER — recibe del shell raíz: la sesión, los grupos
   (useGroups vive arriba porque Configuración también los necesita), el
   estado de navegación interna (view/setView, también levantado para que
   Configuración pueda abrir "crear grupo" o "ver invitación" empujando
   este mismo estado) y los toasts (compartidos con Configuración).
   ========================================================================= */

export default function SplitLedgerTab({
  session, groups, loading, reloadGroup, deleteGroup,
  view, setView, showError, showSuccess, showInfo,
}) {
  const [groupInvites, setGroupInvites] = useState([]); // invitaciones pendientes del grupo que estoy editando

  const loadGroupInvites = useCallback(async (groupId) => {
    const { data, error } = await supabase
      .from("invites")
      .select("id, member_id, profiles!to_user_id(username)")
      .eq("group_id", groupId)
      .eq("status", "pending");
    if (error) { setGroupInvites([]); return; }
    setGroupInvites(data.map((i) => ({ inviteId: i.id, memberId: i.member_id, username: i.profiles?.username })));
  }, []);

  // Cargar invitaciones pendientes del grupo que se está editando/invitando
  useEffect(() => {
    if ((view.screen === "editGroup" || view.screen === "inviteScreen") && view.groupId) {
      loadGroupInvites(view.groupId);
    }
  }, [view.screen, view.groupId, loadGroupInvites]);

  const activeGroup = useMemo(
    () => (groups && view.groupId ? groups.find((g) => g.id === view.groupId) : null),
    [groups, view.groupId]
  );

  return (
    <>
      {view.screen === "home" && (
        <Home
          groups={groups}
          loading={loading}
          onOpen={(id) => setView({ screen: "group", groupId: id })}
          onNewExpense={() => setView({ screen: "newExpense" })}
        />
      )}

      {view.screen === "newGroup" && (
        <NewGroup
          onCancel={() => setView({ screen: "home" })}
          session={session}
          onCreate={async ({ name, baseCurrency, members, photoUrl }) => {
            try {
              const { data: groupRow, error: e1 } = await supabase
                .from("groups")
                .insert({ name, base_currency: baseCurrency, photo_url: photoUrl, creator_id: session.userId })
                .select("id")
                .single();
              if (e1) throw e1;
              const groupId = groupRow.id;
              const { error: e2 } = await supabase.from("group_members").insert(
                members.map((m) => ({ group_id: groupId, name: m.name, linked_user_id: m.linkedUserId || null }))
              );
              if (e2) throw e2;
              const { error: e3 } = await supabase.from("categories").insert(
                DEFAULT_CATEGORIES.map((c, i) => ({ group_id: groupId, label: c.label, icon_key: c.iconKey, sort_order: i }))
              );
              if (e3) throw e3;
              await reloadGroup(groupId);
              setView({ screen: "group", groupId });
            } catch (e) {
              showError(`No se pudo guardar el grupo: ${e?.message || e}`);
            }
          }}
        />
      )}

      {view.screen === "group" && activeGroup && (
        <GroupView
          group={activeGroup}
          onBack={() => setView({ screen: "home" })}
          onAddExpense={() => setView({ screen: "newExpense", groupId: activeGroup.id })}
          onOpenExpense={(expenseId) => setView({ screen: "expenseDetail", groupId: activeGroup.id, expenseId })}
          onSettleUp={(prefill) => setView({ screen: "settleUp", groupId: activeGroup.id, prefill })}
          onEditGroup={() => setView({ screen: "editGroup", groupId: activeGroup.id })}
          onRecurring={() => setView({ screen: "recurring", groupId: activeGroup.id })}
          onSoftDeleteExpense={async (expenseId) => {
            try {
              const { error } = await supabase.from("expenses").update({ deleted: true }).eq("id", expenseId);
              if (error) throw error;
              await reloadGroup(activeGroup.id);
            } catch (e) { showError(`No se pudo borrar el gasto: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "expenseDetail" && activeGroup && (
        <ExpenseDetail
          group={activeGroup}
          expenseId={view.expenseId}
          onBack={() => setView({ screen: "group", groupId: activeGroup.id })}
          onEdit={(expenseId) => setView({ screen: "newExpense", groupId: activeGroup.id, expenseId })}
        />
      )}

      {view.screen === "newExpense" && (!view.groupId || activeGroup) && (
        <NewExpense
          group={activeGroup || null}
          groups={groups}
          defaultGroupId={session.defaultGroupId}
          expenseId={view.expenseId}
          onCancel={() => setView(
            view.groupId
              ? (view.expenseId
                  ? { screen: "expenseDetail", groupId: view.groupId, expenseId: view.expenseId }
                  : { screen: "group", groupId: view.groupId })
              : { screen: "home" }
          )}
          onSave={async (expense) => {
            const groupId = activeGroup?.id ?? expense.groupId;
            const exists = !!expense.id;
            const payload = {
              group_id: groupId,
              description: expense.description,
              amount: expense.amount,
              currency: expense.currency,
              category_id: expense.category,
              date: new Date(expense.date).toISOString(),
              notes: expense.notes || null,
              image_url: expense.imageUrl || null,
              split_mode: expense.splitMode,
              payers: expense.payers,
              shares: expense.shares,
            };
            try {
              if (exists) {
                const { error } = await supabase.from("expenses").update(payload).eq("id", expense.id);
                if (error) throw error;
              } else {
                const { error } = await supabase.from("expenses").insert(payload);
                if (error) throw error;
              }
              await reloadGroup(groupId);
              setView(
                exists
                  ? { screen: "expenseDetail", groupId, expenseId: expense.id }
                  : { screen: "group", groupId }
              );
            } catch (e) { showError(`No se pudo guardar el gasto: ${e?.message || e}`); }
          }}
          onDelete={async (expenseId) => {
            try {
              const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
              if (error) throw error;
              await reloadGroup(activeGroup.id);
              setView({ screen: "group", groupId: activeGroup.id });
            } catch (e) { showError(`No se pudo borrar el gasto: ${e?.message || e}`); }
          }}
          onSaveRecurring={async (template) => {
            const groupId = activeGroup?.id ?? template.groupId;
            try {
              const { error } = await supabase.from("recurring_expenses").insert({
                group_id: groupId,
                description: template.description,
                amount: template.amount,
                currency: template.currency,
                category_id: template.category,
                split_mode: template.splitMode,
                payers: template.payers,
                shares: template.shares,
                frequency: template.frequency,
                next_date: new Date(template.nextDate).toISOString(),
              });
              if (error) throw error;
              await reloadGroup(groupId);
              setView({ screen: "group", groupId });
            } catch (e) { showError(`No se pudo crear el gasto recurrente: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "settleUp" && activeGroup && (
        <SettleUp
          group={activeGroup}
          prefill={view.prefill}
          onCancel={() => setView({ screen: "group", groupId: activeGroup.id })}
          onSave={async (payment) => {
            try {
              const { error } = await supabase.from("payments").insert({
                group_id: activeGroup.id,
                from_member_id: payment.from,
                to_member_id: payment.to,
                amount: payment.amount,
                currency: payment.currency,
                date: new Date(payment.date).toISOString(),
                note: payment.note || null,
              });
              if (error) throw error;
              await reloadGroup(activeGroup.id);
              setView({ screen: "group", groupId: activeGroup.id });
            } catch (e) { showError(`No se pudo registrar el pago: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "editGroup" && activeGroup && (
        <EditGroup
          key={`${JSON.stringify(groupInvites)}-${activeGroup.members.length}`}
          group={activeGroup}
          session={session}
          onCancel={() => setView({ screen: "group", groupId: activeGroup.id })}
          onSave={async ({ name, baseCurrency, rates, photoUrl, membersToAdd, memberIdsToRemove, categoriesToAdd, categoriesToUpdate, categoryIdsToRemove }) => {
            try {
              const { error: e1 } = await supabase
                .from("groups")
                .update({ name, base_currency: baseCurrency, rates, photo_url: photoUrl })
                .eq("id", activeGroup.id);
              if (e1) throw e1;
              if (memberIdsToRemove.length) {
                const { error } = await supabase.from("group_members").delete().in("id", memberIdsToRemove);
                if (error) throw error;
              }
              if (membersToAdd.length) {
                const { error } = await supabase.from("group_members").insert(
                  membersToAdd.map((m) => ({ group_id: activeGroup.id, name: m.name }))
                );
                if (error) throw error;
              }
              if (categoryIdsToRemove.length) {
                const { error } = await supabase.from("categories").delete().in("id", categoryIdsToRemove);
                if (error) throw error;
              }
              for (const c of categoriesToUpdate) {
                const { error } = await supabase
                  .from("categories")
                  .update({ label: c.label, icon_key: c.iconKey, sort_order: c.sortOrder })
                  .eq("id", c.id);
                if (error) throw error;
              }
              if (categoriesToAdd.length) {
                const { error } = await supabase.from("categories").insert(
                  categoriesToAdd.map((c) => ({ group_id: activeGroup.id, label: c.label, icon_key: c.iconKey, sort_order: c.sortOrder }))
                );
                if (error) throw error;
              }
              await reloadGroup(activeGroup.id);
              setView({ screen: "group", groupId: activeGroup.id });
            } catch (e) { showError(`No se pudo guardar el grupo: ${e?.message || e}`); }
          }}
          onDeleteGroup={async () => {
            try {
              await deleteGroup(activeGroup.id);
              setView({ screen: "home" });
            } catch (e) { showError(`No se pudo borrar el grupo: ${e?.message || e}`); }
          }}
          onInvite={() => setView({ screen: "inviteScreen", groupId: activeGroup.id })}
          groupInvites={groupInvites}
          showError={showError}
        />
      )}

      {view.screen === "inviteScreen" && activeGroup && (
        <InviteScreen
          key={JSON.stringify(groupInvites)}
          group={activeGroup}
          session={session}
          groupInvites={groupInvites}
          onBack={() => setView({ screen: "editGroup", groupId: activeGroup.id })}
          onSend={async ({ memberId, targetUsername }) => {
            try {
              const uname = targetUsername.trim().toLowerCase();
              const { data: target, error: e0 } = await supabase
                .from("profiles").select("id").eq("username", uname).maybeSingle();
              if (e0) throw e0;
              if (!target) throw new Error(`Usuario "${targetUsername}" no encontrado.`);
              const { data: already } = await supabase
                .from("invites").select("id")
                .eq("member_id", memberId).eq("status", "pending").maybeSingle();
              if (already) throw new Error("Ya existe una invitación para ese miembro.");
              const { error: e1 } = await supabase.from("invites").insert({
                group_id: activeGroup.id,
                member_id: memberId,
                from_user_id: session.userId,
                to_user_id: target.id,
                status: "pending",
              });
              if (e1) throw e1;
              await loadGroupInvites(activeGroup.id);
              showSuccess(`Invitación enviada a @${uname}`);
            } catch (e) { showError(`No se pudo enviar la invitación: ${e?.message || e}`); }
          }}
          onCancelInvite={async (memberId) => {
            try {
              const pending = groupInvites.find((i) => i.memberId === memberId);
              if (!pending) return;
              const { error } = await supabase.from("invites").delete().eq("id", pending.inviteId);
              if (error) throw error;
              await loadGroupInvites(activeGroup.id);
              showInfo(`Invitación a @${pending.username} cancelada`);
            } catch (e) { showError(`No se pudo cancelar la invitación: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "recurring" && activeGroup && (
        <RecurringList
          group={activeGroup}
          onBack={() => setView({ screen: "group", groupId: activeGroup.id })}
          onTogglePause={async (recurringId, paused) => {
            try {
              const { error } = await supabase.from("recurring_expenses").update({ paused }).eq("id", recurringId);
              if (error) throw error;
              await reloadGroup(activeGroup.id);
            } catch (e) { showError(`No se pudo actualizar: ${e?.message || e}`); }
          }}
          onRemove={async (recurringId) => {
            try {
              const { error } = await supabase.from("recurring_expenses").delete().eq("id", recurringId);
              if (error) throw error;
              await reloadGroup(activeGroup.id);
            } catch (e) { showError(`No se pudo actualizar: ${e?.message || e}`); }
          }}
        />
      )}
    </>
  );
}

/* =========================================================================
   HOME
   ========================================================================= */

function Home({ groups, loading, onOpen, onNewExpense }) {
  return (
    <div style={styles.screen}>
      <header style={styles.homeHeader}>
        <h1 style={styles.h1}>Tus grupos</h1>
      </header>

      {loading && <p style={styles.muted}>Abriendo los grupos…</p>}

      {!loading && groups && groups.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}><Receipt size={28} strokeWidth={1.5} /></div>
          <p style={styles.emptyTitle}>Todavía no hay ningún grupo</p>
          <p style={styles.muted}>
            Crea tu primer grupo desde Configuración → Split Ledger — un viaje,
            un piso, una junta — y empieza a anotar quién paga qué.
          </p>
        </div>
      )}

      {!loading && groups && groups.length > 0 && (
        <ul style={styles.groupList}>
          {groups.map((g) => {
            const bal = computeBalances(g);
            const total = g.expenses.filter(e => !e.deleted).reduce((s, e) => s + toBase(e.amount, e.currency, g), 0);
            const settled = Object.values(bal).every((v) => Math.abs(v) < 0.01);
            return (
              <li key={g.id}>
                <button style={styles.groupCard} onClick={() => onOpen(g.id)}>
                  <div style={styles.groupCardLeft}>
                    <div style={{ width: 48, height: 48, minWidth: 48, borderRadius: 12, overflow: "hidden", background: g.photoUrl ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {g.photoUrl
                        ? <img src={g.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <User size={22} color="#A89A87" />
                      }
                    </div>
                    <div>
                      <p style={styles.groupName}>{g.name}</p>
                      <p style={styles.groupMeta}>
                        {g.members.length} personas · {money(total, g.baseCurrency)} en total
                        {settled && g.expenses.length > 0 ? " · saldado" : ""}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={20} color="#A89A87" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* FAB flotante para agregar un gasto — sin grupos todavía no hay a dónde agregarlo.
          bottom más alto que el default: acá siempre está visible la barra de 5 tabs. */}
      {!loading && groups && groups.length > 0 && (
        <button style={{ ...styles.fab, bottom: "calc(78px + env(safe-area-inset-bottom))" }} onClick={onNewExpense} aria-label="Agregar gasto">
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   NEW GROUP
   ========================================================================= */

function NewGroup({ onCancel, onCreate, session }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState([""]);
  const [baseCurrency, setBaseCurrency] = useState("EUR");
  const [err, setErr] = useState("");
  const { previewUrl: photoUrl, pendingFile, removed, handleImageChange: handlePhoto, clear: clearPhoto } = useImageUpload(null, setErr);
  const [saving, setSaving] = useState(false);

  const updateMember = (i, val) => setMembers((prev) => prev.map((m, idx) => (idx === i ? val : m)));
  const addMemberField = () => setMembers((prev) => [...prev, ""]);
  const removeMemberField = (i) => setMembers((prev) => prev.filter((_, idx) => idx !== i));
  const hasEnoughMembers = members.some((n) => n.trim());

  const handleCreate = async () => {
    if (!name.trim()) { setErr("Ponle un nombre al grupo."); return; }
    if (!hasEnoughMembers) { setErr("El grupo necesita al menos dos personas."); return; }
    setSaving(true);
    try {
      const resolvedPhotoUrl = await resolvePhotoUrl({ pendingFile, removed, currentUrl: null });
      // Creador siempre incluido como miembro vinculado
      const myMember = { name: session.displayName, linkedUserId: session.userId };
      const otherMembers = members.map((n) => n.trim()).filter(Boolean).map((n) => ({ name: n }));
      await onCreate({
        name: name.trim(),
        baseCurrency,
        members: [myMember, ...otherMembers],
        photoUrl: resolvedPhotoUrl,
      });
    } catch (e) {
      setErr(`No se pudo subir la foto: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Nuevo grupo" onBack={onCancel} />
      <div style={styles.form}>
        {/* Foto del grupo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 72, height: 72, minWidth: 72, borderRadius: 16, overflow: "hidden", background: photoUrl ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #DDD2BE" }}>
            {photoUrl
              ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <User size={28} color="#A89A87" />
            }
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ ...styles.btnDashed, cursor: "pointer", fontSize: 13 }}>
              <Camera size={14} /> {photoUrl ? "Cambiar foto" : "Añadir foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
            </label>
            {photoUrl && (
              <button style={{ ...styles.btnGhostSmall, fontSize: 12 }} onClick={clearPhoto}>Quitar foto</button>
            )}
          </div>
        </div>

        <label style={styles.label}>
          Nombre del grupo
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Viaje a Lisboa, Piso compartido…" autoFocus />
        </label>

        <label style={styles.label}>
          Moneda principal del grupo
          <select style={styles.input} value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </label>
        <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
          Los balances se calculan en esta moneda. Puedes registrar gastos en otras y definir su tasa de cambio.
        </p>

        <p style={styles.label}>Integrantes</p>

        {/* Tú — fijo, no se puede quitar */}
        <div style={{ ...styles.shareRow, background: "#F3EFE5", borderColor: "#DDD2BE" }}>
          <span style={{ ...styles.avatar, background: colorFor(session.userId) }}>{initials(session.displayName)}</span>
          <span style={{ flex: 1, fontWeight: 600 }}>{session.displayName}</span>
          <span style={{ fontSize: 11, color: "#A8754A", fontFamily: "system-ui, sans-serif" }}>Tú</span>
        </div>

        {/* Otros miembros */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ ...styles.avatar, background: m.trim() ? colorFor(m + i) : "#D9CFC1" }}>
                {m.trim() ? initials(m) : i + 1}
              </span>
              <input style={{ ...styles.input, flex: 1 }} value={m} onChange={(e) => updateMember(i, e.target.value)} placeholder={`Persona ${i + 1}`} />
              {members.length > 1 && (
                <button style={styles.iconBtnGhost} onClick={() => removeMemberField(i)} aria-label="Quitar persona"><X size={16} /></button>
              )}
            </div>
          ))}
        </div>
        <button style={styles.btnDashed} onClick={addMemberField}><Plus size={16} /> Agregar persona</button>

        {err && <p style={styles.errText}>{err}</p>}
        <button style={{ ...styles.btnPrimary, opacity: (saving || !hasEnoughMembers) ? 0.5 : 1 }} onClick={handleCreate} disabled={saving || !hasEnoughMembers}>{saving ? "Creando…" : "Crear grupo"}</button>
      </div>
    </div>
  );
}

/* =========================================================================
   EDIT GROUP (nombre, moneda, tasas, miembros)
   ========================================================================= */

function EditGroup({ group, session, onCancel, onSave, onDeleteGroup, onInvite, groupInvites = [], showError }) {
  const [name, setName] = useState(group.name);
  const [baseCurrency, setBaseCurrency] = useState(group.baseCurrency);
  const [rates, setRates] = useState(group.rates || {});
  const [members, setMembers] = useState(group.members);
  const [newMemberName, setNewMemberName] = useState("");
  const { previewUrl: photoUrl, pendingFile, removed, handleImageChange: handlePhoto, clear: clearPhoto } = useImageUpload(group.photoUrl || null, showError);
  const [saving, setSaving] = useState(false);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState(null);
  const [categories, setCategories] = useState(() => groupCategories(group).map(c => ({ ...c })));
  const [editingCatId, setEditingCatId] = useState(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const dragIdx = useRef(null);
  const balances = useMemo(() => computeBalances(group), [group]);

  const usedCurrencies = useMemo(() => {
    const set = new Set(group.expenses.filter(e => !e.deleted).map((e) => e.currency));
    set.delete(baseCurrency);
    return [...set];
  }, [group.expenses, baseCurrency]);

  const isDirty = useMemo(() => {
    if (name.trim() !== group.name) return true;
    if (baseCurrency !== group.baseCurrency) return true;
    if (JSON.stringify(rates) !== JSON.stringify(group.rates || {})) return true;
    if (pendingFile || removed) return true;
    const origMemberIds = new Set(group.members.map((m) => m.id));
    const curMemberIds = new Set(members.map((m) => m.id));
    if (origMemberIds.size !== curMemberIds.size || [...origMemberIds].some((id) => !curMemberIds.has(id))) return true;
    const origCats = groupCategories(group);
    if (origCats.length !== categories.length) return true;
    if (origCats.some((c, i) => c.id !== categories[i].id || c.label !== categories[i].label || c.iconKey !== categories[i].iconKey)) return true;
    return false;
  }, [name, baseCurrency, rates, pendingFile, removed, members, categories, group]);

  const addMember = () => {
    const n = newMemberName.trim();
    if (!n) return;
    setMembers((prev) => [...prev, { id: uid(), name: n }]);
    setNewMemberName("");
  };

  const removeMember = (id) => {
    const bal = balances[id] || 0;
    if (Math.abs(bal) > 0.01) {
      showError("No puedes quitar a alguien con balance pendiente. Salda sus cuentas primero.");
      return;
    }
    setConfirmRemoveMemberId(id);
  };

  const confirmRemoveMember = (id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setConfirmRemoveMemberId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) return showError("Ponle un nombre al grupo.");
    if (members.length < 2) return showError("El grupo necesita al menos dos personas.");
    if (categories.some(c => !c.label.trim())) return showError("Todas las categorías deben tener un nombre.");
    setSaving(true);
    try {
      const resolvedPhotoUrl = await resolvePhotoUrl({ pendingFile, removed, currentUrl: group.photoUrl });

      const originalMemberIds = new Set(group.members.map((m) => m.id));
      const currentMemberIds = new Set(members.map((m) => m.id));
      const membersToAdd = members.filter((m) => !originalMemberIds.has(m.id));
      const memberIdsToRemove = group.members.filter((m) => !currentMemberIds.has(m.id)).map((m) => m.id);

      const originalCategoryIds = new Set(groupCategories(group).map((c) => c.id));
      const currentCategoryIds = new Set(categories.map((c) => c.id));
      const indexedCategories = categories.map((c, i) => ({ ...c, sortOrder: i }));
      const categoriesToAdd = indexedCategories.filter((c) => !originalCategoryIds.has(c.id));
      const categoriesToUpdate = indexedCategories.filter((c) => originalCategoryIds.has(c.id));
      const categoryIdsToRemove = groupCategories(group).filter((c) => !currentCategoryIds.has(c.id)).map((c) => c.id);

      await onSave({
        name: name.trim(), baseCurrency, rates, photoUrl: resolvedPhotoUrl,
        membersToAdd, memberIdsToRemove, categoriesToAdd, categoriesToUpdate, categoryIdsToRemove,
      });
    } catch (e) {
      showError(`No se pudo guardar: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const addCategory = () => {
    setCategories(prev => [...prev, { id: uid(), label: "", iconKey: "MoreHorizontal" }]);
    setCatsOpen(true);
  };

  const removeCategory = (id) => {
    if (categories.length <= 1) return showError("El grupo necesita al menos una categoría.");
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const updateCategory = (id, patch) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  // Drag & drop handlers
  const onDragStart = (idx) => { dragIdx.current = idx; };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    setCategories(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(idx, 0, moved);
      dragIdx.current = idx;
      return next;
    });
  };
  const onDragEnd = () => { dragIdx.current = null; };

  return (
    <div style={styles.screen}>
      <TopBar
        title="Editar grupo"
        onBack={onCancel}
        right={group.creatorId === session?.userId && (
          <button style={styles.iconBtnGhost} onClick={() => setShowDeleteModal(true)} aria-label="Borrar grupo">
            <Trash2 size={18} color="#B0473A" />
          </button>
        )}
      />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        {/* Foto del grupo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 72, height: 72, minWidth: 72, borderRadius: 16, overflow: "hidden", background: photoUrl ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #DDD2BE" }}>
            {photoUrl
              ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <User size={28} color="#A89A87" />
            }
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ ...styles.btnDashed, cursor: "pointer", fontSize: 13 }}>
              <Camera size={14} /> {photoUrl ? "Cambiar foto" : "Añadir foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
            </label>
            {photoUrl && (
              <button style={{ ...styles.btnGhostSmall, fontSize: 12 }} onClick={clearPhoto}>Quitar foto</button>
            )}
          </div>
        </div>

        <label style={styles.label}>
          Nombre del grupo
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label style={styles.label}>
          Moneda principal
          <select style={styles.input} value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </label>

        {usedCurrencies.length > 0 && (
          <>
            <p style={styles.label}>Tasas de cambio a {baseCurrency}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {usedCurrencies.map((c) => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontFamily: "system-ui, sans-serif", width: 90 }}>1 {c} =</span>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    value={rates[c] ?? ""}
                    onChange={(e) => setRates((prev) => ({ ...prev, [c]: parseFloat(e.target.value) || 0 }))}
                    placeholder={`${baseCurrency} ej. 1.08`}
                    inputMode="decimal"
                  />
                </div>
              ))}
            </div>
            <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
              Esto solo afecta cómo se calculan los balances totales — los montos originales del gasto no cambian.
            </p>
          </>
        )}

        <p style={styles.label}>Personas</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {members.map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ ...styles.shareRow, borderRadius: confirmRemoveMemberId === m.id ? "10px 10px 0 0" : 10 }}>
                <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block" }}>{m.name}</span>
                  {groupInvites.find((i) => i.memberId === m.id) && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#3B6E62", fontFamily: "system-ui, sans-serif" }}>
                      <Send size={10} /> Invitación enviada a @{groupInvites.find((i) => i.memberId === m.id).username}
                    </span>
                  )}
                </div>
                {Math.abs(balances[m.id] || 0) > 0.01 && (
                  <span style={{ fontSize: 11, color: "#A8754A", fontFamily: "system-ui, sans-serif" }}>balance pendiente</span>
                )}
                {m.linkedUserId === session?.userId ? (
                  <span style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#A8754A" }}>Tú</span>
                ) : (
                  <button style={styles.iconBtnGhost} onClick={() => confirmRemoveMemberId === m.id ? setConfirmRemoveMemberId(null) : removeMember(m.id)} aria-label="Quitar persona">
                    <X size={16} color={confirmRemoveMemberId === m.id ? "#B0473A" : undefined} />
                  </button>
                )}
              </div>
              {confirmRemoveMemberId === m.id && (
                <div style={{ background: "#FBEDE7", border: "1px solid #EBC9BA", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>¿Quitar a {m.name} del grupo?</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={styles.btnGhostSmall} onClick={() => setConfirmRemoveMemberId(null)}>Cancelar</button>
                    <button style={styles.btnDangerSmall} onClick={() => confirmRemoveMember(m.id)}>Quitar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...styles.input, flex: 1 }} value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="Nombre de la nueva persona" onKeyDown={(e) => e.key === "Enter" && addMember()} />
          <button style={styles.btnSecondarySmall} onClick={addMember}><UserPlus size={16} /></button>
        </div>

        {/* Invitar personas */}
        {group.creatorId === session?.userId && (
          <button style={styles.btnSecondary} onClick={onInvite}>
            <UserPlus size={16} /> Invitar a alguien al grupo
          </button>
        )}

        {/* ── Categorías colapsables ── */}
        <button
          style={styles.collapsibleHeader}
          onClick={() => setCatsOpen(v => !v)}
          aria-expanded={catsOpen}
        >
          <span style={styles.label}>Categorías de gasto ({categories.length})</span>
          {catsOpen ? <ChevronUp size={18} color="#6B6355" /> : <ChevronDownIcon size={18} color="#6B6355" />}
        </button>

        {catsOpen && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {categories.map((cat, idx) => (
                <div
                  key={cat.id}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDragEnd={onDragEnd}
                  style={{ display: "flex", flexDirection: "column", cursor: "grab" }}
                >
                  <div style={{ ...styles.shareRow, gap: 6, padding: "8px 10px" }}>
                    {/* Handle visual */}
                    <span style={{ color: "#C9BBA0", display: "flex", alignItems: "center", paddingRight: 2, cursor: "grab" }}>
                      ⠿
                    </span>
                    {/* Botón ícono */}
                    <button
                      onClick={() => setEditingCatId(editingCatId === cat.id ? null : cat.id)}
                      style={{ width: 34, height: 34, minWidth: 34, borderRadius: 8, border: "1px solid #DDD2BE", background: editingCatId === cat.id ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#544A3C", cursor: "pointer" }}
                      aria-label="Cambiar ícono"
                    >
                      <IconComp iconKey={cat.iconKey} size={16} />
                    </button>
                    {/* Nombre */}
                    <input
                      style={{ ...styles.input, flex: 1, padding: "7px 10px", fontSize: 14 }}
                      value={cat.label}
                      onChange={e => updateCategory(cat.id, { label: e.target.value })}
                      placeholder="Nombre de categoría"
                    />
                    {/* Borrar */}
                    <button style={styles.iconBtnGhost} onClick={() => removeCategory(cat.id)} aria-label="Eliminar categoría">
                      <X size={15} />
                    </button>
                  </div>
                  {/* Picker de ícono inline */}
                  {editingCatId === cat.id && (
                    <div style={{ background: "#F7F2E9", border: "1px solid #E8DFD0", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {ICON_KEYS.map(key => (
                        <button
                          key={key}
                          onClick={() => { updateCategory(cat.id, { iconKey: key }); setEditingCatId(null); }}
                          style={{ width: 34, height: 34, borderRadius: 8, border: cat.iconKey === key ? "2px solid #C75D3B" : "1px solid #DDD2BE", background: cat.iconKey === key ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#544A3C" }}
                          aria-label={key}
                        >
                          <IconComp iconKey={key} size={16} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button style={styles.btnDashed} onClick={addCategory}><Plus size={16} /> Nueva categoría</button>
          </>
        )}

      </div>

      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onCancel}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !isDirty) ? 0.5 : 1 }} onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </Footer>

      {showDeleteModal && (
        <Modal onClose={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}>
          <p style={{ margin: "0 0 14px", fontSize: 15, fontFamily: "system-ui, sans-serif", color: "#2B2620" }}>
            ¿Borrar "{group.name}" y todo su historial? Esta acción no se puede deshacer.
          </p>
          <input
            style={{ ...styles.input, fontSize: 14 }}
            placeholder='Escribe "Confirmar" para continuar'
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={{ ...styles.btnGhostSmall, flex: 1, justifyContent: "center" }} onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}>Cancelar</button>
            <button
              style={{ ...styles.btnDangerSmall, flex: 1, opacity: deleteConfirmText === "Confirmar" ? 1 : 0.4, cursor: deleteConfirmText === "Confirmar" ? "pointer" : "not-allowed" }}
              onClick={() => deleteConfirmText === "Confirmar" && onDeleteGroup()}
            >
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   GROUP VIEW
   ========================================================================= */

function GroupView({ group, onBack, onAddExpense, onOpenExpense, onSettleUp, onEditGroup, onRecurring, onSoftDeleteExpense }) {
  const [tab, setTab] = useState("activity"); // activity | balances | individual
  const [selectedMember, setSelectedMember] = useState(group.members[0]?.id || null);
  const { members, expenses, payments = [], baseCurrency } = group;

  const balances = useMemo(() => computeBalances(group), [group]);
  const txns = useMemo(() => simplifyDebts(balances), [balances]);
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Alguien que ya no está";
  const allSettled = txns.length === 0;
  const activeExpenses = expenses.filter((e) => !e.deleted);

  const activityItems = useMemo(() => {
    const items = [
      ...activeExpenses.map((e) => ({ kind: "expense", ts: e.date || e.createdAt || 0, created: e.createdAt || 0, data: e })),
      ...payments.filter((p) => !p.deleted).map((p) => ({ kind: "payment", ts: p.date || p.createdAt || 0, created: p.createdAt || 0, data: p })),
    ];
    return items.sort((a, b) => {
      const dateDiff = b.ts - a.ts;
      if (Math.abs(dateDiff) > 60000) return dateDiff; // fechas distintas: ordenar por fecha
      return b.created - a.created; // misma fecha (~mismo día): el más reciente creado arriba
    });
  }, [activeExpenses, payments]);

  const handleDeleteExpense = (expenseId) => {
    onSoftDeleteExpense(expenseId);
  };

  return (
    <div style={styles.screen}>
      <TopBar
        title={group.name}
        onBack={onBack}
        right={
          <button style={styles.iconBtnGhost} onClick={onEditGroup} aria-label="Editar grupo">
            <Settings size={18} />
          </button>
        }
      />

      <div style={styles.quickActions}>
        <button style={styles.quickActionBtn} onClick={onRecurring}>
          <Repeat size={15} /> Recurrentes {group.recurring?.length ? `(${group.recurring.filter(r=>!r.paused).length})` : ""}
        </button>
      </div>

      {/* Fila de miembros con avatares coloreados y expandible */}
      {(() => {
        const [showAll, setShowAll] = React.useState(false);
        const visible = showAll ? members : members.slice(0, 4);
        const extra = members.length - 4;
        return (
          <div style={{ padding: "8px 20px 4px" }}>
            <div style={{ display: "flex", alignItems: showAll ? "flex-start" : "center", flexWrap: showAll ? "wrap" : "nowrap", gap: showAll ? 10 : 0 }}>
              {visible.map((m, idx) => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: showAll ? 44 : "auto", marginLeft: showAll ? 0 : idx === 0 ? 0 : -6, zIndex: showAll ? 0 : 10 - idx, flexShrink: 0 }}>
                  <span style={{ ...styles.avatar, background: colorFor(m.id), width: 34, height: 34, fontSize: 12, boxShadow: showAll ? "none" : "0 0 0 2px #FBF8F2" }}>
                    {initials(m.name)}
                  </span>
                  {showAll && (
                    <span style={{ fontSize: 10, color: "#6B6355", fontFamily: "system-ui, sans-serif", width: 44, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{m.name}</span>
                  )}
                </div>
              ))}
              {!showAll && extra > 0 && (
                <button
                  onClick={() => setShowAll(true)}
                  style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px dashed #C9BBA0", background: "#F0EBE2", fontSize: 11, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#8A7253", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: -6, zIndex: 1, cursor: "pointer", flexShrink: 0 }}
                >
                  +{extra}
                </button>
              )}
              {showAll && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 44, flexShrink: 0 }}>
                  <button
                    onClick={() => setShowAll(false)}
                    style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px dashed #C9BBA0", background: "#F0EBE2", fontSize: 20, fontWeight: 300, fontFamily: "system-ui, sans-serif", color: "#8A7253", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, lineHeight: 1, paddingBottom: 2 }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 10, color: "#6B6355", fontFamily: "system-ui, sans-serif", width: 44, textAlign: "center" }}> </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div style={styles.tabRow}>
        <button style={tab === "activity" ? styles.tabActive : styles.tab} onClick={() => setTab("activity")}>Actividad</button>
        <button style={tab === "balances" ? styles.tabActive : styles.tab} onClick={() => setTab("balances")}>Balances</button>
        <button style={tab === "individual" ? styles.tabActive : styles.tab} onClick={() => setTab("individual")}>Por persona</button>
      </div>

      {tab === "balances" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          {allSettled && (
            <div style={styles.settledBox}><Check size={18} color="#3B6E62" /><span>Todo saldado. Nadie le debe nada a nadie.</span></div>
          )}
          {!allSettled && txns.map((t, i) => (
            <div key={i} style={styles.debtCard}>
              <span style={{ ...styles.avatar, background: colorFor(t.from), width: 30, height: 30, fontSize: 11, flexShrink: 0 }}>{initials(nameOf(t.from))}</span>
              <ArrowRight size={13} color="#C9BBA0" style={{ flexShrink: 0 }} />
              <span style={{ ...styles.avatar, background: colorFor(t.to), width: 30, height: 30, fontSize: 11, flexShrink: 0 }}>{initials(nameOf(t.to))}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontFamily: "system-ui, sans-serif", fontWeight: 500, color: "#544A3C", minWidth: 0 }}>
                <strong style={{ fontWeight: 700 }}>{shortName(nameOf(t.from))}</strong>
                {" le debe a "}
                <strong style={{ fontWeight: 700 }}>{shortName(nameOf(t.to))}</strong>
              </span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#C75D3B", fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>{money(t.amount, baseCurrency)}</span>
              <button style={styles.settleSmallBtn} onClick={() => onSettleUp({ from: t.from, to: t.to, amount: t.amount })}>
                Saldar
              </button>
            </div>
          ))}
          <p style={styles.simplifyNote}>
            {txns.length === 0 ? "Sin pagos pendientes." : `Simplificado a ${txns.length} pago${txns.length > 1 ? "s" : ""} — el mínimo posible para saldar el grupo.`}
          </p>
          <button style={{ ...styles.btnSecondary, width: "calc(100% - 40px)", margin: "4px 20px 0" }} onClick={() => onSettleUp(null)}>
            <HandCoins size={16} /> Registrar un pago
          </button>
        </div>
      )}

      {tab === "individual" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 20px" }}>
            {members.map((m) => (
              <button key={m.id} onClick={() => setSelectedMember(m.id)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px 6px 6px", borderRadius: 20,
                border: `1.5px solid ${selectedMember === m.id ? colorFor(m.id) : "transparent"}`,
                background: selectedMember === m.id ? `${colorFor(m.id)}1a` : "#F0EBE2",
                fontSize: 13, fontFamily: "system-ui, sans-serif", fontWeight: 600,
              }}>
                <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>
                {m.name}
              </button>
            ))}
          </div>

          {selectedMember && (() => {
            const bal = balances[selectedMember] || 0;
            const isZero = Math.abs(bal) < 0.01;
            const isPos = bal > 0.005;

            // Usar las transacciones simplificadas globales filtradas por esta persona
            const myTxns = txns.filter(t => t.from === selectedMember || t.to === selectedMember);

            // Total puesto de su bolsillo
            const totalLent = (group.expenses || []).filter(e => !e.deleted).reduce((sum, e) => {
              const payers = e.payers || { [e.paidBy]: e.amount };
              const paid = toBase(payers[selectedMember] || 0, e.currency, group);
              const owes = toBase(e.shares[selectedMember] || 0, e.currency, group);
              return sum + Math.max(0, paid - owes);
            }, 0);

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 20px" }}>
                {/* Balance general */}
                <div style={{ padding: "14px 16px", borderRadius: 12, background: isZero ? "#F3EFE5" : isPos ? "#EAF1ED" : "#FBEDE7", border: `1px solid ${isZero ? "#DDD2BE" : isPos ? "#CFE2D7" : "#EBC9BA"}` }}>
                  <p style={{ margin: 0, fontSize: 13, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>{nameOf(selectedMember)}</p>
                  {isZero ? (
                    <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>Sin cuentas pendientes</p>
                  ) : (
                    <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: isPos ? "#3B6E62" : "#B0473A" }}>
                      {isPos ? "Le deben " : "Debe "}
                      <span>{money(Math.abs(bal), baseCurrency)}</span>
                    </p>
                  )}
                </div>

                {/* Pagos pendientes simplificados que involucran a esta persona */}
                {myTxns.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {myTxns.map((t, i) => (
                      <div key={i} style={styles.pairRow}>
                        <span style={{ ...styles.avatar, background: colorFor(t.from), width: 28, height: 28, fontSize: 11 }}>{initials(nameOf(t.from))}</span>
                        <span style={{ flex: 1, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>
                          <strong>{shortName(nameOf(t.from))}</strong> le debe a <strong>{shortName(nameOf(t.to))}</strong>
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: t.from === selectedMember ? "#B0473A" : "#3B6E62", fontFamily: "system-ui, sans-serif" }}>
                          {money(t.amount, baseCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total puesto de su bolsillo */}
                {totalLent > 0.01 && (
                  <p style={{ ...styles.muted, padding: 0, fontSize: 12.5 }}>
                    Ha puesto de su bolsillo un total de <strong>{money(totalLent, baseCurrency)}</strong> en gastos del grupo.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {tab === "activity" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {activityItems.length === 0 && <p style={styles.muted}>Aún no hay actividad registrada.</p>}
          {(() => {
            // Agrupar por mes (ya están en orden descendente por ts)
            const rows = [];
            let lastMonthKey = null;
            activityItems.forEach((item) => {
              const d = new Date(item.ts);
              const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
              const monthLabel = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
                .replace(/^./, c => c.toUpperCase());
              if (monthKey !== lastMonthKey) {
                rows.push({ kind: "separator", key: monthKey, label: monthLabel });
                lastMonthKey = monthKey;
              }
              rows.push(item);
            });

            return rows.map((row) => {
              if (row.kind === "separator") {
                return (
                  <div key={row.key} style={styles.monthSeparator}>
                    <span style={styles.monthSeparatorText}>{row.label}</span>
                  </div>
                );
              }
              if (row.kind === "expense") {
                const e = row.data;
                const cat = catInfo(e.category, group);
                return (
                  <button key={e.id} style={styles.expenseCard} onClick={() => onOpenExpense(e.id)}>
                    {/* Fecha a la izquierda */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 32, gap: 1 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#544A3C", lineHeight: 1 }}>
                        {new Date(e.date || e.createdAt).getDate()}
                      </span>
                      <span style={{ fontSize: 9.5, fontWeight: 600, fontFamily: "system-ui, sans-serif", color: "#A8967A", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {new Date(e.date || e.createdAt).toLocaleDateString("es-ES", { month: "short" })}
                      </span>
                    </div>
                    {/* Ícono de categoría */}
                    <div style={{ ...styles.expenseIcon, background: colorFor(cat.id), flexShrink: 0 }}><IconComp iconKey={cat.iconKey} size={16} /></div>
                    {/* Texto */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...styles.expenseTitle, display: "flex", alignItems: "center", gap: 4 }}>
                        {e.imageUrl ? <Camera size={11} color="#A8967A" style={{ flexShrink: 0 }} /> : null}
                        <span>{e.description}</span>
                        {e.recurringId ? <Repeat size={11} color="#A8967A" style={{ flexShrink: 0 }} /> : null}
                      </p>
                      <p style={styles.expenseSub}>
                        {(() => {
                          const payers = e.payers || { [e.paidBy]: e.amount };
                          const payerNames = Object.keys(payers).map(id => shortName(nameOf(id)));
                          const payerStr = payerNames.length === 1
                            ? `${payerNames[0]} pagó`
                            : `${payerNames.slice(0, -1).join(", ")} y ${payerNames.at(-1)} pagaron`;
                          return `${payerStr} ${money(e.amount, e.currency)}`;
                        })()}
                      </p>
                    </div>
                    <ChevronRight size={16} color="#C9BBA0" />
                  </button>
                );
              }
              const p = row.data;
              return (
                <div key={p.id} style={styles.paymentCard}>
                  {/* Fecha */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 32, gap: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#3B6E62", lineHeight: 1 }}>
                      {new Date(p.date || p.createdAt).getDate()}
                    </span>
                    <span style={{ fontSize: 9.5, fontWeight: 600, fontFamily: "system-ui, sans-serif", color: "#3B6E62", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {new Date(p.date || p.createdAt).toLocaleDateString("es-ES", { month: "short" })}
                    </span>
                  </div>
                  <div style={{ ...styles.expenseIcon, background: "#3B6E62", flexShrink: 0 }}><HandCoins size={16} /></div>
                  <p style={{ ...styles.expenseTitle, flex: 1, minWidth: 0, margin: 0 }}>
                    {nameOf(p.from)} le pagó a {nameOf(p.to)}{p.note ? ` · ${p.note}` : ""}
                  </p>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#3B6E62", fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>
                    {money(p.amount, p.currency)}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      )}

      <button style={styles.fab} onClick={onAddExpense} aria-label="Agregar gasto"><Plus size={24} strokeWidth={2.5} /></button>
    </div>
  );
}

/* =========================================================================
   EXPENSE DETAIL (solo lectura — se abre al tocar la tarjeta de un gasto)
   ========================================================================= */

function ExpenseDetail({ group, expenseId, onBack, onEdit }) {
  const { members } = group;
  const e = group.expenses.find((x) => x.id === expenseId);
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Alguien que ya no está";

  if (!e) {
    return (
      <div style={styles.screen}>
        <TopBar title="Gasto" onBack={onBack} />
        <p style={styles.muted}>Este gasto ya no existe.</p>
      </div>
    );
  }

  const cat = catInfo(e.category, group);
  const payers = e.payers || (e.paidBy ? { [e.paidBy]: e.amount } : {});
  const payerIds = Object.keys(payers);
  const shareIds = Object.keys(e.shares || {});

  return (
    <div style={styles.screen}>
      <TopBar
        title="Detalle del gasto"
        onBack={onBack}
        right={
          <button
            onClick={() => onEdit(e.id)}
            style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: "#C75D3B", fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", padding: "6px 4px" }}
          >
            <Pencil size={15} /> Editar
          </button>
        }
      />

      <div style={styles.form}>
        {/* Cabecera: ícono, descripción, categoría y fecha */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ ...styles.expenseIcon, width: 48, height: 48, minWidth: 48, background: colorFor(cat.id) }}>
            <IconComp iconKey={cat.iconKey} size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 19, fontWeight: 700, fontFamily: "'Iowan Old Style', Georgia, serif" }}>
              {e.description}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6B6355", fontFamily: "system-ui, sans-serif" }}>
              {cat.label} · {fmtDate(e.date || e.createdAt)}
            </p>
          </div>
        </div>

        {/* Monto total */}
        <p style={{ margin: 0, fontSize: 32, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#2B2620" }}>
          {money(e.amount, e.currency)}
        </p>

        {/* Quién pagó */}
        <div>
          <p style={{ ...styles.label, marginBottom: 4 }}>{payerIds.length > 1 ? "Quiénes pagaron" : "Quién pagó"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {payerIds.map((id) => (
              <div key={id} style={styles.shareRow}>
                <span style={{ ...styles.avatar, background: colorFor(id), width: 30, height: 30, minWidth: 30, fontSize: 11 }}>
                  {initials(nameOf(id))}
                </span>
                <span style={{ flex: 1 }}>{nameOf(id)}</span>
                <span style={styles.shareAmount}>{money(payers[id], e.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cómo se divide */}
        <div>
          <p style={{ ...styles.label, marginBottom: 4 }}>Cómo se divide</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shareIds.map((id) => (
              <div key={id} style={styles.shareRow}>
                <span style={{ ...styles.avatar, background: colorFor(id), width: 30, height: 30, minWidth: 30, fontSize: 11 }}>
                  {initials(nameOf(id))}
                </span>
                <span style={{ flex: 1 }}>{nameOf(id)}</span>
                <span style={styles.shareAmount}>{money(e.shares[id], e.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {e.imageUrl && (
          <img src={e.imageUrl} alt="" style={{ width: "100%", borderRadius: 12, border: "1px solid #ECE3D3", objectFit: "cover", maxHeight: 220 }} />
        )}

        {e.notes && (
          <div>
            <p style={{ ...styles.label, marginBottom: 4 }}>Notas</p>
            <p style={{ ...styles.muted, padding: 0, margin: 0 }}>{e.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   NEW / EDIT EXPENSE
   ========================================================================= */

// Cuerpo real del formulario — siempre atado a un grupo ya resuelto.
// El wrapper `NewExpense` (al final del archivo) decide si ese grupo viene
// dado (abierto desde dentro de un grupo) o hay que elegirlo primero (abierto
// desde el FAB del listado principal, sin grupo en contexto).
function ExpenseForm({ group, expenseId, extraHeaderField, onCancel, onSave, onDelete, onSaveRecurring }) {
  const { members, baseCurrency } = group;
  const existing = expenseId ? group.expenses.find((e) => e.id === expenseId) : null;

  const [description, setDescription] = useState(existing?.description || "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [currency, setCurrency] = useState(existing?.currency || baseCurrency);
  const [category, setCategory] = useState(existing?.category || groupCategories(group)[0]?.id);
  const [notes, setNotes] = useState(existing?.notes || "");
  const [date, setDate] = useState(existing ? dateInputValue(existing.date) : todayInputValue());

  // Pagadores: "single" o "multi"
  const existingPayers = existing?.payers || (existing?.paidBy ? { [existing.paidBy]: existing.amount } : null);
  const initPayerMode = existingPayers && Object.keys(existingPayers).length > 1 ? "multi" : "single";
  const [payerMode, setPayerMode] = useState(initPayerMode);
  const [singlePayer, setSinglePayer] = useState(
    existing?.paidBy || (existingPayers ? Object.keys(existingPayers)[0] : members[0]?.id || "")
  );
  const [payerAmounts, setPayerAmounts] = useState(
    () => Object.fromEntries(members.map((m) => [m.id, existingPayers?.[m.id] ? String(existingPayers[m.id]) : ""]))
  );
  const [multiPayerSelected, setMultiPayerSelected] = useState(
    () => new Set(existingPayers ? Object.keys(existingPayers) : [members[0]?.id || ""])
  );

  const [splitMode, setSplitMode] = useState(existing?.splitMode || "equal");
  const [participants, setParticipants] = useState(
    () => new Set(existing ? Object.keys(existing.shares) : members.map((m) => m.id))
  );
  const [exactAmounts, setExactAmounts] = useState(
    () => Object.fromEntries(members.map((m) => [m.id, existing?.splitMode === "exact" ? String(existing.shares[m.id] || "") : ""]))
  );
  const [percentages, setPercentages] = useState(
    () => Object.fromEntries(members.map((m) => [m.id, existing?.splitMode === "percent" ? String(Math.round(((existing.shares[m.id]||0) / existing.amount) * 100)) : ""]))
  );
  const [shareUnits, setShareUnits] = useState(
    () => Object.fromEntries(members.map((m) => [m.id, existing?.splitMode === "shares" ? String(existing.shares[m.id] || "") : "1"]))
  );
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [frequency, setFrequency] = useState("monthly");
  const [splitExpanded, setSplitExpanded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(!!(existing?.notes));
  const [err, setErr] = useState("");
  const { previewUrl: imageUrl, pendingFile, removed, handleImageChange, clear: clearImage } = useImageUpload(existing?.imageUrl || null, setErr);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const numericAmount = parseFloat((amount || "").replace(",", "."));
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;

  // Total que han puesto los pagadores seleccionados en modo multi
  const multiPayerTotal = [...multiPayerSelected].reduce((s, id) => {
    const v = parseFloat((payerAmounts[id] || "0").replace(",", "."));
    return s + (isNaN(v) ? 0 : v);
  }, 0);

  const toggleMultiPayer = (id) => {
    setMultiPayerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  };

  const toggleParticipant = (id) => {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const participantIds = members.filter((m) => participants.has(m.id)).map((m) => m.id);
  const exactTotal = participantIds.reduce((s, id) => s + (parseFloat((exactAmounts[id] || "0").replace(",", ".")) || 0), 0);
  const percentTotal = participantIds.reduce((s, id) => s + (parseFloat(percentages[id] || "0") || 0), 0);

  // Construir objeto payers para guardar
  const buildPayers = () => {
    if (payerMode === "single") return { [singlePayer]: numericAmount };
    const result = {};
    [...multiPayerSelected].forEach((id) => {
      const v = parseFloat((payerAmounts[id] || "0").replace(",", "."));
      if (!isNaN(v) && v > 0) result[id] = v;
    });
    return result;
  };

  const buildShares = () => {
    if (splitMode === "equal") return computeShares({ splitMode: "equal", amount: numericAmount, participantIds });
    if (splitMode === "exact") {
      const exact = {};
      participantIds.forEach((id) => (exact[id] = parseFloat((exactAmounts[id] || "0").replace(",", ".")) || 0));
      return computeShares({ splitMode: "exact", amount: numericAmount, participantIds, exactAmounts: exact });
    }
    if (splitMode === "percent") {
      const pct = {};
      participantIds.forEach((id) => (pct[id] = parseFloat(percentages[id] || "0") || 0));
      return computeShares({ splitMode: "percent", amount: numericAmount, participantIds, percentages: pct });
    }
    const units = {};
    participantIds.forEach((id) => (units[id] = parseFloat(shareUnits[id] || "0") || 0));
    return computeShares({ splitMode: "shares", amount: numericAmount, participantIds, shareUnits: units });
  };

  const validate = () => {
    if (!description.trim()) return "Dale una descripción al gasto.";
    if (!validAmount) return "Ingresa un monto válido.";
    if (payerMode === "single" && !singlePayer) return "Indica quién pagó.";
    if (payerMode === "multi" && Math.abs(multiPayerTotal - numericAmount) > 0.01)
      return `Los pagadores suman ${money(multiPayerTotal, currency)}, pero el gasto es de ${money(numericAmount, currency)}.`;
    if (participantIds.length === 0) return "Selecciona al menos una persona en el reparto.";
    if (splitMode === "exact" && Math.abs(exactTotal - numericAmount) > 0.01)
      return `Los montos suman ${money(exactTotal, currency)}, pero el gasto es de ${money(numericAmount, currency)}.`;
    if (splitMode === "percent" && Math.abs(percentTotal - 100) > 0.5)
      return `Los porcentajes suman ${percentTotal.toFixed(0)}%, deben sumar 100%.`;
    return "";
  };

  const handleSave = async () => {
    const v = validate();
    if (v) return setErr(v);
    const dateMs = new Date(date + "T12:00:00").getTime();
    const payers = buildPayers();
    setSaving(true);
    try {
      if (makeRecurring && !existing) {
        await onSaveRecurring({
          groupId: group.id,
          description: description.trim(),
          amount: numericAmount,
          currency,
          category,
          payers,
          splitMode,
          shares: buildShares(),
          frequency,
          nextDate: dateMs,
        });
        return;
      }

      const resolvedImageUrl = await resolvePhotoUrl({ pendingFile, removed, currentUrl: existing?.imageUrl });
      await onSave({
        id: existing?.id,
        groupId: group.id,
        description: description.trim(),
        amount: numericAmount,
        currency,
        category,
        notes: notes.trim(),
        date: dateMs,
        payers,
        splitMode,
        shares: buildShares(),
        imageUrl: resolvedImageUrl,
      });
    } catch (e) {
      setErr(`No se pudo guardar: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.screen}>
      <TopBar
        title={existing ? "Editar gasto" : "Nuevo gasto"}
        onBack={onCancel}
        right={existing && (
          <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(true)} aria-label="Borrar gasto"><Trash2 size={17} /></button>
        )}
      />

      {confirmDelete && (
        <ConfirmInline
          message="¿Borrar este gasto?"
          confirmLabel="Borrar"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => onDelete(existing.id)}
        />
      )}

      <div style={{ ...styles.form, paddingBottom: 100 }}>
        {extraHeaderField}
        <label style={styles.label}>
          Descripción
          <input style={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Cena, taxi, supermercado…" autoFocus={!existing} />
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <label style={{ ...styles.label, flex: 1 }}>
            Monto
            <input style={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <select
            style={{ ...styles.input, width: 80, flexShrink: 0, padding: "11px 6px", textAlign: "center", fontWeight: 600, color: "#544A3C" }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {currency !== baseCurrency && (
          <p style={{ ...styles.muted, padding: 0, marginTop: -8, display: "flex", alignItems: "center", gap: 5 }}>
            <AlertCircle size={13} /> Se convertirá a {baseCurrency} para los balances. Configura la tasa en "Editar grupo" si aún no la tiene.
          </p>
        )}

        {/* Fila: Fecha + Categoría + icono Foto + icono Nota — se pone después de dividido en */}

        <p style={styles.label}>¿Quién pagó?</p>
        <div style={styles.splitModeRow}>
          <button style={payerMode === "single" ? styles.tabActive : styles.tab} onClick={() => setPayerMode("single")}>Una persona</button>
          <button style={payerMode === "multi" ? styles.tabActive : styles.tab} onClick={() => setPayerMode("multi")}>Varias personas</button>
        </div>

        {payerMode === "single" && (
          <div style={styles.payerRow}>
            {members.map((m) => (
              <button key={m.id} onClick={() => setSinglePayer(m.id)} style={{ ...styles.payerChip, borderColor: singlePayer === m.id ? colorFor(m.id) : "transparent", background: singlePayer === m.id ? `${colorFor(m.id)}1a` : "#FAF7F2" }}>
                <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>
                {m.name}
              </button>
            ))}
          </div>
        )}

        {payerMode === "multi" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {members.map((m) => {
              const isIn = multiPayerSelected.has(m.id);
              return (
                <button key={m.id} onClick={() => toggleMultiPayer(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45, textAlign: "left" }}>
                  <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}), flexShrink: 0 }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                  <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                  <span style={{ flex: 1 }}>{m.name}</span>
                  <input
                    style={styles.customInput}
                    disabled={!isIn}
                    value={payerAmounts[m.id]}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPayerAmounts((p) => ({ ...p, [m.id]: e.target.value }))}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </button>
              );
            })}
            <p style={styles.muted}>
              Suma: {money(multiPayerTotal, currency)}{validAmount ? ` / ${money(numericAmount, currency)}` : ""}
              {validAmount && Math.abs(multiPayerTotal - numericAmount) < 0.01 ? " ✓" : ""}
            </p>
          </div>
        )}

        <div>
          {/* Fila colapsable de reparto */}
          <button
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "#FAF7F2", border: "1px solid #DDD2BE", borderRadius: splitExpanded ? "10px 10px 0 0" : 10, padding: "10px 14px", cursor: "pointer" }}
            onClick={() => setSplitExpanded(v => !v)}
          >
            <span style={{ fontSize: 13, fontFamily: "system-ui, sans-serif", color: "#6B6355" }}>Dividido en</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#544A3C" }}>
                {{ equal: "partes iguales", exact: "montos exactos", percent: "porcentajes", shares: "partes proporcionales" }[splitMode]}
              </span>
              {splitExpanded ? <ChevronUp size={15} color="#6B6355" /> : <ChevronDownIcon size={15} color="#6B6355" />}
            </div>
          </button>

          {splitExpanded && (
            <div style={{ border: "1px solid #DDD2BE", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px", display: "flex", flexDirection: "column", gap: 10, background: "#fff" }}>
              {/* Selector de modo */}
              <div style={styles.splitModeRow}>
                {[["equal", "Iguales"], ["exact", "Montos"], ["percent", "Porcentajes"], ["shares", "Partes"]].map(([id, label]) => (
                  <button key={id} style={splitMode === id ? styles.tabActive : styles.tab} onClick={() => setSplitMode(id)}>{label}</button>
                ))}
              </div>

              {splitMode === "equal" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(() => {
                    const preview = validAmount ? fairSplit(numericAmount, participantIds.map(() => 1)) : [];
                    return members.map((m) => {
                      const isIn = participants.has(m.id);
                      const previewIdx = participantIds.indexOf(m.id);
                      const myAmt = isIn && validAmount && previewIdx >= 0 ? preview[previewIdx] : null;
                      return (
                        <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45 }}>
                          <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                          <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
                          <span style={styles.shareAmount}>{myAmt !== null ? money(myAmt, currency) : "—"}</span>
                          <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}) }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        </button>
                      );
                    });
                  })()}
                </div>
              )}

              {splitMode === "exact" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {members.map((m) => {
                    const isIn = participants.has(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45, textAlign: "left" }}>
                        <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}), flexShrink: 0 }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                        <span style={{ flex: 1 }}>{m.name}</span>
                        <input style={styles.customInput} disabled={!isIn} value={exactAmounts[m.id]} onClick={(e) => e.stopPropagation()} onChange={(e) => setExactAmounts((p) => ({ ...p, [m.id]: e.target.value }))} placeholder="0.00" inputMode="decimal" />
                      </button>
                    );
                  })}
                  <p style={styles.muted}>Suma: {money(exactTotal, currency)} {validAmount ? `/ ${money(numericAmount, currency)}` : ""}</p>
                  {validAmount && (() => {
                    const remaining = numericAmount - exactTotal;
                    const isExact = Math.abs(remaining) < 0.01;
                    if (isExact) return null;
                    const isOver = remaining < -0.01;
                    return (
                      <p style={{ ...styles.muted, marginTop: -6, fontWeight: 700, color: isOver ? "#B0473A" : "#6B6355" }}>
                        Falta: {money(remaining, currency)}
                      </p>
                    );
                  })()}
                </div>
              )}

              {splitMode === "percent" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {members.map((m) => {
                    const isIn = participants.has(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45, textAlign: "left" }}>
                        <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}), flexShrink: 0 }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                        <span style={{ flex: 1 }}>{m.name}</span>
                        <input style={styles.customInput} disabled={!isIn} value={percentages[m.id]} onClick={(e) => e.stopPropagation()} onChange={(e) => setPercentages((p) => ({ ...p, [m.id]: e.target.value }))} placeholder="0" inputMode="decimal" />
                        <span style={{ fontSize: 13, color: "#6B6355" }} onClick={(e) => e.stopPropagation()}>%</span>
                      </button>
                    );
                  })}
                  <p style={styles.muted}>Suma: {percentTotal.toFixed(0)}% / 100%</p>
                </div>
              )}

              {splitMode === "shares" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {members.map((m) => {
                    const isIn = participants.has(m.id);
                    const totalUnits = participantIds.reduce((s, id) => s + (parseFloat(shareUnits[id] || "0") || 0), 0) || 1;
                    const myUnits = parseFloat(shareUnits[m.id] || "0") || 0;
                    return (
                      <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45, textAlign: "left" }}>
                        <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}), flexShrink: 0 }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                        <span style={{ flex: 1 }}>{m.name}</span>
                        <input style={{ ...styles.customInput, width: 50 }} disabled={!isIn} value={shareUnits[m.id]} onClick={(e) => e.stopPropagation()} onChange={(e) => setShareUnits((p) => ({ ...p, [m.id]: e.target.value }))} placeholder="1" inputMode="decimal" />
                        <span style={styles.shareAmount}>{isIn && validAmount ? money((numericAmount * myUnits) / totalUnits, currency) : ""}</span>
                      </button>
                    );
                  })}
                  <p style={styles.muted}>Las "partes" son proporciones — alguien con 2 partes paga el doble que alguien con 1.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fila: Fecha + Categoría + icono Foto + icono Nota */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label style={{ ...styles.label, flex: 1 }}>
            Fecha
            <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label style={{ ...styles.label, flex: 1 }}>
            Categoría
            <select style={{ ...styles.input, paddingRight: 10 }} value={category} onChange={(e) => setCategory(e.target.value)}>
              {groupCategories(group).map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label title="Añadir foto" style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${imageUrl ? "#C75D3B" : "#DDD2BE"}`, background: imageUrl ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: imageUrl ? "#C75D3B" : "#6B6355" }}>
            <Camera size={18} />
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageChange} />
          </label>
          <button title="Añadir nota" onClick={() => setNotesOpen(v => !v)} style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${notesOpen || notes ? "#C75D3B" : "#DDD2BE"}`, background: notesOpen || notes ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: notesOpen || notes ? "#C75D3B" : "#6B6355" }}>
            <PenLine size={18} />
          </button>
        </div>

        {imageUrl && (
          <div style={{ position: "relative" }}>
            <img src={imageUrl} alt="Adjunto del gasto" style={{ width: "100%", borderRadius: 12, maxHeight: 180, objectFit: "cover", border: "1px solid #ECE3D3" }} />
            <button onClick={clearImage} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.5)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} aria-label="Quitar imagen">
              <X size={14} />
            </button>
          </div>
        )}

        {(notesOpen || notes) && (
          <textarea style={{ ...styles.input, minHeight: 60, resize: "vertical", fontFamily: "system-ui, sans-serif" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionales…" autoFocus={notesOpen && !notes} />
        )}

        {!existing && (
          <button style={styles.recurringToggle} onClick={() => setMakeRecurring((v) => !v)}>
            <span style={{ ...styles.checkbox, ...(makeRecurring ? styles.checkboxOn : {}) }}>{makeRecurring && <Check size={12} color="#fff" strokeWidth={3} />}</span>
            <Repeat size={15} /> Hacer este gasto recurrente
          </button>
        )}
        {makeRecurring && !existing && (
          <select style={styles.input} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="weekly">Cada semana</option>
            <option value="biweekly">Cada 2 semanas</option>
            <option value="monthly">Cada mes</option>
            <option value="yearly">Cada año</option>
          </select>
        )}

        {err && <p style={styles.errText}>{err}</p>}
      </div>

      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onCancel}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : existing ? "Guardar" : makeRecurring ? "Crear recurrente" : "Guardar"}
        </button>
      </Footer>
    </div>
  );
}

// Wrapper: si ya se sabe a qué grupo pertenece el gasto (abierto desde dentro
// de un grupo), va derecho a ExpenseForm — cero cambios de comportamiento.
// Si no (abierto desde el FAB del listado principal), muestra un selector de
// grupo arriba del formulario; ExpenseForm recién se monta cuando hay un
// grupo elegido, con key={group.id} para arrancar limpio si lo cambian.
function NewExpense({ group, groups, defaultGroupId, expenseId, onCancel, onSave, onDelete, onSaveRecurring }) {
  const [pickedGroupId, setPickedGroupId] = useState(group?.id ?? defaultGroupId ?? "");

  if (group) {
    return (
      <ExpenseForm
        group={group}
        expenseId={expenseId}
        onCancel={onCancel}
        onSave={onSave}
        onDelete={onDelete}
        onSaveRecurring={onSaveRecurring}
      />
    );
  }

  const effectiveGroup = (groups || []).find((g) => g.id === pickedGroupId) || null;
  const groupPicker = (
    <label style={styles.label}>
      Grupo
      <select style={styles.input} value={pickedGroupId} onChange={(e) => setPickedGroupId(e.target.value)}>
        <option value="">Selecciona un grupo…</option>
        {(groups || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </label>
  );

  if (!effectiveGroup) {
    return (
      <div style={styles.screen}>
        <TopBar title="Nuevo gasto" onBack={onCancel} />
        <div style={styles.form}>{groupPicker}</div>
      </div>
    );
  }

  return (
    <ExpenseForm
      key={effectiveGroup.id}
      group={effectiveGroup}
      expenseId={null}
      extraHeaderField={groupPicker}
      onCancel={onCancel}
      onSave={onSave}
      onSaveRecurring={onSaveRecurring}
    />
  );
}

/* =========================================================================
   SETTLE UP (registrar pago directo entre dos personas)
   ========================================================================= */

function SettleUp({ group, prefill, onCancel, onSave }) {
  const { members, baseCurrency } = group;
  const [from, setFrom] = useState(prefill?.from || members[0]?.id || "");
  const [to, setTo] = useState(prefill?.to || members[1]?.id || "");
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount.toFixed(2)) : "");
  const [currency, setCurrency] = useState(baseCurrency);
  const [date, setDate] = useState(todayInputValue());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const numericAmount = parseFloat((amount || "").replace(",", "."));
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;

  const handleSave = async () => {
    if (!from || !to) return setErr("Indica quién paga y quién recibe.");
    if (from === to) return setErr("Tienen que ser dos personas distintas.");
    if (!validAmount) return setErr("Ingresa un monto válido.");
    setSaving(true);
    try {
      await onSave({
        from, to,
        amount: numericAmount,
        currency,
        date: new Date(date + "T12:00:00").getTime(),
        note: note.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Registrar un pago" onBack={onCancel} />
      <div style={styles.form}>
        <p style={{ ...styles.muted, padding: 0 }}>Esto no mueve dinero — solo anota que el pago ya se hizo fuera de la app, para saldar el balance.</p>

        <p style={styles.label}>¿Quién paga?</p>
        <div style={styles.payerRow}>
          {members.map((m) => (
            <button key={m.id} onClick={() => setFrom(m.id)} style={{ ...styles.payerChip, borderColor: from === m.id ? colorFor(m.id) : "transparent", background: from === m.id ? `${colorFor(m.id)}1a` : "#FAF7F2" }}>
              <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>{m.name}
            </button>
          ))}
        </div>

        <p style={styles.label}>¿Quién recibe?</p>
        <div style={styles.payerRow}>
          {members.filter((m) => m.id !== from).map((m) => (
            <button key={m.id} onClick={() => setTo(m.id)} style={{ ...styles.payerChip, borderColor: to === m.id ? colorFor(m.id) : "transparent", background: to === m.id ? `${colorFor(m.id)}1a` : "#FAF7F2" }}>
              <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>{m.name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...styles.label, flex: 1.4 }}>
            Monto
            <input style={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <label style={{ ...styles.label, flex: 1 }}>
            Moneda
            <select style={styles.input} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <label style={styles.label}>
          Fecha
          <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label style={styles.label}>
          Nota (opcional)
          <input style={styles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transferencia, efectivo…" />
        </label>

        {err && <p style={styles.errText}>{err}</p>}
        <button style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>{saving ? "Registrando…" : "Registrar pago"}</button>
      </div>
    </div>
  );
}

/* =========================================================================
   RECURRING LIST
   ========================================================================= */

function RecurringList({ group, onBack, onTogglePause, onRemove }) {
  const { recurring = [], members } = group;
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "—";

  const togglePause = (id, paused) => onTogglePause(id, paused);
  const remove = (id) => onRemove(id);

  return (
    <div style={styles.screen}>
      <TopBar title="Gastos recurrentes" onBack={onBack} />
      <div style={{ padding: "10px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {recurring.length === 0 && (
          <p style={styles.muted}>
            No tienes gastos recurrentes en este grupo. Puedes crear uno marcando "Hacer este gasto recurrente" al agregar un gasto nuevo.
          </p>
        )}
        {recurring.map((r) => {
          const cat = catInfo(r.category, group);
          return (
            <div key={r.id} style={{ ...styles.expenseCard, cursor: "default", opacity: r.paused ? 0.55 : 1 }}>
              <div style={{ ...styles.expenseIcon, background: colorFor(cat.id) }}><IconComp iconKey={cat.iconKey} size={16} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={styles.expenseTitle}>{r.description}</p>
                <p style={styles.expenseSub}>
                  {money(r.amount, r.currency)} · {nameOf(r.paidBy)} paga · {freqLabel(r.frequency)} · próximo: {fmtDate(r.nextDate)}
                  {r.paused ? " · pausado" : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={styles.iconBtnGhost} onClick={() => togglePause(r.id, !r.paused)} aria-label={r.paused ? "Reanudar" : "Pausar"}>
                  {r.paused ? <RefreshCw size={15} /> : <X size={15} />}
                </button>
                <button style={styles.iconBtnGhost} onClick={() => remove(r.id)} aria-label="Eliminar recurrente"><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InviteScreen({ group, session, groupInvites = [], onBack, onSend, onCancelInvite }) {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [targetUsername, setTargetUsername] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);

  const invitableMembers = group.members.filter(m => !m.linkedUserId);

  const handle = async () => {
    if (!selectedMemberId) return setErr("Selecciona a qué miembro corresponde esta persona.");
    if (!targetUsername.trim()) return setErr("Escribe el nombre de usuario a invitar.");
    if (targetUsername.trim().toLowerCase() === session.username) return setErr("No puedes invitarte a ti mismo.");
    setErr("");
    setSending(true);
    await onSend({ memberId: selectedMemberId, targetUsername: targetUsername.trim().toLowerCase() });
    setSelectedMemberId("");
    setTargetUsername("");
    setSending(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Invitar al grupo" onBack={onBack} />
      <div style={styles.form}>
        <p style={{ ...styles.muted, padding: 0 }}>
          Selecciona a qué miembro del grupo corresponde la persona que vas a invitar, y escribe su nombre de usuario en la app.
        </p>

        <p style={styles.label}>¿A qué miembro corresponde?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {invitableMembers.length === 0 && (
            <p style={styles.muted}>Todos los miembros ya tienen usuario vinculado.</p>
          )}
          {invitableMembers.map(m => {
            const pending = groupInvites.find(i => i.memberId === m.id);
            const isSelected = selectedMemberId === m.id;
            return (
              <button key={m.id}
                onClick={() => !pending && setSelectedMemberId(m.id)}
                style={{ ...styles.shareRow, textAlign: "left", cursor: pending ? "default" : "pointer", borderColor: isSelected ? "#C75D3B" : pending ? "#CFE2D7" : "#ECE3D3", background: isSelected ? "#C75D3B0d" : pending ? "#EAF1ED" : "#fff" }}
              >
                <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block" }}>{m.name}</span>
                  {pending && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#3B6E62", fontFamily: "system-ui, sans-serif" }}>
                      <Send size={10} /> Invitación enviada a @{pending.username}
                    </span>
                  )}
                </div>
                <span style={{ width: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isSelected && <Check size={16} color="#C75D3B" />}
                  {pending && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setCancelingId(m.id);
                        await onCancelInvite(m.id);
                        setCancelingId(null);
                      }}
                      disabled={cancelingId === m.id}
                      style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: cancelingId === m.id ? "default" : "pointer", color: "#6B6355", opacity: cancelingId === m.id ? 0.6 : 1 }}
                      aria-label="Cancelar invitación"
                    >
                      {cancelingId === m.id
                        ? <RefreshCw size={14} className="spin" />
                        : <X size={14} />
                      }
                    </button>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <label style={styles.label}>
          Usuario a invitar
          <input style={styles.input} value={targetUsername} onChange={e => setTargetUsername(e.target.value)} placeholder="nombre_de_usuario" autoCapitalize="none" onKeyDown={e => e.key === "Enter" && handle()} />
        </label>

        {err && <p style={styles.errText}>{err}</p>}
        <button style={{ ...styles.btnPrimary, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: sending ? 0.6 : 1 }} onClick={handle} disabled={sending}>
          <Send size={15} /> {sending ? "Enviando…" : "Enviar invitación"}
        </button>
      </div>
    </div>
  );
}
