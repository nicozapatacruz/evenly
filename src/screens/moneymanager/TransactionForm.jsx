import React, { useState, useEffect } from "react";
import { X, Menu, Plus, ArrowLeftRight } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { TopBar, Footer, ConfirmInline, IconInput, PickerField } from "../../components/Shared.jsx";
import { parseAmountInput, todayInputValue, dateInputValue, money } from "../../lib/helpers.jsx";
import { RECURRING_FREQUENCIES, nextOccurrence, computeAmountMain } from "../../lib/moneyManagerData.js";

const TYPE_INFO = {
  income: { label: "Ingreso", color: "#3B6E62" },
  expense: { label: "Gasto", color: "#C75D3B" },
  transfer: { label: "Transferencia", color: "#4A6FA5" },
};

/* =========================================================================
   NUEVA TRANSACCIÓN — Ingreso/Gasto/Transferencia en un solo formulario
   (igual que la app que estamos replicando). Nota: acá solo editamos el
   "título" corto (mapea a la columna `title`); `memo` (la nota larga) por
   ahora solo llega vía la importación masiva, todavía no es editable acá.
   ========================================================================= */

export default function TransactionForm({
  session, settings, groups, accounts, categories, onCancel, onSave, reloadCategories, showError,
  forceRecurringOpen = false, hideRemoveRecurring = false, editingTransaction = null, defaultDate = null,
}) {
  const [managingCategoryType, setManagingCategoryType] = useState(null); // "income" | "expense" | null

  const [type, setType] = useState(editingTransaction?.type || "expense");
  const [date, setDate] = useState(editingTransaction ? dateInputValue(new Date(editingTransaction.date).getTime()) : (defaultDate || todayInputValue()));
  const [amount, setAmount] = useState(editingTransaction ? String(editingTransaction.amount) : "");
  const [currency, setCurrency] = useState(editingTransaction?.currency || settings.main_currency);
  const [exchangeRate, setExchangeRate] = useState(editingTransaction?.exchange_rate ? String(editingTransaction.exchange_rate) : "");
  // La tasa se guarda siempre como "cuántas {moneda de la transacción} vale 1
  // {moneda principal}" (mismo formato de siempre) — este toggle solo cambia
  // qué lado se le pide escribir al usuario; se invierte antes de guardar.
  const [rateFlipped, setRateFlipped] = useState(false);
  const [categoryId, setCategoryId] = useState(editingTransaction?.category_id || "");
  const [accountId, setAccountId] = useState(editingTransaction?.account_id || "");
  const [toAccountId, setToAccountId] = useState(editingTransaction?.to_account_id || "");
  const [note, setNote] = useState(editingTransaction?.title || "");
  const [saving, setSaving] = useState(false);

  const [recurringOpen, setRecurringOpen] = useState(forceRecurringOpen);
  const [freqValue, setFreqValue] = useState("month-1");
  const [freqInterval, setFreqInterval] = useState("3");
  const [endDate, setEndDate] = useState("");

  const typeCategories = categories.filter((c) => c.type === (type === "income" ? "income" : "expense"));

  useEffect(() => {
    if (type === "transfer") { setCategoryId(""); return; }
    // Sin default — si la categoría elegida ya no es válida para este tipo
    // (o no se eligió ninguna todavía), queda vacía en vez de autoseleccionar
    // la primera de la lista.
    if (!typeCategories.find((c) => c.id === categoryId)) setCategoryId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, categories]);

  if (managingCategoryType) {
    return (
      <ManageCategories
        session={session}
        type={managingCategoryType}
        categories={categories}
        reload={reloadCategories}
        showError={showError}
        onBack={() => setManagingCategoryType(null)}
        initialCreating
      />
    );
  }

  // Si la transacción ya tenía una moneda que después se sacó de "Otras
  // monedas" en Ajustes, igual la mostramos acá — si no, el select se queda
  // sin esa opción y no hay forma de mantenerla al editar.
  const currencyOptions = [settings.main_currency, ...(settings.other_currencies || [])];
  if (!currencyOptions.includes(currency)) currencyOptions.push(currency);

  const numericAmount = parseAmountInput(amount);
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;
  const numericRate = parseAmountInput(exchangeRate);
  const canonicalRate = rateFlipped && numericRate ? 1 / numericRate : numericRate;
  const needsRate = currency !== settings.main_currency;
  const validRate = !needsRate || (!isNaN(canonicalRate) && canonicalRate > 0);

  const freq = RECURRING_FREQUENCIES.find((f) => f.value === freqValue);
  const customInterval = parseInt(freqInterval, 10);
  const recurringValid = !recurringOpen || (freq && (freq.interval !== null || customInterval >= 2));

  const canSave = validAmount && validRate && !!accountId && recurringValid && (
    type === "transfer" ? (!!toAccountId && toAccountId !== accountId) : !!categoryId
  );

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const txDate = new Date(date + "T12:00:00");
      const rate = needsRate ? canonicalRate : null;
      const amountMain = computeAmountMain(numericAmount, currency, settings.main_currency, rate);
      let recurring = null;
      if (recurringOpen) {
        const interval = freq.interval ?? customInterval;
        recurring = {
          repeat_unit: freq.unit,
          repeat_interval: interval,
          start_date: txDate.toISOString(),
          next_date: nextOccurrence(txDate, freq.unit, interval, txDate).toISOString(),
          end_date: endDate ? new Date(endDate + "T12:00:00").toISOString() : null,
        };
      }
      await onSave({
        id: editingTransaction?.id,
        type,
        account_id: accountId,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" ? null : categoryId,
        currency,
        amount: numericAmount,
        exchange_rate: rate,
        amount_main: amountMain,
        date: txDate.getTime(),
        title: note.trim() || null,
        memo: null,
        recurring,
      });
    } finally {
      setSaving(false);
    }
  };

  const accent = TYPE_INFO[type].color;

  return (
    <div style={styles.screen}>
      <TopBar title={editingTransaction ? `Editar ${TYPE_INFO[type].label}` : TYPE_INFO[type].label} onBack={onCancel} />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        <div style={{ ...styles.tabRow, padding: 0 }}>
          {Object.keys(TYPE_INFO).map((t) => (
            <button
              key={t}
              style={type === t
                ? { flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${TYPE_INFO[t].color}`, background: TYPE_INFO[t].color, color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: "system-ui, sans-serif" }
                : styles.tab}
              onClick={() => setType(t)}
            >
              {TYPE_INFO[t].label}
            </button>
          ))}
        </div>

        <label style={styles.label}>
          Fecha
          <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <label style={{ ...styles.label, flex: 1 }}>
            Importe
            <input style={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <select
            style={{ ...styles.input, width: 80, flexShrink: 0, padding: "11px 6px", textAlign: "center", fontWeight: 600, color: "#544A3C" }}
            value={currency}
            onChange={(e) => { setCurrency(e.target.value); setRateFlipped(false); }}
          >
            {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {needsRate && (
          <label style={styles.label}>
            1 {rateFlipped ? currency : settings.main_currency} equivale a
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input style={{ ...styles.input, width: "100%", paddingRight: 50 }} value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="1.00" inputMode="decimal" />
                <span style={{ position: "absolute", top: "50%", right: 13, transform: "translateY(-50%)", fontFamily: "system-ui, sans-serif", fontSize: 14, fontWeight: 600, color: "#544A3C", pointerEvents: "none" }}>
                  {rateFlipped ? settings.main_currency : currency}
                </span>
              </div>
              <button
                type="button"
                style={styles.btnSecondarySmall}
                onClick={() => {
                  setRateFlipped((f) => !f);
                  setExchangeRate((prev) => {
                    const n = parseAmountInput(prev);
                    if (!prev || isNaN(n) || n <= 0) return "";
                    return String(Number((1 / n).toPrecision(10)));
                  });
                }}
                aria-label="Invertir la tasa"
              >
                <ArrowLeftRight size={16} />
              </button>
            </div>
          </label>
        )}

        {needsRate && validAmount && validRate && (
          <p style={{ ...styles.muted, padding: 0, fontSize: 12.5, margin: 0 }}>
            {money(numericAmount, currency)} equivalen a {money(numericAmount / canonicalRate, settings.main_currency)}.
          </p>
        )}

        {type !== "transfer" && (
          <label style={styles.label}>
            Categoría
            <PickerField
              value={categoryId}
              onChange={(v) => {
                if (v === "__new__") { setManagingCategoryType(type === "income" ? "income" : "expense"); return; }
                setCategoryId(v);
              }}
              placeholder="Sin categorías"
              groups={[{
                label: null,
                items: [
                  ...typeCategories.map((c) => ({ value: c.id, label: c.name, icon: c.icon })),
                  { value: "__new__", label: "Nuevo", icon: "➕" },
                ],
              }]}
            />
          </label>
        )}

        <label style={styles.label}>
          {type === "transfer" ? "De" : "Cuenta"}
          <PickerField
            value={accountId}
            onChange={setAccountId}
            placeholder="Elegí una cuenta"
            groups={groups
              .map((g) => ({
                label: g.name,
                // Las ocultas no se muestran acá — salvo que sea la que ya
                // tenía elegida esta transacción, para no perder la selección
                // al editar una que usaba una cuenta que después ocultaste.
                items: accounts.filter((a) => a.group_id === g.id && (!a.hidden || a.id === accountId)).map((a) => ({ value: a.id, label: a.name, icon: a.icon })),
              }))
              .filter((g) => g.items.length > 0)}
          />
        </label>

        {type === "transfer" && (
          <label style={styles.label}>
            A
            <PickerField
              value={toAccountId}
              onChange={setToAccountId}
              placeholder="Elegí una cuenta"
              groups={groups
                .map((g) => ({
                  label: g.name,
                  items: accounts.filter((a) => a.group_id === g.id && a.id !== accountId && (!a.hidden || a.id === toAccountId)).map((a) => ({ value: a.id, label: a.name, icon: a.icon })),
                }))
                .filter((g) => g.items.length > 0)}
            />
          </label>
        )}

        <label style={styles.label}>
          Nota
          <input style={styles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </label>

        {!recurringOpen && !forceRecurringOpen && (
          <button style={styles.btnDashed} onClick={() => setRecurringOpen(true)}>
            Hacer {type === "transfer" ? "esta" : "este"} {TYPE_INFO[type].label.toLowerCase()} recurrente
          </button>
        )}

        {recurringOpen && (
          <RecurringFields
            type={type}
            date={date}
            freqValue={freqValue}
            setFreqValue={setFreqValue}
            freqInterval={freqInterval}
            setFreqInterval={setFreqInterval}
            endDate={endDate}
            setEndDate={setEndDate}
            onRemove={hideRemoveRecurring ? null : () => setRecurringOpen(false)}
          />
        )}
      </div>

      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onCancel}>Cancelar</button>
        <button
          style={{ flex: 1, marginTop: 0, padding: "12px", borderRadius: 12, border: "none", background: accent, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "system-ui, sans-serif", opacity: (saving || !canSave) ? 0.5 : 1 }}
          onClick={handleSave}
          disabled={saving || !canSave}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </Footer>
    </div>
  );
}

/* =========================================================================
   CAMPOS DE RECURRENCIA — Frecuencia (con intervalo custom para "Cada X
   semanas/meses"), Fecha de fin, y dos mensajes separados: uno informativo
   (siempre presente, dice CUÁNDO se repite) y una advertencia (solo cuando
   el día elegido puede no existir en algún mes/año futuro).
   ========================================================================= */

function RecurringFields({ type, date, freqValue, setFreqValue, freqInterval, setFreqInterval, endDate, setEndDate, onRemove }) {
  const freq = RECURRING_FREQUENCIES.find((f) => f.value === freqValue);
  const txDate = date ? new Date(date + "T12:00:00") : null;
  const dayOfMonth = txDate?.getDate();
  const monthIndex = txDate?.getMonth(); // 0 = enero, 1 = febrero...
  const monthName = txDate?.toLocaleDateString("es-ES", { month: "long" });
  const weekdayName = txDate?.toLocaleDateString("es-ES", { weekday: "long" });
  const interval = freq?.interval ?? parseInt(freqInterval, 10);

  // Mensaje informativo — siempre presente, explica CUÁNDO se repite.
  let explanation = "";
  if (freq?.unit === "week" && weekdayName) {
    const cadence = interval === 1 ? "cada semana" : `cada ${interval} semanas`;
    explanation = `Se repetirá ${cadence}, siempre los días ${weekdayName} (el mismo día de la semana que la Fecha de arriba).`;
  } else if (freq?.unit === "month" && dayOfMonth) {
    const cadence = interval === 1 ? "de cada mes" : `de cada ${interval} meses`;
    explanation = `Se repetirá el día ${dayOfMonth} ${cadence} (el mismo día que la Fecha de arriba).`;
  } else if (freq?.unit === "year" && dayOfMonth) {
    explanation = `Se repetirá cada año el ${dayOfMonth} de ${monthName} (la misma fecha de arriba).`;
  }

  // Advertencia — solo aparece cuando el ajuste de fin de mes de verdad puede
  // pasar. Para "cada mes", cualquier día 29/30/31 puede caer en un mes corto.
  // Para "cada año", el único caso real es el 29 de febrero en un año no
  // bisiesto — el 30 o 31 de cualquier otro mes existe todos los años igual.
  let warning = "";
  if (freq?.unit === "month" && dayOfMonth >= 29) {
    warning = `El día ${dayOfMonth} no existe en todos los meses — cuando eso pase, se va a usar el último día real de ese mes.`;
  } else if (freq?.unit === "year" && dayOfMonth === 29 && monthIndex === 1) {
    warning = "El 29 de febrero no existe en los años no bisiestos — esos años se va a usar el 28.";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff" }}>
      <label style={styles.label}>
        Frecuencia
        <select style={styles.input} value={freqValue} onChange={(e) => setFreqValue(e.target.value)}>
          {RECURRING_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </label>

      {freq?.interval === null && (
        <label style={styles.label}>
          {freq.unit === "week" ? "Cada cuántas semanas" : "Cada cuántos meses"}
          <input style={styles.input} type="number" min={2} value={freqInterval} onChange={(e) => setFreqInterval(e.target.value)} />
        </label>
      )}

      <label style={styles.label}>
        Fecha de fin (opcional)
        <input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>

      {(explanation || warning) && (
        <div>
          {explanation && <p style={{ ...styles.muted, padding: 0, fontSize: 12.5, margin: 0 }}>{explanation}</p>}
          {warning && <p style={{ ...styles.muted, padding: 0, fontSize: 12.5, margin: 0, color: "#A8754A" }}>{warning}</p>}
        </div>
      )}

      {onRemove && (
        <button style={{ background: "none", border: "none", color: "#B0473A", fontSize: 13.5, fontWeight: 600, fontFamily: "system-ui, sans-serif", padding: "4px 0", textAlign: "left", cursor: "pointer" }} onClick={onRemove}>
          Eliminar recurrencia
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   GESTIONAR CATEGORÍAS (de ingreso o de gasto — son 2 listas separadas,
   sin subcategorías por ahora)
   ========================================================================= */

export function ManageCategories({ session, type, categories, reload, showError, onBack, initialCreating = false }) {
  const [creating, setCreating] = useState(initialCreating);
  const typeCategories = categories.filter((c) => c.type === type);
  const [names, setNames] = useState(() => Object.fromEntries(typeCategories.map((c) => [c.id, c.name])));
  const [icons, setIcons] = useState(() => Object.fromEntries(typeCategories.map((c) => [c.id, c.icon])));
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [order, setOrder] = useState(() => typeCategories.map((c) => c.id));

  useEffect(() => {
    setOrder(typeCategories.map((c) => c.id));
    setNames(Object.fromEntries(typeCategories.map((c) => [c.id, c.name])));
    setIcons(Object.fromEntries(typeCategories.map((c) => [c.id, c.icon])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, type]);

  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const newOrder = arrayMove(order, order.indexOf(active.id), order.indexOf(over.id));
    setOrder(newOrder);
    try {
      const results = await Promise.all(newOrder.map((id, i) => supabase.from("mm_categories").update({ sort_order: i }).eq("id", id)));
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      await reload();
    } catch (e) { showError(`No se pudo guardar el orden: ${e?.message || e}`); await reload(); }
  };

  const renameCategory = async (id) => {
    const name = (names[id] || "").trim();
    const cat = typeCategories.find((c) => c.id === id);
    if (!name || name === cat.name) return;
    try {
      const { error } = await supabase.from("mm_categories").update({ name }).eq("id", id);
      if (error) throw error;
      await reload();
    } catch (e) { showError(`No se pudo renombrar: ${e?.message || e}`); }
  };

  const saveIcon = async (id, icon) => {
    const cat = typeCategories.find((c) => c.id === id);
    if ((icon || null) === (cat.icon || null)) return;
    try {
      const { error } = await supabase.from("mm_categories").update({ icon: icon || null }).eq("id", id);
      if (error) throw error;
      await reload();
    } catch (e) { showError(`No se pudo guardar el ícono: ${e?.message || e}`); }
  };

  const removeCategory = async (id) => {
    try {
      const { error } = await supabase.from("mm_categories").update({ deleted: true }).eq("id", id);
      if (error) throw error;
      await reload();
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setConfirmRemoveId(null);
  };

  if (creating) {
    return (
      <NewCategoryForm
        session={session}
        type={type}
        categories={categories}
        reload={reload}
        showError={showError}
        onCancel={() => setCreating(false)}
        onCreated={() => setCreating(false)}
      />
    );
  }

  return (
    <div style={styles.screen}>
      <TopBar
        title={type === "income" ? "Categorías de ingreso" : "Categorías de gasto"}
        onBack={onBack}
        right={<button style={styles.iconBtnGhost} onClick={() => setCreating(true)} aria-label="Nueva categoría"><Plus size={20} /></button>}
      />
      <div style={styles.form}>
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {order.map((id) => {
                const c = typeCategories.find((x) => x.id === id);
                if (!c) return null;
                return (
                  <div key={id}>
                    <SortableCategoryManageRow
                      id={id}
                      name={names[id] ?? c.name}
                      icon={icons[id] ?? c.icon}
                      onChangeName={(v) => setNames((prev) => ({ ...prev, [id]: v }))}
                      onBlur={() => renameCategory(id)}
                      onChangeIcon={(v) => { setIcons((prev) => ({ ...prev, [id]: v })); saveIcon(id, v); }}
                      onRemove={() => setConfirmRemoveId(id)}
                      isConfirming={confirmRemoveId === id}
                    />
                    {confirmRemoveId === id && (
                      <ConfirmInline
                        message={`¿Borrar "${c.name}"?`}
                        confirmLabel="Borrar"
                        onCancel={() => setConfirmRemoveId(null)}
                        onConfirm={() => removeCategory(id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

// Formulario de "nueva categoría" propio (TopBar + Footer), mismo patrón que
// NewGroupForm/NewAccountForm — reemplaza el input+botón sueltos de abajo.
function NewCategoryForm({ session, type, categories, reload, showError, onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);
  const canSave = !!name.trim();

  const create = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_categories").insert({
        user_id: session.userId, type, name: name.trim(), icon: icon || null, sort_order: categories.filter((c) => c.type === type).length,
      });
      if (error) throw error;
      await reload();
      onCreated();
    } catch (e) { showError(`No se pudo crear: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Nueva categoría" onBack={onCancel} />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label style={{ ...styles.label, flex: 1 }}>
            Nombre
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" onKeyDown={(e) => e.key === "Enter" && canSave && create()} />
          </label>
          <label style={styles.label}>
            Ícono
            <IconInput value={icon} onChange={setIcon} />
          </label>
        </div>
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onCancel}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !canSave) ? 0.5 : 1 }} onClick={create} disabled={saving || !canSave}>
          {saving ? "Creando…" : "Crear"}
        </button>
      </Footer>
    </div>
  );
}

function SortableCategoryManageRow({ id, name, icon, onChangeName, onBlur, onChangeIcon, onRemove, isConfirming }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 6, padding: "6px 8px 6px 4px", borderRadius: isConfirming ? "10px 10px 0 0" : 10 }}>
      <span {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", width: 28, color: "#C9BBA0", cursor: "grab", touchAction: "none" }}>
        <Menu size={18} />
      </span>
      <IconInput value={icon} onChange={onChangeIcon} />
      <input style={{ ...styles.input, flex: 1, padding: "7px 10px", fontSize: 14 }} value={name} onChange={(e) => onChangeName(e.target.value)} onBlur={onBlur} />
      <button style={styles.iconBtnGhost} onClick={onRemove} aria-label="Borrar categoría">
        <X size={16} />
      </button>
    </div>
  );
}
