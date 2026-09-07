import React from "react";
import { ArrowLeft, Camera, User } from "lucide-react";
import { styles } from "../lib/styles.js";

export function TopBar({ title, onBack, right }) {
  return (
    <div style={styles.topBar}>
      <button style={styles.iconBtnGhost} onClick={onBack} aria-label="Volver"><ArrowLeft size={20} /></button>
      <h2 style={styles.topBarTitle}>{title}</h2>
      <div style={{ width: 36, display: "flex", justifyContent: "flex-end" }}>{right}</div>
    </div>
  );
}

// Header "principal" — el único que usan las pantallas raíz de cada tab
// (Tus grupos, Configuración). Un solo componente para las dos así no puede
// volver a haber una diferencia de estilo entre ambas.
export function RootHeader({ title, right }) {
  return (
    <header style={styles.rootHeader}>
      <h1 style={styles.h1}>{title}</h1>
      {right}
    </header>
  );
}

// Regla de fricción para acciones destructivas (a propósito, dos niveles):
// 1) Confirmación de un clic (este componente): para acciones de alcance acotado
//    y que no borran historial compartido — borrar un gasto, quitar un miembro,
//    cerrar sesión, cancelar una invitación.
// 2) Escribir "Confirmar" a mano: reservado solo para borrar el grupo completo,
//    porque destruye el historial de TODOS los miembros sin posibilidad de deshacer.
export function ConfirmInline({ message, confirmLabel = "Confirmar", onCancel, onConfirm, style }) {
  return (
    <div style={{ ...styles.confirmBox, ...style }}>
      <p style={{ margin: 0, fontSize: 14 }}>{message}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button style={{ ...styles.btnGhostSmall, flex: 1, justifyContent: "center" }} onClick={onCancel}>Cancelar</button>
        <button style={{ ...styles.btnDangerSmall, flex: 1 }} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}

// Popup centrado con fondo oscuro — para confirmaciones fuertes (ej. borrar un grupo entero)
export function Modal({ onClose, children }) {
  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Barra fija abajo de la pantalla (botones principales de guardar/cancelar/etc.)
export function Footer({ children }) {
  return <div style={styles.footer}>{children}</div>;
}

// Foto + botones de cambiar/quitar — compartido por NewGroup/EditGroup (foto de grupo,
// shape="square") y Perfil (foto de usuario, shape="circle"). Los dos botones van en fila,
// mismo ancho cada uno.
export function PhotoPicker({ previewUrl, onChange, onClear, shape = "square" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 72, height: 72, minWidth: 72, borderRadius: shape === "circle" ? "50%" : 16, overflow: "hidden", background: previewUrl ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #DDD2BE" }}>
        {previewUrl
          ? <img src={previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <User size={28} color="#A89A87" />
        }
      </div>
      <div style={{ display: "flex", gap: 6, flex: 1 }}>
        <label style={{ ...styles.btnDashed, cursor: "pointer", fontSize: 13, flex: 1 }}>
          <Camera size={14} /> {previewUrl ? "Cambiar foto" : "Añadir foto"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChange} />
        </label>
        {previewUrl && (
          <button style={{ ...styles.btnGhostSmall, fontSize: 12, flex: 1, justifyContent: "center" }} onClick={onClear}>Quitar foto</button>
        )}
      </div>
    </div>
  );
}
