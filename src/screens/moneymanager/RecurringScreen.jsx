import React, { useState } from "react";
import { Plus, Repeat, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { ConfirmInline, EmptyState } from "../../components/Shared.jsx";
import { money, fmtDate } from "../../lib/helpers.jsx";
import { RECURRING_FREQUENCIES } from "../../lib/moneyManagerData.js";

const TYPE_LABEL = { income: "Ingreso", expense: "Gasto", transfer: "Transferencia" };
const TYPE_COLOR = { income: "#3B6E62", expense: "#C75D3B", transfer: "#4A6FA5" };

function freqLabel(r) {
  const preset = RECURRING_FREQUENCIES.find((f) => f.unit === r.repeat_unit && f.interval === r.repeat_interval);
  if (preset) return preset.label;
  return r.repeat_unit === "week" ? `Cada ${r.repeat_interval} semanas` : `Cada ${r.repeat_interval} meses`;
}

/* =========================================================================
   TRANSACCIONES REPETIDAS — vive dentro de Configuración → Money Manager.
   Sin RootHeader propio (esa sección ya vive bajo el header de Config). El
   "+" no abre nada acá adentro — pide a ConfigScreen que muestre el
   TransactionForm a pantalla completa (mismo patrón que ChangePasswordScreen
   /ProfileScreen: reemplaza toda la pantalla, no queda anidado bajo el
   header de Config).
   ========================================================================= */

export default function RecurringScreen({ accounts, recurring, reload, showError, showInfo, onCreateNew }) {
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";

  const removeRecurring = async (id) => {
    try {
      const { error } = await supabase.from("mm_recurring").delete().eq("id", id);
      if (error) throw error;
      await reload();
      showInfo("Transacción repetida eliminada.");
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setConfirmRemoveId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {recurring.length === 0 && (
        <EmptyState icon={<Repeat size={28} strokeWidth={1.5} />} title="Todavía no hay transacciones repetidas">
          Tocá "Nueva transacción repetida" para crear la primera.
        </EmptyState>
      )}
      {recurring.map((r) => (
        <div key={r.id}>
          <div style={{ ...styles.shareRow, alignItems: "flex-start", flexDirection: "column", gap: 4, borderRadius: confirmRemoveId === r.id ? "10px 10px 0 0" : 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <span style={{ fontWeight: 700, color: TYPE_COLOR[r.type] }}>{TYPE_LABEL[r.type]} · {money(r.amount, r.currency)}</span>
              <button style={styles.iconBtnGhost} onClick={() => setConfirmRemoveId(r.id)} aria-label="Borrar recurrencia">
                <X size={16} />
              </button>
            </div>
            <span style={{ fontSize: 12.5, color: "#6B6355", fontFamily: "system-ui, sans-serif" }}>
              {freqLabel(r)} · {accountName(r.account_id)}{r.type === "transfer" ? ` → ${accountName(r.to_account_id)}` : ""} · próxima: {fmtDate(new Date(r.next_date).getTime())}
            </span>
          </div>
          {confirmRemoveId === r.id && (
            <ConfirmInline
              message="¿Borrar esta transacción repetida? No borra las que ya se generaron."
              confirmLabel="Borrar"
              onCancel={() => setConfirmRemoveId(null)}
              onConfirm={() => removeRecurring(r.id)}
            />
          )}
        </div>
      ))}
      <button style={styles.btnDashed} onClick={onCreateNew}>
        <Plus size={16} /> Nueva transacción repetida
      </button>
    </div>
  );
}
