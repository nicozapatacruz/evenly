import React from "react";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, User } from "lucide-react";
import { styles } from "../lib/styles.js";

const MONTH_LABEL = (d) => d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

// Único toggle de la app — label arriba (igual que cualquier otro campo),
// switch dentro de una caja con el mismo estilo que un input. Componentizado
// a propósito: ya se desalineó dos veces por copiarlo a mano (uno quedó en
// negrilla por error, otro heredó la negrilla del label sin querer).
export function ToggleField({ label, description, checked, onChange, disabled }) {
  return (
    <label style={styles.label}>
      {label}
      <div style={{ ...styles.input, display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 400, padding: "7px 13px" }}>
        <span>{description}</span>
        <button
          onClick={() => onChange(!checked)}
          disabled={disabled}
          style={{ width: 44, height: 26, borderRadius: 13, border: "none", background: checked ? "#C75D3B" : "#D9CFC1", position: "relative", cursor: "pointer", flexShrink: 0, opacity: disabled ? 0.6 : 1 }}
          aria-label={label}
        >
          <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
        </button>
      </div>
    </label>
  );
}

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

// Selector de mes (Transacciones y Estadísticas) — solo flechas + nombre
// del mes. El botón para volver al mes actual vive en el header (ver
// TodayButton), no acá adentro.
export function MonthNav({ viewMonth, setViewMonth }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <button style={styles.iconBtnGhost} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} aria-label="Mes anterior">
        <ChevronLeft size={20} />
      </button>
      <span style={{ fontWeight: 600, fontFamily: "system-ui, sans-serif", textTransform: "capitalize" }}>{MONTH_LABEL(viewMonth)}</span>
      <button style={styles.iconBtnGhost} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} aria-label="Mes siguiente">
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

// Botón "Hoy" para el header (misma posición que el lápiz de Cuentas) — solo
// aparece si te alejaste del mes actual, para volver de un salto sin tener
// que contar flechitas.
export function TodayButton({ viewMonth, setViewMonth }) {
  const now = new Date();
  const isCurrentMonth = viewMonth.getFullYear() === now.getFullYear() && viewMonth.getMonth() === now.getMonth();
  if (isCurrentMonth) return null;
  return (
    <button style={styles.btnToday} onClick={() => setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>
      Hoy
    </button>
  );
}

// Input de ícono (categorías y cuentas de Money Manager) — un solo emoji,
// opcional. Se escribe con el teclado de emoji nativo (Mac/iPhone ya lo
// traen), no hace falta un picker propio. Si pegan/escriben más de un emoji,
// se queda solo con el primero — así nunca queda ambigüedad de "cuál es el
// ícono" si alguien pone 2 o 3 sin querer.
export function IconInput({ value, onChange }) {
  const handleChange = (e) => {
    const raw = e.target.value;
    if (!raw) { onChange(""); return; }
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = [...segmenter.segment(raw)][0]?.segment || "";
    onChange(/\p{Extended_Pictographic}/u.test(first) ? first : "");
  };
  return (
    <input
      style={{ ...styles.input, width: 52, textAlign: "center", fontSize: 20, padding: "7px 0", flexShrink: 0 }}
      value={value || ""}
      onChange={handleChange}
      placeholder="🙂"
      maxLength={8}
      aria-label="Ícono (opcional)"
    />
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
