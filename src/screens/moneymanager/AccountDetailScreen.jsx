import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient.js";
import { styles } from "../../lib/styles.js";
import { TopBar, Footer, ConfirmInline, IconInput, PickerField, ToggleField, Field } from "../../components/Shared.jsx";
import { money, CURRENCIES, CURRENCY_LIST } from "../../lib/helpers.jsx";
import { accountBalance, computeCreditCardBalance, creditCardNextPaymentDate, disableAutoPayForDeletedAccounts, useCreditCardActivity } from "../../lib/moneyManagerData.js";

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

const balanceColor = (n) => (n > 0.004 ? "#3B6E62" : n < -0.004 ? "#B0473A" : "#6B6355");

/* =========================================================================
   FORMULARIO DE CUENTA — un solo componente para crear y editar (mismo
   patrón que TransactionForm: `account` null es "nueva", con datos es
   "editar"). `groupLocked` aplica en los dos modos por igual — si entraste
   desde un grupo puntual (Editar grupo), no tiene sentido crear NI mover una
   cuenta a otro grupo desde ahí.
   ========================================================================= */

export default function AccountDetailScreen({ session, account = null, groups, accounts, accountTotals, settings, defaultGroupId, groupLocked = false, reload, showError, showInfo, onBack, onDeleted }) {
  const [groupId, setGroupId] = useState(account?.group_id || defaultGroupId || groups[0]?.id || "");
  const [name, setName] = useState(account?.name || "");
  const [icon, setIcon] = useState(account?.icon || "");
  // Restricción dura (ver PENDIENTES.md sección B): toda transacción de esta
  // cuenta queda en esta moneda. Editable mientras la cuenta no tenga
  // movimientos todavía (ver `hasTransactions` más abajo) — después queda
  // fija, para no invalidar el `amount_main` ya calculado de lo existente.
  const [currency, setCurrency] = useState(account?.currency || settings.main_currency);
  // Proxy de "tiene movimientos": la vista agregada (`accountTotals`) solo
  // trae una fila por cuenta que aparezca en mm_transactions — una cuenta
  // sin ningún movimiento todavía no tiene fila ahí.
  const hasTransactions = !!account && accountTotals.some((t) => t.account_id === account.id);
  const [isCreditCard, setIsCreditCard] = useState(account?.is_credit_card || false);
  const [paymentAccountId, setPaymentAccountId] = useState(account?.payment_account_id || "");
  const [statementDay, setStatementDay] = useState(account?.statement_day || 1);
  const [paymentDay, setPaymentDay] = useState(account?.payment_day || 1);
  const [autoPay, setAutoPay] = useState(account?.auto_pay || false);
  const [hidden, setHidden] = useState(account?.hidden || false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [touched, setTouched] = useState({});
  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));

  const { transactions: ccTx } = useCreditCardActivity(session.userId, isCreditCard && account ? [account.id] : []);

  // Al crear siempre es "dirty" (no hay un original con qué comparar) —
  // mismo criterio que TransactionForm.
  const isDirty = !account || (
    groupId !== account.group_id
    || name.trim() !== account.name
    || icon !== (account.icon || "")
    || currency !== account.currency
    || isCreditCard !== account.is_credit_card
    || paymentAccountId !== (account.payment_account_id || "")
    || statementDay !== (account.statement_day || 1)
    || paymentDay !== (account.payment_day || 1)
    || autoPay !== account.auto_pay
    || hidden !== account.hidden
  );
  const nameRequired = !name.trim();
  // Cuenta de pago es informativa salvo que el pago automático esté
  // prendido — ahí sí es obligatoria, porque el job no tiene de dónde sacar
  // la plata sin ella.
  const paymentAccountRequired = isCreditCard && autoPay && !paymentAccountId;
  // La tarjeta y su cuenta de pago tienen que ser de la misma moneda — el
  // pago automático mueve el mismo monto de una a otra, sin convertir nada
  // (ver PENDIENTES.md sección B). Si ya había una cuenta de pago elegida y
  // acá arriba cambiás la moneda de la tarjeta, queda en conflicto: hay que
  // quitarla primero, no se resuelve solo.
  const paymentAccountCurrencyMismatch = isCreditCard && !!paymentAccountId
    && accounts.find((a) => a.id === paymentAccountId)?.currency !== currency;
  // Si esta cuenta ya es la cuenta de pago de otra tarjeta, no se puede
  // convertir en tarjeta ella misma — mismo motivo que ya impide elegir una
  // tarjeta como cuenta de pago en el selector de abajo ("no tiene sentido
  // pagar una tarjeta con otra"). Hay que cambiarle la cuenta de pago a esa
  // otra tarjeta primero.
  const dependentPaymentCards = account
    ? accounts.filter((a) => a.payment_account_id === account.id && a.is_credit_card && !a.deleted)
    : [];
  const becomingCardConflict = isCreditCard && dependentPaymentCards.length > 0;
  // Cuenta pseudo de un grupo vinculado de Split Ledger — se desvincula
  // desde ahí, no se edita/borra acá (rompería la referencia del vínculo).
  const isSystemAccount = !!account && groups.find((g) => g.id === account.group_id)?.system_key === "split_ledger";
  const canSave = isDirty && !nameRequired && !!groupId && !paymentAccountRequired && !paymentAccountCurrencyMismatch && !becomingCardConflict && !isSystemAccount;

  // Mismo criterio que el selector de cuentas de TransactionForm: agrupado
  // por grupo de cuentas, sin ocultas/eliminadas (salvo que sea la ya
  // elegida, para no perder la selección) — y sin otras tarjetas de crédito,
  // porque no tiene sentido pagar una tarjeta con otra. Tampoco se muestran
  // cuentas de otra moneda a la de esta tarjeta — salvo la ya elegida, para
  // que el conflicto de arriba se pueda ver y resolver, no desaparezca solo.
  const paymentAccountGroups = groups
    // El grupo "Split Ledger" (auto-creado al vincular un grupo compartido)
    // es puramente informativo — esas cuentas nunca se eligen a mano en
    // ningún lado (ver TransactionForm), tampoco acá como cuenta de pago.
    .filter((g) => !g.deleted && g.system_key !== "split_ledger")
    .map((g) => ({
      label: g.name,
      items: accounts
        .filter((a) => a.group_id === g.id && (!account || a.id !== account.id) && !a.is_credit_card && (a.currency === currency || a.id === paymentAccountId) && ((!a.hidden && !a.deleted) || a.id === paymentAccountId))
        .map((a) => ({ value: a.id, label: a.name, icon: a.icon, deleted: a.deleted })),
    }))
    .filter((g) => g.items.length > 0);
  const balance = isCreditCard
    ? computeCreditCardBalance(account?.id, ccTx, statementDay)
    : { total: account ? accountBalance(account.id, accountTotals) : 0 };

  const handleSave = async () => {
    if (saving) return;
    // Si falta algo, en vez de quedarse callado (el botón atenuado no dice
    // por qué) revela los textos de ayuda de los campos que nunca se
    // llegaron a "tocar" — así siempre queda explicado, aunque el usuario
    // nunca haya entrado/salido de ese campo.
    if (!canSave) { setTouched({ name: true, paymentAccountId: true }); return; }
    setSaving(true);
    try {
      // next_payment_date solo se toca cuando de verdad cambia el estado
      // relevante (se prende auto_pay, o cambia payment_day mientras ya
      // estaba prendido) — no en cada "Guardar", si no el reloj del pago
      // automático se reiniciaría cada vez que editás cualquier otra cosa.
      let nextPaymentDate; // undefined = no tocar la columna
      if (!isCreditCard || !autoPay) {
        nextPaymentDate = null;
      } else if (!account || !account.auto_pay || paymentDay !== (account.payment_day || 1)) {
        nextPaymentDate = creditCardNextPaymentDate(paymentDay).toISOString();
      }
      const payload = {
        group_id: groupId,
        name: name.trim(),
        icon: icon || null,
        currency,
        is_credit_card: isCreditCard,
        payment_account_id: isCreditCard ? (paymentAccountId || null) : null,
        statement_day: isCreditCard ? statementDay : null,
        payment_day: isCreditCard ? paymentDay : null,
        auto_pay: isCreditCard ? autoPay : false,
        hidden,
        ...(nextPaymentDate !== undefined ? { next_payment_date: nextPaymentDate } : {}),
      };
      const { error } = account
        ? await supabase.from("mm_accounts").update(payload).eq("id", account.id)
        : await supabase.from("mm_accounts").insert({ user_id: session.userId, sort_order: 999, ...payload });
      if (error) throw error;
      await reload();
      onBack();
    } catch (e) { showError(`No se pudo ${account ? "guardar" : "crear"}: ${e?.message || e}`); }
    setSaving(false);
  };

  // Tarjetas con pago automático que se van a quedar sin cuenta de pago si
  // se borra esta cuenta — se avisa porque el borrado apaga auto_pay en
  // cascada en esas tarjetas (ver disableAutoPayForDeletedAccounts), no
  // porque vaya a quedar "colgado".
  const dependentAutoPayCards = account
    ? accounts.filter((a) => a.payment_account_id === account.id && a.auto_pay && !a.deleted)
    : [];

  const remove = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("mm_accounts").update({ deleted: true }).eq("id", account.id);
      if (error) throw error;
      await disableAutoPayForDeletedAccounts([account.id]);
      await reload();
      showInfo(`"${account.name}" eliminada.`);
      onDeleted();
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setDeleting(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar
        title={account ? "Editar cuenta" : "Nueva cuenta"}
        onBack={onBack}
        right={account && !isSystemAccount && (
          <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(true)} aria-label="Eliminar">
            <Trash2 size={18} />
          </button>
        )}
      />
      {account && confirmDelete && (
        <ConfirmInline
          title={dependentAutoPayCards.length > 0 ? "ATENCIÓN" : undefined}
          message={dependentAutoPayCards.length > 0
            ? `"${account.name}" es la cuenta de pago de ${dependentAutoPayCards.map((c) => `"${c.name}"`).join(", ")}\nEl pago automático de esa${dependentAutoPayCards.length > 1 ? "s tarjetas" : " tarjeta"} se desactivará al eliminar.\n\n¿Eliminar igual?`
            : `¿Eliminar "${account.name}"?`}
          confirmLabel="Eliminar"
          confirmDisabled={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
          style={{ margin: "6px 20px 12px", borderRadius: 12, borderTop: "1px solid #EBC9BA" }}
        />
      )}
      <div style={{ ...styles.form, paddingBottom: 100 }}>
        <Field label="Grupo">
          <select style={{ ...styles.input, opacity: groupLocked ? 0.6 : 1 }} value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={groupLocked}>
            {groups.filter((g) => !g.deleted).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>

        <Field label="Nombre" required error={touched.name && nameRequired ? "Este campo es obligatorio." : ""}>
          <div style={{ display: "flex", gap: 8 }}>
            <IconInput value={icon} onChange={setIcon} />
            <input style={{ ...styles.input, flex: 1 }} value={name} disabled={isSystemAccount} onChange={(e) => setName(e.target.value)} onBlur={() => touch("name")} placeholder="Nombre (ej: Saldo, Ahorros)" />
          </div>
        </Field>
        {isSystemAccount && (
          <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
            Representa un grupo vinculado de Split Ledger — se desvincula desde ahí, no se edita acá.
          </p>
        )}

        <Field label="Moneda" info={hasTransactions ? "Esta cuenta ya tiene movimientos asociados. No se puede cambiar la moneda." : undefined}>
          <select style={{ ...styles.input, opacity: hasTransactions ? 0.6 : 1 }} value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={hasTransactions}>
            {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </Field>

        <ToggleField
          label="Tarjeta de crédito"
          description="Los gastos se reflejan como saldo a pagar según un ciclo de facturación."
          checked={isCreditCard}
          onChange={setIsCreditCard}
          error={becomingCardConflict
            ? `Es la cuenta de pago de ${dependentPaymentCards.map((c) => `"${c.name}"`).join(", ")}. Cambiale la cuenta de pago a ${dependentPaymentCards.length > 1 ? "esas tarjetas" : "esa tarjeta"} antes de convertir esta en tarjeta.`
            : ""}
        />

        {isCreditCard && (
          <>
            <Field
              label="Cuenta de pago"
              info="Cuenta de la cual se pagará esta tarjeta de crédito."
              required={autoPay}
              error={paymentAccountCurrencyMismatch
                ? "La cuenta de pago asociada está en otra moneda. Para cambiar la moneda de la tarjeta debés quitar la cuenta asociada primero y luego asociar una en la misma moneda."
                : (touched.paymentAccountId && paymentAccountRequired ? "Este campo es obligatorio." : "")}
            >
              <PickerField
                value={paymentAccountId}
                onChange={setPaymentAccountId}
                onClear={() => setPaymentAccountId("")}
                onBlur={() => touch("paymentAccountId")}
                placeholder="Elegí una cuenta"
                groups={paymentAccountGroups}
                emptyMessage="No hay cuentas en esa moneda para elegir."
              />
            </Field>
            {accounts.find((a) => a.id === paymentAccountId)?.deleted && (
              <p style={{ ...styles.muted, padding: 0, marginTop: -8, color: "#B0473A", display: "flex", alignItems: "center", gap: 5 }}>
                <Trash2 size={13} /> Esta cuenta fue eliminada.
              </p>
            )}
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
            {(statementDay >= 29 || paymentDay >= 29) && (
              <p style={{ ...styles.muted, padding: 0, marginTop: -8, color: "#A8754A" }}>
                Si el día elegido no existe en algún mes (ej. 30 o 31 en febrero), se va a usar el último día real de ese mes.
              </p>
            )}
            <ToggleField
              label="Pago automático"
              description="Transfiere automáticamente el saldo a pagar en la fecha de pago."
              checked={autoPay}
              onChange={setAutoPay}
            />
          </>
        )}

        {account && (
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
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 14 }}>Saldo actual</span>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, fontWeight: 700, color: balanceColor(balance.total) }}>{money(balance.total, settings.main_currency)}</span>
              </div>
            )}
          </div>
        )}

        <ToggleField
          label="Ocultar"
          description="Oculta esta cuenta del listado de Cuentas."
          checked={hidden}
          onChange={setHidden}
        />
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onBack}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !canSave) ? 0.5 : 1 }} onClick={handleSave} disabled={saving}>
          {saving ? (account ? "Guardando…" : "Creando…") : (account ? "Guardar" : "Crear")}
        </button>
      </Footer>
    </div>
  );
}
