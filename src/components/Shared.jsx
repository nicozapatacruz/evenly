import React from "react";
import { ArrowLeft } from "lucide-react";
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
        <button style={styles.btnGhostSmall} onClick={onCancel}>Cancelar</button>
        <button style={styles.btnDangerSmall} onClick={onConfirm}>{confirmLabel}</button>
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
