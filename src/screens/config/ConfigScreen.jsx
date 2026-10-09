import React, { useState, useEffect } from "react";
import { User, LogOut, Bell, Plus, ChevronRight, Menu } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { TopBar, RootHeader, ConfirmInline, Footer, PhotoPicker, ToggleField, Field } from "../../components/Shared.jsx";
import { useImageUpload, resolvePhotoUrl, colorFor, initials } from "../../lib/helpers.jsx";
import RecurringScreen from "../moneymanager/RecurringScreen.jsx";
import TransactionForm, { ManageCategories } from "../moneymanager/TransactionForm.jsx";
import { ManageGroups, ManageAccounts, ManageAllAccounts } from "../moneymanager/CuentasTab.jsx";
import PeriodSettingsScreen from "../moneymanager/PeriodSettingsScreen.jsx";
import CurrencySettingsScreen from "../moneymanager/CurrencySettingsScreen.jsx";

/* =========================================================================
   CONFIG — toggle de 2 secciones (Money Manager / Split Ledger) + un botón
   de perfil arriba a la derecha (foto, contraseña, cerrar sesión — nada
   más por ahora, así que no amerita ser una sección del toggle).
   ========================================================================= */

export default function ConfigScreen({
  session, invites = [], onAcceptInvite, onRejectInvite, onLogout, refreshProfile,
  groups, reloadGroups, onCreateGroup, onOpenGroup, showError, showSuccess, showInfo,
  changingPassword, setChangingPassword, viewingProfile, setViewingProfile,
  moneyManager, onSaveMoneyTransaction, creatingRecurring, setCreatingRecurring,
  moneyManagerScreen, setMoneyManagerScreen, onOpenSplitLedgerGroup,
}) {
  // Igual que activeTab en SplitLedger.jsx: en localStorage para que
  // sobreviva a cerrar y reabrir la app, no solo a pasar a segundo plano.
  const [section, setSection] = useState(() => {
    const saved = localStorage.getItem("evenly_configSection");
    return saved === "moneymanager" || saved === "splitledger" ? saved : "moneymanager";
  });
  useEffect(() => {
    localStorage.setItem("evenly_configSection", section);
  }, [section]);

  if (creatingRecurring) {
    return (
      <TransactionForm
        session={session}
        settings={moneyManager.settings}
        groups={moneyManager.groups}
        accounts={moneyManager.accounts}
        categories={moneyManager.categories}
        reloadCategories={moneyManager.reload}
        showError={showError}
        forceRecurringOpen
        hideRemoveRecurring
        onCancel={() => setCreatingRecurring(false)}
        onSave={async (tx) => {
          const ok = await onSaveMoneyTransaction(tx);
          if (ok) setCreatingRecurring(false);
        }}
      />
    );
  }

  if (moneyManagerScreen === "recurring") {
    return (
      <div style={styles.screen}>
        <TopBar title="Transacciones repetidas" onBack={() => setMoneyManagerScreen(null)} />
        <div style={{ ...styles.form, paddingBottom: 100 }}>
          <RecurringScreen
            accounts={moneyManager.accounts}
            recurring={moneyManager.recurring}
            reload={moneyManager.reload}
            showError={showError}
            showInfo={showInfo}
            onCreateNew={() => setCreatingRecurring(true)}
          />
        </div>
      </div>
    );
  }

  if (moneyManagerScreen === "period") {
    return (
      <PeriodSettingsScreen
        session={session}
        settings={moneyManager.settings}
        reload={moneyManager.reload}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setMoneyManagerScreen(null)}
      />
    );
  }

  if (moneyManagerScreen === "currency") {
    return (
      <CurrencySettingsScreen
        session={session}
        settings={moneyManager.settings}
        reload={moneyManager.reload}
        showError={showError}
        onBack={() => setMoneyManagerScreen(null)}
      />
    );
  }

  if (moneyManagerScreen === "categoriesIncome" || moneyManagerScreen === "categoriesExpense") {
    return (
      <ManageCategories
        session={session}
        type={moneyManagerScreen === "categoriesIncome" ? "income" : "expense"}
        categories={moneyManager.categories}
        reload={moneyManager.reload}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setMoneyManagerScreen(null)}
      />
    );
  }

  if (moneyManagerScreen === "accountTypes") {
    return (
      <AccountsSettingsScreen
        session={session}
        groups={moneyManager.groups}
        accounts={moneyManager.accounts}
        accountTotals={moneyManager.accountTotals}
        settings={moneyManager.settings}
        slLinks={moneyManager.slLinks}
        onOpenSplitLedgerGroup={onOpenSplitLedgerGroup}
        reload={moneyManager.reload}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setMoneyManagerScreen(null)}
      />
    );
  }

  if (moneyManagerScreen === "accounts") {
    return (
      <ManageAllAccounts
        session={session}
        groups={moneyManager.groups}
        accounts={moneyManager.accounts}
        accountTotals={moneyManager.accountTotals}
        settings={moneyManager.settings}
        slLinks={moneyManager.slLinks}
        onOpenSplitLedgerGroup={onOpenSplitLedgerGroup}
        reload={moneyManager.reload}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setMoneyManagerScreen(null)}
      />
    );
  }

  if (changingPassword) {
    return (
      <ChangePasswordScreen
        session={session}
        onBack={() => setChangingPassword(false)}
        onSave={async (newPassword) => {
          const { error } = await supabase.auth.updateUser({ password: newPassword });
          if (error) throw error;
          showSuccess("Contraseña actualizada.");
          setChangingPassword(false);
        }}
      />
    );
  }

  if (viewingProfile) {
    return (
      <ProfileScreen
        session={session}
        onBack={() => setViewingProfile(false)}
        onLogout={onLogout}
        onChangePassword={() => setChangingPassword(true)}
        onSave={async ({ photoUrl }) => {
          const { error } = await supabase.from("profiles").update({ photo_url: photoUrl }).eq("id", session.userId);
          if (error) throw error;
          await refreshProfile();
        }}
      />
    );
  }

  return (
    <div style={styles.screen}>
      <RootHeader
        title="Configuración"
        right={
          <button style={styles.iconBtnGhost} onClick={() => setViewingProfile(true)} aria-label="Perfil">
            <User size={22} />
          </button>
        }
      />
      <div style={styles.tabRow}>
        <button style={section === "moneymanager" ? styles.tabActive : styles.tab} onClick={() => setSection("moneymanager")}>Money Manager</button>
        <button style={section === "splitledger" ? styles.tabActive : styles.tab} onClick={() => setSection("splitledger")}>Split Ledger</button>
      </div>

      {section === "moneymanager" && (
        <div style={{ ...styles.form, paddingTop: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <p style={{ ...styles.label, marginBottom: 12 }}>Categorías/Cuentas</p>
            <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
              <MenuRow label="Categorías de ingreso" onClick={() => setMoneyManagerScreen("categoriesIncome")} />
              <MenuRow label="Categorías de gasto" onClick={() => setMoneyManagerScreen("categoriesExpense")} />
              <MenuRow label="Grupos de cuentas" onClick={() => setMoneyManagerScreen("accountTypes")} />
              <MenuRow label="Gestor de cuentas" onClick={() => setMoneyManagerScreen("accounts")} last />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <p style={{ ...styles.label, marginBottom: 12 }}>Transacciones</p>
            <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
              <MenuRow label="Detalles del período" onClick={() => setMoneyManagerScreen("period")} />
              <MenuRow label="Transacciones repetidas" onClick={() => setMoneyManagerScreen("recurring")} last />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <p style={{ ...styles.label, marginBottom: 12 }}>Ajustes</p>
            <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
              <MenuRow label="Ajustes de moneda" onClick={() => setMoneyManagerScreen("currency")} />
              <MenuRow label="Respaldo" badge="Próximamente" />
              <MenuRow label="Apariencia" badge="Próximamente" last />
            </div>
          </div>
        </div>
      )}

      {section === "splitledger" && (
        <SplitLedgerSettings
          session={session}
          groups={groups}
          reloadGroups={reloadGroups}
          onCreateGroup={onCreateGroup}
          onOpenGroup={onOpenGroup}
          refreshProfile={refreshProfile}
          showError={showError}
          showSuccess={showSuccess}
          showInfo={showInfo}
          invites={invites}
          onAcceptInvite={onAcceptInvite}
          onRejectInvite={onRejectInvite}
        />
      )}
    </div>
  );
}

// Fila de menú genérica para la lista de Money Manager en Config — o navega
// (onClick) o muestra un badge "Próximamente" (Respaldo/Apariencia, sin
// construir todavía), nunca las dos cosas.
function MenuRow({ label, onClick, badge, last }) {
  return (
    <button
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        padding: "12px 14px", background: "none", border: "none", borderBottom: last ? "none" : "1px solid #F0EBE2",
        fontSize: 14, fontFamily: "system-ui, sans-serif", color: badge ? "#A89A87" : "#2B2620",
        cursor: onClick ? "pointer" : "default", textAlign: "left",
      }}
      onClick={onClick}
      disabled={!onClick}
    >
      <span>{label}</span>
      {badge ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: "#A8754A", background: "#F0E6D6", padding: "3px 8px", borderRadius: 20, fontFamily: "system-ui, sans-serif" }}>{badge}</span>
      ) : (
        <ChevronRight size={18} color="#A89A87" />
      )}
    </button>
  );
}

/* =========================================================================
   GESTOR DE CUENTAS (desde Config) — mismo ManageGroups/ManageAccounts que
   usa el tab Cuentas, con su propio ida-y-vuelta grupo → cuentas acá adentro
   (el tab Cuentas guarda ese estado en AppShell porque también lo necesita
   para el botón de "editar" propio; acá alcanza con un estado local).
   ========================================================================= */

function AccountsSettingsScreen({ session, groups, accounts, accountTotals, settings, slLinks, onOpenSplitLedgerGroup, reload, showError, showInfo, onBack }) {
  const [view, setView] = useState({ screen: "groups" });

  if (view.screen === "accounts") {
    const group = groups.find((g) => g.id === view.groupId);
    if (!group) { setView({ screen: "groups" }); return null; }
    return (
      <ManageAccounts
        session={session}
        group={group}
        groups={groups}
        accounts={accounts}
        accountTotals={accountTotals}
        settings={settings}
        slLinks={slLinks}
        onOpenSplitLedgerGroup={onOpenSplitLedgerGroup}
        reload={reload}
        showError={showError}
        showInfo={showInfo}
        justCreated={view.justCreated}
        onBack={() => setView({ screen: "groups" })}
        onDeleted={() => setView({ screen: "groups" })}
      />
    );
  }

  return (
    <ManageGroups
      session={session}
      groups={groups}
      accounts={accounts}
      reload={reload}
      showError={showError}
      showInfo={showInfo}
      onBack={onBack}
      onOpenGroup={(groupId, opts) => setView({ screen: "accounts", groupId, justCreated: opts?.justCreated })}
    />
  );
}

/* =========================================================================
   PERFIL — pantalla propia (se llega acá por el ícono de usuario arriba a
   la derecha de Configuración): foto, cambiar contraseña, cerrar sesión.
   ========================================================================= */

function ProfileScreen({ session, onBack, onLogout, onChangePassword, onSave }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const { previewUrl: photoUrl, pendingFile, removed, handleImageChange: handlePhoto, clear: clearPhoto } = useImageUpload(session.photoUrl || null, setErr);
  const isDirty = !!pendingFile || removed;

  const handleSave = async () => {
    setErr("");
    setSaving(true);
    try {
      const resolvedPhotoUrl = await resolvePhotoUrl({ pendingFile, removed, currentUrl: session.photoUrl });
      await onSave({ photoUrl: resolvedPhotoUrl });
      onBack();
    } catch (e) { setErr(e?.message || "Error al guardar"); setSaving(false); }
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Perfil" onBack={onBack} />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        <PhotoPicker previewUrl={photoUrl} onChange={handlePhoto} onClear={clearPhoto} shape="circle" />

        <p style={{ ...styles.muted, padding: 0, fontSize: 12 }}>@{session.username}</p>

        <button style={styles.btnSecondary} onClick={onChangePassword}>
          Cambiar contraseña
        </button>

        {err && <p style={styles.errText}>{err}</p>}
      </div>

      {!isDirty ? (
        <Footer>
          {!showLogoutConfirm ? (
            <button style={{ ...styles.btnDangerOutline, marginTop: 0 }} onClick={() => setShowLogoutConfirm(true)}>
              <LogOut size={14} /> Cerrar sesión
            </button>
          ) : (
            <ConfirmInline
              message="¿Cerrar sesión?"
              confirmLabel="Cerrar sesión"
              onCancel={() => setShowLogoutConfirm(false)}
              onConfirm={onLogout}
              style={{ width: "100%", borderRadius: 12, borderTop: "1px solid #EBC9BA" }}
            />
          )}
        </Footer>
      ) : (
        <Footer>
          <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onBack}>Cancelar</button>
          <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </Footer>
      )}
    </div>
  );
}

/* =========================================================================
   CAMBIAR CONTRASEÑA
   ========================================================================= */

function ChangePasswordScreen({ session, onBack, onSave }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});
  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));

  const canSave = !!currentPassword && newPassword.length >= 4 && newPassword === confirmPassword && newPassword !== currentPassword;

  const handleSave = async () => {
    if (saving) return;
    setErr("");
    if (!canSave) { setTouched({ currentPassword: true, newPassword: true, confirmPassword: true }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: session.email, password: currentPassword });
      if (error) throw new Error("La contraseña actual es incorrecta.");
      await onSave(newPassword);
    } catch (e) { setErr(e?.message || "Error al guardar"); setSaving(false); }
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Cambiar contraseña" onBack={onBack} />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        <Field label="Contraseña actual" required error={touched.currentPassword && !currentPassword ? "Este campo es obligatorio." : ""}>
          <input style={styles.input} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} onBlur={() => touch("currentPassword")} placeholder="Contraseña actual" />
        </Field>
        <Field
          label="Nueva contraseña"
          required
          error={touched.newPassword
            ? (newPassword.length < 4 ? "Debe tener al menos 4 caracteres." : (newPassword === currentPassword && currentPassword ? "Debe ser diferente a la actual." : ""))
            : ""}
        >
          <input style={styles.input} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} onBlur={() => touch("newPassword")} placeholder="Nueva contraseña" />
        </Field>
        <Field
          label="Confirmar nueva contraseña"
          required
          error={touched.confirmPassword
            ? (!confirmPassword ? "Este campo es obligatorio." : (newPassword !== confirmPassword ? "Las contraseñas no coinciden." : ""))
            : ""}
        >
          <input style={styles.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onBlur={() => touch("confirmPassword")} placeholder="Confirmar nueva contraseña" />
        </Field>
        {err && <p style={styles.errText}>{err}</p>}
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onBack}>Cancelar</button>
        <button
          style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !canSave) ? 0.5 : 1 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Actualizando…" : "Actualizar contraseña"}
        </button>
      </Footer>
    </div>
  );
}

/* =========================================================================
   SPLIT LEDGER (toggle on/off, invitaciones, nombre visible, grupo por
   defecto, tus grupos)
   ========================================================================= */

function SplitLedgerSettings({ session, groups, reloadGroups, onCreateGroup, onOpenGroup, refreshProfile, showError, showSuccess, showInfo, invites, onAcceptInvite, onRejectInvite }) {
  const [displayName, setDisplayName] = useState(session.displayName || "");
  const [savingName, setSavingName] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const nameDirty = displayName.trim() !== (session.displayName || "");

  // Orden local de "tus grupos" (dnd-kit necesita el array de ids ya en el
  // orden visible). Se resincroniza con `groups` cada vez que cambian desde
  // afuera (crear/aceptar invitación, y el reloadGroups() de más abajo).
  const [groupOrder, setGroupOrder] = useState(() => (groups || []).map((g) => g.id));
  useEffect(() => {
    setGroupOrder((groups || []).map((g) => g.id));
  }, [groups]);

  // MouseSensor + TouchSensor en vez de PointerSensor — ver comentario en
  // SplitLedgerTab.jsx (mismo fix, mismo bug de touch en iOS Safari).
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const handleGroupDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = groupOrder.indexOf(active.id);
    const newIndex = groupOrder.indexOf(over.id);
    const newOrder = arrayMove(groupOrder, oldIndex, newIndex);
    setGroupOrder(newOrder);
    try {
      const results = await Promise.all(newOrder.map((groupId, i) => {
        const g = groups.find((x) => x.id === groupId);
        const memberId = g.members.find((m) => m.linkedUserId === session.userId)?.id;
        return supabase.from("group_members").update({ sort_order: i }).eq("id", memberId);
      }));
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      await reloadGroups();
    } catch (e) {
      showError(`No se pudo guardar el orden: ${e?.message || e}`);
      await reloadGroups();
    }
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) return showError("El nombre no puede estar vacío.");
    setSavingName(true);
    try {
      const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", session.userId);
      if (error) throw error;
      await refreshProfile();
      showSuccess("Nombre actualizado.");
    } catch (e) { showError(`No se pudo guardar: ${e?.message || e}`); } finally { setSavingName(false); }
  };

  const toggleEnabled = async () => {
    setTogglingEnabled(true);
    try {
      const { error } = await supabase.from("profiles").update({ split_ledger_enabled: !session.splitLedgerEnabled }).eq("id", session.userId);
      if (error) throw error;
      await refreshProfile();
    } catch (e) { showError(`No se pudo actualizar: ${e?.message || e}`); } finally { setTogglingEnabled(false); }
  };

  const handleDefaultGroupChange = async (e) => {
    const value = e.target.value || null;
    setSavingDefault(true);
    try {
      const { error } = await supabase.from("profiles").update({ default_group_id: value }).eq("id", session.userId);
      if (error) throw error;
      await refreshProfile();
      showInfo("Guardado.");
    } catch (e) { showError(`No se pudo actualizar: ${e?.message || e}`); } finally { setSavingDefault(false); }
  };

  return (
    <div style={{ ...styles.form, paddingBottom: 100 }}>
      <ToggleField
        label="Split Ledger"
        description="Activar la sección de Split Ledger"
        checked={session.splitLedgerEnabled}
        onChange={toggleEnabled}
        disabled={togglingEnabled}
      />

      <div>
        <Field label="Nombre visible">
          <input style={{ ...styles.input, borderRadius: nameDirty ? "10px 10px 0 0" : 10 }} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tu nombre" />
        </Field>
        {nameDirty && (
          <ConfirmInline
            danger={false}
            confirmLabel={savingName ? "Guardando…" : "Guardar"}
            confirmDisabled={savingName}
            onCancel={() => setDisplayName(session.displayName || "")}
            onConfirm={handleSaveName}
          />
        )}
      </div>

      <Field label="Grupo por defecto">
        <select style={styles.input} value={session.defaultGroupId || ""} onChange={handleDefaultGroupChange} disabled={savingDefault}>
          <option value="">Ninguno</option>
          {(groups || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Field>
      <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
        El botón de "+" en Split Ledger crea el gasto directo en este grupo.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={styles.label}>Tus grupos ({(groups || []).length})</p>

        {/* Invitaciones pendientes */}
        <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
          <p style={{ margin: 0, padding: "12px 16px 8px", fontSize: 13, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#544A3C", borderBottom: invites.length ? "1px solid #F0EBE2" : "none", display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={15} /> Invitaciones ({invites.length})
          </p>
          {invites.map((inv) => (
            <div key={inv.inviteId} style={{ padding: "10px 16px", borderBottom: "1px solid #F0EBE2", display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontFamily: "system-ui, sans-serif" }}>
                <strong>{inv.fromUsername}</strong> te invitó a <strong>{inv.groupName}</strong> como <strong>{inv.memberName}</strong>
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={styles.btnGhostSmall} onClick={() => onRejectInvite(inv)}>Rechazar</button>
                <button style={{ ...styles.btnDangerSmall, background: "#3B6E62" }} onClick={() => onAcceptInvite(inv)}>Aceptar</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
        <SortableContext items={groupOrder} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {groupOrder.map((groupId) => {
              const g = groups.find((x) => x.id === groupId);
              if (!g) return null;
              return <SortableGroupRow key={g.id} group={g} onOpen={() => onOpenGroup(g.id)} draggable={groupOrder.length > 1} />;
            })}
          </div>
        </SortableContext>
      </DndContext>
      <button style={styles.btnDashed} onClick={onCreateGroup}><Plus size={16} /> Crear grupo</button>
    </div>
  );
}

// Una fila arrastrable de "tus grupos" (mismo mecanismo — dnd-kit — que las
// categorías de EditGroup, y mismo ícono de agarre: 3 líneas horizontales).
function SortableGroupRow({ group, onOpen, draggable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id, disabled: !draggable });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 4, padding: "10px 14px" }}>
      {/* Sin ícono de arrastrar si hay un solo ítem — no hay con qué reordenar. */}
      {draggable ? (
        <span
          {...attributes}
          {...listeners}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "stretch",
            width: 28,
            color: "#C9BBA0",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <Menu size={18} />
        </span>
      ) : (
        <span style={{ width: 28, flexShrink: 0 }} />
      )}
      <button style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }} onClick={onOpen}>
        <span style={{ ...styles.avatar, background: colorFor(group.id) }}>{initials(group.name)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{group.name}</span>
        <ChevronRight size={18} color="#A89A87" />
      </button>
    </div>
  );
}
