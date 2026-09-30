import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Info, Trash2, User, X } from "lucide-react";
import { styles } from "../lib/styles.js";
import { ICON_OPTIONS } from "../lib/moneyManagerData.js";

const MONTH_LABEL = (d) => d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

// Único toggle de la app — label arriba (igual que cualquier otro campo),
// switch dentro de una caja con el mismo estilo que un input. Componentizado
// a propósito: ya se desalineó dos veces por copiarlo a mano (uno quedó en
// negrilla por error, otro heredó la negrilla del label sin querer).
export function ToggleField({ label, description, checked, onChange, disabled }) {
  return (
    <label style={styles.label}>
      {label}
      <div style={{ ...styles.input, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontWeight: 400, padding: "7px 13px" }}>
        <span style={{ fontSize: 13, color: "#6B6355", lineHeight: 1.4 }}>{description}</span>
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

// Ícono de "i" que al tocarlo muestra un globo de texto explicativo — para
// campos cuyo nombre no alcanza a explicar qué hacen (ej. "Fecha de
// liquidación"). Con "click", no "hover": esta app es mobile-first, hover no
// existe en touch. Se cierra solo al tocar afuera (mismo mecanismo que
// PickerField).
let infoTooltipInstanceCounter = 0;

export function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++infoTooltipInstanceCounter;

  // Si se abre OTRO tooltip, este se cierra solo — mismo mecanismo que
  // PickerField (nunca hay dos abiertos a la vez).
  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("mm-info-open", { detail: idRef.current }));
  }, [open]);
  useEffect(() => {
    const onOtherOpen = (e) => { if (e.detail !== idRef.current) setOpen(false); };
    window.addEventListener("mm-info-open", onOtherOpen);
    return () => window.removeEventListener("mm-info-open", onOtherOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ background: "none", border: "none", padding: 0, display: "flex", color: "#4A6FA5", cursor: "pointer" }}
        aria-label="Más información"
      >
        <Info size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: 210, background: "#2B2620", color: "#fff", fontSize: 12, fontWeight: 400, fontFamily: "system-ui, sans-serif", padding: "8px 10px", borderRadius: 8, lineHeight: 1.4, zIndex: 20 }}>
          {text}
        </div>
      )}
    </span>
  );
}

// Envuelve un campo (label + el input/select/picker que le pases adentro),
// con ícono de info opcional al lado del label. Usa <label> nativo cuando NO
// hay info (así tocar el texto enfoca el input, gratis) — con info pasa a
// <div>, porque un <label> con un <button> adentro (el del ícono) reenvía el
// click al botón en vez de al input real (ver DESIGN_NOTES.md).
// `required` agrega el asterisco junto al label; `error` (solo se muestra si
// se pasa un string no vacío — el llamador decide cuándo, típicamente en
// blur o al intentar guardar) agrega el texto de ayuda en rojo debajo.
export function Field({ label, info, required, error, style, children }) {
  const Wrapper = info ? "div" : "label";
  // Envuelto en un solo <span> siempre (no un fragment) — el wrapper es
  // flex-column, así que label+asterisco sueltos como hijos directos
  // quedaban cada uno en su propia fila en vez de en la misma línea.
  const labelContent = (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {label}
      {required && <span style={{ color: "#B0473A" }}>*</span>}
    </span>
  );
  return (
    <Wrapper style={{ ...styles.label, ...style }}>
      {info ? (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {labelContent}
          <InfoTooltip text={info} />
        </span>
      ) : labelContent}
      {children}
      {error && <span style={{ fontSize: 12, fontWeight: 400, color: "#B0473A" }}>{error}</span>}
    </Wrapper>
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

// Deslizar horizontalmente el body cambia de mes (Transacciones y
// Estadísticas) — mismo destino que las flechas de MonthNav. Se exige que
// el gesto sea bien horizontal (mucho más ancho que alto) para no robarle
// el scroll vertical normal de la lista.
export function useMonthSwipe(viewMonth, setViewMonth) {
  const startRef = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!startRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    startRef.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const dir = dx < 0 ? 1 : -1; // deslizar a la izquierda = mes siguiente
      setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + dir, 1));
    }
  };
  return { onTouchStart, onTouchEnd };
}

// Anima la entrada del body cada vez que cambia el mes (con flechas o con
// swipe) — sin esto, un swipe rápido no se distingue de "no pasó nada" hasta
// que cambian los números. Devuelve key+className: la key fuerza a React a
// remontar el contenedor (así la animación CSS arranca de nuevo cada vez),
// y la clase decide de qué lado entra según hacia dónde se movió el mes.
export function useMonthSlide(viewMonth) {
  const prevRef = useRef(viewMonth);
  const [dir, setDir] = useState("mm-slide-next");
  useEffect(() => {
    const prev = prevRef.current;
    if (prev.getTime() !== viewMonth.getTime()) {
      setDir(viewMonth.getTime() > prev.getTime() ? "mm-slide-next" : "mm-slide-prev");
      prevRef.current = viewMonth;
    }
  }, [viewMonth]);
  return { key: viewMonth.getTime(), className: dir };
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

// Selector de ícono (categorías y cuentas de Money Manager) — botón compacto
// que abre una grilla con la misma lista curada de emojis, agrupada por
// tema. Antes fue un input de texto libre (no confiable: no abre el teclado
// de emoji solo en mobile, sin atajo simple en desktop) y después un
// `<select>` nativo (funcionaba pero ocupaba más lista que grilla) — la
// grilla ahorra espacio y se ve todo de un vistazo, sin depender de ningún
// teclado del sistema.
export function IconInput({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  // El input queda libre mientras se escribe (sin transformar en cada tecla —
  // eso rompía el borrado con backspace). La limpieza (quedarse con el primer
  // emoji real, por si pegan varios) se hace recién al confirmar.
  const applyCustom = () => {
    const trimmed = custom.trim();
    if (!trimmed) return;
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = [...segmenter.segment(trimmed)][0]?.segment || "";
    if (!/\p{Extended_Pictographic}/u.test(first)) return;
    onChange(first);
    setCustom("");
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          ...styles.input, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0, cursor: "pointer", padding: 4, width: 44,
          appearance: "none", WebkitAppearance: "none", textAlign: "center",
        }}
        aria-label="Elegir ícono"
      >
        {/* "➖" es un emoji real (misma fuente que el resto de los íconos) —
            centra igual que cualquier ícono elegido, a diferencia del guion
            de texto plano "—" que usa otra fuente y se ve descentrado. Solo
            es el marcador visual de "vacío": en la base se sigue guardando
            null/"". */}
        <span style={{ lineHeight: 1 }}>{value || "➖"}</span>
      </button>
      {open && (
        <Modal title="Elegir ícono" onClose={() => setOpen(false)}>
          <div className="no-scrollbar" style={{ maxHeight: "70vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            <button style={{ ...styles.btnSecondary, marginTop: 0 }} onClick={() => { onChange(""); setOpen(false); }}>
              Sin ícono
            </button>
            {ICON_OPTIONS.map((g) => (
              <div key={g.group}>
                <p style={{ ...styles.label, marginBottom: 6 }}>{g.group}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {g.icons.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => { onChange(ic); setOpen(false); }}
                      style={{
                        width: 40, height: 40, fontSize: 20, borderRadius: 10,
                        border: ic === value ? "2px solid #C75D3B" : "1px solid #DDD2BE",
                        background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      aria-label={`Ícono ${ic}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p style={{ ...styles.label, marginBottom: 6 }}>Personalizado</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="icon-inset-focus"
                  style={{ ...styles.input, width: 56, textAlign: "center", fontSize: 20, flexShrink: 0 }}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onBeforeInput={(e) => {
                    // Bloquea la inserción de texto que no sea emoji (backspace/borrar
                    // no dispara esto — solo pasa por acá cuando se INSERTA contenido,
                    // así que no interfiere con el borrado).
                    if (e.data && !/\p{Extended_Pictographic}/u.test(e.data)) e.preventDefault();
                  }}
                  onKeyDown={(e) => e.key === "Enter" && applyCustom()}
                  placeholder="😀"
                  aria-label="Ícono personalizado"
                />
                <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0, opacity: custom ? 1 : 0.5 }} onClick={applyCustom} disabled={!custom}>
                  Usar este
                </button>
              </div>
              <p style={{ ...styles.muted, padding: 0, fontSize: 12.5, margin: "6px 0 0" }}>Solo se aceptan emojis.</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// Regla de fricción para acciones destructivas (a propósito, dos niveles):
// 1) Confirmación de un clic (este componente): para acciones de alcance acotado
//    y que no borran historial compartido — borrar un gasto, quitar un miembro,
//    cerrar sesión, cancelar una invitación.
// 2) Escribir "Confirmar" a mano: reservado solo para borrar el grupo completo,
//    porque destruye el historial de TODOS los miembros sin posibilidad de deshacer.
// `danger` (default true) = acción destructiva → botón rojo (borrar). Con
// `danger={false}` el botón de confirmar usa el color primario en vez de
// rojo — para reusar la misma caja en confirmaciones NO destructivas (ej.
// guardar un cambio). `radius` debe matchear el borderRadius de la fila/
// input de arriba (10 por defecto, el más común) — el caller es responsable
// de achatar las esquinas de ABAJO de esa fila mientras el confirm está
// abierto, y de que el contenedor de los dos no tenga gap, para que quede
// pegado como una sola tarjeta (ver "Quitar persona" en SplitLedgerTab.jsx).
export function ConfirmInline({ title, message, confirmLabel = "Confirmar", onCancel, onConfirm, style, danger = true, confirmDisabled = false, radius = 10 }) {
  return (
    <div style={{ ...styles.confirmBox, borderRadius: `0 0 ${radius}px ${radius}px`, ...style }}>
      {title && <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>{title}</p>}
      {message && <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-line" }}>{message}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: message ? 10 : 0 }}>
        <button style={{ ...styles.btnGhostSmall, flex: 1, justifyContent: "center" }} onClick={onCancel}>Cancelar</button>
        <button
          style={danger ? { ...styles.btnDangerSmall, flex: 1 } : { ...styles.btnPrimarySmall, flex: 1, opacity: confirmDisabled ? 0.5 : 1 }}
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

// Popup centrado con fondo oscuro — para confirmaciones fuertes (ej. borrar un grupo entero).
// El título va en la misma fila que la X (ahorra alto en vez de reservar
// espacio arriba para la X y después repetir el título como texto aparte).
export function Modal({ title, onClose, children }) {
  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: "system-ui, sans-serif", color: "#2B2620" }}>{title}</p>
          <button style={{ ...styles.iconBtnGhost, flexShrink: 0 }} onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Barra fija abajo de la pantalla (botones principales de guardar/cancelar/etc.)
export function Footer({ children }) {
  return <div style={styles.footer}>{children}</div>;
}

// Selector en grilla (categoría/cuenta en Money Manager) — en vez de abrir el
// picker nativo del navegador, toca el campo y despliega una grilla de
// ícono+nombre justo debajo, como en la app original. `groups` es
// [{ label, items: [{ value, label, icon }] }] — pasar `label: null` para
// una lista plana sin encabezados (ej. categorías, que no se agrupan).
let pickerInstanceCounter = 0;

export function PickerField({ value, onChange, groups, placeholder = "Elegir", onClear, onBlur }) {
  const [open, setOpen] = useState(false);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++pickerInstanceCounter;
  const containerRef = useRef(null);
  const selected = groups.flatMap((g) => g.items).find((it) => it.value === value);

  // No hay blur nativo (esto no es un <input>) — se dispara "onBlur" cuando
  // el desplegable se cierra, sea por elegir algo, click afuera, o que se
  // abrió otro picker. Mismo momento en que un <select> real dispararía blur.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) onBlur?.();
    wasOpenRef.current = open;
  }, [open, onBlur]);

  // Si se abre OTRO picker, este se cierra solo — nunca hay dos abiertos a
  // la vez (se avisan entre ellos con un evento propio, en vez de levantar
  // el estado al padre, que tendría que coordinar N pickers distintos).
  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("mm-picker-open", { detail: idRef.current }));
  }, [open]);
  useEffect(() => {
    const onOtherOpen = (e) => { if (e.detail !== idRef.current) setOpen(false); };
    window.addEventListener("mm-picker-open", onOtherOpen);
    return () => window.removeEventListener("mm-picker-open", onOtherOpen);
  }, []);

  // Click afuera de este picker (mientras está abierto) lo cierra. A
  // propósito con "click", no "mousedown": si cierra en mousedown, la
  // página se reacomoda ANTES de que termine el click (mousedown → mouseup
  // → click), y el click termina cayendo en otro elemento que se corrió a
  // ese lugar — justo el bug de "toco Cuenta, cierra Categoría pero no
  // abre Cuenta". Con "click" todo se resuelve en el mismo evento.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [open]);

  const clearable = !!(onClear && selected);

  return (
    <div ref={containerRef}>
      {/* Wrapper propio solo para el botón+X — si el "relative" viviera en
          containerRef (que también envuelve la grilla abierta), el 50% de
          top se calculaba sobre esa altura total y la X terminaba flotando
          a mitad de la grilla en vez de centrada en el input. */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ ...styles.input, width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderRadius: open ? "10px 10px 0 0" : 10, paddingRight: clearable ? 34 : undefined }}
        >
          {selected ? (
            <>
              {selected.icon && <span>{selected.icon}</span>}
              <span style={selected.deleted ? { textDecoration: "line-through", color: "#B0473A" } : undefined}>{selected.label}</span>
              {selected.deleted && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 1, color: "#B0473A" }}>
                  (<Trash2 size={12} />)
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "#A89A87", fontSize: 13 }}>{placeholder}</span>
          )}
        </button>
        {clearable && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onClear(); }}
            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 6, display: "flex", color: "#A89A87" }}
            aria-label="Quitar selección"
          >
            <X size={15} />
          </button>
        )}
      </div>
      {open && (
        <div style={{ border: "1px solid #DDD2BE", borderTop: "none", borderRadius: "0 0 10px 10px", background: "#fff", overflow: "hidden" }}>
          {groups.map((g) => (
            <div key={g.label || "flat"}>
              {g.label && (
                <p style={{ margin: 0, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#A8754A", textTransform: "uppercase", letterSpacing: "0.04em", background: "#FAF7F2", borderBottom: "1px solid #F0EBE2" }}>
                  {g.label}
                </p>
              )}
              {/* gap+background en vez de borderRight/borderBottom por celda:
                  así no queda un borde doble justo en el borde de afuera de
                  la grilla (se veía como un efecto raro ahí). */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "#F0EBE2" }}>
                {g.items.map((it) => (
                  <button
                    type="button"
                    key={it.value}
                    onClick={() => { onChange(it.value); setOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "10px 8px", fontSize: 12.5, fontFamily: "system-ui, sans-serif",
                      border: "none", background: it.value === value ? "#FBEDE7" : "#fff", color: "#2B2620", textAlign: "left", cursor: "pointer", minWidth: 0,
                    }}
                  >
                    {it.icon && <span style={{ flexShrink: 0 }}>{it.icon}</span>}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...(it.deleted ? { textDecoration: "line-through", color: "#B0473A" } : null) }}>
                      {it.label}
                    </span>
                    {it.deleted && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 1, flexShrink: 0, color: "#B0473A" }}>
                        (<Trash2 size={12} />)
                      </span>
                    )}
                  </button>
                ))}
                {/* Celdas vacías al final de la última fila — mismo gris que
                    usa la app original en vez de dejarlas en blanco. */}
                {Array.from({ length: (3 - (g.items.length % 3)) % 3 }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ background: "#F5F1E8" }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
