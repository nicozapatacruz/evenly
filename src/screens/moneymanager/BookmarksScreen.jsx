import React, { useState } from "react";
import { Plus, Pencil, Check, X, Menu, ArrowLeftRight } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { styles } from "../../lib/styles.js";
import { TopBar, ConfirmInline, EmptyState } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { useBookmarks, createBookmark, deleteBookmark, reorderBookmarks } from "../../lib/bookmarksData.js";
import { searchTransactions } from "../../lib/moneyManagerData.js";

const TYPE_LABEL = { income: "Ingreso", expense: "Gasto", transfer: "Transferencia" };
const TYPE_COLOR = { income: "#3B6E62", expense: "#B0473A", transfer: "#4A6FA5" };

/* =========================================================================
   MARCADORES — plantillas de transacción reutilizables (Money Manager).
   Pantalla raíz: lista agrupada por tipo (Ingreso/Gasto/Transferencia), con
   un modo "gestionar" (lápiz) para reordenar/borrar, y un "+" que abre un
   selector de transacciones ya guardadas para convertir una en marcador.
   Tocar un marcador (fuera del modo gestionar) abre el formulario de nueva
   transacción ya completado — ver TransactionForm `prefillBookmark`.
   ========================================================================= */
export default function BookmarksScreen({ userId, accounts, categories, onBack, onUseBookmark, showError, showInfo }) {
  const { bookmarks, loading, reload } = useBookmarks(userId);
  const [managing, setManaging] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const grouped = ["expense", "income", "transfer"]
    .map((type) => ({ type, items: bookmarks.filter((b) => b.type === type) }))
    .filter((g) => g.items.length > 0);

  const handleRemove = async (id, name) => {
    try {
      await deleteBookmark(id);
      await reload();
      showInfo(`"${name}" eliminado.`);
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
  };

  const handleReorder = async (type, orderedIds) => {
    try { await reorderBookmarks(orderedIds); await reload(); }
    catch (e) { showError(`No se pudo guardar el orden: ${e?.message || e}`); await reload(); }
  };

  if (showPicker) {
    return (
      <BookmarkPickerScreen
        userId={userId}
        accounts={accounts}
        categories={categories}
        onBack={() => setShowPicker(false)}
        onPicked={async (tx) => {
          try {
            const { duplicate } = await createBookmark(userId, tx);
            if (duplicate) { showError("Ya existe un marcador igual a esta transacción."); return; }
            await reload();
            setShowPicker(false);
          } catch (e) { showError(`No se pudo guardar el marcador: ${e?.message || e}`); }
        }}
        showError={showError}
      />
    );
  }

  return (
    <div style={styles.screen}>
      <TopBar
        title="Marcadores"
        onBack={onBack}
        right={
          <div style={{ display: "flex", gap: 4 }}>
            <button style={styles.iconBtnGhost} onClick={() => setManaging((v) => !v)} aria-label={managing ? "Listo" : "Gestionar"}>
              {managing ? <Check size={19} /> : <Pencil size={18} />}
            </button>
            {!managing && (
              <button style={styles.iconBtnGhost} onClick={() => setShowPicker(true)} aria-label="Agregar marcador">
                <Plus size={20} />
              </button>
            )}
          </div>
        }
      />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        {loading && <EmptyState title="Cargando…" />}
        {!loading && grouped.length === 0 && (
          <EmptyState title="Todavía no tenés marcadores">
            Tocá el "+" de arriba y elegí una transacción ya cargada para guardarla como atajo.
          </EmptyState>
        )}
        {grouped.map(({ type, items }) => (
          <div key={type}>
            <p style={{ ...styles.label, display: "block", margin: "0 0 8px" }}>{TYPE_LABEL[type]}</p>
            <BookmarkGroup
              type={type}
              items={items}
              accounts={accounts}
              categories={categories}
              managing={managing}
              onUse={onUseBookmark}
              onRemove={handleRemove}
              onReorder={(orderedIds) => handleReorder(type, orderedIds)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BookmarkGroup({ type, items, accounts, categories, managing, onUse, onRemove, onReorder }) {
  const [order, setOrder] = useState(() => items.map((b) => b.id));
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  React.useEffect(() => { setOrder(items.map((b) => b.id)); }, [items]);

  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const newOrder = arrayMove(order, order.indexOf(active.id), order.indexOf(over.id));
    setOrder(newOrder);
    onReorder(newOrder);
  };

  return (
    <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden", marginBottom: 14 }}>
          {order.map((id, i) => {
            const b = items.find((x) => x.id === id);
            if (!b) return null;
            const name = b.title || categories.find((c) => c.id === b.category_id)?.name || "este marcador";
            return (
              <div key={id}>
                <SortableBookmarkRow
                  id={id}
                  bookmark={b}
                  accounts={accounts}
                  categories={categories}
                  managing={managing}
                  last={i === order.length - 1}
                  draggable={order.length > 1}
                  onUse={() => onUse(b)}
                  onRemove={() => setConfirmRemoveId(id)}
                />
                {confirmRemoveId === id && (
                  <ConfirmInline
                    message={`¿Borrar "${name}"?`}
                    confirmLabel="Borrar"
                    onCancel={() => setConfirmRemoveId(null)}
                    onConfirm={async () => { await onRemove(id, name); setConfirmRemoveId(null); }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableBookmarkRow({ id, bookmark, accounts, categories, managing, last, draggable, onUse, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !draggable || !managing });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const account = accounts.find((a) => a.id === bookmark.account_id);
  const toAccount = accounts.find((a) => a.id === bookmark.to_account_id);
  const category = categories.find((c) => c.id === bookmark.category_id);
  const color = TYPE_COLOR[bookmark.type];

  const content = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
      <span style={{ width: 20, display: "flex", justifyContent: "center", flexShrink: 0, fontSize: 17 }}>
        {bookmark.type === "transfer" ? <ArrowLeftRight size={16} color={color} /> : (category?.icon || "")}
      </span>
      <div style={{ minWidth: 0, textAlign: "left" }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, fontFamily: "system-ui, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {bookmark.title || category?.name || "Sin nota"}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "#6B6355", fontFamily: "system-ui, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {bookmark.type === "transfer"
            ? `${account?.icon || ""} ${account?.name || "—"} → ${toAccount?.icon || ""} ${toAccount?.name || "—"}`
            : `${account?.icon || ""} ${account?.name || "—"}`}
        </p>
      </div>
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: last ? "none" : "1px solid #F5F1E8", fontFamily: "system-ui, sans-serif" }}
    >
      {managing && (
        draggable
          ? <span {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", width: 28, color: "#C9BBA0", cursor: "grab", touchAction: "none", flexShrink: 0 }}><Menu size={18} /></span>
          : <span style={{ width: 28, flexShrink: 0 }} />
      )}
      {managing ? content : (
        <button onClick={onUse} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          {content}
        </button>
      )}
      <span style={{ fontWeight: 600, fontSize: 14, color, flexShrink: 0 }}>{money(bookmark.amount, bookmark.currency)}</span>
      {managing && (
        <button onClick={onRemove} aria-label="Borrar marcador" style={styles.iconBtnGhost}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   SELECTOR ("+") — lista plana de transacciones ya guardadas (más
   recientes primero) para elegir cuál convertir en marcador. Reutiliza
   searchTransactions sin filtros (ya trae hasta 500, ordenadas).
   ========================================================================= */
function BookmarkPickerScreen({ userId, accounts, categories, onBack, onPicked, showError }) {
  const [transactions, setTransactions] = useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await searchTransactions(userId, {});
        if (!cancelled) setTransactions(data);
      } catch (e) {
        if (!cancelled) { setTransactions([]); showError(`No se pudo cargar: ${e?.message || e}`); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div style={styles.screen}>
      <TopBar title="Elegí una transacción" onBack={onBack} />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        {transactions === null && <EmptyState title="Cargando…" />}
        {transactions?.length === 0 && <EmptyState title="No hay transacciones todavía" />}
        {transactions && transactions.length > 0 && (
          <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
            {transactions.map((t, i) => {
              const account = accounts.find((a) => a.id === t.account_id);
              const toAccount = accounts.find((a) => a.id === t.to_account_id);
              const category = categories.find((c) => c.id === t.category_id);
              const color = TYPE_COLOR[t.type];
              return (
                <button
                  key={t.id}
                  onClick={() => onPicked(t)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", borderBottom: i === transactions.length - 1 ? "none" : "1px solid #F5F1E8", background: "none", border: "none", fontFamily: "system-ui, sans-serif", textAlign: "left", cursor: "pointer" }}
                >
                  <span style={{ width: 20, display: "flex", justifyContent: "center", flexShrink: 0, fontSize: 17 }}>
                    {t.type === "transfer" ? <ArrowLeftRight size={16} color={color} /> : (category?.icon || "")}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.title || category?.name || "Sin nota"}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#6B6355", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.type === "transfer"
                        ? `${account?.icon || ""} ${account?.name || "—"} → ${toAccount?.icon || ""} ${toAccount?.name || "—"}`
                        : `${account?.icon || ""} ${account?.name || "—"}`}
                    </p>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 14, color, flexShrink: 0 }}>{money(t.amount, t.currency)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
