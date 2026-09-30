import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { TopBar, Footer, ConfirmInline, IconInput, PickerField, ToggleField, Field } from "../../components/Shared.jsx";
import { money } from "../../lib/helpers.jsx";
import { accountBalance, computeCreditCardBalance, useCreditCardActivity } from "../../lib/moneyManagerData.js";

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

const balanceColor = (n) => (n > 0.004 ? "#3B6E62" : n < -0.004 ? "#B0473A" : "#6B6355");

/* =========================================================================
   DETALLE DE CUENTA — reemplaza la edición inline que había en la fila
   (nombre/ícono/ocultar/borrar) y agrega lo de tarjeta de crédito. Es un
   formulario con Footer Cancelar/Guardar (no autoguarda como Configuración)
   — mismos campos y misma estructura que NewAccountForm, esto es su
   contraparte de edición.
   ========================================================================= */

export default function AccountDetailScreen({ session, account, groups, accounts, accountTotals, settings, reload, showError, showInfo, onBack, onDeleted }) {
  const [groupId, setGroupId] = useState(account.group_id);
  const [name, setName] = useState(account.name);
  const [icon, setIcon] = useState(account.icon || "");
  const [isCreditCard, setIsCreditCard] = useState(account.is_credit_card);
  const [paymentAccountId, setPaymentAccountId] = useState(account.payment_account_id || "");
  const [statementDay, setStatementDay] = useState(account.statement_day || 1);
  const [paymentDay, setPaymentDay] = useState(account.payment_day || 1);
  const [autoPay, setAutoPay] = useState(account.auto_pay);
  const [hidden, setHidden] = useState(account.hidden);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { transactions: ccTx } = useCreditCardActivity(session.userId, isCreditCard ? [account.id] : []);

  const isDirty = (
    groupId !== account.group_id
    || name.trim() !== account.name
    || icon !== (account.icon || "")
    || isCreditCard !== account.is_credit_card
    || paymentAccountId !== (account.payment_account_id || "")
    || statementDay !== (account.statement_day || 1)
    || paymentDay !== (account.payment_day || 1)
    || autoPay !== account.auto_pay
    || hidden !== account.hidden
  );
  const canSave = isDirty && !!name.trim() && !!groupId;

  // Sin otras tarjetas de crédito como opción — no tiene sentido pagar una
  // tarjeta con otra.
  const paymentAccountOptions = accounts.filter((a) => a.id !== account.id && !a.deleted && !a.is_credit_card);
  const balance = isCreditCard
    ? computeCreditCardBalance(account.id, ccTx, statementDay)
    : { total: accountBalance(account.id, accountTotals) };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_accounts").update({
        group_id: groupId,
        name: name.trim(),
        icon: icon || null,
        is_credit_card: isCreditCard,
        payment_account_id: isCreditCard ? (paymentAccountId || null) : null,
        statement_day: isCreditCard ? statementDay : null,
        payment_day: isCreditCard ? paymentDay : null,
        auto_pay: isCreditCard ? autoPay : false,
        hidden,
      }).eq("id", account.id);
      if (error) throw error;
      await reload();
      onBack();
    } catch (e) { showError(`No se pudo guardar: ${e?.message || e}`); }
    setSaving(false);
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("mm_accounts").update({ deleted: true }).eq("id", account.id);
      if (error) throw error;
      await reload();
      showInfo(`"${account.name}" eliminada.`);
      onDeleted();
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setDeleting(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar
        title="Editar cuenta"
        onBack={onBack}
        right={
          <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(true)} aria-label="Eliminar">
            <Trash2 size={18} />
          </button>
        }
      />
      {confirmDelete && (
        <ConfirmInline
          message={`¿Eliminar "${account.name}"?`}
          confirmLabel="Eliminar"
          confirmDisabled={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
          style={{ margin: "6px 20px 12px", borderRadius: 12, borderTop: "1px solid #EBC9BA" }}
        />
      )}
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        <Field label="Grupo">
          <select style={styles.input} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.filter((g) => !g.deleted).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>

        <Field label="Nombre">
          <div style={{ display: "flex", gap: 8 }}>
            <IconInput value={icon} onChange={setIcon} />
            <input style={{ ...styles.input, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </Field>

        <ToggleField
          label="Tarjeta de crédito"
          description="Los gastos se reflejan como saldo a pagar según un ciclo de facturación."
          checked={isCreditCard}
          onChange={setIsCreditCard}
        />

        {isCreditCard && (
          <>
            <Field label="Cuenta de pago" info="Cuenta de la cual se pagará esta tarjeta de crédito.">
              <PickerField
                value={paymentAccountId}
                onChange={setPaymentAccountId}
                placeholder="Elegí una cuenta"
                groups={[{ label: null, items: paymentAccountOptions.map((a) => ({ value: a.id, label: a.name, icon: a.icon })) }]}
              />
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Fecha de liquidación" info="Día del mes en que cierra el ciclo de facturación de la tarjeta." style={{ flex: 1 }}>
                <select style={styles.input} value={statementDay} onChange={(e) => setStatementDay(parseInt(e.target.value, 10))}>
                  {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Fecha de pago" info="Día del mes en que se realiza el pago automático de la tarjeta." style={{ flex: 1 }}>
                <select style={styles.input} value={paymentDay} onChange={(e) => setPaymentDay(parseInt(e.target.value, 10))}>
                  {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            </div>
            <ToggleField
              label="Pago automático"
              description="Transfiere automáticamente el saldo a pagar en la fecha de pago."
              checked={autoPay}
              onChange={setAutoPay}
            />
          </>
        )}

        <div style={{ borderRadius: 14, border: "1px solid #ECE3D3", background: "#fff", overflow: "hidden" }}>
          {isCreditCard ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #F0EBE2" }}>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 14 }}>Saldo a pagar</span>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, fontWeight: 700, color: balanceColor(balance.pasado) }}>{money(balance.pasado, settings.main_currency)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px" }}>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 14 }}>Saldo restante</span>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, fontWeight: 700, color: balanceColor(balance.actual) }}>{money(balance.actual, settings.main_currency)}</span>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px" }}>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 14 }}>Saldo</span>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, fontWeight: 700, color: balanceColor(balance.total) }}>{money(balance.total, settings.main_currency)}</span>
            </div>
          )}
        </div>

        <ToggleField
          label="Ocultar"
          description="Oculta esta cuenta del listado de Cuentas."
          checked={hidden}
          onChange={setHidden}
        />
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onBack}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !canSave) ? 0.5 : 1 }} onClick={handleSave} disabled={saving || !canSave}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </Footer>
    </div>
  );
}
