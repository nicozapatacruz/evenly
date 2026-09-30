import React, { useState } from "react";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { TopBar, ToggleField, Field } from "../../components/Shared.jsx";
import { WEEKDAY_OPTIONS } from "../../lib/moneyManagerData.js";

const STARTUP_TAB_OPTIONS = [
  { value: "", label: "Sin preferencia" },
  { value: "ledger", label: "Transacciones" },
  { value: "stats", label: "Estadísticas" },
  { value: "accounts", label: "Cuentas" },
  { value: "splitledger", label: "Split Ledger" },
];

/* =========================================================================
   DETALLES DEL PERÍODO — día de inicio del mes/semana, autocompletar notas
   (el toggle vive acá; la función en sí de sugerir notas anteriores todavía
   no está construida — ver memoria de simplificaciones) y la tab de inicio.
   ========================================================================= */

export default function PeriodSettingsScreen({ session, settings, reload, showError, showInfo, onBack }) {
  const [monthStartDay, setMonthStartDay] = useState(settings.month_start_day);
  const [weekStartDay, setWeekStartDay] = useState(settings.week_start_day);
  const [autocomplete, setAutocomplete] = useState(settings.autocomplete_notes);
  const [startupTab, setStartupTab] = useState(settings.startup_tab || "");
  const [saving, setSaving] = useState(false);

  // silent=true para el toggle (el switch ya se ve moverse solo — un toast
  // ahí sería ruido); los <select> sin botón sí lo necesitan, no dan
  // ninguna otra pista de que la elección llegó a guardarse.
  const save = async (patch, { silent = false } = {}) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_settings").upsert({ user_id: session.userId, ...patch }, { onConflict: "user_id" });
      if (error) throw error;
      await reload();
      if (!silent) showInfo("Guardado.");
    } catch (e) { showError(`No se pudo guardar: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Detalles del período" onBack={onBack} />
      <div style={{ ...styles.form, opacity: saving ? 0.6 : 1 }}>
        <Field label="Día de inicio del mes">
          <select
            style={styles.input}
            value={monthStartDay}
            onChange={(e) => { const v = parseInt(e.target.value, 10); setMonthStartDay(v); save({ month_start_day: v }); }}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>

        <Field label="Día de inicio de la semana">
          <select
            style={styles.input}
            value={weekStartDay}
            onChange={(e) => { setWeekStartDay(e.target.value); save({ week_start_day: e.target.value }); }}
          >
            {WEEKDAY_OPTIONS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </Field>

        <ToggleField
          label="Autocompletar notas"
          description="Sugerir notas anteriores al escribir"
          checked={autocomplete}
          onChange={(v) => { setAutocomplete(v); save({ autocomplete_notes: v }, { silent: true }); }}
        />

        <Field label="Pantalla de inicio">
          <select
            style={styles.input}
            value={startupTab}
            onChange={(e) => { setStartupTab(e.target.value); save({ startup_tab: e.target.value || null }); }}
          >
            {STARTUP_TAB_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>La app va a abrir siempre en esta pestaña, en vez de la que quedó abierta la última vez.</p>
      </div>
    </div>
  );
}
