import React, { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { TopBar, Footer, ConfirmInline, Field } from "../../components/Shared.jsx";
import { CURRENCIES, CURRENCY_LIST } from "../../lib/helpers.jsx";

/* =========================================================================
   AJUSTES DE MONEDA — moneda principal + una lista ordenada de "otras
   monedas" (opcional). Esa lista, en ese orden, es la que aparece en el
   selector de moneda de cada transacción (junto a la principal, siempre
   primera). No hay más una "moneda secundaria" única ni una tasa fija
   global — la tasa se pide en el momento de cada transacción puntual.
   ========================================================================= */

export default function CurrencySettingsScreen({ session, settings, reload, showError, onBack }) {
  const [mainCurrency, setMainCurrency] = useState(settings.main_currency);
  const [otherCurrencies, setOtherCurrencies] = useState(() => (settings.other_currencies || []).filter((c) => c !== settings.main_currency));
  const [saving, setSaving] = useState(false);
  const [confirmRemoveCode, setConfirmRemoveCode] = useState(null);

  // Si cambiás la principal a una moneda que ya estaba en "otras", se saca
  // de ahí sola (no tiene sentido que esté en las dos listas a la vez).
  useEffect(() => {
    setOtherCurrencies((prev) => prev.filter((c) => c !== mainCurrency));
  }, [mainCurrency]);

  const availableToAdd = CURRENCY_LIST.filter((c) => c !== mainCurrency && !otherCurrencies.includes(c));
  const isDirty = mainCurrency !== settings.main_currency
    || JSON.stringify(otherCurrencies) !== JSON.stringify(settings.other_currencies || []);

  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setOtherCurrencies((prev) => arrayMove(prev, prev.indexOf(active.id), prev.indexOf(over.id)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_settings").upsert({
        user_id: session.userId,
        main_currency: mainCurrency,
        other_currencies: otherCurrencies,
      }, { onConflict: "user_id" });
      if (error) throw error;
      await reload();
      onBack();
    } catch (e) { showError(`No se pudo guardar: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Ajustes de moneda" onBack={onBack} />
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        <Field label="Moneda principal" info="Es la moneda por defecto de las cuentas.">
          <select style={styles.input} value={mainCurrency} onChange={(e) => setMainCurrency(e.target.value)}>
            {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </Field>

        <div>
          <p style={styles.label}>Otras monedas</p>
          <p style={{ ...styles.muted, padding: 0, marginTop: -6, marginBottom: 8 }}>
            Aparecen en ese orden en el selector de moneda de cada transacción.
          </p>
          {otherCurrencies.length === 0 && (
            <p style={{ ...styles.muted, padding: 0, marginBottom: 8 }}>Todavía no agregaste ninguna.</p>
          )}
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={otherCurrencies} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {otherCurrencies.map((c) => (
                  <div key={c}>
                    <SortableCurrencyRow code={c} isConfirming={confirmRemoveCode === c} onRemove={() => setConfirmRemoveCode(c)} draggable={otherCurrencies.length > 1} />
                    {confirmRemoveCode === c && (
                      <ConfirmInline
                        message={`¿Quitar ${c} de la lista?`}
                        confirmLabel="Quitar"
                        onCancel={() => setConfirmRemoveCode(null)}
                        onConfirm={() => { setOtherCurrencies((prev) => prev.filter((x) => x !== c)); setConfirmRemoveCode(null); }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {availableToAdd.length > 0 && (
            <select
              style={{ ...styles.input, marginTop: 8 }}
              value=""
              onChange={(e) => { if (e.target.value) setOtherCurrencies((prev) => [...prev, e.target.value]); }}
            >
              <option value="" disabled hidden>+ Agregar moneda</option>
              {availableToAdd.map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
            </select>
          )}
        </div>
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onBack}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !isDirty) ? 0.5 : 1 }} onClick={save} disabled={saving || !isDirty}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </Footer>
    </div>
  );
}

function SortableCurrencyRow({ code, isConfirming, onRemove, draggable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: code, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={{ ...style, ...styles.shareRow, gap: 8, padding: "10px 14px", borderRadius: isConfirming ? "10px 10px 0 0" : 10 }}>
      {/* Sin ícono de arrastrar si hay un solo ítem — no hay con qué reordenar. */}
      {draggable ? (
        <span {...attributes} {...listeners} style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", width: 28, color: "#C9BBA0", cursor: "grab", touchAction: "none" }}>
          <Menu size={18} />
        </span>
      ) : (
        <span style={{ width: 28, flexShrink: 0 }} />
      )}
      {/* gap:6 acá adentro — el texto no tiene padding propio como un botón,
          necesita su propio espacio visible hasta el botón de borrar. Solo
          el handle necesita los 4px del gap de la fila. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ flex: 1, fontFamily: "system-ui, sans-serif", fontSize: 14 }}>{code} ({CURRENCIES[code].symbol})</span>
        <button style={styles.iconBtnGhost} onClick={onRemove} aria-label={`Quitar ${code}`}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
