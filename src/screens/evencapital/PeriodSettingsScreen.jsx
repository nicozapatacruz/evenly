import React, { useRef, useState } from "react";
import { offlineSupabase as supabase } from "../../lib/offlineSupabase.js";
import { styles } from "../../lib/styles.js";
import { TopBar, FormFooter, PickerField } from "../../components/Shared.jsx";
import { WEEKDAY_OPTIONS } from "../../lib/evenCapitalData.js";

/* =========================================================================
   DETALLES DEL PERÍODO — día de inicio del mes/semana, los únicos 2 campos
   que de verdad definen "qué es un período" acá (el resto de lo que vivía
   en esta pantalla -- autocompletar notas, pantalla de inicio -- se mudó a
   Preferencias, no tenía nada que ver con esto). Formulario común (Guardar
   en el footer), no autoguardado -- antes cada cambio se guardaba solo,
   único formulario de la app con ese patrón.
   ========================================================================= */

export default function PeriodSettingsScreen({ session, settings, reload, showError, onBack }) {
  const [monthStartDay, setMonthStartDay] = useState(settings.month_start_day);
  const monthStartDayRef = useRef(settings.month_start_day);
  const [weekStartDay, setWeekStartDay] = useState(settings.week_start_day);
  const [saving, setSaving] = useState(false);

  const isDirty = monthStartDay !== settings.month_start_day
    || weekStartDay !== settings.week_start_day;

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_settings").upsert({
        user_id: session.userId,
        month_start_day: monthStartDay,
        week_start_day: weekStartDay,
      }, { onConflict: "user_id" });
      if (error) throw error;
      await reload();
      onBack();
    } catch (e) { showError(`No se pudo guardar: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Detalles del período" onBack={onBack} />
      <div style={styles.form}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif" }}>
          <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 13, color: "#6B6355" }}>Día de inicio del mes</span>
          <input
            className="row-input"
            style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13.5, fontFamily: "system-ui, sans-serif", border: "none", background: "transparent", padding: 0, color: "#2B2620" }}
            inputMode="numeric"
            value={monthStartDay}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setMonthStartDay(digits === "" ? "" : parseInt(digits, 10));
            }}
            onBlur={() => {
              const n = Number(monthStartDay);
              if (Number.isInteger(n) && n >= 1 && n <= 28) {
                monthStartDayRef.current = n;
                setMonthStartDay(n);
              } else {
                setMonthStartDay(monthStartDayRef.current);
              }
            }}
          />
        </div>

        <PickerField
          rowLabel="Día de inicio de la semana"
          listStyle
          title="Día de inicio de la semana"
          value={weekStartDay}
          onChange={setWeekStartDay}
          groups={[{ label: null, items: WEEKDAY_OPTIONS }]}
        />
      </div>
      <FormFooter
        onCancel={onBack}
        onConfirm={save}
        confirmLabel={saving ? "Guardando…" : "Guardar"}
        confirmDisabled={saving || !isDirty}
        confirmDim={!isDirty}
      />
    </div>
  );
}
