import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Ban, Camera, Check, ChevronLeft, ChevronRight, Eye, EyeOff, Info, Lock, Trash2, User, X } from "lucide-react";
import { styles } from "../lib/styles.js";
import { ICON_OPTIONS } from "../lib/evenCapitalData.js";
import { money, parseAmountInput, todayInputValue } from "../lib/helpers.jsx";

const MONTH_LABEL = (d) => d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

// Texto del label de una fila sin caja (ToggleField/PickerField rowLabel/
// DateRow/TextRow/CurrencyConversionField) -- tope de 2 líneas con "…" en
// la 3ra. Sin esto, un label largo (ej. "Cuenta por defecto en gastos
// propios/ajenos", EvenGroupCapitalLink) le dejaba casi nada de ancho al
// valor de al lado, que terminaba partiéndose solo en 2 líneas sin avisar
// (visto en vivo en un iPhone angosto) -- el contenedor de afuera limita el
// label a 50% del ancho de la fila (ver cada uso), esto es lo que permite
// que, llegado ese tope, el texto pase a una 2da línea en vez de desbordar.
const rowLabelTextStyle = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "normal",
};

// Logo de EvenGroup (el nudo de cintas entrelazadas) — se usa como
// marca/badge para señalar "esto está vinculado a EvenCapital" (lista de
// grupos, selector de grupo al cargar un gasto). Colores propios del logo,
// no currentColor — es una marca, no un ícono que deba heredar el color del
// texto que lo rodea.
export function EvenGroupIcon({ size = 18, color = "#ba5331", style }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width={size} height={size} style={style}>
      <path d="M 1298 1156 L 1280 1136 L 1242 1105 L 1144 1043 L 1112 1069 L 1076 1105 L 1051 1135 L 1016 1185 L 963 1279 L 943 1308 L 915 1339 L 890 1359 L 859 1374 L 835 1379 L 805 1379 L 776 1372 L 747 1358 L 730 1345 L 707 1320 L 699 1308 L 687 1281 L 682 1262 L 679 1236 L 682 1201 L 695 1161 L 624 1101 L 571 1048 L 556 1071 L 547 1089 L 530 1138 L 522 1188 L 522 1229 L 524 1250 L 530 1285 L 536 1307 L 548 1340 L 562 1369 L 581 1400 L 601 1427 L 624 1453 L 648 1475 L 666 1489 L 704 1513 L 736 1528 L 756 1535 L 788 1543 L 810 1546 L 840 1547 L 866 1545 L 901 1538 L 946 1521 L 981 1501 L 1023 1468 L 1053 1437 L 1075 1410 L 1141 1317 L 1198 1246 L 1243 1201 Z" fill={color} fillRule="evenodd" />
      <path d="M 1154 727 L 1140 740 L 1112 779 L 1049 890 L 1080 931 L 1108 960 L 1138 987 L 1191 1026 L 1268 1075 L 1296 1097 L 1322 1123 L 1341 1147 L 1358 1180 L 1365 1203 L 1368 1221 L 1367 1252 L 1358 1286 L 1348 1307 L 1334 1327 L 1312 1349 L 1281 1368 L 1258 1376 L 1241 1379 L 1211 1379 L 1195 1376 L 1170 1368 L 1158 1362 L 1101 1441 L 1056 1492 L 1088 1514 L 1120 1529 L 1147 1538 L 1190 1546 L 1238 1546 L 1269 1541 L 1309 1529 L 1359 1504 L 1381 1489 L 1411 1464 L 1435 1440 L 1457 1413 L 1477 1383 L 1498 1342 L 1513 1300 L 1521 1263 L 1524 1236 L 1525 1201 L 1523 1172 L 1517 1138 L 1505 1100 L 1482 1056 L 1458 1023 L 1437 999 L 1393 956 L 1286 868 L 1241 828 L 1191 775 Z" fill={color} fillRule="evenodd" />
      <path d="M 1522 778 L 1517 750 L 1505 708 L 1494 682 L 1477 650 L 1460 624 L 1438 596 L 1397 556 L 1365 532 L 1345 520 L 1323 509 L 1294 498 L 1268 491 L 1238 486 L 1181 486 L 1145 493 L 1104 508 L 1062 532 L 1027 560 L 998 589 L 977 614 L 900 721 L 856 775 L 803 829 L 779 850 L 747 874 L 776 903 L 810 930 L 902 989 L 945 953 L 970 927 L 993 899 L 1026 851 L 1068 775 L 1088 743 L 1108 716 L 1138 685 L 1162 668 L 1191 655 L 1222 650 L 1243 651 L 1271 658 L 1296 670 L 1314 683 L 1338 709 L 1346 721 L 1358 746 L 1367 782 L 1368 807 L 1366 825 L 1360 849 L 1352 870 L 1430 937 L 1476 984 L 1502 938 L 1511 915 L 1518 889 L 1525 833 Z" fill={color} fillRule="evenodd" />
      <path d="M 805 486 L 777 491 L 747 500 L 722 510 L 684 531 L 664 545 L 630 574 L 610 595 L 587 624 L 566 657 L 552 684 L 542 708 L 533 737 L 526 769 L 522 803 L 524 864 L 531 899 L 546 941 L 562 971 L 594 1015 L 612 1035 L 662 1083 L 736 1143 L 803 1201 L 861 1263 L 892 1304 L 908 1288 L 933 1253 L 973 1179 L 996 1141 L 962 1096 L 920 1055 L 872 1017 L 764 945 L 721 905 L 697 871 L 685 842 L 679 808 L 680 781 L 685 757 L 699 724 L 715 701 L 739 678 L 756 667 L 779 657 L 814 650 L 830 650 L 851 653 L 871 659 L 889 668 L 943 593 L 991 540 L 991 538 L 972 524 L 947 510 L 898 492 L 852 485 Z" fill={color} fillRule="evenodd" />
    </svg>
  );
}

// Único toggle de la app — label arriba (igual que cualquier otro campo),
// switch dentro de una caja con el mismo estilo que un input. Componentizado
// a propósito: ya se desalineó dos veces por copiarlo a mano (uno quedó en
// negrilla por error, otro heredó la negrilla del label sin querer).
// Fila label-izquierda/switch-derecha, sin caja (mismo lenguaje que el resto
// de los campos del formulario) -- `description` es la explicación FIJA de
// qué hace el toggle (siempre presente, va junto al LABEL, como cualquier
// otro ícono de información); `blockedReason`, en cambio, es la explicación
// de por qué está deshabilitado AHORA MISMO (solo mientras `disabled` sea
// true) -- va junto al SWITCH, a su izquierda, no al label, para que quede
// claro que es sobre el control, no sobre el campo en general (mismo
// criterio que el candado de `lockedValue` en los demás campos, aunque acá
// cae a la izquierda del switch y no a la derecha del valor, porque el
// switch ya está pegado al borde derecho de la fila).
export function ToggleField({ label, description, checked, onChange, disabled, error, blockedReason }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#6B6355" }}>
          {/* Sin el tope de 50%/2 líneas que sí llevan PickerField/DateRow/
              TextRow: ahí protege el espacio del valor de al lado, pero acá
              el switch siempre mide lo mismo (no compite por espacio), así
              que el label simplemente envuelve libre si hace falta -- de
              paso evita un bug real de Safari/iOS encontrado en vivo
              (texto duplicado) al combinar `-webkit-line-clamp` con el
              switch animado de al lado.
              La opacidad de "deshabilitado" va en un span propio, SOLO
              alrededor del texto -- puesta en toda la fila (como antes),
              también apagaba el ícono de info Y, lo que es peor, el globo
              de texto que abre al tocarlo (la opacidad de un contenedor
              afecta a todo lo que tenga adentro, incluido lo que se dibuja
              `position:absolute` por fuera de su caja visual), justo cuando
              `blockedReason` existe PARA explicar por qué está apagado -- se
              volvía casi ilegible. */}
          <span style={{ opacity: disabled ? 0.6 : 1 }}>{label}</span>
          {/* Si está bloqueado, el ⓘ de "qué hace esto" se saca -- ahí lo
              único relevante es POR QUÉ no se puede tocar ahora (el 🚫 de
              `blockedReason`, del otro lado), no una explicación general que
              en ese momento no sirve de nada. */}
          {description && !(disabled && blockedReason) && <InfoTooltip text={description} />}
        </span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          {disabled && blockedReason && <InfoTooltip text={blockedReason} blocked />}
          <button
            onClick={() => onChange(!checked)}
            disabled={disabled}
            style={{ width: 44, height: 26, borderRadius: 13, border: "none", background: checked ? "#C75D3B" : "#D9CFC1", position: "relative", cursor: disabled ? "default" : "pointer", flexShrink: 0, opacity: disabled ? 0.6 : 1 }}
            aria-label={label}
          >
            <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
          </button>
        </div>
      </div>
      {error && <p style={{ margin: 0, fontSize: 12, fontFamily: "system-ui, sans-serif", color: "#B0473A" }}>{error}</p>}
    </div>
  );
}

// Ícono de "i" que al tocarlo muestra un globo de texto explicativo — para
// campos cuyo nombre no alcanza a explicar qué hacen (ej. "Fecha de
// liquidación"). Con "click", no "hover": esta app es mobile-first, hover no
// existe en touch. Se cierra solo al tocar afuera (mismo mecanismo que
// PickerField).
let infoTooltipInstanceCounter = 0;

// `blocked`: para texto que explica por qué algo está deshabilitado (no un
// dato de más), usa el ícono de "prohibido" en vez del de información, para
// no confundir "esto es un dato" con "esto no se puede hacer".
export function InfoTooltip({ text, blocked }) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [horizontalShift, setHorizontalShift] = useState(0);
  const ref = useRef(null);
  const boxRef = useRef(null);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++infoTooltipInstanceCounter;

  // Se ancla desde la derecha del ícono por defecto (ver más abajo), lo que
  // asume que el ícono está cerca del borde derecho — cierto con labels
  // largos ("Cuenta por defecto en gastos ajenos"), pero con uno corto
  // ("Cuenta de lo prestado") el ícono queda más a la izquierda y el mismo
  // ancho fijo se sale por el borde IZQUIERDO en vez del derecho. Por eso
  // se mide (alto Y ancho) después de pintarlo en su posición default, y se
  // corrige para cualquiera de los dos bordes, sin asumir en cuál label cae.
  // useLayoutEffect (no useEffect): mide ANTES de que el navegador pinte ese
  // frame, así que si hay que corregirlo no se alcanza a ver el salto.
  useLayoutEffect(() => {
    if (!open) { setOpenUpward(false); setHorizontalShift(0); return; }
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (rect.bottom > window.innerHeight) setOpenUpward(true);
    const PADDING = 8;
    if (rect.left < PADDING) setHorizontalShift(PADDING - rect.left);
    else if (rect.right > window.innerWidth - PADDING) setHorizontalShift(window.innerWidth - PADDING - rect.right);
  }, [open]);

  // Si se abre OTRO tooltip, este se cierra solo — mismo mecanismo que
  // PickerField (nunca hay dos abiertos a la vez).
  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("ec-info-open", { detail: idRef.current }));
  }, [open]);
  useEffect(() => {
    const onOtherOpen = (e) => { if (e.detail !== idRef.current) setOpen(false); };
    window.addEventListener("ec-info-open", onOtherOpen);
    return () => window.removeEventListener("ec-info-open", onOtherOpen);
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
      {/* `<span role="button">`, no un `<button>` de verdad: esto puede
          terminar anidado adentro de OTRO botón (ej. la fila entera de un
          `PickerField rowLabel`, que es un solo `<button>` clickeable) —
          HTML no permite un botón adentro de otro, y el navegador rompe el
          comportamiento de ambos. Mismo truco que ya usa la "X" de limpiar
          selección de `PickerField`, acá abajo. */}
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ display: "flex", color: blocked ? "#B0473A" : "#4A6FA5", cursor: "pointer" }}
        aria-label={blocked ? "Por qué está deshabilitado" : "Más información"}
      >
        {blocked ? <Ban size={14} /> : <Info size={14} />}
      </span>
      {open && (
        // Anclado desde la derecha del ícono (no desde la izquierda): en los
        // campos con label largo (ej. "Cuenta por defecto en gastos ajenos")
        // el ícono queda cerca del borde derecho de la pantalla, y un ancho
        // fijo creciendo hacia la derecha se salía del viewport en mobile.
        <div ref={boxRef} style={{ position: "absolute", ...(openUpward ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }), right: 0, transform: horizontalShift ? `translateX(${horizontalShift}px)` : undefined, width: "min(210px, calc(100vw - 40px))", background: "#2B2620", color: "#fff", fontSize: 12, fontWeight: 400, fontFamily: "system-ui, sans-serif", padding: "8px 10px", borderRadius: 8, lineHeight: 1.4, whiteSpace: "pre-line", zIndex: 20 }}>
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
export function Field({ label, info, infoBlocked, required, error, style, children }) {
  // Siempre "div", nunca <label>: un <label> reenvía el click a su primer
  // control "labelable" interno aunque el click haya caído en un elemento
  // con pointer-events:none (ej. el título de grupo o una celda vacía de
  // PickerField) — eso cerraba el desplegable sin seleccionar nada, un bug
  // real de reenvío nativo del navegador, no de bubbling (stopPropagation
  // no lo frenaba).
  const Wrapper = "div";
  // Envuelto en un solo <span> siempre (no un fragment) — el wrapper es
  // flex-column, así que label+asterisco sueltos como hijos directos
  // quedaban cada uno en su propia fila en vez de en la misma línea.
  // Sin gap acá adentro (a propósito): el asterisco va pegado al label, no
  // separado -- mismo espaciado que ya quedó en PickerField/ToggleField
  // (ver `blockedReason`/`info` ahí) tras separar la opacidad de
  // "deshabilitado" en su propio span. El gap de afuera (ver más abajo,
  // entre esto y el ⓘ) sigue igual.
  const labelContent = (
    <span style={{ display: "flex", alignItems: "center" }}>
      {label}
      {required && <span style={{ color: "#B0473A" }}>*</span>}
    </span>
  );
  return (
    <Wrapper style={{ ...styles.label, ...style }}>
      {/* Sin label (ej. PickerField en modo "row", que ya dibuja su propia
          etiqueta a la izquierda de la fila) — Field se usa solo por el
          error de abajo, no hay nada que mostrar arriba de children. */}
      {label ? (info ? (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {labelContent}
          <InfoTooltip text={info} blocked={infoBlocked} />
        </span>
      ) : labelContent) : null}
      {children}
      {error && <span style={{ fontSize: 12, fontWeight: 400, color: "#B0473A" }}>{error}</span>}
    </Wrapper>
  );
}

// Texto explicativo chico debajo de una fila/campo (ej. "Se usa solo si el
// asistente no logra leer la fecha...") — mismo estilo repetido en varios
// formularios, antes copiado a mano cada vez.
export function Hint({ children, color, style }) {
  // `color` solo se mete al objeto si vino de verdad: spread de
  // `color: undefined` (lo que pasaba antes acá, cuando no se pasaba la
  // prop) pisa el gris apagado de styles.muted con "sin color", heredando
  // el color de texto normal del padre en vez de quedarse apagado.
  return <p style={{ ...styles.muted, padding: 0, fontSize: 12.5, margin: 0, ...(color ? { color } : null), ...style }}>{children}</p>;
}

// Input de contraseña con el "ojito" para mostrar/ocultar en texto plano —
// mismo <input> de siempre, solo le agrega el ícono superpuesto y el padding
// para que el texto no quede debajo del botón.
export function PasswordInput({ style, visible: visibleProp, onToggleVisible, ...rest }) {
  // Sin visible/onToggleVisible (el caso de siempre), cada campo maneja su
  // propio mostrar/ocultar. Pasándolos, varios campos (ej. "nueva contraseña"
  // + "confirmar") comparten un solo mostrar/ocultar entre los dos.
  const [visibleState, setVisibleState] = useState(false);
  const visible = visibleProp !== undefined ? visibleProp : visibleState;
  const toggleVisible = onToggleVisible || (() => setVisibleState((v) => !v));
  return (
    <div style={{ position: "relative" }}>
      <input {...rest} type={visible ? "text" : "password"} style={{ ...style, width: "100%", boxSizing: "border-box", paddingRight: 38 }} />
      <button
        type="button"
        onClick={toggleVisible}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 4, display: "flex", color: "#A89A87", cursor: "pointer" }}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function TopBar({ title, onBack, right }) {
  return (
    <div style={styles.topBar}>
      {/* Siempre 3 hijos (aunque este quede vacío): el grid de 3 columnas
          ("1fr auto 1fr") ubica a sus hijos por orden de aparición, no por
          la columna "lógica" que cada uno debería ocupar — si este div no
          se renderizara cuando no hay onBack, el título pasaría a ocupar
          la primera columna en vez de la del medio y se vería descentrado. */}
      {onBack
        ? <button style={{ ...styles.iconBtnGhost, justifySelf: "start" }} onClick={onBack} aria-label="Volver"><ArrowLeft size={20} /></button>
        : <div />}
      <h2 style={styles.topBarTitle}>{title}</h2>
      <div style={{ display: "flex", justifySelf: "end" }}>{right}</div>
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
// `unit="year"` lo reusa el sub-tab Mensual del extracto de cuenta (desliza
// para cambiar de año en vez de mes) — mismo gesto, mismo umbral.
export function useMonthSwipe(viewMonth, setViewMonth, unit = "month") {
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
      const dir = dx < 0 ? 1 : -1; // deslizar a la izquierda = siguiente
      setViewMonth(unit === "year"
        ? new Date(viewMonth.getFullYear() + dir, viewMonth.getMonth(), 1)
        : new Date(viewMonth.getFullYear(), viewMonth.getMonth() + dir, 1));
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
  const [dir, setDir] = useState("ec-slide-next");
  useEffect(() => {
    const prev = prevRef.current;
    if (prev.getTime() !== viewMonth.getTime()) {
      setDir(viewMonth.getTime() > prev.getTime() ? "ec-slide-next" : "ec-slide-prev");
      prevRef.current = viewMonth;
    }
  }, [viewMonth]);
  return { key: viewMonth.getTime(), className: dir };
}

// Botón "Hoy" para el header (misma posición que el lápiz de Cuentas) — solo
// aparece si te alejaste del mes actual, para volver de un salto sin tener
// que contar flechitas.
// Banner "Filtros activos" — a propósito un elemento pegado al contenido
// (no un cambio de color/ícono en el header, fácil de no notar) para que no
// se te olvide que estás viendo una versión filtrada de Transacciones o
// Estadísticas. Tocar el cuerpo abre Filtros; la X (zona de toque propia,
// separada) los limpia directo — sin confirmar, porque es barato de
// deshacer (volvés a Filtros y los aplicás de nuevo, no se pierde nada).
export function FiltersActiveBanner({ onOpen, onClear }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 14px", borderRadius: 20, background: "#FBEDE7", border: "1px solid #EBC9BA" }}>
      <button type="button" onClick={onOpen} style={{ flex: 1, background: "none", border: "none", padding: 0, textAlign: "left", fontSize: 13, fontWeight: 600, fontFamily: "system-ui, sans-serif", color: "#C75D3B", cursor: "pointer" }}>
        Filtros activos
      </button>
      {/* Sin width/height ni padding propios: el botón de "quitar" mide lo
          que mide el ícono (15px) y nada más, para que el alto de toda la
          píldora lo termine dando el texto (igual que PendingRateBanner),
          no un cuadrado de hitbox más alto que el texto. */}
      <button type="button" onClick={onClear} aria-label="Quitar filtros" style={{ background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", color: "#C75D3B", cursor: "pointer" }}>
        <X size={15} />
      </button>
    </div>
  );
}

// Mismo look/patrón que FiltersActiveBanner (tocar el cuerpo abre el modal
// de comparar, la X la quita directo sin confirmar) -- pensado para vivir
// al lado de ese banner, 50/50, cuando los dos están activos a la vez (ver
// EstadisticasTab).
export function CompareActiveBanner({ onOpen, onClear }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 14px", borderRadius: 20, background: "#FBEDE7", border: "1px solid #EBC9BA" }}>
      <button type="button" onClick={onOpen} style={{ flex: 1, background: "none", border: "none", padding: 0, textAlign: "left", fontSize: 13, fontWeight: 600, fontFamily: "system-ui, sans-serif", color: "#C75D3B", cursor: "pointer" }}>
        Comparación activa
      </button>
      <button type="button" onClick={onClear} aria-label="Quitar comparación" style={{ background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", color: "#C75D3B", cursor: "pointer" }}>
        <X size={15} />
      </button>
    </div>
  );
}

// Mismo look que FiltersActiveBanner (sin botón de "quitar" — no hay nada
// que limpiar, solo se resuelve cargando la tasa) — tocarlo abre la primera
// transacción pendiente para completarla.
export function PendingRateBanner({ count, onOpen }) {
  return (
    <button type="button" onClick={onOpen} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 20, background: "#FBEDE7", border: "1px solid #EBC9BA", textAlign: "left", fontSize: 13, fontWeight: 600, fontFamily: "system-ui, sans-serif", color: "#C75D3B", cursor: "pointer" }}>
      {count === 1 ? "1 transacción pendiente de tasa de cambio" : `${count} transacciones pendientes de tasa de cambio`}
    </button>
  );
}

// Aviso de "Pendiente TC" (ver applyPendienteTcAutoSum en evenGroupSync.js,
// solo le sale a quien tiene esa automatización custom): un gasto de Split
// Ledger que ya había sumado algo ahí se borró después, y esa suma nunca se
// revierte sola (podría ya estar mezclada con otro mes). Un solo tap marca
// todo como revisado, no hay sub-pantalla: el usuario va a corregir el
// monto él mismo en Pendiente TC, esto solo es el recordatorio.
export function PendienteTcReviewBanner({ items, onAcknowledgeAll }) {
  const total = items.reduce((s, item) => s + Number(item.amount), 0);
  return (
    <button type="button" onClick={onAcknowledgeAll} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 20, background: "#FBEDE7", border: "1px solid #EBC9BA", textAlign: "left", fontSize: 13, fontWeight: 600, fontFamily: "system-ui, sans-serif", color: "#C75D3B", cursor: "pointer" }}>
      Revisá Pendiente TC: se borró {items.length === 1 ? "un gasto" : `${items.length} gastos`} que ya le había sumado {money(total, "EUR")} (toca para marcar como revisado)
    </button>
  );
}

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

// Selector de ícono (categorías y cuentas de EvenCapital) — botón compacto
// que abre una grilla con la misma lista curada de emojis, agrupada por
// tema. Antes fue un input de texto libre (no confiable: no abre el teclado
// de emoji solo en mobile, sin atajo simple en desktop) y después un
// `<select>` nativo (funcionaba pero ocupaba más lista que grilla) — la
// grilla ahorra espacio y se ve todo de un vistazo, sin depender de ningún
// teclado del sistema.
export function IconInput({ value, onChange, small = false, style }) {
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
        style={small
          // `small`: chip redondo sin caja (misma idea que el chip de
          // moneda `compact small` de PickerField) -- para vivir adentro de
          // una fila sin caja (ej. Nombre de una cuenta), no en un campo
          // boxeado de siempre.
          ? { width: 32, height: 32, borderRadius: 10, border: "none", background: "#F3ECE0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, cursor: "pointer", padding: 0, ...style }
          : {
              ...styles.input, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0, cursor: "pointer", padding: 4, width: 44,
              appearance: "none", WebkitAppearance: "none", textAlign: "center",
              ...style,
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
        // Hoja que sube desde abajo (mismo mecanismo que PickerField), no el
        // `Modal` centrado de siempre -- pero con una grilla propia, más
        // densa y SIN nombre debajo de cada ítem (acá no hay nada que
        // nombrar, es solo el emoji): mezcla del armazón de PickerField con
        // el contenido que ya tenía este selector.
        <div style={styles.sheetBackdrop} onClick={() => setOpen(false)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetHeader}>
              <span />
              <p style={styles.sheetTitle}>Elegir ícono</p>
              <button type="button" style={styles.sheetClose} onClick={() => setOpen(false)}>Cerrar</button>
            </div>
            <div className="no-scrollbar" style={{ ...styles.sheetBody, display: "flex", flexDirection: "column", gap: 14 }}>
              <button style={{ ...styles.btnSecondary, marginTop: 4 }} onClick={() => { onChange(""); setOpen(false); }}>
                Sin ícono
              </button>
              {ICON_OPTIONS.map((g) => (
                <div key={g.group}>
                  <p style={{ ...styles.label, marginBottom: 6 }}>{g.group}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {g.icons.map((ic) => {
                      const on = ic === value;
                      return (
                        <button
                          key={ic}
                          onClick={() => { onChange(ic); setOpen(false); }}
                          style={{
                            width: 44, height: 44, fontSize: 22, borderRadius: 14, border: "none",
                            background: on ? "#F6E6DE" : "#F3ECE0", boxShadow: on ? "inset 0 0 0 2px #C75D3B" : "none",
                            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                          }}
                          aria-label={`Ícono ${ic}`}
                        >
                          {ic}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div>
                <p style={{ ...styles.label, marginBottom: 6 }}>Personalizado</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="icon-inset-focus"
                    style={{ ...styles.input, width: 56, height: 56, padding: 0, textAlign: "center", fontSize: 28, flexShrink: 0 }}
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
          </div>
        </div>
      )}
    </>
  );
}

// Control segmentado (riel gris + píldora blanca que "flota" en la opción
// activa) — reemplaza el patrón viejo de 2+ botones independientes con su
// propio borde (`styles.tab`/`styles.tabActive`), que se confundía
// visualmente con los botones de acción reales (mismo relleno sólido). Acá
// la opción activa nunca es un relleno sólido, siempre una píldora blanca
// con el texto en color -- ese lenguaje queda reservado para Guardar/
// Aplicar/etc.
//
// `options`: [{ value, label, color, badge }]. `label` puede ser un nodo
// fijo o una función `(active) => nodo` (para texto/colores que cambian
// según si esa opción puntual está activa, ej. el monto debajo de "Ingresos"
// en Estadísticas). `color` pisa el naranja por defecto para ESA opción
// cuando está activa (ej. verde para Ingreso). `badge` es un nodo chico
// (punto o contador) superpuesto arriba a la derecha -- el botón ya tiene
// `position:"relative"`, no hace falta agregarlo en cada caller.
export function SegmentedControl({ options, value, onChange, disabled = false, style }) {
  return (
    <div style={{ display: "flex", gap: 3, background: "#ECE3D3", borderRadius: 10, padding: 3, opacity: disabled ? 0.6 : 1, ...style }}>
      {options.map((opt) => {
        const active = opt.value === value;
        const accent = opt.color || "#C75D3B";
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1, position: "relative", padding: "7px 0", borderRadius: 8, border: "none",
              background: active ? "#fff" : "transparent",
              color: active ? accent : "#6B6355",
              fontSize: 12.5, fontWeight: 600, fontFamily: "system-ui, sans-serif",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
              cursor: disabled ? "not-allowed" : "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}
          >
            {typeof opt.label === "function" ? opt.label(active) : opt.label}
            {opt.badge}
          </button>
        );
      })}
    </div>
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
// pegado como una sola tarjeta (ver "Quitar persona" en EvenGroupTab.jsx).
export function ConfirmInline({ title, message, confirmLabel = "Confirmar", onCancel, onConfirm, style, danger = true, confirmDisabled = false, radius = 10 }) {
  return (
    <div style={{ ...styles.confirmBox, borderRadius: `0 0 ${radius}px ${radius}px`, ...style }}>
      {title && <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>{title}</p>}
      {message && <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-line" }}>{message}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: message ? 10 : 0 }}>
        <button style={{ ...styles.btnGhostSmall, flex: 1, justifyContent: "center" }} onClick={onCancel}>Cancelar</button>
        <button
          style={{ ...(danger ? styles.btnDangerSmall : styles.btnPrimarySmall), flex: 1, opacity: confirmDisabled ? 0.5 : 1 }}
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

// Footer de Cancelar/acción con ratio 1/3 (Cancelar) - 2/3 (acción
// principal) — le da más peso visual al botón que de verdad importa, sin
// perder el de cancelar (ver PENDIENTES.md). Mismo patrón repetido en casi
// todos los formularios de la app; se va migrando acá a medida que se
// rediseña cada uno (no es un cambio retroactivo al Footer 50/50 viejo que
// todavía usan los formularios no tocados).
// `confirmDisabled` bloquea el click de verdad (ej. mientras se está
// guardando, para no mandar 2 veces) — `confirmDim` solo lo apaga
// visualmente (ej. formulario inválido) SIN bloquear el click, para que
// igual dispare la validación inline (mostrar "Este campo es
// obligatorio.", etc.) en vez de no hacer nada.
export function FormFooter({ onCancel, cancelLabel = "Cancelar", cancelDisabled = false, onConfirm, confirmLabel, confirmDisabled = false, confirmDim = false, confirmColor = "#C75D3B" }) {
  return (
    <Footer>
      <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onCancel} disabled={cancelDisabled}>
        {cancelLabel}
      </button>
      <button
        style={{ flex: 2, marginTop: 0, padding: "12px", borderRadius: 12, border: "none", background: confirmColor, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "system-ui, sans-serif", opacity: (confirmDisabled || confirmDim) ? 0.5 : 1 }}
        onClick={onConfirm}
        disabled={confirmDisabled}
      >
        {confirmLabel}
      </button>
    </Footer>
  );
}

// Selector en grilla (categoría/cuenta en EvenCapital) — toca el campo y
// sube una hoja desde abajo con una grilla de ícono+nombre (antes se
// desplegaba pegada al campo, empujando el resto del formulario — ver
// PENDIENTES.md). `groups` es [{ label, items: [{ value, label, icon }] }]
// — pasar `label: null` para una lista plana sin encabezados (ej.
// categorías, que no se agrupan). `title` es el título de la hoja (por
// defecto el mismo `placeholder`, que ya suele estar redactado para
// funcionar en los dos lugares, ej. "Elegí una cuenta").
let pickerInstanceCounter = 0;
// Canvas reusado para medir el ancho real del importe en CalculatorAmountInput
// (ver más abajo) — uno solo para toda la app, no uno por instancia del input.
let amountMeasureCtx = null;

// Tamaño de letra para un ícono de texto corto (ej. símbolo de moneda, "€"
// vs "COL$") según su largo REAL en caracteres visibles -- Array.from, no
// `.length`: un emoji como "🍕" cuenta como 2 con `.length` (par subrogado
// en JS) pero como 1 acá, así que los emojis de categorías/cuentas de
// siempre NUNCA se achican por error, solo texto de verdad largo (monedas).
function textIconFontSize(icon, base) {
  if (typeof icon !== "string") return base;
  const len = Array.from(icon).length;
  if (len <= 1) return base;
  const scale = { 2: 0.85, 3: 0.7, 4: 0.58 }[len] || 0.5;
  return Math.round(base * scale);
}

export function PickerField({ value, onChange, groups, placeholder = "Elegir", title, note, onClear, onBlur, disabled = false, emptyMessage = "No hay opciones para elegir.", openSignal, compact = false, small = false, rowLabel, info, blockedReason, required = false, listStyle = false, lockedValue = false }) {
  const [open, setOpen] = useState(false);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++pickerInstanceCounter;
  const selected = groups.flatMap((g) => g.items).find((it) => it.value === value);
  // Para el chip `small` (moneda): el símbolo se achica según cuántos
  // caracteres tiene (ej. "€" vs "COL$") para que siga entrando en el
  // cuadrado de 32x32 sin desbordarse -- la lista de monedas es fija y
  // conocida (CURRENCIES en helpers.jsx), alcanza con esto, no hace falta
  // medir en vivo con Canvas como hace CalculatorAmountInput.
  const smallIconFontSize = textIconFontSize(selected?.icon, 16);

  // Apertura "a control remoto": un padre que cambia `openSignal` (ej. un
  // contador que sube) abre este picker sin tener que levantar su estado
  // `open` entero acá (ej. el botón "Ok" de CalculatorAmountInput, que
  // confirma el importe y salta directo a elegir categoría).
  const firstOpenSignalRef = useRef(openSignal);
  useEffect(() => {
    if (openSignal !== undefined && openSignal !== firstOpenSignalRef.current) setOpen(true);
    firstOpenSignalRef.current = openSignal;
  }, [openSignal]);

  // No hay blur nativo (esto no es un <input>) — se dispara "onBlur" cuando
  // la hoja se cierra, sea por elegir algo, "Cerrar", o que se abrió otro
  // picker. Mismo momento en que un <select> real dispararía blur.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) onBlur?.();
    wasOpenRef.current = open;
  }, [open, onBlur]);

  // Si se abre OTRO picker, este se cierra solo — nunca hay dos abiertos a
  // la vez (se avisan entre ellos con un evento propio, en vez de levantar
  // el estado al padre, que tendría que coordinar N pickers distintos).
  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("ec-picker-open", { detail: idRef.current }));
  }, [open]);
  useEffect(() => {
    const onOtherOpen = (e) => { if (e.detail !== idRef.current) setOpen(false); };
    window.addEventListener("ec-picker-open", onOtherOpen);
    return () => window.removeEventListener("ec-picker-open", onOtherOpen);
  }, []);

  const clearable = !!(onClear && selected);

  // Variante "row": label a la izquierda, valor a la derecha, en la misma
  // fila, con un simple borde inferior en vez de la caja de un campo normal
  // (Cuenta/Categoría del formulario de transacción — ver PENDIENTES.md).
  // Toda la fila es el botón (sin chevron aparte): tocar en cualquier parte
  // abre la hoja. La "X" de limpiar, si aplica, vive inline junto al valor.
  const trigger = rowLabel ? (
    <button
      type="button"
      onClick={() => !disabled && setOpen(true)}
      // Sin el atributo `disabled` nativo (a propósito): un `<button disabled>`
      // bloquea TODA interacción adentro, incluido el 🚫 de `blockedReason`
      // que vive en su interior -- quedaba imposible de tocar. El bloqueo de
      // verdad ya lo hace el `!disabled` del onClick de acá arriba; esto solo
      // deja de usar el mecanismo nativo para no tapar a sus hijos.
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 40, padding: "0 2px", border: "none", borderBottom: "1px solid #ECE3D3", background: "transparent", textAlign: "left", fontFamily: "system-ui, sans-serif", cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <span style={{ ...rowLabelTextStyle, maxWidth: "50%", flexShrink: 0, fontSize: 13, color: "#6B6355" }}>
        {/* El ⓘ va ADENTRO del mismo bloque clampeado (no como hermano
            flex afuera) -- así fluye con el texto como una palabra más y
            cae pegado a donde sea que termine la última línea visible, en
            vez de quedar anclado al ancho de la línea más larga (que es lo
            que pasaba cuando era un hermano flex: su posición dependía del
            ancho de la CAJA, no de dónde termina el texto de verdad).
            La opacidad de "deshabilitado" va en un span propio, solo
            alrededor del texto -- mismo motivo que ya se resolvió en
            ToggleField: puesta en todo esto (como era antes), también
            apagaba el ⓘ y su globo de texto, justo cuando `blockedReason`
            existe PARA explicar por qué está apagado. */}
        <span style={{ opacity: disabled ? 0.6 : 1 }}>
          {rowLabel}
          {required && <span style={{ color: "#B0473A" }}>*</span>}
        </span>
        {/* Si está bloqueado, no tiene sentido TAMBIÉN explicar qué hace el
            campo en general -- lo único que importa ahí es por qué no se
            puede tocar ahora (el 🚫, del otro lado, junto al valor). */}
        {/* marginLeft a mano (no un `gap` del contenedor, que ya no es flex
            ahora que esto vive dentro del bloque clampeado): sin esto el ⓘ
            queda pegado contra el texto/asterisco, sin aire. verticalAlign
            también a mano -- un elemento inline dentro de `-webkit-box`
            alinea por defecto a la línea base del texto (como una letra
            más), y un ícono ahí se ve corrido hacia arriba; "middle" lo
            centra contra la línea como ya hacía el `alignItems:"center"`
            de flexbox antes de este cambio. */}
        {info && !(disabled && blockedReason) && <span style={{ marginLeft: 4, verticalAlign: "middle" }}><InfoTooltip text={info} /></span>}
      </span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flex: 1, fontSize: 13.5, minWidth: 0 }}>
        {/* `blockedReason` va del lado del VALOR (no del label, como `info`)
            -- mismo criterio que `ToggleField`, donde el 🚫 vive pegado al
            switch: explica por qué ESE control puntual está apagado, no el
            campo en general. Afuera del span de abajo (que sí se atenúa) para
            que el ⓘ/su globo de texto nunca queden atenuados. */}
        {disabled && blockedReason && <InfoTooltip text={blockedReason} blocked />}
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, color: selected ? "#2B2620" : "#A3968B", opacity: disabled ? 0.6 : 1 }}>
          {selected ? (
            <>
              {selected.icon && <span style={{ display: "inline-flex", alignItems: "center" }}>{selected.icon}</span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...(selected.deleted ? { textDecoration: "line-through", color: "#B0473A" } : null) }}>{selected.label}</span>
              {selected.deleted && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 1, color: "#B0473A", flexShrink: 0 }}>
                  (<Trash2 size={12} />)
                </span>
              )}
            </>
          ) : placeholder}
          {/* `lockedValue` (no `disabled` a secas: eso se usa en muchos otros
              lados por otras razones, ej. mientras se guarda) -- candado junto
              al VALOR, no a la etiqueta, para que se note mirando qué dice el
              campo, no solo su nombre. */}
          {lockedValue && <Lock size={11} color="#8A7F72" style={{ flexShrink: 0 }} />}
          {clearable && !disabled && (
            <span
              role="button"
              aria-label="Quitar selección"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onClear(); }}
              style={{ display: "inline-flex", color: "#A89A87", flexShrink: 0 }}
            >
              <X size={14} />
            </span>
          )}
        </span>
      </span>
    </button>
  ) : (
    // Wrapper propio solo para el botón+X — ya no envuelve nada más (la
    // hoja abierta vive aparte, fixed), así que esto podría ser directo el
    // botón, pero se deja el div relativo para la X.
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={compact
          // Si está disabled, no se ve como un botón (sin fondo ni borde) --
          // si de verdad no se puede tocar, que no lo parezca, en vez de
          // quedar como un botón activo atenuado.
          // Sin caja (disabled), el padding/minWidth de "botón" deja un hueco
          // vacío enorme al lado del importe -- esos valores eran para dar
          // lugar DENTRO de la caja, que ya no existe.
          // `small` (compact + no-hero, ej. Importe en fila de SettleUp):
          // mismo chip, pero a la altura de un texto normal de fila (40px),
          // no del tamaño "hero" (56px) -- sigue siendo tocable, a diferencia
          // de `disabled`.
          // `small`: un poco MENOS alto que la fila que lo contiene (no
          // 100%), para que quede un respiro arriba/abajo y no toque el
          // borde inferior de la fila -- antes quedaba pegado a esa línea.
          // `small` cuadrado: mismo ancho que alto (32x32), sin padding
          // horizontal -- con padding quedaba más ancho que alto.
          ? { fontFamily: "system-ui, sans-serif", color: "#2B2420", border: "none", borderRadius: small ? 10 : 14, minWidth: disabled ? 0 : (small ? 32 : 54), width: small ? 32 : undefined, height: disabled ? 56 : (small ? 32 : 56), background: disabled ? "transparent" : (open ? "#F6E6DE" : "#F3ECE0"), boxShadow: disabled ? "none" : (open ? "inset 0 0 0 2px #C75D3B" : "inset 0 0 0 1px #E7DFD2"), padding: disabled ? 0 : (small ? 0 : "0 10px"), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, transition: "background-color .15s, box-shadow .15s" }
          : { ...styles.input, width: "100%", height: 44, boxSizing: "border-box", textAlign: "left", display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, paddingRight: clearable ? 34 : undefined }}
      >
        {compact ? (
          // Chip apilado (símbolo grande arriba, código chico abajo) — igual
          // que el selector de moneda del mockup, no el chip inline ancho de
          // un picker normal.
          <>
            <span style={{ fontSize: small ? smallIconFontSize : 25, fontFamily: "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif", lineHeight: 1 }}>{selected?.icon || selected?.label || placeholder}</span>
            {/* Sin la caja (disabled) o en `small`, el símbolo + código
                apilados se ven descentrados/apretados -- en los dos casos
                queda solo el símbolo. */}
            {!disabled && !small && selected?.icon && <span style={{ marginTop: 4, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", color: "#6E625A" }}>{selected.label}</span>}
          </>
        ) : selected ? (
          <>
            {selected.icon && <span style={{ display: "inline-flex", alignItems: "center" }}>{selected.icon}</span>}
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
      {clearable && !disabled && (
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
  );

  return (
    <>
      {trigger}
      {open && (
        <div style={styles.sheetBackdrop} onClick={() => setOpen(false)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetHeader}>
              <span />
              <p style={styles.sheetTitle}>{title || placeholder}</p>
              <button type="button" style={styles.sheetClose} onClick={() => setOpen(false)}>Cerrar</button>
            </div>
            <div style={styles.sheetBody}>
              {note && (
                <p style={{ margin: "14px 4px 0", fontSize: 13.5, lineHeight: 1.5, color: "#6E625A", fontFamily: "system-ui, sans-serif" }}>
                  {note}
                </p>
              )}
              {groups.length === 0 && (
                <p style={{ margin: "16px 4px 0", fontSize: 13, color: "#A89A87", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
                  {emptyMessage}
                </p>
              )}
              {groups.map((g) => (
                <div key={g.label || "flat"}>
                  {g.label && (
                    <div style={styles.sheetGroupTitle}>
                      <span>{g.label}</span>
                      <span style={styles.sheetGroupRule} />
                    </div>
                  )}
                  {listStyle ? (
                    // Lista simple (sin ícono) — para opciones que son más
                    // "elegí una de esta lista" que "elegí este ícono" (ej.
                    // Frecuencia de una recurrencia). Check a la derecha en
                    // vez de grilla de cajitas.
                    <div>
                      {g.items.map((it) => {
                        const on = it.value === value;
                        return (
                          <button
                            type="button"
                            key={it.value}
                            onClick={() => { onChange(it.value); setOpen(false); }}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: 48, padding: "0 4px", border: "none", borderBottom: "1px solid #F0EBE2", background: "transparent", textAlign: "left", fontFamily: "system-ui, sans-serif", fontSize: 14.5, color: on ? "#C75D3B" : "#2B2420", fontWeight: on ? 600 : 400, cursor: "pointer" }}
                          >
                            {it.label}
                            {on && <Check size={16} color="#C75D3B" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={styles.sheetGrid}>
                      {g.items.map((it) => {
                        const on = it.value === value;
                        return (
                          <button type="button" key={it.value} style={styles.sheetTile} onClick={() => { onChange(it.value); setOpen(false); }}>
                            {/* Siempre la cajita, aunque no haya ícono (ej. una
                                categoría/cuenta vieja sin emoji asignado) — si
                                se omite del todo acá, la grilla pierde una
                                celda entera y todo lo que sigue se desalinea
                                (quedó así en nuestro propio "Otros"). Con texto
                                (1ra letra del nombre) en vez de vacía. */}
                            <span style={{ ...styles.sheetTileIcon, fontSize: textIconFontSize(it.icon, styles.sheetTileIcon.fontSize), ...(it.action ? { background: "#E8F1EB" } : null), ...(on ? styles.sheetTileIconOn : null), ...(it.icon ? null : { color: "#A89A87", fontWeight: 600 }) }}>
                              {it.icon || it.label?.trim()?.[0]?.toUpperCase() || "?"}
                            </span>
                            <span style={{ ...styles.sheetTileName, ...(on ? styles.sheetTileNameOn : null), ...(it.deleted ? { textDecoration: "line-through", color: "#B0473A" } : null) }}>
                              {it.label}{it.deleted ? " (borrada)" : ""}
                              {it.sublabel && <><br /><span style={{ fontSize: 11.5, fontWeight: 400, color: on ? "#C7A68E" : "#A89A87" }}>{it.sublabel}</span></>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// "Hoy, 23 Oct 2026" (o "Jue, 22 Oct 2026" si no es hoy) — las filas de
// fecha (Fecha de una transacción, Fecha de fin de una recurrencia, Fecha
// por defecto de una importación, etc.) muestran esto en vez de la fecha
// cruda del <input type="date">.
const capitalize = (s) => s.replace(/\.$/, "").replace(/^\p{L}/u, (c) => c.toUpperCase());
export function formatDateRow(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const isToday = dateStr === todayInputValue();
  const prefix = isToday ? "Hoy" : capitalize(d.toLocaleDateString("es-ES", { weekday: "short" }));
  const month = capitalize(d.toLocaleDateString("es-ES", { month: "short" }));
  return `${prefix}, ${d.getDate()} ${month} ${d.getFullYear()}`;
}

// Fila de fecha: label izquierda, valor formateado a la derecha, sin caja.
// El <input type="date"> real queda encima, invisible, para seguir
// abriendo el selector nativo del navegador/celular al tocar — no hay
// forma de "fingir" ese selector sin perder su UX nativa (rueditas en
// iOS, calendario en Android/desktop).
export function DateRow({ label, value, onChange, disabled = false, placeholder = "Elegir fecha", lockedValue = false }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif", opacity: disabled ? 0.6 : 1 }}>
        <span style={{ ...rowLabelTextStyle, maxWidth: "50%", flexShrink: 0, fontSize: 13, color: "#6B6355" }}>{label}</span>
        <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, textAlign: "right", fontSize: 13.5, color: value ? "#2B2620" : "#A3968B" }}>
          {value ? formatDateRow(value) : placeholder}
          {lockedValue && <Lock size={11} color="#8A7F72" style={{ flexShrink: 0 }} />}
        </span>
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", padding: 0, margin: 0, cursor: disabled ? "not-allowed" : "pointer" }}
      />
    </div>
  );
}

// Recorta un texto a un ancho en PÍXELES de verdad (no una cantidad de
// caracteres adivinada) — el ancho disponible de una fila varía con el
// dispositivo/tamaño de letra, así que un límite fijo de caracteres (lo que
// se probó primero) se pasa con textos de letras anchas y sobra con letras
// angostas. Búsqueda binaria + Canvas 2D (mismo truco que cualquier
// "truncate with ellipsis" fuera del CSS, necesario acá porque
// text-overflow:ellipsis no es confiable en <textarea>).
let rowMeasureCtx = null;
function truncateToWidth(text, maxWidth, font) {
  if (!rowMeasureCtx) rowMeasureCtx = document.createElement("canvas").getContext("2d");
  rowMeasureCtx.font = font;
  if (rowMeasureCtx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rowMeasureCtx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + "…";
}

// Mismo truco, pero al revés: recorta por el INICIO en vez del final (el
// "…" queda adelante, se conserva la COLA del texto) — para la expresión
// de la calculadora mientras se escribe, donde lo último tecleado (y el
// cursor) siempre tiene que quedar visible, nunca lo de más atrás.
function truncateFromStart(text, maxWidth, font) {
  if (!rowMeasureCtx) rowMeasureCtx = document.createElement("canvas").getContext("2d");
  rowMeasureCtx.font = font;
  if (rowMeasureCtx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rowMeasureCtx.measureText("…" + text.slice(mid)).width <= maxWidth) hi = mid;
    else lo = mid + 1;
  }
  return "…" + text.slice(lo).trimStart();
}

// Fila "label izquierda (ancho fijo) / input derecha, sin caja" para texto
// libre (Descripción/Nota de una transacción, y cualquier otro campo de
// texto corto de un formulario) — SIN hoja/modal (a diferencia de
// Cuenta/Categoría, que sí son selección-de-opciones): se escribe directo
// en la fila. `suggestions`, si viene no vacío, lista coincidencias debajo
// (autocompletar); onMouseDown (no onClick) para que el input no pierda el
// foco antes de registrar el tap. `multiline`: se ve como una fila de una
// sola línea cerrada, pero al enfocar crece para poder escribir/leer texto
// largo sin perderlo (label arriba, valor abajo, en vez de label-izquierda/
// valor-derecha en la misma línea).
export function TextRow({ label, value, onChange, onFocus, onBlur, placeholder, suggestions, onPickSuggestion, multiline = false }) {
  const [focused, setFocused] = useState(false);
  const taRef = useRef(null);
  useEffect(() => {
    if (!multiline) return;
    const el = taRef.current;
    if (!el) return;
    el.style.height = focused ? Math.min(el.scrollHeight, 160) + "px" : "";
  }, [focused, value, multiline]);

  // Colapsada (no enfocada): solo la 1ra línea, recortada al ancho REAL de
  // la fila (truncateToWidth) si hace falta — nunca se pierde nada (el
  // valor completo sigue en `value`, esto es solo lo que se VE cerrado).
  // Antes del primer montaje (taRef.current aún null) no hay ancho que
  // medir; ese primer render cae en el valor completo, se corrige solo en
  // cuanto el efecto de abajo dispara un re-render.
  const FONT = "16px system-ui, -apple-system, sans-serif";
  const [, forceMeasure] = useState(0);
  useLayoutEffect(() => { if (!focused) forceMeasure((n) => n + 1); }, [focused, value]);
  const collapsed = !value ? value : (() => {
    const firstLine = value.split("\n")[0];
    const hasMore = value.includes("\n");
    const width = taRef.current?.clientWidth;
    if (!width) return hasMore ? firstLine + "…" : firstLine; // antes del 1er montaje, sin ancho que medir
    if (!hasMore) return truncateToWidth(firstLine, width, FONT);
    // Con más contenido abajo, el "…" es obligatorio aunque la 1ra línea
    // sola entre entera (truncateToWidth no lo agregaría si ya entra).
    if (!rowMeasureCtx) rowMeasureCtx = document.createElement("canvas").getContext("2d");
    rowMeasureCtx.font = FONT;
    if (rowMeasureCtx.measureText(firstLine + "…").width <= width) return firstLine + "…";
    return truncateToWidth(firstLine, width, FONT); // ya agrega su propio "…" al recortar
  })();

  return (
    <div style={{ position: "relative" }}>
      <div style={multiline
        ? { display: "flex", flexDirection: "column", gap: 6, minHeight: 40, borderBottom: "1px solid #ECE3D3", padding: "13px 0 15px" }
        : { display: "flex", alignItems: "center", gap: 12, minHeight: 40, borderBottom: "1px solid #ECE3D3" }}
      >
        {/* En modo multiline, label y textarea ya quedan apilados (columna,
            no fila) -- el label tiene toda la fila para él solo, así que
            acá SÍ conviene `nowrap` liso (no el tope de 50%/2 líneas de la
            variante de una sola fila, que acá no aplica y solo lo partiría
            sin necesidad). */}
        <span style={multiline
          ? { flexShrink: 0, whiteSpace: "nowrap", fontSize: 13, color: "#6B6355", fontFamily: "system-ui, sans-serif" }
          : { ...rowLabelTextStyle, maxWidth: "50%", flexShrink: 0, fontSize: 13, color: "#6B6355", fontFamily: "system-ui, sans-serif" }}>{label}</span>
        {multiline ? (
          <textarea
            ref={taRef}
            rows={1}
            className="row-input"
            value={focused ? value : collapsed}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => { setFocused(true); onFocus?.(); }}
            onBlur={() => { setFocused(false); onBlur?.(); }}
            placeholder={placeholder}
            style={{ width: "100%", fontSize: 13.5, fontFamily: "system-ui, sans-serif", border: "none", background: "transparent", padding: 0, color: "#2B2420", resize: "none", overflow: "hidden", lineHeight: 1.4, ...(focused ? null : { whiteSpace: "nowrap", textOverflow: "ellipsis" }) }}
          />
        ) : (
          <input
            className="row-input"
            style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13.5, fontFamily: "system-ui, sans-serif", border: "none", background: "transparent", padding: 0, color: "#2B2420", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
          />
        )}
      </div>
      {suggestions && suggestions.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 5, border: "1px solid #DDD2BE", borderRadius: 10, background: "#fff", overflow: "hidden", boxShadow: "0 4px 10px rgba(0,0,0,0.08)" }}>
          {suggestions.map((s) => (
            <button
              type="button"
              key={s}
              onMouseDown={(e) => { e.preventDefault(); onPickSuggestion(s); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", fontSize: 13, fontFamily: "system-ui, sans-serif", border: "none", background: "#fff", color: "#2B2620", cursor: "pointer" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Agrupa acciones del header (Filtros/Favoritos/etc.) + el selector de
// moneda (Fase 2 de multi-moneda, ver MULTI_CURRENCY_PLAN.md) en un solo
// ícono con popover, en vez de un ícono por acción — un header mobile no
// tiene lugar para 5 íconos sueltos. `trigger` es el contenido del botón
// cerrado (ícono(s) + badge, lo arma cada pantalla). `items` son acciones
// de una sola fila: [{ icon, label, onClick, badge }]. `currencies` (si
// hay más de una) agrega una sección "Moneda" al final con un check en la
// elegida — si `items` viene vacío, el popover es solo esa sección.
// Mismo mecanismo de click-afuera-cierra + evento global "ec-picker-open"
// que ya usa PickerField (un solo popover abierto a la vez en toda la app).
// Mismo patrón repetido en cargando/sin resultados/nada registrado en toda
// la app: ícono opcional, título siempre, subtítulo opcional. El subtítulo
// va con padding:0 porque styles.emptyState ya trae su propio padding
// horizontal; sumarle el "0 20px" de styles.muted lo dejaría con el doble.
export function EmptyState({ icon, title, children }) {
  return (
    <div style={styles.emptyState}>
      {icon && <div style={styles.emptyIcon}>{icon}</div>}
      <p style={styles.emptyTitle}>{title}</p>
      {children && <p style={{ ...styles.muted, padding: 0 }}>{children}</p>}
    </div>
  );
}

// Evalúa una lista de tokens alternados número/operador/número/...
// (ej. ["12", "×", "3", "+", "5"]) respetando precedencia (× ÷ antes que
// + −), sin pasar por eval(). Devuelve NaN si algún número no es válido.
function evaluateCalculatorTokens(tokens) {
  const timesAndDivide = [parseFloat(tokens[0])];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const num = parseFloat(tokens[i + 1]);
    if (op === "×" || op === "÷") {
      const prev = timesAndDivide.pop();
      timesAndDivide.push(op === "×" ? prev * num : prev / num);
    } else {
      timesAndDivide.push(op, num);
    }
  }
  let result = timesAndDivide[0];
  for (let i = 1; i < timesAndDivide.length; i += 2) {
    result = timesAndDivide[i] === "+" ? result + timesAndDivide[i + 1] : result - timesAndDivide[i + 1];
  }
  return result;
}

// Redondeo a 2 decimales (mismo criterio que money()): evita que la
// imprecisión de punto flotante de una división dejé algo como
// "33.330000000000005" en el campo.
const roundMoney = (n) => Math.round(n * 100) / 100;

// Tope de dígitos para cualquier número escrito a mano en la calculadora
// propia (importe, tasa de conversión, montos): 9 enteros + 2 decimales
// (hasta 999.999.999,99) — de sobra para cualquier caso real. Sin esto, un
// número absurdamente largo dejaba de caber incluso al tamaño mínimo de
// letra (texto recortado por los 2 lados a la vez, por estar centrado —
// ver PENDIENTES.md/sesión 2026-10-24). Mismo criterio que ya tenía la
// app Money Manager original.
function canAppendDigit(current, d) {
  if (d === ".") return true; // el límite de un solo "." se chequea aparte
  const [intPart, decPart] = current.split(".");
  if (decPart !== undefined) return decPart.length < 2;
  return intPart.replace("-", "").length < 9;
}

// Importe ya cerrado (no mientras se edita): siempre 2 decimales, coma
// como separador — "12" se ve "12,00", "5.5" se ve "5,50". Mismo criterio
// que money() (que no se puede reusar directo acá: ya antepone el símbolo
// de moneda, y acá la moneda va aparte, en su propio chip).
function formatClosedAmount(value) {
  if (!value) return "";
  const n = Number(value);
  if (isNaN(n)) return value;
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// `variant`: "digit" (serif, grande, default) | "op" (÷×−+=, sans, terracota)
// | "fn" (C/⌫, sans, chico, muted) | "primary" (Ok, caja sólida).
function CalculatorKeyButton({ label, onClick, variant = "digit", wide }) {
  const primary = variant === "primary";
  const op = variant === "op";
  const fn = variant === "fn";
  // Estado de presionado por JS (onPointerDown/Up/Leave/Cancel), no CSS
  // `:active` — el `-webkit-tap-highlight-color: transparent` global (ver
  // styles.js) apaga el flash nativo en toda la app, y `:active` por sí
  // solo no es confiable en Safari/iOS con un toque real (solo anda bien
  // con mouse) — por eso esto no se veía en el celular aunque sí al
  // probarlo con clicks de mouse/Playwright.
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        gridColumn: wide ? "span 2" : undefined,
        padding: "14px 0",
        borderRadius: 10,
        border: "none",
        background: primary ? "#C75D3B" : pressed ? "#F0E6D6" : "transparent",
        color: primary ? "#fff" : op ? "#C75D3B" : fn ? "#6E625A" : "#2B2620",
        fontSize: primary ? 18 : op ? 24 : fn ? 19 : 28,
        fontWeight: primary ? 600 : fn ? 500 : 400,
        fontFamily: primary || op || fn ? "system-ui, sans-serif" : "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif",
        cursor: "pointer",
        filter: primary && pressed ? "brightness(0.92)" : undefined,
      }}
    >
      {label}
    </button>
  );
}

// Empuja la página hacia arriba al abrir un teclado propio fijo abajo
// (CalculatorAmountInput, ExchangeRateField), pero SOLO lo justo para que
// el campo quede visible arriba del teclado (igual que el teclado nativo
// del celular): si el campo ya estaba por encima de donde va a aparecer el
// teclado, no se mueve nada. Un elemento position:fixed (el teclado) nunca
// suma a la altura scrolleable de la página, así que si el form es corto no
// hay a dónde scrollear todavía. padding-bottom no sirve para crear ese
// margen porque "* { box-sizing: border-box }" (ver styles.js) lo mete
// adentro de los 100dvh fijos de <body> en vez de sumarlo; con min-height sí
// se fuerza una altura total mayor, sin pelear contra el box-sizing.
function useKeypadScrollIntoView(open, anchorRef, sheetRef) {
  const scrolledByRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    const prevMinHeight = document.body.style.minHeight;
    const raf = requestAnimationFrame(() => {
      const anchorRect = anchorRef.current?.getBoundingClientRect();
      const sheetRect = sheetRef.current?.getBoundingClientRect();
      if (!anchorRect || !sheetRect) return;
      document.body.style.minHeight = `calc(100dvh + ${sheetRect.height}px)`;
      const overlap = anchorRect.bottom - sheetRect.top;
      const scrollAmount = overlap > 0 ? overlap + 32 : 0;
      scrolledByRef.current = scrollAmount;
      if (scrollAmount > 0) window.scrollBy({ top: scrollAmount, behavior: "smooth" });
    });
    return () => {
      cancelAnimationFrame(raf);
      const scrolledBy = scrolledByRef.current;
      scrolledByRef.current = 0;
      // Si se scrolleó al abrir, primero se deshace ese scroll suavemente
      // y recién cuando termina esa animación se achica el <body> de
      // vuelta: si se achica ya mismo, el navegador recorta el scroll de
      // golpe al nuevo máximo (más chico) y se siente como un salto brusco.
      if (scrolledBy > 0) {
        window.scrollBy({ top: -scrolledBy, behavior: "smooth" });
        setTimeout(() => { document.body.style.minHeight = prevMinHeight; }, 350);
      } else {
        document.body.style.minHeight = prevMinHeight;
      }
    };
  }, [open]);
}

// Reemplaza el <input> numérico plano de "Importe": permite escribir
// operaciones (ej. "12×3+5") con un teclado propio en vez del teclado
// numérico nativo, y las resuelve en el mismo campo (ver PENDIENTES.md,
// sección A). Mientras se edita, el campo muestra la expresión completa tal
// cual se va tecleando (no colapsa a un resultado parcial en cada símbolo);
// "=" o cerrar el teclado (click afuera, o se abrió otro picker) resuelve
// lo pendiente. `value`/`onChange` siguen siendo el string plano de siempre
// (compatible con parseAmountInput), el estado de "qué se está tecleando"
// es interno y nunca llega al padre a medias.
export function CalculatorAmountInput({ value, onChange, onBlur, onConfirmNext, placeholder = "0.00", disabled = false, style, focusStyle, currency, placeholderColor = "#A89A87" }) {
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState([]);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++pickerInstanceCounter;
  const containerRef = useRef(null);
  const inputElRef = useRef(null);
  const keypadRef = useRef(null);

  useKeypadScrollIntoView(open, inputElRef, keypadRef);

  // Cada vez que los tokens forman una expresión completa (termina en
  // número, no en operador colgado), se resuelve y se sube al padre: así
  // el resto del formulario (ej. "equivale a" de la tasa de cambio) siempre
  // tiene un número válido, aunque el teclado siga abierto. Vaciar todo
  // (borrar hasta el último dígito) también se sube como "" — si no, el
  // padre se quedaba pegado en el último valor completo que sí llegó a
  // subirse (ej. escribir "123", borrar los 3, cerrar: quedaba en "1").
  // `if (!open) return` primero: `tokens` arranca en [] en CADA montaje
  // (no solo cuando el usuario vacía el campo a mano editando), así que
  // sin este guard esto borraba a "" cualquier `value` precargado al
  // editar una transacción ya existente, apenas montaba el componente.
  useEffect(() => {
    if (!open) return;
    if (tokens.length === 0) { onChange(""); return; }
    if (tokens.length % 2 === 0) return;
    const result = evaluateCalculatorTokens(tokens);
    if (!isNaN(result) && isFinite(result)) onChange(String(roundMoney(result)));
  }, [tokens]);

  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("ec-picker-open", { detail: idRef.current }));
  }, [open]);
  useEffect(() => {
    const onOtherOpen = (e) => { if (e.detail !== idRef.current) setOpen(false); };
    window.addEventListener("ec-picker-open", onOtherOpen);
    return () => window.removeEventListener("ec-picker-open", onOtherOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [open]);

  // Mismo criterio que PickerField: no hay blur nativo (el teclado propio
  // no es un <input> editable), así que "onBlur" se dispara cuando el
  // teclado se cierra, sea por "=", click afuera, o se abrió otro picker.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) onBlur?.();
    wasOpenRef.current = open;
  }, [open, onBlur]);

  const openEdit = () => {
    if (disabled) return;
    setTokens(value ? [String(value)] : []);
    setOpen(true);
  };

  const pressDigit = (d) => {
    setTokens((prev) => {
      if (prev.length === 0) return [d === "." ? "0." : d];
      const lastIsOperator = prev.length % 2 === 0;
      if (lastIsOperator) return [...prev, d === "." ? "0." : d];
      const last = prev[prev.length - 1];
      if (d === "." && last.includes(".")) return prev;
      if (!canAppendDigit(last, d)) return prev;
      return [...prev.slice(0, -1), last + d];
    });
  };
  const pressOperator = (op) => {
    setTokens((prev) => {
      if (prev.length === 0) return prev;
      const lastIsOperator = prev.length % 2 === 0;
      return lastIsOperator ? [...prev.slice(0, -1), op] : [...prev, op];
    });
  };
  const pressBackspace = () => {
    setTokens((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      return last.length > 1 ? [...prev.slice(0, -1), last.slice(0, -1)] : prev.slice(0, -1);
    });
  };
  const pressEquals = () => {
    setTokens((prev) => {
      const complete = prev.length % 2 === 1 ? prev : prev.slice(0, -1);
      if (complete.length === 0) return prev;
      const result = evaluateCalculatorTokens(complete);
      return !isNaN(result) && isFinite(result) ? [String(roundMoney(result))] : prev;
    });
  };
  // "Ok": lo mismo que "=" (ya queda resuelto solo por el efecto de arriba,
  // que sube cada expresión completa al padre), pero además cierra el
  // teclado y salta directo al siguiente campo (igual que la app Money
  // Manager original).
  const pressConfirmNext = () => {
    setOpen(false);
    onConfirmNext?.();
  };

  // Cerrado, siempre 2 decimales ("12" → "12,00", "5,5" → "5,50") — mientras
  // se edita se deja la expresión tal cual se tecleó (acá SÍ importa poder
  // ver "12" sin decimales de más mientras escribís, o "12×3" mientras
  // armás una cuenta). `value` siempre es un string estilo JS (punto, sin
  // ceros de más, ver roundMoney) — nunca lo que el usuario tipeó a mano.
  const displayValue = open ? tokens.join(" ") : formatClosedAmount(value);

  // Letra que se achica para que el importe quepa siempre, midiendo el
  // ANCHO REAL en píxeles (Canvas) en vez de adivinar por cantidad de
  // caracteres — una cantidad de caracteres igual puede pesar muy distinto
  // en píxeles según qué dígitos sean (ver PENDIENTES.md), y esto además
  // cubre la expresión completa mientras se escribe (ej. "2×3×3×3÷2"), no
  // solo el resultado ya calculado. Si ni al tamaño mínimo entra (una
  // expresión larguísima, varios números encadenados), se recorta por el
  // INICIO con "…" — el final (y el cursor) nunca se esconden, a
  // diferencia de dejar que el navegador recorte parejo de los 2 lados.
  const baseFontSize = style?.fontSize || 15;
  const [fitFontSize, setFitFontSize] = useState(baseFontSize);
  const [visibleText, setVisibleText] = useState(displayValue || placeholder);
  useLayoutEffect(() => {
    const box = containerRef.current;
    const text = displayValue || placeholder;
    if (!box || !text) { setFitFontSize(baseFontSize); setVisibleText(text); return; }
    const measure = () => {
      // Medir el ancho del PADRE (y restarle los hermanos) en vez del
      // propio botón: dentro de una fila flex que lo encoge (ej. el
      // importe "hero", al lado del chip de moneda), el ancho del botón
      // depende circularmente de su propio contenido (hug-content), así
      // que usarlo como "disponible" daba medidas inestables/erráticas
      // según qué se hubiera tecleado justo antes (ver PENDIENTES.md,
      // sesión 2026-10-24). El padre (la fila completa) SÍ tiene un ancho
      // estable, independiente de cuánto mida este campo en particular.
      const parent = box.parentElement;
      if (!parent) { setFitFontSize(baseFontSize); setVisibleText(text); return; }
      // Los hermanos solo "compiten" por ancho si el padre es una fila
      // horizontal (ej. el chip de moneda al lado, en el importe "hero")
      // — si es una columna (ej. el <Field> normal, label arriba/error
      // abajo), esos hermanos están en otro renglón, no hay que restarlos.
      const parentStyle = getComputedStyle(parent);
      const isRow = parentStyle.display.includes("flex") && !parentStyle.flexDirection.startsWith("column");
      const siblingsWidth = isRow
        ? [...parent.children].filter((c) => c !== box).reduce((sum, c) => sum + c.getBoundingClientRect().width, 0)
        : 0;
      const gapPx = isRow ? (parseFloat(getComputedStyle(parent).columnGap || getComputedStyle(parent).gap) || 0) : 0;
      const gapCount = isRow && parent.children.length > 1 ? parent.children.length - 1 : 0;
      const available = parent.clientWidth - siblingsWidth - gapPx * gapCount - 16;
      if (available <= 0) { setFitFontSize(baseFontSize); setVisibleText(text); return; }
      if (!amountMeasureCtx) amountMeasureCtx = document.createElement("canvas").getContext("2d");
      const fontFamily = style?.fontFamily || "system-ui, sans-serif";
      // El peso de letra (ej. fontWeight:600 en Importe de fila de SettleUp)
      // también afecta el ancho real -- negrita pesa más que texto normal al
      // mismo tamaño. Sin esto acá, Canvas medía como si SIEMPRE fuera
      // normal (default), subestimando el ancho real cada vez que el campo
      // pide negrita -- esto, no el redondeo, era la causa real de que
      // "a veces" tocara al vecino (dependía de cuánto texto en negrita
      // hubiera en cada momento, no era un error fijo).
      const fontWeight = style?.fontWeight || "normal";
      amountMeasureCtx.font = `${fontWeight} ${baseFontSize}px ${fontFamily}`;
      const textWidth = amountMeasureCtx.measureText(text).width;
      if (textWidth <= available) { setFitFontSize(baseFontSize); setVisibleText(text); return; }
      const minSize = Math.max(16, baseFontSize * 0.35);
      // *0.92: la escala lineal (mismo ancho/alto que a baseFontSize) es una
      // aproximación -- el ancho REAL ya achicado nunca da ejecto igual al
      // predicho (fuente/kerning), y sin margen de sobra el texto terminaba
      // tocando lo que viene al lado (visto en vivo con un layout angosto,
      // ej. Importe en fila con el chip de moneda pegado).
      const scaledSize = baseFontSize * (available / textWidth) * 0.92;
      if (scaledSize >= minSize) { setFitFontSize(scaledSize); setVisibleText(text); return; }
      // Ni al tamaño mínimo entra entero: se queda en el mínimo y se
      // recorta el TEXTO (no la letra) para que siga entrando.
      setFitFontSize(minSize);
      setVisibleText(truncateFromStart(text, available, `${fontWeight} ${minSize}px ${fontFamily}`));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [displayValue, placeholder, baseFontSize, style?.fontFamily, style?.fontWeight]);

  return (
    // stopPropagation acá (no en cada botón del teclado): si este input
    // vive adentro de otro elemento clickeable (ej. la fila de "Varias
    // personas" en EvenGroup, que es un <button> entero), ningún toque
    // acá adentro debería llegarle a ese padre.
    // minWidth:0 acá (no solo en el botón de adentro): si este componente
    // vive dentro de un flex row que se supone que lo encoge cuando no
    // entra (ej. el importe "hero"), el flex-item de VERDAD es este div de
    // afuera — sin esto, el min-width:auto default de cualquier flex item
    // igual lo mantenía del ancho de su contenido, por más que el botón de
    // adentro tuviera su propio minWidth:0.
    <div ref={containerRef} onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
      <div style={{ position: "relative", minWidth: 0 }}>
        {/* <button>, no <input> — a propósito: un <input> real, aunque sea
            readOnly con inputMode="none", igual le pide foco a iOS, que a
            veces reserva espacio para un teclado que nunca llega a mostrar
            (el nuestro es este mismo panel fijo de abajo) y deja el viewport
            visual desalineado del real — ahí los toques del teclado propio
            caían en el botón de abajo del que se veía. Un <button> nunca
            dispara ese reservado nativo. */}
        <button
          ref={inputElRef}
          type="button"
          onClick={openEdit}
          disabled={disabled}
          // `...style` antes del estado "open": así un estilo custom (ej. el
          // importe "hero" sin caja, en TransactionForm) puede igual recibir
          // su propio feedback de foco vía `focusStyle`, en vez de quedar
          // pisado por el anillo default pensado para el campo con caja.
          style={{ ...styles.input, width: "100%", height: 44, boxSizing: "border-box", textAlign: "left", display: "flex", alignItems: "center", opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer", ...(currency ? { paddingRight: 46 } : null), ...style, fontSize: fitFontSize, overflow: "hidden", ...(open ? (focusStyle || { boxShadow: "0 0 0 2px #C75D3B" }) : null) }}
        >
          {/* Si ni el tamaño mínimo alcanza (ej. varios números encadenados
              mientras se escribe), `visibleText` ya viene recortado por el
              INICIO con "…" (ver el efecto de arriba) — el final y el
              cursor siempre quedan visibles, nunca se esconden. */}
          <span style={{ whiteSpace: "nowrap" }}>
            {displayValue ? visibleText : <span style={{ color: placeholderColor }}>{visibleText}</span>}
          </span>
          {/* Este <button> no tiene foco/caret nativo (ver nota arriba) — sin
              esto, no había ninguna señal visual de que el teclado propio
              está activo para este campo (igual online que offline). Altura
              proporcional al tamaño de letra que se está mostrando (no 18px
              fijo) — en el importe "hero" (54px) un cursor de 18px se veía
              como un palito perdido al lado del número. */}
          {open && <span className="blink-cursor" style={{ marginLeft: 2, flexShrink: 0, width: 1.5, height: fitFontSize, background: "#C75D3B" }} />}
        </button>
        {currency && (
          <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: "#A89A87", fontSize: 13, pointerEvents: "none" }}>
            {currency}
          </span>
        )}
      </div>
      {open && (
        // Fijo abajo de toda la pantalla, como un teclado reemplazando al
        // nativo (no un dropdown pegado al campo), con el mismo ancho/centrado
        // que styles.footer, para quedar alineado con el resto del form
        // en desktop. zIndex por encima del Footer (5) para taparlo
        // mientras se edita, igual que haría un teclado real.
        <div ref={keypadRef} style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 0, width: "100%", maxWidth: 480, boxSizing: "border-box", background: "#FBF8F2", borderTop: "1px solid #DDD2BE", borderRadius: "16px 16px 0 0", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)", padding: "10px 10px calc(10px + env(safe-area-inset-bottom))", zIndex: 15 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            <CalculatorKeyButton label="7" onClick={() => pressDigit("7")} />
            <CalculatorKeyButton label="8" onClick={() => pressDigit("8")} />
            <CalculatorKeyButton label="9" onClick={() => pressDigit("9")} />
            <CalculatorKeyButton label="÷" variant="op" onClick={() => pressOperator("÷")} />
            <CalculatorKeyButton label="4" onClick={() => pressDigit("4")} />
            <CalculatorKeyButton label="5" onClick={() => pressDigit("5")} />
            <CalculatorKeyButton label="6" onClick={() => pressDigit("6")} />
            <CalculatorKeyButton label="×" variant="op" onClick={() => pressOperator("×")} />
            <CalculatorKeyButton label="1" onClick={() => pressDigit("1")} />
            <CalculatorKeyButton label="2" onClick={() => pressDigit("2")} />
            <CalculatorKeyButton label="3" onClick={() => pressDigit("3")} />
            <CalculatorKeyButton label="-" variant="op" onClick={() => pressOperator("-")} />
            <CalculatorKeyButton label="0" onClick={() => pressDigit("0")} />
            <CalculatorKeyButton label="." onClick={() => pressDigit(".")} />
            <CalculatorKeyButton label="⌫" variant="fn" onClick={pressBackspace} />
            <CalculatorKeyButton label="+" variant="op" onClick={() => pressOperator("+")} />
            <CalculatorKeyButton label="C" variant="fn" onClick={() => setTokens([])} />
            <CalculatorKeyButton label="=" variant="op" onClick={pressEquals} />
            <CalculatorKeyButton label="Ok" variant="primary" wide onClick={pressConfirmNext} />
          </div>
        </div>
      )}
    </div>
  );
}

// Evalúa tokens completos (termina en número, no en operador colgado) o
// devuelve null si la expresión está a medio escribir. Compartido por los 2
// inputs "de valor" de CurrencyConversionField (y en espíritu con
// CalculatorAmountInput, aunque cada uno maneja sus propios tokens).
function completeCalculatorValue(tokens) {
  if (tokens.length === 0 || tokens.length % 2 === 0) return null;
  const result = evaluateCalculatorTokens(tokens);
  return !isNaN(result) && isFinite(result) ? roundMoney(result) : null;
}

// Reemplaza TANTO el <input> de "Importe" COMO el de "tasa de cambio" cuando
// la moneda de la transacción no coincide con la de la cuenta (ver
// PENDIENTES.md, sección A). El campo "Importe" deja de ser editable en el
// momento: pasa a ser un botón que abre esta misma hoja, que pide 2 datos a
// la vez (nunca 1 solo, porque el importe en la moneda de la transacción
// siempre hace falta igual):
//   - "Valor": el importe en la moneda de la transacción. Siempre visible.
//   - según el modo: "Tasa" (la tasa de conversión, numérico simple) o
//     "Montos" (el importe ya convertido a la moneda de la cuenta, con
//     calculadora igual que "Valor").
// Cambiar de modo no pierde lo ya tecleado: convierte lo que haya a la
// representación del modo nuevo. Cerrar la hoja (click afuera, "Ok", o se
// abrió otro picker) siempre deja guardado lo último válido: subir el dato
// al padre pasa continuamente mientras se edita (mismo criterio que
// CalculatorAmountInput), así que cerrar nunca "pierde" nada a medio
// terminar. "Ok" además salta al siguiente campo (igual que en Importe
// simple); click afuera no.
export function CurrencyConversionField({ amount, onChangeAmount, currency, accountCurrency, rate, onChangeRate, onBlur, onConfirmNext, openSignal, amountDisabled = false, required = false }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("rate"); // "rate" | "montos"
  const [activeRow, setActiveRow] = useState("valor"); // "valor" | "second"
  const [valorTokens, setValorTokens] = useState([]);
  const [secondTokens, setSecondTokens] = useState([]); // usado en modo "montos"
  const [rateDraft, setRateDraft] = useState(""); // usado en modo "rate"
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++pickerInstanceCounter;
  const containerRef = useRef(null);
  const boxRef = useRef(null);
  const sheetRef = useRef(null);

  useKeypadScrollIntoView(open, boxRef, sheetRef);

  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("ec-picker-open", { detail: idRef.current }));
  }, [open]);
  useEffect(() => {
    const onOtherOpen = (e) => { if (e.detail !== idRef.current) setOpen(false); };
    window.addEventListener("ec-picker-open", onOtherOpen);
    return () => window.removeEventListener("ec-picker-open", onOtherOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [open]);

  // Mismo criterio que PickerField/CalculatorAmountInput: no hay blur
  // nativo, así que "onBlur" se dispara cuando la hoja se cierra.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) onBlur?.();
    wasOpenRef.current = open;
  }, [open, onBlur]);

  const openEdit = () => {
    setMode("rate");
    setValorTokens(amount ? [String(amount)] : []);
    setRateDraft(rate || "");
    setSecondTokens([]);
    // Si "Valor" está bloqueado (amountDisabled), no puede arrancar activo:
    // el teclado le escribiría encima a un campo que no se puede tocar.
    setActiveRow(amountDisabled ? "second" : "valor");
    setOpen(true);
  };

  // Apertura a control remoto: cuando cambiás la moneda de la transacción a
  // una distinta de la cuenta, el padre sube `openSignal` para que esta hoja
  // se abra sola (no hace falta que toques nada para que te la pida).
  const firstOpenSignalRef = useRef(openSignal);
  useEffect(() => {
    if (openSignal !== undefined && openSignal !== firstOpenSignalRef.current) openEdit();
    firstOpenSignalRef.current = openSignal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  // Cada vez que "Valor" (y, según el modo, "Tasa" o "Montos") tiene algo
  // completo, se sube al padre: así cerrar la hoja (sea como sea) nunca
  // pierde lo último válido tecleado.
  // Vaciar del todo (Valor, Tasa, o Montos convertido) sube "" al padre —
  // mismo bug/arreglo que CalculatorAmountInput: antes, borrar hasta el
  // último dígito simplemente no subía nada, y el padre se quedaba pegado
  // en el último valor completo que sí había llegado a subirse. `if
  // (!open) return` primero por la misma razón que ahí: estos 3 estados
  // arrancan vacíos en CADA montaje, no solo cuando el usuario los vacía
  // a mano editando — sin el guard, esto borraba a "" el monto/tasa ya
  // cargados de una transacción existente apenas montaba el componente.
  useEffect(() => {
    if (!open) return;
    const valorValue = completeCalculatorValue(valorTokens);
    if (valorTokens.length === 0) onChangeAmount("");
    else if (valorValue != null) onChangeAmount(String(valorValue));

    if (mode === "rate") {
      if (rateDraft === "") {
        onChangeRate("");
      } else {
        const n = parseAmountInput(rateDraft);
        if (!isNaN(n) && n > 0) onChangeRate(rateDraft);
      }
    } else {
      const secondValue = completeCalculatorValue(secondTokens);
      if (secondTokens.length === 0) {
        onChangeRate("");
      } else if (valorValue != null && secondValue != null && secondValue > 0) {
        onChangeRate(String(Number((valorValue / secondValue).toPrecision(10))));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorTokens, secondTokens, rateDraft, mode]);

  // Cambiar de modo no pierde lo ya tecleado: convierte el valor actual a la
  // representación del modo nuevo (si se puede), en vez de limpiar todo.
  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    const valorValue = completeCalculatorValue(valorTokens);
    if (nextMode === "montos") {
      const rateNum = parseAmountInput(rateDraft);
      setSecondTokens(valorValue != null && !isNaN(rateNum) && rateNum > 0 ? [String(roundMoney(valorValue / rateNum))] : []);
    } else {
      const secondValue = completeCalculatorValue(secondTokens);
      setRateDraft(valorValue != null && secondValue != null && secondValue > 0 ? String(Number((valorValue / secondValue).toPrecision(10))) : "");
    }
    setMode(nextMode);
    setActiveRow(amountDisabled ? "second" : "valor");
  };

  const activeUsesCalculator = activeRow === "valor" || mode === "montos";
  const setActiveTokens = activeRow === "valor" ? setValorTokens : setSecondTokens;

  const pressDigit = (d) => {
    if (!activeUsesCalculator) {
      setRateDraft((prev) => {
        if (!prev) return d === "." ? "0." : d;
        if (d === "." && prev.includes(".")) return prev;
        if (!canAppendDigit(prev, d)) return prev;
        return prev + d;
      });
      return;
    }
    setActiveTokens((prev) => {
      if (prev.length === 0) return [d === "." ? "0." : d];
      const lastIsOperator = prev.length % 2 === 0;
      if (lastIsOperator) return [...prev, d === "." ? "0." : d];
      const last = prev[prev.length - 1];
      if (d === "." && last.includes(".")) return prev;
      if (!canAppendDigit(last, d)) return prev;
      return [...prev.slice(0, -1), last + d];
    });
  };
  const pressOperator = (op) => {
    setActiveTokens((prev) => {
      if (prev.length === 0) return prev;
      const lastIsOperator = prev.length % 2 === 0;
      return lastIsOperator ? [...prev.slice(0, -1), op] : [...prev, op];
    });
  };
  const pressBackspace = () => {
    if (!activeUsesCalculator) { setRateDraft((prev) => prev.slice(0, -1)); return; }
    setActiveTokens((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      return last.length > 1 ? [...prev.slice(0, -1), last.slice(0, -1)] : prev.slice(0, -1);
    });
  };
  const pressClear = () => {
    if (!activeUsesCalculator) { setRateDraft(""); return; }
    setActiveTokens([]);
  };
  const pressEquals = () => {
    setActiveTokens((prev) => {
      const complete = prev.length % 2 === 1 ? prev : prev.slice(0, -1);
      if (complete.length === 0) return prev;
      const result = evaluateCalculatorTokens(complete);
      return !isNaN(result) && isFinite(result) ? [String(roundMoney(result))] : prev;
    });
  };
  const pressOk = () => {
    setOpen(false);
    onConfirmNext?.();
  };

  const valorDisplay = valorTokens.length ? valorTokens.join(" ") : "0";
  const secondDisplay = mode === "montos" ? (secondTokens.length ? secondTokens.join(" ") : "0") : (rateDraft || "0");
  // Mismo lenguaje que el resto de filas/hojas (ver TransactionForm/
  // PickerField): sin caja, fondo arena solo en la fila activa (en vez de
  // un borde que cambia de color) — antes esto era 100% ajeno, con
  // <input>s de caja blanca con borde que no se parecían a nada más.
  const rowStyle = (row) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    minHeight: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: "none",
    background: activeRow === row ? "#F3ECE0" : "transparent",
    fontFamily: "system-ui, sans-serif",
    cursor: row === "valor" && amountDisabled ? "not-allowed" : "pointer",
    opacity: row === "valor" && amountDisabled ? 0.6 : 1,
  });
  const rowValueStyle = { fontSize: 20, fontFamily: "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif", color: "#2B2420" };
  const rowCodeStyle = { fontSize: 13, color: "#A3968B", fontFamily: "system-ui, sans-serif" };

  return (
    <div ref={containerRef} onClick={(e) => e.stopPropagation()}>
      <button
        ref={boxRef}
        type="button"
        onClick={openEdit}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 40, padding: 0, border: "none", borderBottom: "1px solid #ECE3D3", background: "transparent", textAlign: "left", fontFamily: "system-ui, sans-serif", cursor: "pointer" }}
      >
        <span style={{ ...rowLabelTextStyle, maxWidth: "50%", flexShrink: 0, fontSize: 13, color: "#6B6355" }}>
          Importe{required && <span style={{ color: "#B0473A" }}> *</span>}
        </span>
        <span style={{ flex: 1, textAlign: "right", fontSize: 13.5, color: amount ? "#2B2420" : "#A3968B" }}>
          {amount ? `${formatClosedAmount(amount)} ${currency}` : "0,00"}
        </span>
      </button>
      {open && (
        <div style={styles.sheetBackdrop} onClick={() => setOpen(false)}>
          <div ref={sheetRef} style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetHeader}>
              <span />
              <p style={styles.sheetTitle}>Importe</p>
              <button type="button" style={styles.sheetClose} onClick={() => setOpen(false)}>Cerrar</button>
            </div>
            <div style={{ ...styles.sheetBody, display: "flex", flexDirection: "column" }}>
              <SegmentedControl
                style={{ marginBottom: 16 }}
                options={[{ value: "rate", label: "Tasa" }, { value: "montos", label: "Montos" }]}
                value={mode}
                onChange={switchMode}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                <span style={{ fontSize: 13, color: "#6B6355", fontFamily: "system-ui, sans-serif", padding: "0 12px" }}>Valor</span>
                <button
                  type="button"
                  onClick={() => !amountDisabled && setActiveRow("valor")}
                  disabled={amountDisabled}
                  style={rowStyle("valor")}
                >
                  <span style={rowValueStyle}>{valorDisplay}</span>
                  <span style={rowCodeStyle}>{currency}</span>
                </button>
                <span style={{ fontSize: 13, color: "#6B6355", fontFamily: "system-ui, sans-serif", padding: "8px 12px 0" }}>
                  {mode === "rate" ? "Tasa de conversión" : "Valor convertido"}
                </span>
                <button type="button" onClick={() => setActiveRow("second")} style={rowStyle("second")}>
                  <span style={rowValueStyle}>{secondDisplay}</span>
                  {mode === "montos" && <span style={rowCodeStyle}>{accountCurrency}</span>}
                </button>
              </div>
          {/* gridAutoRows fijo (no "auto") — sin esto, la grilla de 3
              columnas (Tasa, sin operadores) terminaba un poco más baja
              que la de 4 (Valor, con operadores): misma cantidad de filas,
              pero el alto de cada fila dependía del contenido de ESA
              grilla nada más, no se mantenía igual entre las dos. */}
          {activeUsesCalculator ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridAutoRows: 58, gap: 6 }}>
              <CalculatorKeyButton label="7" onClick={() => pressDigit("7")} />
              <CalculatorKeyButton label="8" onClick={() => pressDigit("8")} />
              <CalculatorKeyButton label="9" onClick={() => pressDigit("9")} />
              <CalculatorKeyButton label="÷" variant="op" onClick={() => pressOperator("÷")} />
              <CalculatorKeyButton label="4" onClick={() => pressDigit("4")} />
              <CalculatorKeyButton label="5" onClick={() => pressDigit("5")} />
              <CalculatorKeyButton label="6" onClick={() => pressDigit("6")} />
              <CalculatorKeyButton label="×" variant="op" onClick={() => pressOperator("×")} />
              <CalculatorKeyButton label="1" onClick={() => pressDigit("1")} />
              <CalculatorKeyButton label="2" onClick={() => pressDigit("2")} />
              <CalculatorKeyButton label="3" onClick={() => pressDigit("3")} />
              <CalculatorKeyButton label="-" variant="op" onClick={() => pressOperator("-")} />
              <CalculatorKeyButton label="0" onClick={() => pressDigit("0")} />
              <CalculatorKeyButton label="." onClick={() => pressDigit(".")} />
              <CalculatorKeyButton label="⌫" variant="fn" onClick={pressBackspace} />
              <CalculatorKeyButton label="+" variant="op" onClick={() => pressOperator("+")} />
              <CalculatorKeyButton label="C" variant="fn" onClick={pressClear} />
              <CalculatorKeyButton label="=" variant="op" onClick={pressEquals} />
              <CalculatorKeyButton label="Ok" variant="primary" wide onClick={pressOk} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: 58, gap: 6 }}>
              <CalculatorKeyButton label="7" onClick={() => pressDigit("7")} />
              <CalculatorKeyButton label="8" onClick={() => pressDigit("8")} />
              <CalculatorKeyButton label="9" onClick={() => pressDigit("9")} />
              <CalculatorKeyButton label="4" onClick={() => pressDigit("4")} />
              <CalculatorKeyButton label="5" onClick={() => pressDigit("5")} />
              <CalculatorKeyButton label="6" onClick={() => pressDigit("6")} />
              <CalculatorKeyButton label="1" onClick={() => pressDigit("1")} />
              <CalculatorKeyButton label="2" onClick={() => pressDigit("2")} />
              <CalculatorKeyButton label="3" onClick={() => pressDigit("3")} />
              <CalculatorKeyButton label="0" onClick={() => pressDigit("0")} />
              <CalculatorKeyButton label="." onClick={() => pressDigit(".")} />
              <CalculatorKeyButton label="⌫" variant="fn" onClick={pressBackspace} />
              <CalculatorKeyButton label="C" variant="fn" onClick={pressClear} />
              <CalculatorKeyButton label="Ok" variant="primary" wide onClick={pressOk} />
            </div>
          )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HeaderMenu({ trigger, items = [], currencies = [], currency, onChangeCurrency }) {
  const [open, setOpen] = useState(false);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++pickerInstanceCounter;
  const containerRef = useRef(null);

  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("ec-picker-open", { detail: idRef.current }));
  }, [open]);
  useEffect(() => {
    const onOtherOpen = (e) => { if (e.detail !== idRef.current) setOpen(false); };
    window.addEventListener("ec-picker-open", onOtherOpen);
    return () => window.removeEventListener("ec-picker-open", onOtherOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [open]);

  const menuRowStyle = { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: "none", textAlign: "left", fontSize: 13.5, fontFamily: "system-ui, sans-serif", color: "#2B2620", cursor: "pointer" };
  const showCurrencies = currencies.length > 1;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button style={{ ...styles.iconBtnGhost, position: "relative" }} onClick={() => setOpen((o) => !o)} aria-label="Más opciones">
        {trigger}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, minWidth: 180, background: "#fff", border: "1px solid #ECE3D3", borderRadius: 10, boxShadow: "0 6px 16px rgba(0,0,0,0.1)", zIndex: 20, overflow: "hidden" }}>
          {items.map((item) => (
            <button key={item.label} style={menuRowStyle} onClick={() => { setOpen(false); item.onClick(); }}>
              {item.icon}
              {item.label}
              {item.badge && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C75D3B", marginLeft: "auto" }} />}
            </button>
          ))}
          {showCurrencies && (
            <>
              {items.length > 0 && <div style={{ margin: "2px 0", borderTop: "1px solid #F0EBE2" }} />}
              <p style={{ margin: 0, padding: "8px 14px 2px", fontSize: 11, fontWeight: 700, color: "#A89A87", textTransform: "uppercase", letterSpacing: "0.04em" }}>Moneda</p>
              {currencies.map((c) => (
                <button key={c} style={menuRowStyle} onClick={() => { setOpen(false); onChangeCurrency(c); }}>
                  <span style={{ width: 16, display: "flex", justifyContent: "center" }}>{c === currency && <Check size={14} color="#C75D3B" />}</span>
                  {c}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Misma base visual que PickerField (grilla agrupada de 3 columnas) pero de
// selección múltiple — pensado para los filtros del Buscador (cuenta,
// categoría). Diferencias clave: tocar un ítem lo prende/apaga sin cerrar el
// desplegable (tenés que poder elegir varios seguidos), y el botón de arriba
// resume cuántos hay elegidos en vez de mostrar un solo valor.
let multiPickerInstanceCounter = 0;

export function MultiPickerField({ value, onChange, groups, placeholder = "Elegir" }) {
  const [open, setOpen] = useState(false);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++multiPickerInstanceCounter;
  const containerRef = useRef(null);
  const selectedItems = groups.flatMap((g) => g.items).filter((it) => value.includes(it.value));

  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("ec-picker-open", { detail: `multi-${idRef.current}` }));
  }, [open]);
  useEffect(() => {
    const onOtherOpen = (e) => { if (e.detail !== `multi-${idRef.current}`) setOpen(false); };
    window.addEventListener("ec-picker-open", onOtherOpen);
    return () => window.removeEventListener("ec-picker-open", onOtherOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [open]);

  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const summary = selectedItems.length === 0 ? placeholder
    : selectedItems.length === 1 ? selectedItems[0].label
      : `${selectedItems.length} seleccionadas`;

  return (
    <div ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...styles.input, width: "100%", height: 44, boxSizing: "border-box", textAlign: "left", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderRadius: open ? "10px 10px 0 0" : 10 }}
      >
        <span style={selectedItems.length === 0 ? { color: "#A89A87", fontSize: 13 } : undefined}>{summary}</span>
      </button>
      {open && (
        <div style={{ border: "1px solid #DDD2BE", borderTop: "none", borderRadius: "0 0 10px 10px", background: "#fff", overflow: "hidden" }}>
          {groups.map((g) => (
            <div key={g.label || "flat"}>
              {g.label && (
                <p style={{ margin: 0, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#A8754A", textTransform: "uppercase", letterSpacing: "0.04em", background: "#FAF7F2", borderBottom: "1px solid #F0EBE2", pointerEvents: "none" }}>
                  {g.label}
                </p>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "#F0EBE2" }}>
                {g.items.map((it) => {
                  const checked = value.includes(it.value);
                  return (
                    <button
                      type="button"
                      key={it.value}
                      // Solo onPointerUp (no también onClick, como en
                      // PickerField): ahí onChange+setOpen(false) son
                      // idempotentes y da igual que se disparen dos veces,
                      // pero toggle() invierte el valor — disparar los dos
                      // eventos prendía y apagaba en el mismo click.
                      onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); toggle(it.value); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "10px 8px", fontSize: 12.5, fontFamily: "system-ui, sans-serif",
                        border: "none", background: checked ? "#FBEDE7" : "#fff", color: "#2B2620", textAlign: "left", cursor: "pointer", minWidth: 0,
                      }}
                    >
                      {it.icon && <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }}>{it.icon}</span>}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{it.label}</span>
                      {checked && <Check size={14} style={{ flexShrink: 0, color: "#C75D3B" }} />}
                    </button>
                  );
                })}
                {Array.from({ length: (3 - (g.items.length % 3)) % 3 }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ background: "#F5F1E8", pointerEvents: "none" }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Para fotos guardadas en Supabase Storage (grupos, perfil): si la imagen no
// carga (ej. sin señal, nunca la cacheamos) muestra el mismo fallback de
// "sin foto" en vez del ícono roto del navegador.
export function ImageWithFallback({ src, alt = "", style, fallback }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return fallback;
  return <img src={src} alt={alt} style={style} onError={() => setFailed(true)} />;
}

// Foto + botones de cambiar/quitar — compartido por NewGroup/EditGroup (foto de grupo,
// shape="square") y Perfil (foto de usuario, shape="circle"). Los dos botones van en fila,
// mismo ancho cada uno.
// `onDisabledClick`: igual que el resto de los botones bloqueados offline
// (dejan el click llegar y recién ahí avisan) — con `pointer-events: none`
// (lo que había antes) el click ni siquiera llega a disparar el aviso, se
// ve bloqueado pero sin ninguna explicación. `disabled` real en el <input>
// tendría el mismo problema (algunos navegadores ni dejan que el <label>
// reciba el click), por eso el bloqueo de verdad pasa por `preventDefault`
// en el click del <label>, no por el atributo disabled.
export function PhotoPicker({ previewUrl, onChange, onClear, shape = "square", disabled = false, onDisabledClick }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: disabled ? 0.5 : 1 }}>
      <div style={{ width: 72, height: 72, minWidth: 72, borderRadius: shape === "circle" ? "50%" : 16, overflow: "hidden", background: previewUrl ? "transparent" : "#E8DFD0", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #DDD2BE" }}>
        <ImageWithFallback
          src={previewUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          fallback={<User size={28} color="#A89A87" />}
        />
      </div>
      <div style={{ display: "flex", gap: 6, flex: 1 }}>
        <label
          style={{ ...styles.btnDashed, cursor: disabled ? "default" : "pointer", fontSize: 13, flex: 1 }}
          onClick={(e) => { if (disabled) { e.preventDefault(); onDisabledClick?.(); } }}
        >
          <Camera size={14} /> {previewUrl ? "Cambiar foto" : "Añadir foto"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChange} />
        </label>
        {previewUrl && (
          <button
            style={{ ...styles.btnGhostSmall, fontSize: 12, flex: 1, justifyContent: "center" }}
            onClick={() => { if (disabled) { onDisabledClick?.(); return; } onClear(); }}
          >
            Quitar foto
          </button>
        )}
      </div>
    </div>
  );
}

// Ver una foto a pantalla completa (tocar una miniatura la abre, tocar
// afuera o la "X" la cierra) — mismo overlay negro + botón de cerrar
// repetido en varios lugares (gasto/pago de EvenGroup con foto adjunta,
// importar desde foto), antes duplicado en cada pantalla.
export function PhotoLightbox({ open, src, onClose }) {
  if (!open || !src) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        style={{ position: "absolute", top: 16, right: 16, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <X size={22} color="#fff" />
      </button>
    </div>
  );
}
