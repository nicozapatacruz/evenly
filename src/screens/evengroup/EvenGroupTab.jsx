import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../../lib/supabaseClient.js";
import {
  Plus, Receipt, X, ChevronRight, ArrowRight, Check, Trash2, Settings,
  RefreshCw, HandCoins, UserPlus, ChevronUp,
  ChevronDown as ChevronDownIcon, Camera, User, PenLine, Pencil, Send, Menu,
} from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { styles } from "../../lib/styles.js";
import { TopBar, RootHeader, ConfirmInline, Modal, FormFooter, PhotoPicker, PhotoLightbox, ImageWithFallback, Field, ToggleField, PickerField, DateRow, TextRow, EvenGroupIcon, EmptyState, CalculatorAmountInput, SegmentedControl, Hint } from "../../components/Shared.jsx";
import { linkGroupToAccount, updateLinkDefaults, unlinkGroup } from "../../lib/evenGroupLink.js";
import { useRecentNoteTitles } from "../../lib/evenCapitalData.js";
import {
  uid, CURRENCIES, CURRENCY_LIST, money, parseAmountInput, ICON_KEYS, IconComp,
  DEFAULT_CATEGORIES, groupCategories, catInfo, colorFor, initials, shortName, nameOf,
  computeBalances, simplifyDebts, fairSplit, computeShares,
  dateInputValue, todayInputValue, fmtDate,
  useImageUpload, resolvePhotoUrl, useScrollToTopOnChange, useScrollIntoViewOnChange, normalizeForSearch,
} from "../../lib/helpers.jsx";

/* =========================================================================
   TAB DE EVENGROUP — recibe del shell raíz: la sesión, los grupos
   (useGroups vive arriba porque Configuración también los necesita), el
   estado de navegación interna (view/setView, también levantado para que
   Configuración pueda abrir "crear grupo" o "ver invitación" empujando
   este mismo estado) y los toasts (compartidos con Configuración).
   ========================================================================= */

export default function EvenGroupTab({
  session, groups, loading, reloadGroup, deleteGroup,
  view, setView, showError, showSuccess, showInfo,
  evenCapital, onBackOverride, isOnline = true,
}) {
  const [groupInvites, setGroupInvites] = useState([]); // invitaciones pendientes del grupo que estoy editando

  // EvenGroup es online-only (varios miembros escriben el mismo grupo,
  // a diferencia de EvenCapital) — offline se puede VER el último estado
  // cacheado, pero cualquier escritura se bloquea acá, en el único lugar
  // donde este archivo de verdad habla con la base (ver comentario arriba
  // del export default).
  const blockOffline = useCallback(() => {
    showError("Estás offline, no podés hacer esto ahora.");
  }, [showError]);

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
          session={session}
          evenCapital={evenCapital}
          onOpen={(id) => { setView({ screen: "group", groupId: id }); reloadGroup(id); }}
          onNewExpense={() => setView({ screen: "newExpense" })}
          isOnline={isOnline}
          showError={showError}
        />
      )}

      {view.screen === "newGroup" && (
        <GroupForm
          onCancel={onBackOverride || (() => setView({ screen: "home" }))}
          session={session}
          showError={showError}
          isOnline={isOnline}
          onCreate={async ({ name, baseCurrency, members, photoUrl }) => {
            if (!isOnline) { blockOffline(); return; }
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
          session={session}
          onRefresh={() => reloadGroup(activeGroup.id)}
          onBack={onBackOverride || (() => setView({ screen: "home" }))}
          onAddExpense={() => setView({ screen: "newExpense", groupId: activeGroup.id })}
          onOpenExpense={(expenseId) => setView({ screen: "expenseDetail", groupId: activeGroup.id, expenseId })}
          onSettleUp={(prefill) => setView({ screen: "settleUp", groupId: activeGroup.id, prefill })}
          onOpenPayment={(paymentId) => setView({ screen: "paymentDetail", groupId: activeGroup.id, paymentId })}
          onEditGroup={() => setView({ screen: "editGroup", groupId: activeGroup.id })}
          isOnline={isOnline}
          showError={showError}
          onSoftDeleteExpense={async (expenseId) => {
            if (!isOnline) { blockOffline(); return; }
            try {
              const { error } = await supabase.from("expenses").update({ deleted: true }).eq("id", expenseId);
              if (error) throw error;
              await reloadGroup(activeGroup.id);
              await evenCapital?.reload();
              showInfo("Gasto eliminado.");
            } catch (e) { showError(`No se pudo borrar el gasto: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "expenseDetail" && activeGroup && (
        <ExpenseDetail
          group={activeGroup}
          expenseId={view.expenseId}
          onBack={onBackOverride || (() => setView({ screen: "group", groupId: activeGroup.id }))}
          onEdit={(expenseId) => setView({ screen: "newExpense", groupId: activeGroup.id, expenseId })}
          isOnline={isOnline}
          showError={showError}
        />
      )}

      {view.screen === "paymentDetail" && activeGroup && (
        <PaymentDetail
          group={activeGroup}
          paymentId={view.paymentId}
          onBack={onBackOverride || (() => setView({ screen: "group", groupId: activeGroup.id }))}
          onEdit={(paymentId) => setView({ screen: "settleUp", groupId: activeGroup.id, paymentId })}
          isOnline={isOnline}
          showError={showError}
        />
      )}

      {view.screen === "newExpense" && (!view.groupId || activeGroup) && (
        <NewExpense
          group={activeGroup || null}
          groups={groups}
          defaultGroupId={session.defaultGroupId}
          expenseId={view.expenseId}
          session={session}
          evenCapital={evenCapital}
          onCancel={onBackOverride || (() => setView(
            view.groupId
              ? (view.expenseId
                  ? { screen: "expenseDetail", groupId: view.groupId, expenseId: view.expenseId }
                  : { screen: "group", groupId: view.groupId })
              : { screen: "home" }
          ))}
          onSave={async (expense) => {
            if (!isOnline) { blockOffline(); return; }
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
              let savedId = expense.id;
              if (exists) {
                const { error } = await supabase.from("expenses").update(payload).eq("id", expense.id);
                if (error) throw error;
              } else {
                const { data, error } = await supabase.from("expenses").insert(payload).select("id").single();
                if (error) throw error;
                savedId = data.id;
              }
              await reloadGroup(groupId);
              await evenCapital?.reload();
              // Si llegamos acá por "Ver original" desde una transacción
              // sincronizada (onBackOverride todavía activo porque no nos
              // movimos de pantalla), guardar nos manda derecho de vuelta a
              // EvenCapital — no tiene sentido pasar por el detalle del
              // gasto en el medio cuando el usuario ya terminó lo que vino a
              // hacer acá.
              if (onBackOverride) {
                onBackOverride();
              } else {
                setView(
                  exists
                    ? { screen: "expenseDetail", groupId, expenseId: expense.id }
                    : { screen: "group", groupId }
                );
              }
              return savedId;
            } catch (e) { showError(`No se pudo guardar el gasto: ${e?.message || e}`); }
          }}
          onDelete={async (expenseId) => {
            if (!isOnline) { blockOffline(); return; }
            try {
              // Soft-delete, no DELETE real: un gasto ya sincronizado hacia
              // EvenCapital (de cualquier miembro vinculado) guarda este id
              // en sl_source_id -- borrarlo de verdad rompe "Ver original"
              // para siempre, sin ningún error visible.
              const { error } = await supabase.from("expenses").update({ deleted: true }).eq("id", expenseId);
              if (error) throw error;
              await reloadGroup(activeGroup.id);
              await evenCapital?.reload();
              setView({ screen: "group", groupId: activeGroup.id });
              showInfo("Gasto eliminado.");
            } catch (e) { showError(`No se pudo borrar el gasto: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "settleUp" && activeGroup && (
        <SettleUp
          group={activeGroup}
          paymentId={view.paymentId}
          prefill={view.prefill}
          session={session}
          evenCapital={evenCapital}
          onCancel={onBackOverride || (() => setView(
            view.paymentId
              ? { screen: "paymentDetail", groupId: activeGroup.id, paymentId: view.paymentId }
              : { screen: "group", groupId: activeGroup.id }
          ))}
          onSave={async (payment) => {
            if (!isOnline) { blockOffline(); return; }
            const payload = {
              group_id: activeGroup.id,
              from_member_id: payment.from,
              to_member_id: payment.to,
              amount: payment.amount,
              currency: payment.currency,
              date: new Date(payment.date).toISOString(),
              note: payment.note || null,
            };
            try {
              let savedId = payment.id;
              if (payment.id) {
                const { error } = await supabase.from("payments").update(payload).eq("id", payment.id);
                if (error) throw error;
              } else {
                const { data, error } = await supabase.from("payments").insert(payload).select("id").single();
                if (error) throw error;
                savedId = data.id;
              }
              await reloadGroup(activeGroup.id);
              await evenCapital?.reload();
              // Mismo criterio que al guardar un gasto: si vinimos por "Ver
              // original", volver manda derecho a EvenCapital en vez de
              // pasar por el detalle del pago.
              if (onBackOverride) {
                onBackOverride();
              } else {
                setView(
                  payment.id
                    ? { screen: "paymentDetail", groupId: activeGroup.id, paymentId: payment.id }
                    : { screen: "group", groupId: activeGroup.id }
                );
              }
              return savedId;
            } catch (e) { showError(`No se pudo registrar el pago: ${e?.message || e}`); }
          }}
          onDelete={async (paymentId) => {
            if (!isOnline) { blockOffline(); return; }
            try {
              // Mismo motivo que el soft-delete de gastos: no romper "Ver
              // original" para un pago ya sincronizado hacia EvenCapital.
              const { error } = await supabase.from("payments").update({ deleted: true }).eq("id", paymentId);
              if (error) throw error;
              await reloadGroup(activeGroup.id);
              await evenCapital?.reload();
              setView({ screen: "group", groupId: activeGroup.id });
              showInfo("Pago eliminado.");
            } catch (e) { showError(`No se pudo borrar el pago: ${e?.message || e}`); }
          }}
        />
      )}

      {view.screen === "editGroup" && activeGroup && (
        <GroupForm
          key={`${JSON.stringify(groupInvites)}-${activeGroup.members.length}`}
          group={activeGroup}
          session={session}
          evenCapital={evenCapital}
          isOnline={isOnline}
          onCancel={onBackOverride || (() => setView({ screen: "group", groupId: activeGroup.id }))}
          onSave={async ({ name, baseCurrency, photoUrl, membersToAdd, memberIdsToRemove, categoriesToAdd, categoriesToUpdate, categoryIdsToRemove }) => {
            if (!isOnline) { blockOffline(); return false; }
            try {
              const { error: e1 } = await supabase
                .from("groups")
                .update({ name, base_currency: baseCurrency, photo_url: photoUrl })
                .eq("id", activeGroup.id);
              if (e1) throw e1;
              if (memberIdsToRemove.length) {
                // Soft-delete: un borrado real choca con la FK de payments/
                // expenses hacia esta fila en cuanto esa persona tuvo algún
                // gasto o pago (incluso ya saldado) — la fila se queda para
                // que el historial siga mostrando su nombre, solo se la deja
                // de ofrecer para gastos/pagos nuevos.
                const { error } = await supabase.from("group_members").update({ deleted: true }).in("id", memberIdsToRemove);
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
              if (categoriesToUpdate.length) {
                const results = await Promise.all(categoriesToUpdate.map((c) =>
                  supabase.from("categories").update({ label: c.label, icon_key: c.iconKey, sort_order: c.sortOrder }).eq("id", c.id)
                ));
                const failed = results.find((r) => r.error);
                if (failed) throw failed.error;
              }
              if (categoriesToAdd.length) {
                const { error } = await supabase.from("categories").insert(
                  categoriesToAdd.map((c) => ({ group_id: activeGroup.id, label: c.label, icon_key: c.iconKey, sort_order: c.sortOrder }))
                );
                if (error) throw error;
              }
              await reloadGroup(activeGroup.id);
              // Navegar después de guardar es decisión de GroupForm, no de
              // acá -- "Guardar" vuelve a la pantalla de siempre (su propio
              // `onCancel`, que ya resuelve el caso del deep link); "Guardar
              // y vincular" en cambio sigue derecho a Invitar. Esta función
              // solo persiste y avisa si salió bien.
              return true;
            } catch (e) { showError(`No se pudo guardar el grupo: ${e?.message || e}`); return false; }
          }}
          onDeleteGroup={async () => {
            if (!isOnline) { blockOffline(); return; }
            try {
              await deleteGroup(activeGroup.id);
              setView({ screen: "home" });
              showInfo(`"${activeGroup.name}" eliminado.`);
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
            if (!isOnline) { blockOffline(); return false; }
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
              return true;
            } catch (e) { showError(`No se pudo enviar la invitación: ${e?.message || e}`); return false; }
          }}
          onCancelInvite={async (memberId) => {
            if (!isOnline) { blockOffline(); return; }
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

    </>
  );
}

/* =========================================================================
   HOME
   ========================================================================= */

// Una línea por cada moneda donde el usuario tenga balance pendiente en este grupo
// (sin conversión entre monedas — si debe en COP y le deben en EUR, son dos líneas).
function groupCardLines(g, session) {
  const myId = g.members.find((m) => m.linkedUserId === session?.userId)?.id;
  if (!myId) return [{ key: "settled", node: "Saldado" }];

  const balancesByCurrency = computeBalances(g);
  const lines = [];

  for (const currency of Object.keys(balancesByCurrency)) {
    const bal = balancesByCurrency[currency];
    if (Object.values(bal).every((v) => Math.abs(v) < 0.01)) continue;
    const txns = simplifyDebts(bal);
    const owedByMe = txns.filter((t) => t.from === myId);
    const owedToMe = txns.filter((t) => t.to === myId);

    if (owedByMe.length > 0) {
      const total = owedByMe.reduce((s, t) => s + t.amount, 0);
      const who = owedByMe.length === 1 ? shortName(nameOf(g.members, owedByMe[0].to)) : `${owedByMe.length} personas`;
      lines.push({ key: currency, node: <>Debes <span style={{ color: "#B0473A", fontWeight: 700 }}>{money(total, currency)}</span> a {who}</> });
    } else if (owedToMe.length > 0) {
      const total = owedToMe.reduce((s, t) => s + t.amount, 0);
      const who = owedToMe.length === 1 ? shortName(nameOf(g.members, owedToMe[0].from)) : `${owedToMe.length} personas`;
      const verb = owedToMe.length === 1 ? "te debe" : "te deben";
      lines.push({ key: currency, node: <>{who} {verb} <span style={{ color: "#3B6E62", fontWeight: 700 }}>{money(total, currency)}</span></> });
    }
  }
  return lines.length > 0 ? lines : [{ key: "settled", node: "Saldado" }];
}

function Home({ groups, loading, session, evenCapital, onOpen, onNewExpense, isOnline = true, showError }) {
  return (
    <div style={styles.screenWithFab}>
      <RootHeader title="Tus grupos" />

      {loading && <EmptyState title="Abriendo los grupos…" />}

      {!loading && groups && groups.length === 0 && (
        <EmptyState icon={<Receipt size={28} strokeWidth={1.5} />} title="Todavía no hay ningún grupo">
          Crea tu primer grupo desde Configuración → EvenGroup (un viaje, un
          piso, una junta) y empieza a anotar quién paga qué.
        </EmptyState>
      )}

      {!loading && groups && groups.length > 0 && (
        <ul style={styles.groupList}>
          {groups.map((g) => {
            const isLinked = evenCapital?.slLinks?.some((l) => l.active && l.group_id === g.id && l.user_id === session.userId);
            return (
              <li key={g.id}>
                <button style={styles.groupCard} onClick={() => onOpen(g.id)}>
                  <div style={styles.groupCardLeft}>
                    <div style={{ width: 48, height: 48, minWidth: 48, borderRadius: 12, overflow: "hidden", background: g.photoUrl ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <ImageWithFallback
                        src={g.photoUrl}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        fallback={<User size={22} color="#A89A87" />}
                      />
                    </div>
                    <div>
                      <p style={styles.groupName}>{g.name}</p>
                      {groupCardLines(g, session).map(({ key, node }) => (
                        <p key={key} style={styles.groupMeta}>{node}</p>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {isLinked && (
                      <span style={{ display: "flex" }} title="Vinculado a EvenCapital">
                        <EvenGroupIcon size={26} />
                      </span>
                    )}
                    <ChevronRight size={20} color="#A89A87" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* FAB flotante para agregar un gasto — sin grupos todavía no hay a dónde agregarlo.
          bottom más alto que el default: acá siempre está visible la barra de 5 tabs. */}
      {!loading && groups && groups.length > 0 && (
        <button
          style={{ ...styles.fab, bottom: "calc(78px + env(safe-area-inset-bottom))", opacity: isOnline ? 1 : 0.5 }}
          onClick={() => { if (!isOnline) { showError("Estás offline, no podés crear un gasto ahora."); return; } onNewExpense(); }}
          aria-label="Agregar gasto"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   NEW GROUP
   ========================================================================= */

// NewGroup + EditGroup fusionados en un solo componente — pero solo el
// encabezado (foto, nombre, moneda) es realmente "lo mismo" entre crear y
// editar. Integrantes, categorías y borrar tienen modelos de datos e
// interacciones genuinamente distintas (nombres en blanco vs. personas reales
// con id/invitación/balance pendiente; sin categorías vs. reordenar con
// drag-and-drop; sin borrar vs. modal de "escribí Confirmar") — se dejan
// como secciones propias de cada modo, no forzadas a parecerse.
function GroupForm({ group = null, session, evenCapital, onCancel, onCreate, onSave, onDeleteGroup, onInvite, groupInvites = [], showError, isOnline = true }) {
  const isEditing = !!group;
  const [name, setName] = useState(group?.name || "");
  const [baseCurrency, setBaseCurrency] = useState(group?.baseCurrency || "EUR");
  const { previewUrl: photoUrl, pendingFile, removed, handleImageChange: handlePhoto, clear: clearPhoto } = useImageUpload(group?.photoUrl || null, showError);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});
  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));

  // --- Solo para crear: integrantes como campos de texto en blanco ---
  const [blankMembers, setBlankMembers] = useState([""]);
  const updateMember = (i, val) => setBlankMembers((prev) => prev.map((m, idx) => (idx === i ? val : m)));
  const addMemberField = () => setBlankMembers((prev) => [...prev, ""]);
  const removeMemberField = (i) => setBlankMembers((prev) => prev.filter((_, idx) => idx !== i));
  const hasEnoughMembers = blankMembers.some((n) => n.trim());
  const canCreate = name.trim() && hasEnoughMembers;

  const handleCreate = async () => {
    if (saving) return;
    if (!canCreate) { setTouched({ name: true, members: true }); return; }
    setSaving(true);
    try {
      const resolvedPhotoUrl = await resolvePhotoUrl({ pendingFile, removed, currentUrl: null });
      // Creador siempre incluido como miembro vinculado
      const myMember = { name: session.displayName, linkedUserId: session.userId };
      const otherMembers = blankMembers.map((n) => n.trim()).filter(Boolean).map((n) => ({ name: n }));
      await onCreate({
        name: name.trim(),
        baseCurrency,
        members: [myMember, ...otherMembers],
        photoUrl: resolvedPhotoUrl,
      });
    } catch (e) {
      showError(`No se pudo guardar: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  // --- Solo para editar: integrantes reales, categorías, borrar ---
  const [members, setMembers] = useState(() => (group?.members || []).filter((m) => !m.deleted));
  const [newMemberName, setNewMemberName] = useState("");
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState(null);
  const [categories, setCategories] = useState(() => (group ? groupCategories(group).map(c => ({ ...c })) : []));
  const [editingCatId, setEditingCatId] = useState(null);
  const [catsOpen, setCatsOpen] = useState(false);
  // Scroll al contenido recién revelado -- ver nota igual en ExpenseForm/
  // TransactionForm.jsx, mismo motivo (helpers.jsx).
  const catsRef = useRef(null);
  useScrollIntoViewOnChange(catsRef, catsOpen);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingGroup, setDeletingGroup] = useState(false);
  const balances = useMemo(() => (group ? computeBalances(group) : {}), [group]);

  const isDirty = useMemo(() => {
    if (!group) return true;
    if (name.trim() !== group.name) return true;
    if (baseCurrency !== group.baseCurrency) return true;
    if (pendingFile || removed) return true;
    const origMemberIds = new Set(group.members.filter((m) => !m.deleted).map((m) => m.id));
    const curMemberIds = new Set(members.map((m) => m.id));
    if (origMemberIds.size !== curMemberIds.size || [...origMemberIds].some((id) => !curMemberIds.has(id))) return true;
    const origCats = groupCategories(group);
    if (origCats.length !== categories.length) return true;
    if (origCats.some((c, i) => c.id !== categories[i].id || c.label !== categories[i].label || c.iconKey !== categories[i].iconKey)) return true;
    return false;
  }, [name, baseCurrency, pendingFile, removed, members, categories, group]);
  const hasEmptyCategory = categories.some((c) => !c.label.trim());

  // --- Vínculo con EvenCapital: personal (no lo ven otros miembros), pero
  // se guarda con el mismo botón "Guardar" de este formulario — no amerita
  // un botón propio aparte. Desvincular es la excepción: queda inmediato,
  // con su propia confirmación, en EvenGroupCapitalLink más abajo.
  const myMemberId = group?.members.find((m) => m.linkedUserId === session.userId)?.id;
  const activeMmLink = isEditing && myMemberId
    ? evenCapital?.slLinks?.find((l) => l.active && l.group_id === group.id && l.user_id === session.userId)
    : null;
  const [mmLinked, setMmLinked] = useState(!!activeMmLink);
  const [mmOwnAccountId, setMmOwnAccountId] = useState(activeMmLink?.default_own_account_id || "");
  const [mmOtherAccountId, setMmOtherAccountId] = useState(activeMmLink?.default_other_account_id || "");
  // "Lo que prestás" (lend_account_id) y "lo que te prestan" (loan_account_id)
  // son independientes entre sí -- antes eran un solo campo compartido, se
  // separaron porque no hay ninguna relación lógica entre las dos
  // direcciones (ver TAREAS_ACTUALES.md). Las dos son independientes de la
  // cuenta pseudo (esa sigue siempre auto-manejada, invisible) -- vacío =
  // esa pata del préstamo sigue usando "propios"/"ajenos" como hasta ahora.
  const [mmLendAccountId, setMmLendAccountId] = useState(activeMmLink?.lend_account_id || "");
  const [mmLoanAccountId, setMmLoanAccountId] = useState(activeMmLink?.loan_account_id || "");
  // Solo tiene efecto si "lo que prestás" es una tarjeta de crédito -- ver
  // EvenGroupCapitalLink, que la oculta si no.
  const [mmLendOffsetAccountId, setMmLendOffsetAccountId] = useState(activeMmLink?.lend_offset_account_id || "");
  useEffect(() => {
    setMmLinked(!!activeMmLink);
    setMmOwnAccountId(activeMmLink?.default_own_account_id || "");
    setMmOtherAccountId(activeMmLink?.default_other_account_id || "");
    setMmLendAccountId(activeMmLink?.lend_account_id || "");
    setMmLoanAccountId(activeMmLink?.loan_account_id || "");
    setMmLendOffsetAccountId(activeMmLink?.lend_offset_account_id || "");
  }, [activeMmLink?.id, activeMmLink?.default_own_account_id, activeMmLink?.default_other_account_id, activeMmLink?.lend_account_id, activeMmLink?.loan_account_id, activeMmLink?.lend_offset_account_id]);
  const mmNeedsAccounts = mmLinked && (!mmOwnAccountId || !mmOtherAccountId);
  const mmDirty = !!myMemberId && (activeMmLink
    ? (mmOwnAccountId !== activeMmLink.default_own_account_id || mmOtherAccountId !== activeMmLink.default_other_account_id
        || mmLendAccountId !== (activeMmLink.lend_account_id || "") || mmLoanAccountId !== (activeMmLink.loan_account_id || "")
        || mmLendOffsetAccountId !== (activeMmLink.lend_offset_account_id || ""))
    : (mmLinked && !!mmOwnAccountId && !!mmOtherAccountId));

  const canSaveEdit = name.trim() && members.length >= 2 && !hasEmptyCategory && !mmNeedsAccounts;

  const addMember = () => {
    const n = newMemberName.trim();
    if (!n) return;
    setMembers((prev) => [...prev, { id: uid(), name: n }]);
    setNewMemberName("");
  };

  const removeMember = (id) => {
    const hasPending = Object.values(balances).some((bal) => Math.abs(bal[id] || 0) > 0.01);
    if (hasPending) {
      showError("No puedes quitar a alguien con balance pendiente. Salda sus cuentas primero.");
      return;
    }
    setConfirmRemoveMemberId(id);
  };

  const confirmRemoveMember = (id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setConfirmRemoveMemberId(null);
  };

  // Persiste los cambios pendientes (si los hay) sin decidir qué pasa
  // después -- eso queda en manos de quien llama: "Guardar" vuelve a la
  // pantalla del grupo, "Guardar y vincular" sigue derecho a Invitar (ver
  // handleSave/handleSaveAndInvite más abajo). Devuelve true si quedó todo
  // bien (incluido el caso de "no había nada que guardar"), false si hubo
  // que frenar (validación, offline, o error real) -- en ese caso, quien
  // llama no debe navegar a ningún lado.
  const persistPendingChanges = async () => {
    if (!isDirty && !mmDirty) return true;
    if (!canSaveEdit) {
      setTouched({ name: true, members: true, categories: true, mmOwnAccountId: true, mmOtherAccountId: true });
      if (hasEmptyCategory) setCatsOpen(true);
      return false;
    }
    if (!isOnline) { showError("Estás offline, no podés hacer esto ahora."); return false; }
    setSaving(true);
    try {
      const resolvedPhotoUrl = await resolvePhotoUrl({ pendingFile, removed, currentUrl: group.photoUrl });

      const originalMemberIds = new Set(group.members.filter((m) => !m.deleted).map((m) => m.id));
      const currentMemberIds = new Set(members.map((m) => m.id));
      const membersToAdd = members.filter((m) => !originalMemberIds.has(m.id));
      const memberIdsToRemove = group.members.filter((m) => !m.deleted && !currentMemberIds.has(m.id)).map((m) => m.id);

      const originalCatsById = new Map(groupCategories(group).map((c, i) => [c.id, { label: c.label, iconKey: c.iconKey, sortOrder: i }]));
      const currentCategoryIds = new Set(categories.map((c) => c.id));
      const indexedCategories = categories.map((c, i) => ({ ...c, sortOrder: i }));
      const categoriesToAdd = indexedCategories.filter((c) => !originalCatsById.has(c.id));
      // Solo se manda a actualizar la categoría cuyo label/ícono/orden realmente cambió,
      // no todas las que ya existían (evita un UPDATE por categoría sin tocar en cada guardado).
      const categoriesToUpdate = indexedCategories.filter((c) => {
        const orig = originalCatsById.get(c.id);
        return orig && (orig.label !== c.label || orig.iconKey !== c.iconKey || orig.sortOrder !== c.sortOrder);
      });
      const categoryIdsToRemove = groupCategories(group).filter((c) => !currentCategoryIds.has(c.id)).map((c) => c.id);

      if (mmDirty) {
        if (activeMmLink) {
          await updateLinkDefaults(activeMmLink.id, {
            defaultOwnAccountId: mmOwnAccountId,
            defaultOtherAccountId: mmOtherAccountId,
            lendAccountId: mmLendAccountId || null,
            loanAccountId: mmLoanAccountId || null,
            lendOffsetAccountId: mmLendOffsetAccountId || null,
          });
        } else {
          await linkGroupToAccount({
            userId: session.userId,
            groupId: group.id,
            memberId: myMemberId,
            groupName: group.name,
            defaultOwnAccountId: mmOwnAccountId,
            defaultOtherAccountId: mmOtherAccountId,
            lendAccountId: mmLendAccountId || null,
            loanAccountId: mmLoanAccountId || null,
            lendOffsetAccountId: mmLendOffsetAccountId || null,
            currency: evenCapital.settings.main_currency,
          });
        }
        await evenCapital.reload();
      }

      const ok = await onSave({
        name: name.trim(), baseCurrency, photoUrl: resolvedPhotoUrl,
        membersToAdd, memberIdsToRemove, categoriesToAdd, categoriesToUpdate, categoryIdsToRemove,
      });
      return !!ok;
    } catch (e) {
      showError(`No se pudo guardar: ${e?.message || e}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (await persistPendingChanges()) onCancel();
  };

  // "Guardar y vincular" -- mismo guardado que "Guardar" de arriba, pero en
  // vez de volver a la pantalla del grupo sigue derecho a Invitar. Pensado
  // para el caso de agregar una persona nueva y querer invitarla ya mismo,
  // sin el viaje redondo de guardar, salir, volver a entrar.
  const handleSaveAndInvite = async () => {
    if (saving) return;
    if (await persistPendingChanges()) onInvite();
  };

  const addCategory = () => {
    const usedKeys = new Set(categories.map(c => c.iconKey));
    const iconKey = ICON_KEYS.find(k => !usedKeys.has(k)) || "MoreHorizontal";
    setCategories(prev => [...prev, { id: uid(), label: "", iconKey }]);
    setCatsOpen(true);
  };

  const removeCategory = (id) => {
    if (categories.length <= 1) return showError("El grupo necesita al menos una categoría.");
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const updateCategory = (id, patch) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  // Reordenar categorías (dnd-kit: MouseSensor + TouchSensor en vez de PointerSensor —
  // PointerSensor depende de que Safari/iOS respete touch-action:none vía CSS para
  // suprimir el scroll nativo, y en listas con varios ítems lo hace de forma inconsistente
  // ahí; TouchSensor intercepta el touch directamente y llama preventDefault(), más confiable).
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const handleCategoryDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setCategories((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  return (
    <div style={styles.screen}>
      <TopBar
        title={isEditing ? "Editar grupo" : "Nuevo grupo"}
        onBack={onCancel}
        right={isEditing && group.creatorId === session?.userId && (
          <button style={styles.iconBtnGhost} onClick={() => setShowDeleteModal(true)} aria-label="Borrar grupo">
            <Trash2 size={18} color="#B0473A" />
          </button>
        )}
      />
      <div style={styles.form}>
        {/* Foto del grupo */}
        <PhotoPicker previewUrl={photoUrl} onChange={handlePhoto} onClear={clearPhoto} shape="square" disabled={!isOnline} onDisabledClick={() => showError("Estás offline, no podés hacer esto ahora.")} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif" }}>
          <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 13, color: "#6B6355" }}>
            Nombre del grupo<span style={{ color: "#B0473A" }}>*</span>
          </span>
          <input
            className="row-input"
            style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13.5, fontFamily: "system-ui, sans-serif", border: "none", background: "transparent", padding: 0, color: "#2B2620" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => touch("name")}
            placeholder={isEditing ? undefined : "Viaje a Lisboa, Piso compartido…"}
          />
        </div>
        {touched.name && !name.trim() && (
          <p style={{ margin: "-8px 0 0", fontSize: 12, fontFamily: "system-ui, sans-serif", color: "#B0473A" }}>Este campo es obligatorio.</p>
        )}

        <PickerField
          rowLabel={isEditing ? "Moneda principal" : "Moneda principal del grupo"}
          title="Elegí la moneda"
          value={baseCurrency}
          onChange={setBaseCurrency}
          groups={[{ label: null, items: CURRENCY_LIST.map((c) => ({ value: c, label: c, icon: CURRENCIES[c].symbol })) }]}
        />
        {!isEditing && (
          <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
            Es la moneda que se preselecciona al crear un gasto. Puedes registrar gastos en
            otras monedas cuando quieras, cada una lleva su propio balance por separado.
          </p>
        )}

        {isEditing ? (
          <>
            {/* Envueltos juntos (gap:6, no el gap:14 del form de afuera) —
                label, lista, campo para sumar gente e invitar son una sola
                unidad, el form entero no debería separarlos como si fueran
                varias secciones distintas. display:"block" en el <p> —
                styles.label trae flexDirection:"column" (pensado para un
                Field con label+input apilados), que acá partía "Personas" y
                el "*" en 2 líneas en vez de una. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ ...styles.label, display: "block", margin: 0 }}>Personas <span style={{ color: "#B0473A" }}>*</span></p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {members.map((m) => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <div style={{ ...styles.shareRow, borderRadius: confirmRemoveMemberId === m.id ? "10px 10px 0 0" : 10 }}>
                    <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block" }}>{m.name}</span>
                      {groupInvites.find((i) => i.memberId === m.id) && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#3B6E62", fontFamily: "system-ui, sans-serif" }}>
                          Invitación enviada a @{groupInvites.find((i) => i.memberId === m.id).username}
                        </span>
                      )}
                    </div>
                    {Object.values(balances).some((bal) => Math.abs(bal[m.id] || 0) > 0.01) && (
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
                    <ConfirmInline
                      message={`¿Quitar a ${m.name} del grupo?`}
                      confirmLabel="Quitar"
                      onCancel={() => setConfirmRemoveMemberId(null)}
                      onConfirm={() => confirmRemoveMember(m.id)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...styles.input, flex: 1 }} value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} onBlur={() => touch("members")} placeholder="Nombre de la nueva persona" onKeyDown={(e) => e.key === "Enter" && newMemberName.trim() && addMember()} />
              <button style={{ ...styles.btnSecondarySmall, opacity: newMemberName.trim() ? 1 : 0.5 }} onClick={addMember} disabled={!newMemberName.trim()}><UserPlus size={16} /></button>
            </div>
            {touched.members && members.length < 2 && (
              <p style={{ margin: 0, fontSize: 12, color: "#B0473A", fontFamily: "system-ui, sans-serif" }}>El grupo necesita al menos 2 personas.</p>
            )}

            {/* Invitar personas. Si ya no queda nadie sin usuario vinculado,
                no hay nada que invitar: el botón directamente no aparece.
                Bloqueado mientras haya cambios sin guardar -- "Invitar" lee
                la lista de miembros YA PERSISTIDA (la prop `group`, no este
                estado local), así que una persona recién agregada acá
                todavía no existiría del otro lado hasta guardar. */}
            {group.creatorId === session?.userId && members.some((m) => !m.linkedUserId) && (
              <>
                <button
                  style={{ ...styles.btnSecondary, opacity: (saving || ((isDirty || mmDirty) && !canSaveEdit)) ? 0.5 : 1 }}
                  onClick={handleSaveAndInvite}
                  disabled={saving || ((isDirty || mmDirty) && !canSaveEdit)}
                >
                  <UserPlus size={16} /> {(isDirty || mmDirty) ? "Guardar cambios y vincular un usuario" : "Vincular un usuario a un miembro ya creado"}
                </button>
                {(isDirty || mmDirty) && (
                  <p style={{ margin: "-4px 0 0", fontSize: 12, fontFamily: "system-ui, sans-serif", color: "#6B6355" }}>
                    Se van a guardar todos los cambios pendientes del formulario antes de continuar al formulario de invitación.
                  </p>
                )}
              </>
            )}
            </div>

            {/* ── Categorías colapsables ── mismo aspecto que "Dividido en"
                (caja con borde, el body queda pegado y conectado abajo). */}
            <div>
              <button
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "#FAF7F2", border: "1px solid #DDD2BE", borderRadius: catsOpen ? "10px 10px 0 0" : 10, padding: "10px 14px", cursor: "pointer" }}
                onClick={() => setCatsOpen(v => !v)}
                aria-expanded={catsOpen}
              >
                <span style={styles.label}>Categorías de gasto ({categories.length})</span>
                {catsOpen ? <ChevronUp size={18} color="#6B6355" /> : <ChevronDownIcon size={18} color="#6B6355" />}
              </button>

              {catsOpen && (
                <div ref={catsRef} style={{ border: "1px solid #DDD2BE", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px", display: "flex", flexDirection: "column", gap: 10, background: "#fff" }}>
                  <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
                    <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {categories.map((cat) => (
                          <SortableCategoryRow
                            key={cat.id}
                            cat={cat}
                            onEditIcon={() => setEditingCatId(cat.id)}
                            onChangeLabel={(label) => updateCategory(cat.id, { label })}
                            onRemove={() => removeCategory(cat.id)}
                            draggable={categories.length > 1}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <button style={styles.btnDashed} onClick={addCategory}><Plus size={16} /> Nueva categoría</button>
                  {touched.categories && hasEmptyCategory && (
                    <p style={{ margin: "-4px 0 0", fontSize: 12, color: "#B0473A", fontFamily: "system-ui, sans-serif" }}>Todas las categorías necesitan un nombre.</p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Mismo motivo que "Personas" (modo editar) — label+contenido
                envueltos juntos (gap:6) para no heredar el gap:14 del form,
                y display:"block" para que "Integrantes" y el "*" no se
                partan en 2 líneas (styles.label trae flexDirection:column). */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ ...styles.label, display: "block", margin: 0 }}>Integrantes <span style={{ color: "#B0473A" }}>*</span></p>

              {/* Tú — fijo, no se puede quitar */}
              <div style={{ ...styles.shareRow, background: "#F3EFE5", borderColor: "#DDD2BE" }}>
                <span style={{ ...styles.avatar, background: colorFor(session.userId) }}>{initials(session.displayName)}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{session.displayName}</span>
                <span style={{ fontSize: 11, color: "#A8754A", fontFamily: "system-ui, sans-serif" }}>Tú</span>
              </div>

              {/* Otros miembros */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {blankMembers.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ ...styles.avatar, background: m.trim() ? colorFor(m + i) : "#D9CFC1" }}>
                      {m.trim() ? initials(m) : i + 1}
                    </span>
                    <input style={{ ...styles.input, flex: 1 }} value={m} onChange={(e) => updateMember(i, e.target.value)} onBlur={() => touch("members")} placeholder={`Persona ${i + 1}`} />
                    {blankMembers.length > 1 && (
                      <button style={styles.iconBtnGhost} onClick={() => removeMemberField(i)} aria-label="Quitar persona"><X size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button style={styles.btnDashed} onClick={addMemberField}><Plus size={16} /> Agregar persona</button>
            {touched.members && !hasEnoughMembers && (
              <p style={{ margin: "-4px 0 0", fontSize: 12, color: "#B0473A", fontFamily: "system-ui, sans-serif" }}>Agregá al menos una persona.</p>
            )}
          </>
        )}

        {/* Vincular a EvenCapital — personal, no grupal, pero se guarda
            con el mismo botón "Guardar" de arriba (el vínculo en sí no
            amerita su propio botón). Desvincular es la excepción, queda
            inmediato. */}
        {isEditing && evenCapital && (
          <EvenGroupCapitalLink
            group={group}
            session={session}
            evenCapital={evenCapital}
            showError={showError}
            isOnline={isOnline}
            linked={mmLinked}
            onToggle={setMmLinked}
            ownAccountId={mmOwnAccountId}
            onOwnAccountChange={setMmOwnAccountId}
            otherAccountId={mmOtherAccountId}
            onOtherAccountChange={setMmOtherAccountId}
            lendAccountId={mmLendAccountId}
            onLendAccountChange={setMmLendAccountId}
            loanAccountId={mmLoanAccountId}
            onLoanAccountChange={setMmLoanAccountId}
            lendOffsetAccountId={mmLendOffsetAccountId}
            onLendOffsetAccountChange={setMmLendOffsetAccountId}
            touched={touched}
            touch={touch}
            disabled={saving}
          />
        )}
      </div>

      {isEditing && editingCatId && (() => {
        const editingCat = categories.find((c) => c.id === editingCatId);
        return (
          <Modal title="Elegir ícono" onClose={() => setEditingCatId(null)}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ICON_KEYS.map((key) => {
                const usedByOther = categories.some((c) => c.id !== editingCatId && c.iconKey === key);
                return (
                  <button
                    key={key}
                    onClick={() => { if (!usedByOther) { updateCategory(editingCatId, { iconKey: key }); setEditingCatId(null); } }}
                    disabled={usedByOther}
                    title={usedByOther ? "Ya usado por otra categoría" : undefined}
                    style={{ width: 34, height: 34, borderRadius: 8, border: editingCat?.iconKey === key ? "2px solid #C75D3B" : "1px solid #DDD2BE", background: editingCat?.iconKey === key ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#544A3C", opacity: usedByOther ? 0.3 : 1, cursor: usedByOther ? "not-allowed" : "pointer" }}
                    aria-label={key}
                  >
                    <IconComp iconKey={key} size={16} />
                  </button>
                );
              })}
            </div>
          </Modal>
        );
      })()}

      <FormFooter
        onCancel={onCancel}
        onConfirm={isEditing ? handleSave : handleCreate}
        confirmLabel={isEditing ? (saving ? "Guardando…" : "Guardar") : (saving ? "Creando…" : "Crear")}
        confirmDisabled={saving}
        confirmDim={isEditing ? ((!isDirty && !mmDirty) || !canSaveEdit) : !canCreate}
      />

      {isEditing && showDeleteModal && (
        <Modal title={`¿Borrar "${group.name}"?`} onClose={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}>
          <p style={{ margin: "0 0 14px", fontSize: 14, fontFamily: "system-ui, sans-serif", color: "#6B6355" }}>
            Esta acción no se puede deshacer.
          </p>
          <input
            style={{ ...styles.input, fontSize: 14, width: "100%" }}
            placeholder='Escribe "Confirmar" para continuar'
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={{ ...styles.btnGhostSmall, flex: 1, justifyContent: "center" }} onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}>Cancelar</button>
            <button
              style={{ ...styles.btnDangerSmall, flex: 1, opacity: (deleteConfirmText === "Confirmar" && !deletingGroup) ? 1 : 0.4, cursor: (deleteConfirmText === "Confirmar" && !deletingGroup) ? "pointer" : "not-allowed" }}
              disabled={deletingGroup}
              onClick={async () => {
                if (deleteConfirmText !== "Confirmar") return;
                setDeletingGroup(true);
                await onDeleteGroup();
                setDeletingGroup(false);
              }}
            >
              {deletingGroup ? "Eliminando…" : "Confirmar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Sección "Mi EvenCapital" dentro de Editar grupo — vincular este grupo a
// 2 cuentas default (propios/ajenos). Controlado desde GroupForm: el toggle
// y los 2 selectores son borrador suyo, se guardan con su mismo botón
// "Guardar" (no amerita uno propio). Desvincular es la excepción — queda acá
// adentro como acción inmediata con su propia confirmación, porque es más
// parecida a borrar algo que a editar un campo del formulario.
function EvenGroupCapitalLink({
  group, session, evenCapital, showError,
  linked, onToggle, ownAccountId, onOwnAccountChange, otherAccountId, onOtherAccountChange,
  lendAccountId, onLendAccountChange, loanAccountId, onLoanAccountChange,
  lendOffsetAccountId, onLendOffsetAccountChange,
  touched, touch, disabled, isOnline = true,
}) {
  const [unlinking, setUnlinking] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(!!(lendAccountId || loanAccountId || lendOffsetAccountId));
  const advancedRef = useRef(null);
  useScrollIntoViewOnChange(advancedRef, advancedOpen);

  const myMemberId = group.members.find((m) => m.linkedUserId === session.userId)?.id;
  const activeLink = evenCapital.slLinks.find((l) => l.active && l.group_id === group.id && l.user_id === session.userId);

  // Cuentas elegibles: ninguna cuenta eliminada, ninguna del propio grupo
  // "EvenGroup" (no tiene sentido vincular un grupo a su propia cuenta
  // pseudo, ni a la de otro grupo vinculado). Tarjetas de crédito sí se
  // permiten — un gasto del grupo puede perfectamente haberse pagado con una.
  const accountGroups = evenCapital.groups
    .filter((g) => !g.deleted && g.system_key !== "split_ledger")
    .map((g) => ({
      label: g.name,
      items: evenCapital.accounts
        .filter((a) => a.group_id === g.id && !a.hidden && !a.deleted)
        .map((a) => ({ value: a.id, label: a.name, icon: a.icon })),
    }))
    .filter((g) => g.items.length > 0);

  // La compensación por ciclo de tarjeta (lendOffsetAccountId) solo tiene
  // sentido si la cuenta que de verdad se usa para prestar es una tarjeta de
  // crédito -- y esa no es necesariamente "lo que prestás": si ese campo
  // queda vacío, el préstamo cae en "propios" (ver ensureExpenseChoices en
  // evenGroupSync.js), el mismo fallback que ya usa la sincronización.
  const effectiveLendAccountId = lendAccountId || ownAccountId;
  const lendAccountIsCreditCard = !!evenCapital.accounts.find((a) => a.id === effectiveLendAccountId)?.is_credit_card;

  const handleToggle = (on) => {
    if (on || !activeLink) { onToggle(on); return; }
    setConfirmingUnlink(true); // ya hay un vínculo guardado — apagar pide confirmación
  };

  const handleUnlink = async () => {
    if (!isOnline) { showError("Estás offline, no podés hacer esto ahora."); return; }
    setUnlinking(true);
    try {
      await unlinkGroup(activeLink.id);
      await evenCapital.reload();
    } catch (e) {
      showError(`No se pudo desvincular: ${e?.message || e}`);
    } finally {
      setUnlinking(false);
      setConfirmingUnlink(false);
    }
  };

  if (!myMemberId) return null; // no soy miembro vinculado de este grupo — no aplica

  // Aviso de saldo previo: la sincronización solo mira gastos/pagos desde
  // que se vincula ("nada retroactivo") — si ya había un saldo pendiente
  // antes, ese nunca se va a reflejar en EvenCapital. Solo tiene sentido
  // mostrarlo al crear un vínculo nuevo, no en uno ya activo.
  const pendingBalances = !activeLink
    ? Object.entries(computeBalances(group))
        .map(([currency, byMember]) => [currency, byMember[myMemberId] || 0])
        .filter(([, amt]) => Math.abs(amt) > 0.005)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ToggleField
        label="Vincular grupo a EvenCapital"
        description="Tus gastos del grupo se reflejan en tus cuentas."
        checked={linked}
        disabled={disabled || unlinking}
        onChange={handleToggle}
      />
      {linked && pendingBalances.length > 0 && (
        <p style={{ ...styles.muted, padding: 0, color: "#B0473A" }}>
          Ya tenías un saldo pendiente en este grupo ({pendingBalances.map(([currency, amt]) => money(amt, currency)).join(", ")}). No se va a reflejar en EvenCapital, solo lo que pase de acá en adelante.
        </p>
      )}
      {confirmingUnlink && (
        <ConfirmInline
          message="¿Desvincular este grupo de tu EvenCapital? Las transacciones ya sincronizadas no se borran, pero vas a dejar de ver las nuevas."
          confirmLabel={unlinking ? "Desvinculando…" : "Desvincular"}
          confirmDisabled={unlinking}
          onCancel={() => setConfirmingUnlink(false)}
          onConfirm={handleUnlink}
          style={{ borderRadius: 12, borderTop: "1px solid #EBC9BA" }}
        />
      )}
      {linked && !confirmingUnlink && (
        <>
          <Field
            label="Cuenta por defecto en gastos propios"
            info={"Cuenta que se usa para tu parte cuando vos creás un gasto en el grupo.\nEj: creás un gasto de €100 del que €50 son tuyos y €50 son de otra persona. Los €50 tuyos salen de esta cuenta."}
            required
            error={touched.mmOwnAccountId && !ownAccountId ? "Este campo es obligatorio." : ""}
          >
            <PickerField
              value={ownAccountId}
              onChange={onOwnAccountChange}
              onBlur={() => touch("mmOwnAccountId")}
              groups={accountGroups}
              placeholder="Elegí una cuenta"
            />
          </Field>
          <Field
            label="Cuenta por defecto en gastos ajenos"
            info={"Cuenta que se usa para tu parte cuando otro miembro crea un gasto en el grupo.\nEj: alguien crea un gasto de €100 del que €50 son tuyos. Esos €50 salen de esta cuenta, pero entran de vuelta al mismo tiempo por una transferencia automática (desde 'lo que te prestan' si la configuraste en Opciones avanzadas, o desde esta misma cuenta si no) -- así que en neto no perdés nada hasta que de verdad le debas esa plata a alguien."}
            required
            error={touched.mmOtherAccountId && !otherAccountId ? "Este campo es obligatorio." : ""}
          >
            <PickerField
              value={otherAccountId}
              onChange={onOtherAccountChange}
              onBlur={() => touch("mmOtherAccountId")}
              groups={accountGroups}
              placeholder="Elegí una cuenta"
            />
          </Field>

          {/* Opciones avanzadas — casi nadie las necesita (solo quien presta
              o le prestan plata del grupo y quiere separarla de sus gastos
              propios/ajenos), así que quedan colapsadas por defecto, salvo
              que ya haya algo configurado acá (ver advancedOpen más arriba). */}
          <div>
            <button
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "#FAF7F2", border: "1px solid #DDD2BE", borderRadius: advancedOpen ? "10px 10px 0 0" : 10, padding: "10px 14px", cursor: "pointer" }}
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              type="button"
            >
              <span style={styles.label}>Opciones avanzadas</span>
              {advancedOpen ? <ChevronUp size={18} color="#6B6355" /> : <ChevronDownIcon size={18} color="#6B6355" />}
            </button>

            {advancedOpen && (
              <div ref={advancedRef} style={{ border: "1px solid #DDD2BE", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px", display: "flex", flexDirection: "column", gap: 10, background: "#fff" }}>
                <Field
                  label="Cuenta de lo que prestás"
                  info={"Cuenta aparte para cuando VOS pagás de más (prestás) en el grupo, separada de 'propios' (esa sigue siendo tu parte del gasto).\nEj: gasto de €100 (tu parte €50), vos pagás los €100. Los otros €50 prestados salen de esta cuenta en vez de 'propios'.\nSi lo dejás vacío, el préstamo sigue mezclado con 'propios', como hasta ahora."}
                >
                  <PickerField
                    value={lendAccountId}
                    onChange={onLendAccountChange}
                    onClear={() => onLendAccountChange("")}
                    groups={accountGroups}
                    placeholder="Sin cuenta aparte"
                  />
                </Field>
                <Field
                  label="Cuenta de lo que te prestan"
                  info={"Cuenta aparte para cuando OTRO paga tu parte en el grupo, separada de 'ajenos' (esa sigue siendo tu parte del gasto).\nEj: gasto de €100 (tu parte €50), paga otra persona. Esos €50 que te prestaron entran acá al mismo tiempo que se registra tu parte en 'ajenos'.\nSi lo dejás vacío, el préstamo sigue mezclado con 'ajenos', como hasta ahora."}
                >
                  <PickerField
                    value={loanAccountId}
                    onChange={onLoanAccountChange}
                    onClear={() => onLoanAccountChange("")}
                    groups={accountGroups}
                    placeholder="Sin cuenta aparte"
                  />
                </Field>
                {lendAccountIsCreditCard && (
                  <Field
                    label="Cuenta de origen para compensar lo prestado"
                    info={"Si 'lo que prestás' es una tarjeta, pagarla completa (tu parte + lo prestado) hace que tu cuenta líquida se vea baja hasta que el grupo te devuelva esa plata -- es real, no un error.\nSi igual querés que se vea 'limpia' de una, elegí acá una cuenta donde ver temporalmente lo prestado: al cerrar cada ciclo de la tarjeta, se transfiere sola desde acá hacia tu cuenta de gastos ajenos.\nSi lo dejás vacío, no se genera ninguna transferencia -- tu cuenta líquida simplemente se ve baja hasta que te paguen."}
                  >
                    <PickerField
                      value={lendOffsetAccountId}
                      onChange={onLendOffsetAccountChange}
                      onClear={() => onLendOffsetAccountChange("")}
                      groups={accountGroups}
                      placeholder="Sin compensación automática"
                    />
                  </Field>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Una fila arrastrable de la lista de categorías (dnd-kit: funciona con mouse y con touch,
// a diferencia del drag & drop nativo de HTML que en celulares no responde al dedo).
function SortableCategoryRow({ cat, onEditIcon, onChangeLabel, onRemove, draggable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id, disabled: !draggable });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 8, padding: "10px 14px" }}>
      {/* Handle — ícono SVG (se centra bien, a diferencia del glifo de texto) a todo el alto
          de la fila para que el área de agarre sea más grande. touchAction:"none" es necesario
          para que el drag responda al dedo en vez de disparar el scroll. Sin ícono si hay un
          solo ítem — no hay con qué reordenar. */}
      {draggable ? (
        <span
          {...attributes}
          {...listeners}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "stretch",
            width: 32,
            color: "#C9BBA0",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <Menu size={18} />
        </span>
      ) : (
        <span style={{ width: 32, flexShrink: 0 }} />
      )}
      {/* gap:6 acá adentro (no en la fila entera) — el handle solo necesita
          4px hasta lo siguiente, pero el botón de ícono/input/botón de
          borrar sí son cajas separadas que necesitan su propio espacio. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        <button
          onClick={onEditIcon}
          style={{ width: 34, height: 34, minWidth: 34, borderRadius: 8, border: "1px solid #DDD2BE", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#544A3C", cursor: "pointer" }}
          aria-label="Cambiar ícono"
        >
          <IconComp iconKey={cat.iconKey} size={16} />
        </button>
        <input
          style={{ ...styles.input, flex: 1, padding: "7px 10px", fontSize: 14 }}
          value={cat.label}
          onChange={(e) => onChangeLabel(e.target.value)}
          placeholder="Nombre de categoría"
        />
        <button style={styles.iconBtnGhost} onClick={onRemove} aria-label="Eliminar categoría">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   GROUP VIEW
   ========================================================================= */

function GroupView({ group, session, onRefresh, onBack, onAddExpense, onOpenExpense, onOpenPayment, onSettleUp, onEditGroup, onSoftDeleteExpense, isOnline = true, showError }) {
  const blockOffline = () => showError("Estás offline, no podés hacer esto ahora.");
  const [tab, setTab] = useState("activity"); // activity | balances | individual
  useScrollToTopOnChange(tab);

  // Otro miembro puede haber agregado/editado un gasto desde su propio
  // teléfono mientras vos tenías este grupo abierto — sin esto, solo se veía
  // al salir y volver a entrar a la app.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") onRefresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [onRefresh]);
  const [selectedMember, setSelectedMember] = useState(group.members.find((m) => !m.deleted)?.id || null);
  const { members, expenses, payments = [] } = group;

  // Un balance (y su lista de deudas simplificada) por cada moneda usada en el grupo —
  // sin conversión entre ellas, para no depender de tasas de cambio.
  const balancesByCurrency = useMemo(() => computeBalances(group), [group]);
  const currencies = Object.keys(balancesByCurrency);
  const txnsByCurrency = useMemo(
    () => Object.fromEntries(currencies.map((c) => [c, simplifyDebts(balancesByCurrency[c])])),
    [balancesByCurrency, currencies]
  );
  const allSettled = currencies.every((c) => txnsByCurrency[c].length === 0);
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
    <div style={styles.screenWithFab}>
      <TopBar
        title={group.name}
        onBack={onBack}
        right={
          <button
            style={{ ...styles.iconBtnGhost, opacity: isOnline ? 1 : 0.5 }}
            onClick={() => { if (!isOnline) { blockOffline(); return; } onEditGroup(); }}
            aria-label="Editar grupo"
          >
            <Settings size={18} />
          </button>
        }
      />

      <SegmentedControl
        style={{ margin: "24px 20px 4px" }}
        options={[
          { value: "activity", label: "Actividad" },
          { value: "balances", label: "Balances" },
          { value: "individual", label: "Por persona" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* Mismo texto ("Debes X a Y" / "Y te debe X") que ya usa la tarjeta
          de este grupo en "Tus grupos", debajo de los toggles para no tener
          que volver atrás para verlo. Si está saldado no se muestra nada
          acá (ya lo deja claro el resto de la pantalla). */}
      {(() => {
        const lines = groupCardLines(group, session).filter((l) => l.key !== "settled");
        if (!lines.length) return null;
        return (
          <div style={{ padding: "10px 20px 0", fontSize: 15, fontFamily: "system-ui, sans-serif", color: "#544A3C" }}>
            {lines.map((line) => <p key={line.key} style={{ margin: 0 }}>{line.node}</p>)}
          </div>
        );
      })()}

      {tab === "balances" && (() => {
        const totalTxnCount = currencies.reduce((s, c) => s + txnsByCurrency[c].length, 0);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6, padding: "0 20px" }}>
            {allSettled && (
              <div style={styles.settledBox}><Check size={18} color="#3B6E62" /><span>Todo saldado. Nadie le debe nada a nadie.</span></div>
            )}
            {!allSettled && currencies.map((currency) => {
              const txns = txnsByCurrency[currency];
              if (txns.length === 0) return null;
              return (
                <div key={currency} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {currencies.length > 1 && (
                    <p style={styles.label}>{currency}</p>
                  )}
                  {txns.map((t, i) => (
                    <div key={i} style={styles.debtCard}>
                      <span style={{ ...styles.avatar, background: colorFor(t.from), width: 30, height: 30, fontSize: 11, flexShrink: 0 }}>{initials(nameOf(members, t.from))}</span>
                      <ArrowRight size={13} color="#C9BBA0" style={{ flexShrink: 0 }} />
                      <span style={{ ...styles.avatar, background: colorFor(t.to), width: 30, height: 30, fontSize: 11, flexShrink: 0 }}>{initials(nameOf(members, t.to))}</span>
                      <span style={{ flex: 1, fontSize: 13.5, fontFamily: "system-ui, sans-serif", fontWeight: 500, color: "#544A3C", minWidth: 0 }}>
                        <strong style={{ fontWeight: 700 }}>{shortName(nameOf(members, t.from))}</strong>
                        {" le debe a "}
                        <strong style={{ fontWeight: 700 }}>{shortName(nameOf(members, t.to))}</strong>
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#C75D3B", fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>{money(t.amount, currency)}</span>
                      <button
                        style={{ ...styles.settleSmallBtn, opacity: isOnline ? 1 : 0.5 }}
                        onClick={() => { if (!isOnline) { blockOffline(); return; } onSettleUp({ from: t.from, to: t.to, amount: t.amount, currency }); }}
                      >
                        Saldar
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
            <p style={styles.simplifyNote}>
              {allSettled ? "Sin pagos pendientes." : `Simplificado a ${totalTxnCount} pago${totalTxnCount > 1 ? "s" : ""}: el mínimo posible para saldar el grupo.`}
            </p>
            <button
              style={{ ...styles.btnSecondary, marginTop: 4, opacity: isOnline ? 1 : 0.5 }}
              onClick={() => { if (!isOnline) { blockOffline(); return; } onSettleUp(null); }}
            >
              <HandCoins size={16} /> Registrar un pago
            </button>
          </div>
        );
      })()}

      {tab === "individual" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 20px" }}>
            {members.filter((m) => !m.deleted).map((m) => (
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
            const perCurrency = currencies.map((currency) => {
              const bal = balancesByCurrency[currency][selectedMember] || 0;
              const myTxns = txnsByCurrency[currency].filter(t => t.from === selectedMember || t.to === selectedMember);
              // Total que puso de su bolsillo: lo que pagó en cada gasto, no lo que le queda
              // después de descontar su propia parte (eso ya lo muestra el balance de arriba).
              const totalLent = activeExpenses.filter(e => e.currency === currency).reduce((sum, e) => {
                const payers = e.payers || { [e.paidBy]: e.amount };
                return sum + (payers[selectedMember] || 0);
              }, 0);
              return { currency, bal, myTxns, totalLent };
            }).filter(({ bal, totalLent }) => Math.abs(bal) > 0.01 || totalLent > 0.01);

            if (perCurrency.length === 0) {
              return (
                <div style={{ padding: "14px 16px", borderRadius: 12, background: "#F3EFE5", border: "1px solid #DDD2BE", margin: "0 20px" }}>
                  <p style={{ margin: 0, fontSize: 13, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>{nameOf(members, selectedMember)}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>Sin cuentas pendientes</p>
                </div>
              );
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 20px" }}>
                {perCurrency.map(({ currency, bal, myTxns, totalLent }) => {
                  const isZero = Math.abs(bal) < 0.01;
                  const isPos = bal > 0.005;
                  return (
                    <div key={currency} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {/* Balance general de esta moneda */}
                      <div style={{ padding: "14px 16px", borderRadius: 12, background: isZero ? "#F3EFE5" : isPos ? "#EAF1ED" : "#FBEDE7", border: `1px solid ${isZero ? "#DDD2BE" : isPos ? "#CFE2D7" : "#EBC9BA"}` }}>
                        <p style={{ margin: 0, fontSize: 13, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>
                          {nameOf(members, selectedMember)}{currencies.length > 1 ? ` · ${currency}` : ""}
                        </p>
                        {isZero ? (
                          <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#76695A" }}>Sin cuentas pendientes</p>
                        ) : (
                          <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: isPos ? "#3B6E62" : "#B0473A" }}>
                            {isPos ? "Le deben " : "Debe "}
                            <span>{money(Math.abs(bal), currency)}</span>
                          </p>
                        )}
                      </div>

                      {/* Pagos pendientes simplificados que involucran a esta persona */}
                      {myTxns.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {myTxns.map((t, i) => (
                            <div key={i} style={styles.pairRow}>
                              <span style={{ ...styles.avatar, background: colorFor(t.from), width: 28, height: 28, fontSize: 11 }}>{initials(nameOf(members, t.from))}</span>
                              <span style={{ flex: 1, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>
                                <strong>{shortName(nameOf(members, t.from))}</strong> le debe a <strong>{shortName(nameOf(members, t.to))}</strong>
                              </span>
                              <span style={{ fontWeight: 700, fontSize: 13.5, color: t.from === selectedMember ? "#B0473A" : "#3B6E62", fontFamily: "system-ui, sans-serif" }}>
                                {money(t.amount, currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Total puesto de su bolsillo */}
                      {totalLent > 0.01 && (
                        <p style={{ ...styles.muted, padding: 0, fontSize: 12.5 }}>
                          Ha puesto de su bolsillo un total de <strong>{money(totalLent, currency)}</strong> en gastos del grupo.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {tab === "activity" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, padding: "0 20px" }}>
          {activityItems.length === 0 && (
            <EmptyState icon={<Receipt size={28} strokeWidth={1.5} />} title="Todavía no hay actividad">
              Tocá el "+" de abajo para cargar el primer gasto del grupo.
            </EmptyState>
          )}
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
                      </p>
                      <p style={styles.expenseSub}>
                        {(() => {
                          const payers = e.payers || { [e.paidBy]: e.amount };
                          const payerNames = Object.keys(payers).map(id => shortName(nameOf(members, id)));
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
                <button key={p.id} style={styles.paymentCard} onClick={() => onOpenPayment(p.id)}>
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
                    {nameOf(members, p.from)} le pagó a {nameOf(members, p.to)}{p.note ? ` · ${p.note}` : ""}
                  </p>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#3B6E62", fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>
                    {money(p.amount, p.currency)}
                  </span>
                  <ChevronRight size={16} color="#C9BBA0" />
                </button>
              );
            });
          })()}
        </div>
      )}

      <button
        style={{ ...styles.fab, bottom: "calc(78px + env(safe-area-inset-bottom))", opacity: isOnline ? 1 : 0.5 }}
        onClick={() => { if (!isOnline) { blockOffline(); return; } onAddExpense(); }}
        aria-label="Agregar gasto"
      ><Plus size={24} strokeWidth={2.5} /></button>
    </div>
  );
}

/* =========================================================================
   EXPENSE DETAIL (solo lectura — se abre al tocar la tarjeta de un gasto)
   ========================================================================= */

function ExpenseDetail({ group, expenseId, onBack, onEdit, isOnline = true, showError }) {
  const { members } = group;
  const e = group.expenses.find((x) => x.id === expenseId);
  const [showFullPhoto, setShowFullPhoto] = useState(false);

  if (!e || e.deleted) {
    return (
      <div style={styles.screen}>
        <TopBar title="Gasto" onBack={onBack} />
        <EmptyState icon={<Trash2 size={28} strokeWidth={1.5} />} title={e ? "Este gasto fue eliminado" : "Este gasto ya no existe"} />
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
            onClick={() => { if (!isOnline) { showError("Estás offline, no podés editar este gasto ahora."); return; } onEdit(e.id); }}
            style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: "#C75D3B", fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", padding: "6px 4px", opacity: isOnline ? 1 : 0.5 }}
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
          <p style={{ ...styles.label, marginBottom: 6 }}>{payerIds.length > 1 ? "Quiénes pagaron" : "Quién pagó"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {payerIds.map((id) => (
              <div key={id} style={styles.shareRow}>
                <span style={{ ...styles.avatar, background: colorFor(id), width: 30, height: 30, minWidth: 30, fontSize: 11 }}>
                  {initials(nameOf(members, id))}
                </span>
                <span style={{ flex: 1 }}>{nameOf(members, id)}</span>
                <span style={styles.shareAmount}>{money(payers[id], e.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cómo se divide */}
        <div>
          <p style={{ ...styles.label, marginBottom: 6 }}>Cómo se divide</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shareIds.map((id) => (
              <div key={id} style={styles.shareRow}>
                <span style={{ ...styles.avatar, background: colorFor(id), width: 30, height: 30, minWidth: 30, fontSize: 11 }}>
                  {initials(nameOf(members, id))}
                </span>
                <span style={{ flex: 1 }}>{nameOf(members, id)}</span>
                <span style={styles.shareAmount}>{money(e.shares[id], e.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {e.imageUrl && (
          <button
            type="button"
            onClick={() => setShowFullPhoto(true)}
            aria-label="Ver foto completa"
            style={{ width: "100%", padding: 0, border: "none", background: "none", display: "block", cursor: "zoom-in" }}
          >
            <ImageWithFallback
              src={e.imageUrl}
              style={{ width: "100%", borderRadius: 12, border: "1px solid #ECE3D3", objectFit: "cover", maxHeight: 220, display: "block" }}
              fallback={<div style={{ padding: 14, textAlign: "center", borderRadius: 12, border: "1px solid #ECE3D3", color: "#A89A87", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>Foto no disponible sin conexión</div>}
            />
          </button>
        )}

        <PhotoLightbox open={showFullPhoto} src={e.imageUrl} onClose={() => setShowFullPhoto(false)} />

        {e.notes && (
          <div>
            <p style={{ ...styles.label, marginBottom: 6 }}>Notas</p>
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
function ExpenseForm({ group, expenseId, extraHeaderField, onCancel, onSave, onDelete, session, evenCapital }) {
  const { baseCurrency } = group;
  const existing = expenseId ? group.expenses.find((e) => e.id === expenseId) : null;
  // Alguien ya quitado del grupo no se ofrece como pagador/participante nuevo,
  // pero si este gasto (uno viejo, se está editando) ya lo incluía, se lo
  // sigue mostrando para no perder su parte al guardar.
  const existingMemberIds = new Set(existing ? [
    ...Object.keys(existing.payers || (existing.paidBy ? { [existing.paidBy]: existing.amount } : {})),
    ...Object.keys(existing.shares || {}),
  ] : []);
  const members = group.members.filter((m) => !m.deleted || existingMemberIds.has(m.id));
  const myMemberId = group.members.find((m) => m.linkedUserId === session?.userId)?.id;

  const [description, setDescription] = useState(existing?.description || "");
  // Autocompletado de Descripción con lo que ya tenés en EvenCapital (no
  // con otros gastos de EvenGroup -- se pensó y se descartó a propósito)
  // cuando el grupo está vinculado, igual que ya hace el campo "Descripción"
  // de un gasto de EvenCapital (mismo hook, mismo criterio de "activado
  // en Config"). Mismas 2 banderas que allá: "Focused" sigue el foco real,
  // "Dismissed" se prende solo al elegir una sugerencia.
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [descriptionDismissed, setDescriptionDismissed] = useState(false);
  const recentNoteTitles = useRecentNoteTitles(session?.userId);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [currency, setCurrency] = useState(existing?.currency || baseCurrency);
  const [category, setCategory] = useState(existing?.category || groupCategories(group)[0]?.id);
  const [notes, setNotes] = useState(existing?.notes || "");
  const [date, setDate] = useState(existing ? dateInputValue(existing.date) : todayInputValue());

  // Pagadores: "single" o "multi"
  const existingPayers = existing?.payers || (existing?.paidBy ? { [existing.paidBy]: existing.amount } : null);
  const initPayerMode = existingPayers && Object.keys(existingPayers).length > 1 ? "multi" : "single";
  const [payerMode, setPayerMode] = useState(initPayerMode);
  // Gasto nuevo (sin pagadores todavía): yo soy el pagador por defecto, no
  // "el primer miembro de la lista" — casi siempre soy quien está cargando
  // el gasto en este momento.
  const [singlePayer, setSinglePayer] = useState(
    existing?.paidBy || (existingPayers ? Object.keys(existingPayers)[0] : (myMemberId || members[0]?.id || ""))
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
  const [splitExpanded, setSplitExpanded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(!!(existing?.notes));
  const [err, setErr] = useState("");
  const { previewUrl: imageUrl, pendingFile, removed, handleImageChange, clear: clearImage } = useImageUpload(existing?.imageUrl || null, setErr);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));

  // Scroll al contenido recién revelado -- si se toca "Nota"/"Dividido en"
  // (o se cambia de modo) con la vista ya baja, lo nuevo puede quedar fuera
  // de la pantalla sin ningún indicio de que pasó algo. Ver helpers.jsx.
  const notesRef = useRef(null);
  useScrollIntoViewOnChange(notesRef, notesOpen);
  const splitRef = useRef(null);
  useScrollIntoViewOnChange(splitRef, splitExpanded);
  useScrollIntoViewOnChange(splitRef, splitMode);
  const payerRef = useRef(null);
  useScrollIntoViewOnChange(payerRef, payerMode);

  // Mi EvenCapital — solo si YO tengo este grupo vinculado. (myMemberId ya
  // se calculó arriba, lo necesitaba el default de "¿quién pagó?")
  const activeLink = evenCapital?.slLinks?.find((l) => l.active && l.group_id === group.id && l.user_id === session?.userId);
  const [mmAccountId, setMmAccountId] = useState("");
  const [mmCategoryId, setMmCategoryId] = useState("");
  const [mmLoanAccountId, setMmLoanAccountId] = useState("");
  const savedMmChoiceRef = useRef(null); // null = todavía no se chequeó; {} = se chequeó y no había nada guardado

  const numericAmount = parseAmountInput(amount || "");
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;

  // Total que han puesto los pagadores seleccionados en modo multi
  const multiPayerTotal = [...multiPayerSelected].reduce((s, id) => {
    const v = parseAmountInput(payerAmounts[id] || "0");
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
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  };

  const participantIds = members.filter((m) => participants.has(m.id)).map((m) => m.id);
  const exactTotal = participantIds.reduce((s, id) => s + (parseAmountInput(exactAmounts[id] || "0") || 0), 0);
  const percentTotal = participantIds.reduce((s, id) => s + (parseFloat(percentages[id] || "0") || 0), 0);

  // Construir objeto payers para guardar
  const buildPayers = () => {
    if (payerMode === "single") return { [singlePayer]: numericAmount };
    const result = {};
    [...multiPayerSelected].forEach((id) => {
      const v = parseAmountInput(payerAmounts[id] || "0");
      if (!isNaN(v) && v > 0) result[id] = v;
    });
    return result;
  };

  // Día del gasto, no el de hoy -- así el reparto no cambia solo si lo
  // editás otro día, y un gasto ya guardado siempre recalcula igual.
  const shareSeed = parseInt(date.slice(8, 10), 10) || 0;

  const buildShares = () => {
    if (splitMode === "equal") return computeShares({ splitMode: "equal", amount: numericAmount, participantIds, seed: shareSeed });
    if (splitMode === "exact") {
      const exact = {};
      participantIds.forEach((id) => (exact[id] = parseAmountInput(exactAmounts[id] || "0") || 0));
      return computeShares({ splitMode: "exact", amount: numericAmount, participantIds, exactAmounts: exact });
    }
    if (splitMode === "percent") {
      const pct = {};
      participantIds.forEach((id) => (pct[id] = parseFloat(percentages[id] || "0") || 0));
      return computeShares({ splitMode: "percent", amount: numericAmount, participantIds, percentages: pct, seed: shareSeed });
    }
    const units = {};
    participantIds.forEach((id) => (units[id] = parseFloat(shareUnits[id] || "0") || 0));
    return computeShares({ splitMode: "shares", amount: numericAmount, participantIds, shareUnits: units, seed: shareSeed });
  };

  // 4 casos, según si yo pagué algo y/o me toca una parte real:
  // - Pago sí (participe o no): sale Cuenta, con default "propia".
  // - Pago no + participo sí: sale Cuenta, con default "ajena".
  // - Pago no + participo no: no sale Cuenta (no hay ninguna transferencia
  //   saliendo de una cuenta mía).
  // La Categoría de Money solo tiene sentido si participo de verdad — si
  // pagué pero no me toca nada, no existe ningún "gasto" mío en Money (solo
  // el préstamo, que nunca lleva categoría), así que esa categoría nunca se
  // usaría en ningún lado.
  //
  // Esto se decide por SELECCIÓN (quién está marcado como pagador/participante),
  // no por los montos ya calculados (buildPayers/buildShares) — si no, estos
  // campos no aparecían hasta escribir un Importe válido, lo cual no tiene
  // sentido: ya sabés si pagás/participás desde que tocás los botones de
  // arriba, antes de terminar de escribir el monto.
  const iPay = payerMode === "single" ? singlePayer === myMemberId : multiPayerSelected.has(myMemberId);
  const iParticipate = participants.has(myMemberId);
  const mmInvolved = !!(activeLink && myMemberId && (iPay || iParticipate));
  const showMmCategory = !!(activeLink && myMemberId && iParticipate);
  const descriptionSuggestions = activeLink && evenCapital.settings.autocomplete_notes && description.trim()
    ? recentNoteTitles.filter((t) => normalizeForSearch(t).includes(normalizeForSearch(description.trim())) && normalizeForSearch(t) !== normalizeForSearch(description.trim())).slice(0, 5)
    : [];

  // La primera vez (por vínculo/gasto): trae la elección ya guardada para
  // ESTE gasto puntual, si existe (nunca se pisa después). Si no hay
  // ninguna todavía, arranca en el default que corresponda según si pago o
  // no en este momento.
  useEffect(() => {
    if (!activeLink) return;
    let cancelled = false;
    savedMmChoiceRef.current = null;
    (async () => {
      let choice = null;
      if (existing) {
        const { data } = await supabase
          .from("sl_mm_expense_choices")
          .select("account_id, category_id, loan_account_id")
          .eq("link_id", activeLink.id).eq("source_kind", "expense").eq("source_id", existing.id)
          .maybeSingle();
        choice = data;
      }
      if (cancelled) return;
      savedMmChoiceRef.current = choice || {};
      setMmAccountId(choice?.account_id || (iPay ? activeLink.default_own_account_id : activeLink.default_other_account_id));
      setMmCategoryId(choice?.category_id || "");
      // Default según dirección -- igual que "Cuenta" arriba: si pagás vos
      // (probable préstamo), "lo que prestás"; si no, "lo que te prestan".
      // Es solo un prellenado, el cálculo real (por monto exacto) lo hace
      // ensureExpenseChoices en evenGroupSync.js si no se guarda nada acá.
      setMmLoanAccountId(choice?.loan_account_id || (iPay ? activeLink.lend_account_id : activeLink.loan_account_id) || "");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLink?.id, existing?.id]);

  // Si cambiás quién pagó ANTES de tocar el selector de Cuenta a mano, el
  // default (propia/ajena) se actualiza solo — apenas lo tocás vos
  // (touched.mmAccountId), o si ya había una elección guardada para este
  // gasto, deja de tocarse.
  useEffect(() => {
    if (!activeLink || touched.mmAccountId) return;
    if (savedMmChoiceRef.current?.account_id) return;
    setMmAccountId(iPay ? activeLink.default_own_account_id : activeLink.default_other_account_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iPay, activeLink?.id]);

  // Ya no devuelve mensajes: el botón de Guardar se deshabilita con esta misma condición,
  // así que para cuando handleSave llega a ejecutarse esto siempre es true — es solo un
  // respaldo silencioso, no hace falta mostrar ningún error acá.
  const canSave =
    validAmount &&
    (payerMode === "single" ? !!singlePayer : Math.abs(multiPayerTotal - numericAmount) < 0.01) &&
    participantIds.length > 0 &&
    (splitMode !== "exact" || Math.abs(exactTotal - numericAmount) < 0.01) &&
    (splitMode !== "percent" || Math.abs(percentTotal - 100) < 0.5) &&
    (splitMode !== "shares" || participantIds.reduce((s, id) => s + (parseFloat(shareUnits[id] || "0") || 0), 0) > 0) &&
    (!mmInvolved || !!mmAccountId);

  const handleSave = async () => {
    if (saving) return;
    if (!canSave) { setTouched({ amount: true, mmAccountId: true }); return; }
    const dateMs = new Date(date + "T12:00:00").getTime();
    const payers = buildPayers();
    setSaving(true);
    try {
      const resolvedImageUrl = await resolvePhotoUrl({ pendingFile, removed, currentUrl: existing?.imageUrl });
      const savedId = await onSave({
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
      // Se fija la cuenta/categoría elegidas para ESTE gasto puntual — la
      // reconciliación nunca las vuelve a recalcular sola (ver evenGroupSync.js).
      // Upsert con overwrite (no ignoreDuplicates): tu elección de ahora
      // siempre gana, nunca importa si la reconciliación ya había sembrado
      // un default antes de que llegaras acá.
      if (mmInvolved && savedId) {
        const finalId = existing?.id || savedId;
        await supabase.from("sl_mm_expense_choices").upsert(
          { link_id: activeLink.id, source_kind: "expense", source_id: finalId, account_id: mmAccountId, category_id: mmCategoryId || null, loan_account_id: mmLoanAccountId || null },
          { onConflict: "link_id,source_kind,source_id" }
        );
        // Custom para Nico/Paulina (ver sync_split_category_to_other_members
        // en la base, y customUserConfig.js): tu "Categoría personal" se le
        // sugiere al otro miembro vinculado del grupo, buscando el nombre
        // equivalente en SU propio EvenCapital -- no pisa una categoría
        // que el otro ya tenga elegida, solo la rellena si está vacía.
        const categoryName = evenCapital.categories.find((c) => c.id === mmCategoryId)?.name;
        if (categoryName) {
          const { error: syncError } = await supabase.rpc("sync_split_category_to_other_members", {
            p_link_id: activeLink.id, p_source_kind: "expense", p_source_id: finalId, p_category_name: categoryName,
          });
          if (syncError) console.error("No se pudo sincronizar la categoría con el otro miembro", syncError);
        }
        await evenCapital.reload();
      }
    } catch (e) {
      setErr(`No se pudo guardar: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  // Después de todos los hooks (ver el bug de orden de hooks ya corregido
  // en TransactionForm.jsx) -- llegar acá por "Ver original" a un gasto ya
  // borrado no debería dejarlo editar como si siguiera activo.
  if (existing?.deleted) {
    return (
      <div style={styles.screen}>
        <TopBar title="Gasto" onBack={onCancel} />
        <EmptyState icon={<Trash2 size={28} strokeWidth={1.5} />} title="Este gasto fue eliminado" />
      </div>
    );
  }

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
          confirmLabel={saving ? "Borrando…" : "Borrar"}
          confirmDisabled={saving}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => { setSaving(true); await onDelete(existing.id); setSaving(false); }}
          style={{ margin: "6px 20px 12px", borderRadius: 12, borderTop: "1px solid #EBC9BA" }}
        />
      )}

      <div style={styles.form}>
        {/* Importe "hero": mismo bloque que TransactionForm.jsx/el asistente
            de fotos (número grande centrado, sin caja, moneda como chip
            aparte) -- acá la moneda SÍ es elegible (un gasto del grupo puede
            ser en otra moneda a la del grupo), así que el chip queda tocable,
            a diferencia del asistente. */}
        <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, width: "100%" }}>
            <CalculatorAmountInput
              value={amount}
              onChange={setAmount}
              onBlur={() => touch("amount")}
              placeholder="0,00"
              style={{ flex: "0 1 auto", minWidth: 0, width: "auto", height: 56, border: "none", background: "transparent", padding: "0 10px", lineHeight: 1, fontSize: 40, fontWeight: 400, fontFamily: "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif", color: "#C75D3B", textAlign: "center", justifyContent: "center", borderRadius: 14 }}
              focusStyle={{ background: "#F3ECE0", boxShadow: "none" }}
              placeholderColor="#A3968B"
            />
            <PickerField
              compact
              value={currency}
              onChange={setCurrency}
              title="Elegí la moneda"
              groups={[{ label: null, items: [baseCurrency, ...CURRENCY_LIST.filter((c) => c !== baseCurrency)].map((c) => ({ value: c, label: c, icon: CURRENCIES[c]?.symbol })) }]}
            />
          </div>
        </div>
        {touched.amount && !validAmount && (
          <p style={{ margin: "-6px 0 0", fontSize: 13, textAlign: "center", color: "#B0473A", fontFamily: "system-ui, sans-serif" }}>Ingresá un importe válido.</p>
        )}

        {extraHeaderField}

        <DateRow label="Fecha" value={date} onChange={setDate} />

        {mmInvolved && (
          <Field error={touched.mmAccountId && !mmAccountId ? "Este campo es obligatorio." : ""}>
            <PickerField
              rowLabel={<>Cuenta <EvenGroupIcon size={13} style={{ marginLeft: 2 }} /></>}
              required
              value={mmAccountId}
              onChange={setMmAccountId}
              onBlur={() => touch("mmAccountId")}
              placeholder="Elegí una cuenta"
              title="Elegí una cuenta"
              groups={evenCapital.groups
                .filter((g) => !g.deleted && g.system_key !== "split_ledger")
                .map((g) => ({
                  label: g.name,
                  items: evenCapital.accounts.filter((a) => a.group_id === g.id && !a.hidden && !a.deleted).map((a) => ({ value: a.id, label: a.name, icon: a.icon })),
                }))
                .filter((g) => g.items.length > 0)}
            />
          </Field>
        )}

        {mmInvolved && (
          <PickerField
            rowLabel={<>Cuenta de lo prestado <EvenGroupIcon size={13} style={{ marginLeft: 2 }} /></>}
            info="Para este gasto puntual: de dónde sale (o adónde entra) lo que prestás, si tu grupo tiene configurada una cuenta para eso. Dejalo vacío para usar 'Cuenta' de arriba, como siempre."
            value={mmLoanAccountId}
            onChange={setMmLoanAccountId}
            onClear={() => setMmLoanAccountId("")}
            placeholder="Misma que 'Cuenta'"
            title="Elegí una cuenta"
            groups={evenCapital.groups
              .filter((g) => !g.deleted && g.system_key !== "split_ledger")
              .map((g) => ({
                label: g.name,
                items: evenCapital.accounts.filter((a) => a.group_id === g.id && !a.hidden && !a.deleted).map((a) => ({ value: a.id, label: a.name, icon: a.icon })),
              }))
              .filter((g) => g.items.length > 0)}
          />
        )}

        {showMmCategory && (
          <Field>
            <PickerField
              rowLabel={<>Categoría personal <EvenGroupIcon size={13} style={{ marginLeft: 2 }} /></>}
              value={mmCategoryId}
              onChange={setMmCategoryId}
              onClear={() => setMmCategoryId("")}
              placeholder="Sin categoría"
              title="Elegí una categoría"
              groups={[{
                label: null,
                items: evenCapital.categories.filter((c) => c.type === "expense" && !c.deleted).map((c) => ({ value: c.id, label: c.name, icon: c.icon })),
              }]}
            />
          </Field>
        )}
        {/* La categoría de Split siempre está — la ve todo el grupo. El label
            queda fijo en "Categoría de {grupo}" apenas el grupo está
            vinculado a EvenCapital (participes/pagues o no) — así no
            cambia de nombre según el caso, que sería más confuso que útil. */}
        <Field>
          <PickerField
            rowLabel={activeLink ? `Categoría de ${group.name}` : "Categoría"}
            title="Elegí una categoría"
            value={category}
            onChange={setCategory}
            groups={[{
              label: null,
              items: groupCategories(group).map((c) => ({ value: c.id, label: c.label, icon: <IconComp iconKey={c.iconKey} size={16} /> })),
            }]}
          />
        </Field>

        <TextRow
          label="Descripción"
          value={description}
          onChange={(v) => { setDescription(v); setDescriptionDismissed(false); }}
          onFocus={() => setDescriptionFocused(true)}
          onBlur={() => setDescriptionFocused(false)}
          placeholder="Cena, taxi, supermercado… (opcional)"
          suggestions={descriptionFocused && !descriptionDismissed ? descriptionSuggestions : []}
          onPickSuggestion={(s) => { setDescription(s); setDescriptionDismissed(true); }}
        />

        {/* Foto/Nota no son parte del patrón de fila label-valor (no existen
            en TransactionForm.jsx/el asistente) -- quedan en su propia fila,
            como ya estaban, solo que ahora separadas de Descripción (que
            pasó a ocupar todo el ancho, como el resto de los campos). */}
        <div style={{ display: "flex", gap: 8 }}>
          <label title="Añadir foto" style={{ width: 44, height: 44, boxSizing: "border-box", borderRadius: 10, border: `1px solid ${imageUrl ? "#C75D3B" : "#DDD2BE"}`, background: imageUrl ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: imageUrl ? "#C75D3B" : "#6B6355" }}>
            <Camera size={18} />
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageChange} />
          </label>
          <button title="Añadir nota" onClick={() => setNotesOpen(v => !v)} style={{ width: 44, height: 44, boxSizing: "border-box", borderRadius: 10, border: `1px solid ${notesOpen || notes ? "#C75D3B" : "#DDD2BE"}`, background: notesOpen || notes ? "#C75D3B1a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: notesOpen || notes ? "#C75D3B" : "#6B6355" }}>
            <PenLine size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={styles.label}>¿Quién pagó?</p>
          <SegmentedControl
            options={[
              { value: "single", label: "Una persona" },
              { value: "multi", label: "Varias personas" },
            ]}
            value={payerMode}
            onChange={setPayerMode}
          />
        </div>

        {payerMode === "single" && (
          <div ref={payerRef} style={styles.payerRow}>
            {members.map((m) => (
              <button key={m.id} onClick={() => setSinglePayer(m.id)} style={{ ...styles.payerChip, borderColor: singlePayer === m.id ? colorFor(m.id) : "transparent", background: singlePayer === m.id ? `${colorFor(m.id)}1a` : "#FAF7F2" }}>
                <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>
                {m.name}
              </button>
            ))}
          </div>
        )}

        {payerMode === "multi" && (
          <div ref={payerRef} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
            <p style={{ ...styles.muted, padding: "0 10px" }}>
              Suma: {money(multiPayerTotal, currency)}{validAmount ? ` / ${money(numericAmount, currency)}` : ""}
            </p>
            {validAmount && (() => {
              const remaining = numericAmount - multiPayerTotal;
              if (Math.abs(remaining) < 0.01) return null;
              const isOver = remaining < -0.01;
              return (
                <p style={{ ...styles.muted, padding: "0 10px", marginTop: -6, fontWeight: 700, color: isOver ? "#B0473A" : "#6B6355" }}>
                  {isOver ? "Sobra" : "Falta"}: {money(Math.abs(remaining), currency)}
                </p>
              );
            })()}
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
            <div ref={splitRef} style={{ border: "1px solid #DDD2BE", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px", display: "flex", flexDirection: "column", gap: 10, background: "#fff" }}>
              {/* Selector de modo */}
              <SegmentedControl
                options={[["equal", "Iguales"], ["exact", "Montos"], ["percent", "Porcentajes"], ["shares", "Partes"]].map(([id, label]) => ({ value: id, label }))}
                value={splitMode}
                onChange={setSplitMode}
              />

              {splitMode === "equal" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(() => {
                    const preview = validAmount ? fairSplit(numericAmount, participantIds.map(() => 1), shareSeed) : [];
                    return members.map((m) => {
                      const isIn = participants.has(m.id);
                      const previewIdx = participantIds.indexOf(m.id);
                      const myAmt = isIn && validAmount && previewIdx >= 0 ? preview[previewIdx] : null;
                      return (
                        <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{ ...styles.shareRow, opacity: isIn ? 1 : 0.45 }}>
                          <span style={{ ...styles.checkbox, ...(isIn ? styles.checkboxOn : {}), flexShrink: 0 }}>{isIn && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                          <span style={{ ...styles.avatar, background: colorFor(m.id) }}>{initials(m.name)}</span>
                          <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
                          <span style={styles.shareAmount}>{myAmt !== null ? money(myAmt, currency) : "—"}</span>
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
                  <p style={{ ...styles.muted, padding: "0 10px" }}>Suma: {money(exactTotal, currency)} {validAmount ? `/ ${money(numericAmount, currency)}` : ""}</p>
                  {validAmount && (() => {
                    const remaining = numericAmount - exactTotal;
                    const isExact = Math.abs(remaining) < 0.01;
                    if (isExact) return null;
                    const isOver = remaining < -0.01;
                    return (
                      <p style={{ ...styles.muted, padding: "0 10px", marginTop: -6, fontWeight: 700, color: isOver ? "#B0473A" : "#6B6355" }}>
                        {isOver ? "Sobra" : "Falta"}: {money(Math.abs(remaining), currency)}
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
                  <p style={{ ...styles.muted, padding: "0 10px" }}>Suma: {percentTotal.toFixed(0)}% / 100%</p>
                  {(() => {
                    const remaining = 100 - percentTotal;
                    if (Math.abs(remaining) < 0.5) return null;
                    const isOver = remaining < -0.5;
                    return (
                      <p style={{ ...styles.muted, padding: "0 10px", marginTop: -6, fontWeight: 700, color: isOver ? "#B0473A" : "#6B6355" }}>
                        {isOver ? "Sobra" : "Falta"}: {Math.abs(remaining).toFixed(0)}%
                      </p>
                    );
                  })()}
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
                  <p style={{ ...styles.muted, padding: "0 10px" }}>Las "partes" son proporciones: alguien con 2 partes paga el doble que alguien con 1.</p>
                  {participantIds.reduce((s, id) => s + (parseFloat(shareUnits[id] || "0") || 0), 0) <= 0 && (
                    <p style={styles.errText}>Asigna al menos una parte a alguien en el reparto.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>


        {imageUrl && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowFullPhoto(true)}
              aria-label="Ver foto completa"
              style={{ width: "100%", padding: 0, border: "none", background: "none", display: "block", cursor: "zoom-in" }}
            >
              <img src={imageUrl} alt="Adjunto del gasto" style={{ width: "100%", borderRadius: 12, maxHeight: 180, objectFit: "cover", border: "1px solid #ECE3D3", display: "block" }} />
            </button>
            <button
              type="button"
              onClick={clearImage}
              aria-label="Quitar imagen"
              style={{ position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: "50%", border: "none", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.25)", cursor: "pointer" }}
            >
              <Trash2 size={17} color="#B0473A" />
            </button>
          </div>
        )}

        <PhotoLightbox open={showFullPhoto} src={imageUrl} onClose={() => setShowFullPhoto(false)} />

        {(notesOpen || notes) && (
          <div ref={notesRef}>
            <TextRow label="Nota" value={notes} onChange={setNotes} placeholder="Notas adicionales…" multiline />
          </div>
        )}

        {err && <p style={styles.errText}>{err}</p>}
      </div>

      <FormFooter
        onCancel={onCancel}
        onConfirm={handleSave}
        confirmLabel={saving ? "Guardando…" : "Guardar"}
        confirmDisabled={saving}
        confirmDim={!canSave}
      />
    </div>
  );
}

// Wrapper: si ya se sabe a qué grupo pertenece el gasto (abierto desde dentro
// de un grupo), va derecho a ExpenseForm — cero cambios de comportamiento.
// Si no (abierto desde el FAB del listado principal), muestra un selector de
// grupo arriba del formulario; ExpenseForm recién se monta cuando hay un
// grupo elegido, con key={group.id} para arrancar limpio si lo cambian.
function NewExpense({ group, groups, defaultGroupId, expenseId, onCancel, onSave, onDelete, session, evenCapital }) {
  const [pickedGroupId, setPickedGroupId] = useState(group?.id ?? defaultGroupId ?? "");

  if (group) {
    return (
      <ExpenseForm
        group={group}
        expenseId={expenseId}
        onCancel={onCancel}
        onSave={onSave}
        onDelete={onDelete}
        session={session}
        evenCapital={evenCapital}
      />
    );
  }

  const effectiveGroup = (groups || []).find((g) => g.id === pickedGroupId) || null;
  const isGroupLinked = effectiveGroup && evenCapital?.slLinks?.some(
    (l) => l.active && l.group_id === effectiveGroup.id && l.user_id === session.userId
  );
  const groupPicker = (
    <Field>
      <PickerField
        rowLabel={isGroupLinked ? <>Grupo <EvenGroupIcon size={13} style={{ marginLeft: 2 }} /></> : "Grupo"}
        value={pickedGroupId}
        onChange={setPickedGroupId}
        placeholder="Selecciona un grupo…"
        title="Elegí un grupo"
        groups={[{ label: null, items: (groups || []).map((g) => ({ value: g.id, label: g.name })) }]}
      />
    </Field>
  );

  if (!effectiveGroup) {
    return (
      <div style={{ ...styles.screen, paddingBottom: 0 }}>
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
      session={session}
      evenCapital={evenCapital}
    />
  );
}

/* =========================================================================
   PAYMENT DETAIL (solo lectura — se abre al tocar la tarjeta de un pago,
   mismo patrón que ExpenseDetail para ser consistentes)
   ========================================================================= */

function PaymentDetail({ group, paymentId, onBack, onEdit, isOnline = true, showError }) {
  const { members } = group;
  const p = group.payments.find((x) => x.id === paymentId);

  if (!p || p.deleted) {
    return (
      <div style={styles.screen}>
        <TopBar title="Pago" onBack={onBack} />
        <EmptyState icon={<Trash2 size={28} strokeWidth={1.5} />} title={p ? "Este pago fue eliminado" : "Este pago ya no existe"} />
      </div>
    );
  }

  return (
    <div style={styles.screen}>
      <TopBar
        title="Detalle del pago"
        onBack={onBack}
        right={
          <button
            onClick={() => { if (!isOnline) { showError("Estás offline, no podés editar este pago ahora."); return; } onEdit(p.id); }}
            style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: "#C75D3B", fontWeight: 700, fontSize: 13.5, fontFamily: "system-ui, sans-serif", padding: "6px 4px", opacity: isOnline ? 1 : 0.5 }}
          >
            <Pencil size={15} /> Editar
          </button>
        }
      />

      <div style={styles.form}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ ...styles.expenseIcon, width: 48, height: 48, minWidth: 48, background: "#3B6E62" }}>
            <HandCoins size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 19, fontWeight: 700, fontFamily: "'Iowan Old Style', Georgia, serif" }}>
              {nameOf(members, p.from)} le pagó a {nameOf(members, p.to)}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6B6355", fontFamily: "system-ui, sans-serif" }}>
              {fmtDate(p.date || p.createdAt)}
            </p>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 32, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#2B2620" }}>
          {money(p.amount, p.currency)}
        </p>

        {p.note && (
          <div>
            <p style={{ ...styles.label, marginBottom: 6 }}>Nota</p>
            <p style={{ ...styles.muted, padding: 0, margin: 0 }}>{p.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   SETTLE UP (registrar pago directo entre dos personas)
   ========================================================================= */

function SettleUp({ group, paymentId, prefill, onCancel, onSave, onDelete, session, evenCapital }) {
  const { baseCurrency } = group;
  const existing = paymentId ? group.payments.find((p) => p.id === paymentId) : null;
  // Mismo motivo que en ExpenseForm: alguien ya quitado del grupo no se
  // ofrece para un pago nuevo, pero si este pago (uno viejo, se está
  // editando) ya lo incluía como from/to, se lo sigue mostrando.
  const members = group.members.filter((m) => !m.deleted || m.id === existing?.from || m.id === existing?.to);
  const myMemberId = members.find((m) => m.linkedUserId === session?.userId)?.id;

  const [from, setFrom] = useState(existing?.from || prefill?.from || members[0]?.id || "");
  const [to, setTo] = useState(existing?.to || prefill?.to || members[1]?.id || "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : (prefill?.amount ? String(prefill.amount.toFixed(2)) : ""));
  const [currency, setCurrency] = useState(existing?.currency || prefill?.currency || baseCurrency);
  const [date, setDate] = useState(existing ? dateInputValue(existing.date) : todayInputValue());
  const [note, setNote] = useState(existing?.note || "");
  const [saving, setSaving] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Mi EvenCapital — mismo mecanismo que en el gasto (ExpenseForm): si este
  // pago me involucra (lo pago yo o lo recibo yo), elegís de qué cuenta mía
  // sale/entra, y esa elección se fija para siempre en sl_mm_expense_choices
  // (antes esto no existía para pagos, solo para gastos — ver
  // MULTI_CURRENCY_PLAN.md / conversación 2026-10-08).
  const activeLink = evenCapital?.slLinks?.find((l) => l.active && l.group_id === group.id && l.user_id === session?.userId);
  const [mmAccountId, setMmAccountId] = useState("");
  const [mmLoanAccountId, setMmLoanAccountId] = useState("");
  const [touched, setTouched] = useState({});
  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));
  const savedMmChoiceRef = useRef(null);

  const isFrom = from === myMemberId;
  const isTo = to === myMemberId;
  const mmInvolved = !!(activeLink && myMemberId && (isFrom || isTo));

  useEffect(() => {
    if (!activeLink) return;
    let cancelled = false;
    savedMmChoiceRef.current = null;
    (async () => {
      let choice = null;
      if (existing) {
        const { data } = await supabase
          .from("sl_mm_expense_choices")
          .select("account_id, loan_account_id")
          .eq("link_id", activeLink.id).eq("source_kind", "payment").eq("source_id", existing.id)
          .maybeSingle();
        choice = data;
      }
      if (cancelled) return;
      savedMmChoiceRef.current = choice || {};
      setMmAccountId(choice?.account_id || (isFrom ? activeLink.default_own_account_id : activeLink.default_other_account_id));
      // isFrom (pagás vos) = saldás lo que debías -- "lo que te prestan".
      // !isFrom (te pagan) = te saldan lo que prestaste -- "lo que prestás".
      setMmLoanAccountId(choice?.loan_account_id || (isFrom ? activeLink.loan_account_id : activeLink.lend_account_id) || "");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLink?.id, existing?.id]);

  useEffect(() => {
    if (!activeLink || touched.mmAccountId) return;
    if (savedMmChoiceRef.current?.account_id) return;
    setMmAccountId(isFrom ? activeLink.default_own_account_id : activeLink.default_other_account_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFrom, activeLink?.id]);

  const numericAmount = parseAmountInput(amount || "");
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;
  // from/to siempre vienen preseleccionados (arrancan en los primeros 2 miembros) y
  // "¿Quién recibe?" ya excluye a quien es "¿Quién paga?" — así que lo único que de
  // verdad puede faltar acá es el monto (y la cuenta, si este pago me involucra).
  const canSave = !!from && !!to && from !== to && validAmount && (!mmInvolved || !!mmAccountId);

  const handleSave = async () => {
    if (saving) return;
    if (!canSave) { setAmountTouched(true); touch("mmAccountId"); return; }
    setSaving(true);
    try {
      const savedId = await onSave({
        id: existing?.id,
        from, to,
        amount: numericAmount,
        currency,
        date: new Date(date + "T12:00:00").getTime(),
        note: note.trim(),
      });
      // Se fija la cuenta elegida para ESTE pago puntual — la reconciliación
      // nunca la vuelve a recalcular sola (ver evenGroupSync.js).
      if (mmInvolved && savedId) {
        const finalId = existing?.id || savedId;
        await supabase.from("sl_mm_expense_choices").upsert(
          { link_id: activeLink.id, source_kind: "payment", source_id: finalId, account_id: mmAccountId, loan_account_id: mmLoanAccountId || null },
          { onConflict: "link_id,source_kind,source_id" }
        );
        await evenCapital.reload();
      }
    } finally {
      setSaving(false);
    }
  };

  // Mismo motivo que ExpenseForm: "Ver original" a un pago ya borrado no
  // debería dejarlo editar como si siguiera activo.
  if (existing?.deleted) {
    return (
      <div style={styles.screen}>
        <TopBar title="Pago" onBack={onCancel} />
        <EmptyState icon={<Trash2 size={28} strokeWidth={1.5} />} title="Este pago fue eliminado" />
      </div>
    );
  }

  return (
    <div style={styles.screen}>
      <TopBar
        title={existing ? "Editar pago" : "Registrar un pago"}
        onBack={onCancel}
        right={existing && (
          <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(true)} aria-label="Borrar pago"><Trash2 size={17} /></button>
        )}
      />
      {confirmDelete && (
        <ConfirmInline
          message="¿Borrar este pago?"
          confirmLabel={saving ? "Borrando…" : "Borrar"}
          confirmDisabled={saving}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => { setSaving(true); await onDelete(existing.id); setSaving(false); }}
          style={{ margin: "6px 20px 12px", borderRadius: 12, borderTop: "1px solid #EBC9BA" }}
        />
      )}
      <div style={styles.form}>
        {/* Envuelto en su propio flex-column gap:0 (mismo patrón que
            ConfigScreen) para que la separación entre la pregunta y sus
            chips sea SOLO los 4px de marginBottom (misma convención que
            "Quiénes pagaron"/"Cómo se divide"/"Notas" en el gasto) sin
            sumarle el gap:14 de styles.form — ese gap:14 sigue aplicando
            entre "¿Quién paga?" y "¿Quién recibe?", como separación entre
            preguntas distintas. Sin el div, el margen del <p> y el gap del
            form se suman en vez de superponerse (CSS no los colapsa). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <p style={{ ...styles.label, marginBottom: 6 }}>¿Quién paga?</p>
          <div style={styles.payerRow}>
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setFrom(m.id);
                  // Si solo queda una persona posible para "¿Quién recibe?" (ej. un
                  // grupo de 2), no tiene sentido pedir que la elija a mano: es la
                  // única opción. Si no, mismo criterio de siempre (limpiar si
                  // quedó igual al nuevo "¿Quién paga?").
                  const remaining = members.filter((x) => x.id !== m.id);
                  if (remaining.length === 1) setTo(remaining[0].id);
                  else if (to === m.id) setTo("");
                }}
                style={{ ...styles.payerChip, borderColor: from === m.id ? colorFor(m.id) : "transparent", background: from === m.id ? `${colorFor(m.id)}1a` : "#FAF7F2" }}
              >
                <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>{m.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <p style={{ ...styles.label, marginBottom: 6 }}>¿Quién recibe?</p>
          <div style={styles.payerRow}>
            {members.filter((m) => m.id !== from).map((m) => (
              <button key={m.id} onClick={() => setTo(m.id)} style={{ ...styles.payerChip, borderColor: to === m.id ? colorFor(m.id) : "transparent", background: to === m.id ? `${colorFor(m.id)}1a` : "#FAF7F2" }}>
                <span style={{ ...styles.avatar, background: colorFor(m.id), width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>{m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Importe EN FILA, no "hero" -- a diferencia de ExpenseForm/
            TransactionForm.jsx, acá "¿Quién paga?"/"¿Quién recibe?" tienen
            que ir primero (son el dato más importante de un pago), así que
            el importe deja de ser "lo primero que se ve" -- el tratamiento
            hero (número gigante) se sentía fuera de lugar en el medio del
            formulario en vez de al principio. Primer campo de "monto" de la
            app en formato fila -- reusa los mismos 2 controles (calculadora +
            chip de moneda) que el hero, solo más chicos y alineados a la
            derecha como cualquier otra fila. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif" }}>
          <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 13, color: "#6B6355" }}>
            Importe <span style={{ color: "#B0473A" }}>*</span>
          </span>
          {/* minWidth:0 ACÁ (no solo adentro de CalculatorAmountInput): es
              un flex:1 dentro de la fila de "Importe" -- sin esto, un flex
              item no se achica nunca por debajo del ancho de su propio
              contenido (default de CSS), así que una expresión larga
              empujaba toda la fila en vez de recortarse con "…". */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <CalculatorAmountInput
              value={amount}
              onChange={setAmount}
              onBlur={() => setAmountTouched(true)}
              placeholder="0,00"
              // height:32 (no 40, el alto de la fila) -- igual que el chip de
              // moneda, para que quede centrado con un respiro arriba/abajo
              // en vez de tocar la línea de la fila.
              style={{ flex: "0 1 auto", minWidth: 0, width: "auto", height: 32, border: "none", background: "transparent", padding: "0 4px", lineHeight: 1, fontSize: 22, fontWeight: 600, fontFamily: "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif", color: "#C75D3B", textAlign: "right", justifyContent: "flex-end" }}
              focusStyle={{ background: "#F3ECE0", boxShadow: "none" }}
              placeholderColor="#A3968B"
            />
            <PickerField
              compact
              small
              value={currency}
              onChange={setCurrency}
              title="Elegí la moneda"
              groups={[{ label: null, items: [baseCurrency, ...CURRENCY_LIST.filter((c) => c !== baseCurrency)].map((c) => ({ value: c, label: c, icon: CURRENCIES[c]?.symbol })) }]}
            />
          </div>
        </div>
        {amountTouched && !validAmount && (
          <p style={{ margin: "-6px 0 0", fontSize: 13, textAlign: "right", color: "#B0473A", fontFamily: "system-ui, sans-serif" }}>Ingresá un importe válido.</p>
        )}

        <DateRow label="Fecha" value={date} onChange={setDate} />

        <TextRow label="Nota" value={note} onChange={setNote} placeholder="Transferencia, efectivo… (opcional)" />

        {mmInvolved && (
          <Field error={touched.mmAccountId && !mmAccountId ? "Este campo es obligatorio." : ""}>
            <PickerField
              rowLabel={<>Cuenta <EvenGroupIcon size={13} style={{ marginLeft: 2 }} /></>}
              required
              value={mmAccountId}
              onChange={setMmAccountId}
              onBlur={() => touch("mmAccountId")}
              placeholder="Elegí una cuenta"
              title="Elegí una cuenta"
              groups={evenCapital.groups
                .filter((g) => !g.deleted && g.system_key !== "split_ledger")
                .map((g) => ({
                  label: g.name,
                  items: evenCapital.accounts.filter((a) => a.group_id === g.id && !a.hidden && !a.deleted).map((a) => ({ value: a.id, label: a.name, icon: a.icon })),
                }))
                .filter((g) => g.items.length > 0)}
            />
          </Field>
        )}

        {mmInvolved && (
          <PickerField
            rowLabel={<>Cuenta de lo prestado <EvenGroupIcon size={13} style={{ marginLeft: 2 }} /></>}
            info="Para este pago puntual: de dónde sale (o adónde entra) lo que se salda, si tu grupo tiene configurada una cuenta para eso. Dejalo vacío para usar 'Cuenta' de arriba, como siempre."
            value={mmLoanAccountId}
            onChange={setMmLoanAccountId}
            onClear={() => setMmLoanAccountId("")}
            placeholder="Misma que 'Cuenta'"
            title="Elegí una cuenta"
            groups={evenCapital.groups
              .filter((g) => !g.deleted && g.system_key !== "split_ledger")
              .map((g) => ({
                label: g.name,
                items: evenCapital.accounts.filter((a) => a.group_id === g.id && !a.hidden && !a.deleted).map((a) => ({ value: a.id, label: a.name, icon: a.icon })),
              }))
              .filter((g) => g.items.length > 0)}
          />
        )}

        {/* Antes era lo primero que se leía, con más peso del que amerita
            (es una aclaración, no una instrucción) -- abajo del todo, como
            Hint, queda disponible sin competir por la atención. */}
        <Hint style={{ fontStyle: "italic" }}>*Esto no mueve dinero. Solo anota que el pago ya se hizo fuera de la app, para saldar el balance.</Hint>
      </div>
      <FormFooter
        onCancel={onCancel}
        onConfirm={handleSave}
        confirmLabel={saving ? "Guardando…" : (existing ? "Guardar" : "Registrar pago")}
        confirmDisabled={saving}
        confirmDim={!canSave}
      />
    </div>
  );
}


function InviteScreen({ group, session, groupInvites = [], onBack, onSend, onCancelInvite }) {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [targetUsername, setTargetUsername] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [touched, setTouched] = useState({});
  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));

  const invitableMembers = group.members.filter(m => !m.linkedUserId && !m.deleted);
  const selectableMembers = invitableMembers.filter(m => !groupInvites.find(i => i.memberId === m.id));
  const isSelfInvite = !!targetUsername.trim() && targetUsername.trim().toLowerCase() === session.username;
  const canSend = !!selectedMemberId && !!targetUsername.trim() && !isSelfInvite;

  // Si solo queda un miembro por invitar, no hace falta que el usuario lo
  // elija a mano.
  useEffect(() => {
    if (!selectedMemberId && selectableMembers.length === 1) {
      setSelectedMemberId(selectableMembers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, selectableMembers.length, selectableMembers[0]?.id]);

  const handle = async () => {
    if (sending) return;
    if (!canSend) { setTouched({ member: true, username: true }); return; }
    setSending(true);
    const ok = await onSend({ memberId: selectedMemberId, targetUsername: targetUsername.trim().toLowerCase() });
    if (ok) {
      setSelectedMemberId("");
      setTargetUsername("");
    }
    setSending(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Invitar al grupo" onBack={onBack} />
      <div style={styles.form}>
        <p style={{ ...styles.muted, padding: 0 }}>
          Selecciona a qué miembro del grupo corresponde la persona que vas a invitar, y escribe su nombre de usuario en la app.
        </p>

        {/* Mismo motivo que "Personas"/"Integrantes" — label+contenido
            envueltos juntos (gap:6) con margin:0 explícito en el <p> (si no,
            su margen por defecto del navegador se suma al gap). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ ...styles.label, display: "block", margin: 0 }}>¿A qué miembro corresponde? <span style={{ color: "#B0473A" }}>*</span></p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {invitableMembers.map(m => {
            const pending = groupInvites.find(i => i.memberId === m.id);
            const isSelected = selectedMemberId === m.id;
            const isConfirming = confirmCancelId === m.id;
            return (
              <div key={m.id}>
                <button
                  onClick={() => !pending && setSelectedMemberId(m.id)}
                  style={{ ...styles.shareRow, textAlign: "left", cursor: pending ? "default" : "pointer", borderColor: isSelected ? "#C75D3B" : pending ? "#CFE2D7" : "#ECE3D3", background: isSelected ? "#C75D3B0d" : pending ? "#EAF1ED" : "#fff", borderRadius: isConfirming ? "10px 10px 0 0" : 10 }}
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
                        onClick={(e) => { e.stopPropagation(); setConfirmCancelId(m.id); }}
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
                {isConfirming && (
                  <ConfirmInline
                    message="¿Cancelar esta invitación?"
                    confirmLabel="Sí, cancelar"
                    onCancel={() => setConfirmCancelId(null)}
                    onConfirm={async () => {
                      setConfirmCancelId(null);
                      setCancelingId(m.id);
                      await onCancelInvite(m.id);
                      setCancelingId(null);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        </div>
        {touched.member && !selectedMemberId && (
          <p style={{ margin: "-4px 0 0", fontSize: 12, color: "#B0473A", fontFamily: "system-ui, sans-serif" }}>Elegí a qué miembro corresponde.</p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif" }}>
          <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 13, color: "#6B6355" }}>
            Usuario a invitar<span style={{ color: "#B0473A" }}>*</span>
          </span>
          <input
            className="row-input"
            style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13.5, fontFamily: "system-ui, sans-serif", border: "none", background: "transparent", padding: 0, color: "#2B2620" }}
            value={targetUsername}
            onChange={e => setTargetUsername(e.target.value)}
            onBlur={() => touch("username")}
            placeholder="nombre_de_usuario"
            autoCapitalize="none"
            onKeyDown={e => e.key === "Enter" && canSend && !sending && handle()}
          />
        </div>
        {touched.username && !targetUsername.trim() && (
          <p style={{ margin: "-8px 0 0", fontSize: 12, fontFamily: "system-ui, sans-serif", color: "#B0473A" }}>Este campo es obligatorio.</p>
        )}

        {isSelfInvite && <p style={styles.errText}>No puedes invitarte a ti mismo.</p>}
      </div>

      <FormFooter
        onCancel={onBack}
        onConfirm={handle}
        confirmLabel={sending ? "Enviando…" : "Enviar invitación"}
        confirmDisabled={sending}
        confirmDim={!canSend}
      />
    </div>
  );
}
