export const globalCss = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; height: 100%; overflow-x: hidden; overscroll-behavior-y: none; -webkit-text-size-adjust: 100%; background: #F7F2E9; }
  #root { height: 100%; }
  /* box-shadow en vez de outline: Safari no sigue bien un border-radius
     asimétrico con outline (ej. un input con esquinas planas de un solo
     lado para fusionarse con algo pegado abajo) — se veía redondeado
     también del lado que debía quedar recto. box-shadow sí respeta el
     border-radius exacto del elemento en cualquier navegador. */
  input:focus, select:focus-visible, textarea:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px #C75D3B;
  }
  /* Los botones no llevan anillo de foco: el click/tap ya se ve por el
     cambio de color propio de cada botón, y en botones redondeados el
     anillo se recortaba contra la esquina (bug ya reportado). */
  button:focus-visible {
    outline: none;
  }
  /* Mismo anillo pero hacia ADENTRO — para cajas chicas pegadas a un borde
     (el input de ícono personalizado), donde un anillo hacia afuera se ve
     como si el borde "se saliera". */
  .icon-inset-focus:focus {
    box-shadow: inset 0 0 0 2px #C75D3B;
  }
  button { font-family: inherit; cursor: pointer; color: inherit; }
  select { appearance: none; -webkit-appearance: none; background-image: none; }
  /* iOS Safari ignora font-size/height inline en <input type="date">; hay que
     anular su apariencia nativa o el campo sale gigante en mobile. */
  input[type="date"] { appearance: none; -webkit-appearance: none; }
  input[type="date"]::-webkit-date-and-time-value { text-align: left; }
  input::placeholder, textarea::placeholder { font-size: 13px; }
  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
  }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }
  /* Scroll sin barra visible — el resto de la app scrollea de a página
     completa (iOS ya la esconde sola ahí), pero un overflow:auto anidado
     (ej. la grilla de íconos) sí la muestra en desktop/otros navegadores. */
  .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
  /* Scrollbar delgada y con los colores de la app (no la gris nativa del SO)
     — para los pocos lugares donde SÍ hace falta ver que hay más contenido
     (ej. el textarea de Descripción con altura fija). */
  textarea {
    scrollbar-width: thin;
    scrollbar-color: #D9CFC1 transparent;
  }
  textarea::-webkit-scrollbar { width: 7px; }
  textarea::-webkit-scrollbar-track { background: transparent; }
  textarea::-webkit-scrollbar-thumb { background: #D9CFC1; border-radius: 10px; }
  textarea::-webkit-scrollbar-thumb:hover { background: #C9BBA0; }
  /* Feedback visual al cambiar de mes (flechas o swipe) en Transacciones y
     Estadísticas — sin esto, un swipe rápido no se distingue de que "no pasó
     nada" hasta que cambian los números. */
  @keyframes mm-slide-next { from { transform: translateX(18px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes mm-slide-prev { from { transform: translateX(-18px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  .mm-slide-next { animation: mm-slide-next 0.22s ease-out; }
  .mm-slide-prev { animation: mm-slide-prev 0.22s ease-out; }
`;

// Base compartida por todos los headers — quedan pegados arriba al hacer
// scroll (sticky, no fixed: así heredan el ancho de .screen directamente,
// sin necesitar el truco de left:50%+translateX que "fixed" exige para
// centrarse, el cual se desalinea en desktop cuando hay scrollbar de por
// medio).
const fixedHeaderBase = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  background: "#FBF8F2",
  borderBottom: "1px solid #ECE3D3",
  boxSizing: "border-box",
};

// minHeight: "100%" en vez de una unidad vh/dvh — en la Web App instalada de
// iOS, vh/dvh a veces reportan un alto mayor al visible real y dejan un hueco
// fantasma abajo; "100%" hereda de html/body (height:100% en globalCss), que
// sí refleja el alto visible correcto ahí.
export const styles = {
  app: {
    fontFamily: "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif",
    background: "#F7F2E9",
    minHeight: "100%",
    color: "#2B2620",
    display: "flex",
    justifyContent: "center",
  },
  screen: {
    width: "100%",
    maxWidth: 480,
    minHeight: "100%",
    background: "#FBF8F2",
    position: "relative",
    paddingBottom: 100,
    boxShadow: "0 0 0 1px #ECE3D3",
  },
  // Header "principal" — único, compartido por las 2 pantallas raíz (Tus
  // grupos / Configuración) vía el componente <RootHeader>. Que sea un solo
  // objeto en vez de uno por pantalla es a propósito: así no se puede volver
  // a desalinear un padding entre los dos sin querer.
  rootHeader: { ...fixedHeaderBase, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "calc(32px + env(safe-area-inset-top)) 20px 18px" },
  // Franja fija debajo del RootHeader (ej. mes + totales en Transacciones) —
  // va envuelta junto al RootHeader en un div "position:sticky" propio del
  // screen que lo usa (no acá, sería sticky dos veces sin sentido); esta
  // parte solo pone el look visual (fondo + separador).
  subHeader: { background: "#FBF8F2", borderBottom: "1px solid #ECE3D3", padding: "8px 20px", display: "flex", flexDirection: "column", gap: 4 },
  eyebrow: { margin: 0, fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#A8754A" },
  h1: { margin: "4px 0 0", fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em" },
  muted: { color: "#6B6355", fontSize: 14, padding: "0 20px", lineHeight: 1.5, fontFamily: "system-ui, sans-serif" },
  emptyState: { margin: "40px 20px", padding: "32px 20px", border: "1px dashed #D9CFC1", borderRadius: 14, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  emptyIcon: { width: 52, height: 52, borderRadius: "50%", background: "#F0E6D6", display: "flex", alignItems: "center", justifyContent: "center", color: "#C75D3B", marginBottom: 6 },
  emptyTitle: { fontWeight: 600, fontSize: 16, margin: "0 0 2px" },
  groupList: { listStyle: "none", margin: 0, padding: "12px 14px 4px", display: "flex", flexDirection: "column", gap: 8 },
  groupCard: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "1px solid #ECE3D3", borderRadius: 14, padding: "14px 14px", textAlign: "left" },
  groupCardLeft: { display: "flex", alignItems: "center", gap: 14 },
  avatarStack: { display: "flex", alignItems: "center" },
  avatar: { width: 32, height: 32, minWidth: 32, borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, border: "2px solid #FBF8F2", fontFamily: "system-ui, sans-serif" },
  groupName: { margin: 0, fontWeight: 600, fontSize: 15.5, color: "#2B2620" },
  groupMeta: { margin: "2px 0 0", fontSize: 12.5, color: "#6B6355", fontFamily: "system-ui, sans-serif" },
  topBar: { ...fixedHeaderBase, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(20px + env(safe-area-inset-top)) 14px 8px", gap: 8 },
  topBarTitle: { margin: 0, fontSize: 18, fontWeight: 600, flex: 1, textAlign: "center" },
  iconBtnGhost: { width: 36, height: 36, borderRadius: "50%", border: "none", background: "transparent", color: "#544A3C", display: "flex", alignItems: "center", justifyContent: "center" },
  iconBtnPrimary: { width: 44, height: 44, borderRadius: "50%", border: "none", background: "#C75D3B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(199,93,59,0.3)" },
  form: { padding: "12px 20px 28px", display: "flex", flexDirection: "column", gap: 14 },
  label: { fontSize: 13, fontWeight: 600, color: "#544A3C", display: "flex", flexDirection: "column", gap: 6, fontFamily: "system-ui, sans-serif" },
  input: { fontFamily: "system-ui, sans-serif", fontSize: 15, padding: "11px 13px", borderRadius: 10, border: "1px solid #DDD2BE", background: "#fff", color: "#2B2620" },
  btnDashed: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 10, border: "1px dashed #C9BBA0", background: "transparent", color: "#8A7253", fontSize: 13.5, fontFamily: "system-ui, sans-serif", fontWeight: 600 },
  btnPrimary: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, padding: "14px", borderRadius: 12, border: "none", background: "#C75D3B", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "system-ui, sans-serif", boxShadow: "0 6px 14px rgba(199,93,59,0.25)" },
  btnSecondary: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 4, width: "100%", padding: "12px", borderRadius: 12, border: "1px solid #DDD2BE", background: "#fff", color: "#544A3C", fontSize: 14, fontWeight: 600, fontFamily: "system-ui, sans-serif" },
  btnSecondarySmall: { width: 44, borderRadius: 10, border: "1px solid #DDD2BE", background: "#fff", color: "#544A3C", display: "flex", alignItems: "center", justifyContent: "center" },
  btnToday: { padding: "4px 10px", borderRadius: 20, border: "1px solid #DDD2BE", background: "#fff", color: "#544A3C", fontSize: 12, fontWeight: 600, fontFamily: "system-ui, sans-serif" },
  btnGhostSmall: { padding: "8px 14px", borderRadius: 8, border: "1px solid #DDD2BE", background: "#fff", fontSize: 13, fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", gap: 6, color: "#76695A" },
  btnDangerSmall: { padding: "8px 14px", borderRadius: 8, border: "none", background: "#B0473A", color: "#fff", fontSize: 13, fontFamily: "system-ui, sans-serif", fontWeight: 600 },
  btnPrimarySmall: { padding: "8px 14px", borderRadius: 8, border: "none", background: "#C75D3B", color: "#fff", fontSize: 13, fontFamily: "system-ui, sans-serif", fontWeight: 600 },
  // Sin margen lateral por defecto — la mayoría de los usos ya están anidados
  // dentro de un contenedor con su propio padding (styles.form); el único que
  // no lo está (borrar un gasto, pegado directo a styles.screen) le pasa su
  // propio margen lateral por afuera.
  // Sin margen ni borde superior a propósito — se pega directo debajo de la
  // fila/input que lo dispara (mismo radio que esa fila abajo, 0 arriba),
  // para que se vea como una sola tarjeta que cambia de color, no una caja
  // flotando aparte. El caller le pone su propio radio via el prop `radius`
  // de ConfirmInline, y debe achatar las esquinas de ABAJO de su propia fila
  // mientras el confirm está abierto (ver ejemplo ya armado: quitar miembro
  // de un grupo, en SplitLedgerTab.jsx).
  confirmBox: { padding: "10px 12px", background: "#FBEDE7", border: "1px solid #EBC9BA", borderTop: "none", fontFamily: "system-ui, sans-serif" },
  avatarRow: { display: "flex", gap: 8, overflowX: "auto", padding: "10px 20px 4px" },
  memberChip: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 52 },
  memberChipName: { fontSize: 10.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tabRow: { display: "flex", gap: 6, padding: "12px 20px 4px" },
  tab: { flex: 1, padding: "9px 0", borderRadius: 9, border: "1px solid #ECE3D3", background: "#fff", color: "#6B6355", fontSize: 12.5, fontWeight: 600, fontFamily: "system-ui, sans-serif" },
  tabActive: { flex: 1, padding: "9px 0", borderRadius: 9, border: "1px solid #C75D3B", background: "#C75D3B", color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: "system-ui, sans-serif" },
  splitModeRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  settledBox: { margin: "10px 20px 0", padding: 16, borderRadius: 12, background: "#EAF1ED", border: "1px solid #CFE2D7", display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#3B6E62", fontFamily: "system-ui, sans-serif", fontWeight: 600 },
  debtCard: { margin: "0 20px", padding: "12px 14px", borderRadius: 12, background: "#fff", border: "1px solid #ECE3D3", display: "flex", alignItems: "center", gap: 8, fontFamily: "system-ui, sans-serif" },
  debtPerson: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  debtName: { fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  debtMiddle: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 70 },
  debtAmount: { fontSize: 14, fontWeight: 700, color: "#C75D3B" },
  settleSmallBtn: { padding: "6px 12px", borderRadius: 8, border: "1px solid #C75D3B", background: "transparent", color: "#C75D3B", fontSize: 12, fontWeight: 700, fontFamily: "system-ui, sans-serif", marginLeft: "auto" },
  simplifyNote: { margin: "4px 20px 0", fontSize: 12, color: "#A8967A", fontFamily: "system-ui, sans-serif", textAlign: "center" },
  btnDangerOutline: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 4,
    width: "100%",
    padding: "12px",
    borderRadius: 12,
    border: "1px solid #EBC9BA",
    background: "#fff",
    color: "#B0473A",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "system-ui, sans-serif",
    cursor: "pointer",
  },
  collapsibleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "transparent",
    border: "none",
    padding: "4px 0",
    width: "100%",
    cursor: "pointer",
  },
  monthSeparator: {
    margin: "6px 20px 0",
    paddingBottom: 4,
    borderBottom: "1px solid #E8DFD0",
    display: "flex",
    alignItems: "center",
  },
  monthSeparatorText: {
    fontSize: 11.5,
    fontWeight: 700,
    fontFamily: "system-ui, sans-serif",
    color: "#A8967A",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  pairRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "#fff", border: "1px solid #ECE3D3" },
  expenseCard: { margin: "0 20px", padding: "11px 12px", borderRadius: 12, background: "#fff", border: "1px solid #ECE3D3", display: "flex", alignItems: "center", gap: 12, fontFamily: "system-ui, sans-serif", textAlign: "left", width: "calc(100% - 40px)" },
  paymentCard: { margin: "0 20px", padding: "11px 12px", borderRadius: 12, background: "#F3EFE5", border: "1px dashed #D9CFC1", display: "flex", alignItems: "center", gap: 12, fontFamily: "system-ui, sans-serif" },
  expenseIcon: { width: 36, height: 36, minWidth: 36, borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" },
  expenseTitle: { margin: 0, fontSize: 14, fontWeight: 600, fontFamily: "'Iowan Old Style', Georgia, serif", color: "#2B2620" },
  expenseSub: { margin: "2px 0 0", fontSize: 11.5, color: "#6B6355" },
  fab: { position: "fixed", bottom: 28, right: "max(20px, calc(50vw - 240px + 20px))", width: 56, height: 56, borderRadius: "50%", border: "none", background: "#C75D3B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(199,93,59,0.4)" },
  footer: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 480,
    display: "flex",
    gap: 10,
    padding: "12px 20px calc(12px + env(safe-area-inset-bottom))",
    background: "#FBF8F2",
    borderTop: "1px solid #ECE3D3",
    boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
    zIndex: 5,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(43,38,32,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    background: "#FBF8F2",
    borderRadius: 16,
    padding: "16px 20px 20px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  payerRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  payerChip: { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px 7px 7px", borderRadius: 20, border: "1.5px solid transparent", fontSize: 13, fontFamily: "system-ui, sans-serif", fontWeight: 600 },
  categoryGrid: { display: "flex", flexWrap: "wrap", gap: 6 },
  categoryChip: { display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 18, border: "1.5px solid transparent", fontSize: 12, fontFamily: "system-ui, sans-serif", fontWeight: 600, color: "#544A3C" },
  shareRow: { display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid #ECE3D3", background: "#fff", fontSize: 14, fontFamily: "system-ui, sans-serif", width: "100%" },
  shareAmount: { fontSize: 13, color: "#6B6355", fontWeight: 600 },
  checkbox: { width: 20, height: 20, minWidth: 20, borderRadius: 6, border: "1.5px solid #D9CFC1", display: "flex", alignItems: "center", justifyContent: "center" },
  checkboxOn: { background: "#C75D3B", borderColor: "#C75D3B" },
  customInput: { width: 80, fontFamily: "system-ui, sans-serif", fontSize: 14, padding: "7px 9px", borderRadius: 8, border: "1px solid #DDD2BE", textAlign: "right" },
  errText: { color: "#B0473A", fontSize: 13, fontFamily: "system-ui, sans-serif", margin: 0, background: "#FBEDE7", padding: "8px 12px", borderRadius: 8 },
  toast: { position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#2B2620", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontFamily: "system-ui, sans-serif", zIndex: 50, maxWidth: "90%", textAlign: "center" },

  // Barra de navegación inferior (5 tabs, fija, solo visible en la raíz de cada tab)
  tabBar: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 480,
    display: "flex",
    padding: "6px 4px calc(6px + env(safe-area-inset-bottom))",
    background: "#FBF8F2",
    borderTop: "1px solid #ECE3D3",
    zIndex: 10,
  },
  tabBarItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "6px 2px",
    background: "transparent",
    border: "none",
    color: "#8A7253",
    position: "relative",
    minWidth: 0,
  },
  tabBarItemActive: { color: "#C75D3B" },
  tabBarLabel: { fontSize: 10.5, fontFamily: "system-ui, sans-serif", fontWeight: 600, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tabBarBadge: { position: "absolute", top: 2, right: "24%", width: 8, height: 8, borderRadius: "50%", background: "#C75D3B" },
};
