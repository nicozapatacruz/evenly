import React, { useState } from "react";
import { offlineSupabase as supabase } from "../../lib/offlineSupabase.js";
import { styles } from "../../lib/styles.js";
import { TopBar, FormFooter, ToggleField, PickerField } from "../../components/Shared.jsx";

const STARTUP_TAB_OPTIONS = [
  { value: "", label: "Sin preferencia" },
  { value: "ledger", label: "Transacciones" },
  { value: "stats", label: "Estadísticas" },
  { value: "accounts", label: "Cuentas" },
  { value: "evengroup", label: "EvenGroup" },
];

// Mismo look que MenuRow (ConfigScreen.jsx) para un ítem "todavía no
// existe" -- no se reusa ese componente (vive del lado de afuera, en
// config/, que ya importa las pantallas de acá, no al revés), se duplica
// a mano este pedacito nomás, igual que ya se hace con otros badges chicos
// entre pantallas (ver TransactionDayGroups.jsx/SearchScreen.jsx).
function ComingSoonRow({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 40, borderBottom: "1px solid #ECE3D3", fontFamily: "system-ui, sans-serif" }}>
      <span style={{ fontSize: 13.5, color: "#A89A87" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#A8754A", background: "#F0E6D6", padding: "3px 8px", borderRadius: 20 }}>Próximamente</span>
    </div>
  );
}

/* =========================================================================
   PREFERENCIAS — comportamiento general de la app que no es ni "período"
   (eso quedó en PeriodSettingsScreen) ni "valor por defecto de una
   transacción nueva" (eso vive en DefaultsSettingsScreen): autocompletar
   notas, pantalla de inicio, y los placeholders de apariencia/idioma.
   ========================================================================= */

export default function PreferencesScreen({ session, settings, reload, showError, onBack }) {
  const [autocomplete, setAutocomplete] = useState(settings.autocomplete_notes);
  const [startupTab, setStartupTab] = useState(settings.startup_tab || "");
  const [saving, setSaving] = useState(false);

  const isDirty = autocomplete !== settings.autocomplete_notes
    || startupTab !== (settings.startup_tab || "");

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_settings").upsert({
        user_id: session.userId,
        autocomplete_notes: autocomplete,
        startup_tab: startupTab || null,
      }, { onConflict: "user_id" });
      if (error) throw error;
      await reload();
      onBack();
    } catch (e) { showError(`No se pudo guardar: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Preferencias" onBack={onBack} />
      <div style={styles.form}>
        <ToggleField
          label="Autocompletar notas"
          description="Al crear una transacción, te sugerirá notas anteriores al llenar el campo de Notas."
          checked={autocomplete}
          onChange={setAutocomplete}
        />

        <PickerField
          rowLabel="Pantalla de inicio"
          info="La app va a abrir siempre en esta pestaña, en vez de la que quedó abierta la última vez."
          listStyle
          title="Pantalla de inicio"
          value={startupTab}
          onChange={setStartupTab}
          groups={[{ label: null, items: STARTUP_TAB_OPTIONS }]}
        />

        <ComingSoonRow label="Apariencia" />
        <ComingSoonRow label="Idioma" />
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
