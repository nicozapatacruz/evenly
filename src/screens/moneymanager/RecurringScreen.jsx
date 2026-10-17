import React from "react";
import { Plus, Repeat, ChevronRight } from "lucide-react";
import { styles } from "../../lib/styles.js";
import { EmptyState } from "../../components/Shared.jsx";
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
   TRANSACCIONES RECURRENTES — vive dentro de Configuración → Money Manager.
   Sin RootHeader propio (esa sección ya vive bajo el header de Config). El
   "+" no abre nada acá adentro — pide a ConfigScreen que muestre el
   TransactionForm a pantalla completa (mismo patrón que ChangePasswordScreen
   /ProfileScreen: reemplaza toda la pantalla, no queda anidado bajo el
   header de Config). Borrar una recurrente tampoco pasa acá -- toda la fila
   solo abre "Editar recurrente" (como tocar una fila de grupo), y ese
   formulario tiene su propia papelera en el header, igual que editar un
   gasto.
   ========================================================================= */

export default function RecurringScreen({ accounts, categories, recurring, onCreateNew, onEdit }) {
  const account = (id) => accounts.find((a) => a.id === id);
  const category = (id) => categories.find((c) => c.id === id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {recurring.length === 0 && (
        <EmptyState icon={<Repeat size={28} strokeWidth={1.5} />} title="Todavía no hay transacciones recurrentes">
          Tocá "Nueva transacción recurrente" para crear la primera.
        </EmptyState>
      )}
      {recurring.map((r) => (
        <button
          key={r.id}
          onClick={() => onEdit(r)}
          style={{ ...styles.shareRow, alignItems: "center", gap: 10, borderRadius: 10, width: "100%", textAlign: "left", background: "#fff", border: "1px solid #ECE3D3" }}
        >
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontWeight: 700, color: TYPE_COLOR[r.type] }}>
              {TYPE_LABEL[r.type]} · {money(r.amount, r.currency)}{r.title ? ` → ${r.title}` : ""}
            </span>
            <span style={{ fontSize: 12.5, color: "#6B6355", fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
              {account(r.account_id)?.icon && <span style={{ fontSize: 13 }}>{account(r.account_id).icon}</span>}
              {account(r.account_id)?.name || "—"}
              {r.type === "transfer" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  → {account(r.to_account_id)?.icon && <span style={{ fontSize: 13 }}>{account(r.to_account_id).icon}</span>}
                  {account(r.to_account_id)?.name || "—"}
                </span>
              )}
              {r.type !== "transfer" && (() => {
                const c = category(r.category_id);
                return (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    · {c?.icon && <span style={{ fontSize: 13 }}>{c.icon}</span>}
                    {c ? c.name : "Sin categoría"}
                  </span>
                );
              })()}
            </span>
            <span style={{ fontSize: 12.5, color: "#6B6355", fontFamily: "system-ui, sans-serif" }}>
              {freqLabel(r)} · próxima: {fmtDate(new Date(r.next_date).getTime())}
            </span>
          </div>
          <ChevronRight size={20} color="#A89A87" style={{ flexShrink: 0 }} />
        </button>
      ))}
      <button style={styles.btnDashed} onClick={onCreateNew}>
        <Plus size={16} /> Nueva transacción recurrente
      </button>
    </div>
  );
}
