import React, { useState } from "react";
import { User, Camera, LogOut, Bell, Plus, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { TopBar, ConfirmInline, Footer } from "../../components/Shared.jsx";
import { useImageUpload, resolvePhotoUrl, colorFor, initials } from "../../lib/helpers.jsx";
import ComingSoon from "../moneymanager/ComingSoon.jsx";

/* =========================================================================
   CONFIG — toggle de 2 secciones (Money Manager / Split Ledger) + un botón
   de perfil arriba a la derecha (foto, contraseña, cerrar sesión — nada
   más por ahora, así que no amerita ser una sección del toggle).
   ========================================================================= */

export default function ConfigScreen({
  session, invites = [], onAcceptInvite, onRejectInvite, onLogout, refreshProfile,
  groups, onCreateGroup, onOpenGroup, showError, showSuccess,
  changingPassword, setChangingPassword, viewingProfile, setViewingProfile,
}) {
  const [section, setSection] = useState("splitledger"); // "moneymanager" | "splitledger"

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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "32px 20px 8px" }}>
        <h1 style={styles.h1}>Configuración</h1>
        <button style={styles.iconBtnGhost} onClick={() => setViewingProfile(true)} aria-label="Perfil">
          <User size={22} />
        </button>
      </header>
      <div style={styles.tabRow}>
        <button style={section === "moneymanager" ? styles.tabActive : styles.tab} onClick={() => setSection("moneymanager")}>Money Manager</button>
        <button style={section === "splitledger" ? styles.tabActive : styles.tab} onClick={() => setSection("splitledger")}>Split Ledger</button>
      </div>

      {section === "moneymanager" && <ComingSoon title="Money Manager" />}

      {section === "splitledger" && (
        <SplitLedgerSettings
          session={session}
          groups={groups}
          onCreateGroup={onCreateGroup}
          onOpenGroup={onOpenGroup}
          refreshProfile={refreshProfile}
          showError={showError}
          showSuccess={showSuccess}
          invites={invites}
          onAcceptInvite={onAcceptInvite}
          onRejectInvite={onRejectInvite}
        />
      )}
    </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 72, height: 72, minWidth: 72, borderRadius: "50%", overflow: "hidden", background: photoUrl ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #DDD2BE" }}>
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
            {photoUrl && <button style={{ ...styles.btnGhostSmall, fontSize: 12 }} onClick={clearPhoto}>Quitar foto</button>}
          </div>
        </div>

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
              style={{ margin: 0, width: "100%" }}
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

  const handleSave = async () => {
    setErr("");
    if (!currentPassword) return setErr("Escribe tu contraseña actual.");
    if (!newPassword || newPassword.length < 4) return setErr("La nueva contraseña debe tener al menos 4 caracteres.");
    if (newPassword !== confirmPassword) return setErr("Las contraseñas no coinciden.");
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
      <div style={styles.form}>
        <label style={styles.label}>
          Contraseña actual
          <input style={styles.input} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••" />
        </label>
        <label style={styles.label}>
          Nueva contraseña
          <input style={styles.input} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••" />
        </label>
        <label style={styles.label}>
          Confirmar nueva contraseña
          <input style={styles.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••" />
        </label>
        {err && <p style={styles.errText}>{err}</p>}
        <button style={styles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Actualizar contraseña"}
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   SPLIT LEDGER (toggle on/off, invitaciones, nombre visible, grupo por
   defecto, tus grupos)
   ========================================================================= */

function SplitLedgerSettings({ session, groups, onCreateGroup, onOpenGroup, refreshProfile, showError, showSuccess, invites, onAcceptInvite, onRejectInvite }) {
  const [displayName, setDisplayName] = useState(session.displayName || "");
  const [savingName, setSavingName] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const nameDirty = displayName.trim() !== (session.displayName || "");

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
    } catch (e) { showError(`No se pudo actualizar: ${e?.message || e}`); } finally { setSavingDefault(false); }
  };

  return (
    <div style={{ ...styles.form, paddingBottom: 100 }}>
      <div style={{ ...styles.shareRow, justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>Use Split Ledger</span>
        <button
          onClick={toggleEnabled}
          disabled={togglingEnabled}
          style={{ width: 44, height: 26, borderRadius: 13, border: "none", background: session.splitLedgerEnabled ? "#C75D3B" : "#D9CFC1", position: "relative", cursor: "pointer", flexShrink: 0, opacity: togglingEnabled ? 0.6 : 1 }}
          aria-label="Use Split Ledger"
        >
          <span style={{ position: "absolute", top: 3, left: session.splitLedgerEnabled ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
        </button>
      </div>

      <label style={styles.label}>
        Nombre visible
        <input style={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tu nombre" />
      </label>
      {nameDirty && (
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={() => setDisplayName(session.displayName || "")}>Cancelar</button>
          <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0 }} onClick={handleSaveName} disabled={savingName}>
            {savingName ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}

      <label style={styles.label}>
        Grupo por defecto
        <select style={styles.input} value={session.defaultGroupId || ""} onChange={handleDefaultGroupChange} disabled={savingDefault}>
          <option value="">Ninguno</option>
          {(groups || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
        El botón de "+" en Split Ledger crea el gasto directo en este grupo.
      </p>

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

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(groups || []).map((g) => (
          <button key={g.id} style={{ ...styles.shareRow, cursor: "pointer", textAlign: "left" }} onClick={() => onOpenGroup(g.id)}>
            <span style={{ ...styles.avatar, background: colorFor(g.id) }}>{initials(g.name)}</span>
            <span style={{ flex: 1 }}>{g.name}</span>
            <ChevronRight size={18} color="#A89A87" />
          </button>
        ))}
      </div>
      <button style={styles.btnDashed} onClick={onCreateGroup}><Plus size={16} /> Crear grupo</button>
    </div>
  );
}
