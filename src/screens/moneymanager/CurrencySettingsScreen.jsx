import React, { useState } from "react";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { TopBar } from "../../components/Shared.jsx";
import { CURRENCIES, CURRENCY_LIST } from "../../lib/helpers.jsx";

/* =========================================================================
   AJUSTES DE MONEDA — moneda principal + una moneda secundaria opcional con
   su tasa de cambio (misma idea que baseCurrency+rates en Split Ledger).
   ========================================================================= */

export default function CurrencySettingsScreen({ session, settings, reload, showError, onBack }) {
  const [mainCurrency, setMainCurrency] = useState(settings.main_currency);
  const [secondaryCurrency, setSecondaryCurrency] = useState(settings.secondary_currency || "");
  const [secondaryRate, setSecondaryRate] = useState(settings.secondary_rate ? String(settings.secondary_rate) : "");
  const [saving, setSaving] = useState(false);

  const canSave = !!mainCurrency && (!secondaryCurrency || (secondaryCurrency !== mainCurrency && parseFloat(secondaryRate) > 0));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_settings").upsert({
        user_id: session.userId,
        main_currency: mainCurrency,
        secondary_currency: secondaryCurrency || null,
        secondary_rate: secondaryCurrency ? parseFloat(secondaryRate) : null,
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
        <label style={styles.label}>
          Moneda principal
          <select style={styles.input} value={mainCurrency} onChange={(e) => setMainCurrency(e.target.value)}>
            {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </label>

        <label style={styles.label}>
          Moneda secundaria (opcional)
          <select style={styles.input} value={secondaryCurrency} onChange={(e) => setSecondaryCurrency(e.target.value)}>
            <option value="">Ninguna</option>
            {CURRENCY_LIST.filter((c) => c !== mainCurrency).map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </label>

        {secondaryCurrency && (
          <label style={styles.label}>
            Tasa ({mainCurrency} → {secondaryCurrency})
            <input style={styles.input} value={secondaryRate} onChange={(e) => setSecondaryRate(e.target.value)} placeholder="1.00" inputMode="decimal" />
          </label>
        )}

        <button style={{ ...styles.btnPrimary, opacity: (saving || !canSave) ? 0.5 : 1 }} onClick={save} disabled={saving || !canSave}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
