import React, { useState } from "react";
import { offlineSupabase as supabase } from "../../lib/offlineSupabase.js";
import { styles } from "../../lib/styles.js";
import { TopBar, FormFooter, ToggleField, PickerField } from "../../components/Shared.jsx";

/* =========================================================================
   VALORES POR DEFECTO — qué se precarga al crear una transacción nueva SIN
   contexto (el "+" general de Transacciones/Estadísticas, no el de adentro
   de una cuenta puntual, que ya manda su propio defaultAccountId). Solo
   EvenCapital -- EvenGroup tiene su propio formulario de gasto, totalmente
   aparte, esto no lo toca.
   ========================================================================= */

export default function DefaultsSettingsScreen({ session, settings, groups, accounts, categories, reload, showError, onBack }) {
  const [defaultAccountId, setDefaultAccountId] = useState(settings.default_account_id || "");
  const [defaultExpenseCategoryId, setDefaultExpenseCategoryId] = useState(settings.default_expense_category_id || "");
  const [defaultIncomeCategoryId, setDefaultIncomeCategoryId] = useState(settings.default_income_category_id || "");
  const [defaultFuture, setDefaultFuture] = useState(!!settings.default_future_transactions);
  const [saving, setSaving] = useState(false);

  const isDirty = defaultAccountId !== (settings.default_account_id || "")
    || defaultExpenseCategoryId !== (settings.default_expense_category_id || "")
    || defaultIncomeCategoryId !== (settings.default_income_category_id || "")
    || defaultFuture !== !!settings.default_future_transactions;

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_settings").upsert({
        user_id: session.userId,
        default_account_id: defaultAccountId || null,
        default_expense_category_id: defaultExpenseCategoryId || null,
        default_income_category_id: defaultIncomeCategoryId || null,
        default_future_transactions: defaultFuture,
      }, { onConflict: "user_id" });
      if (error) throw error;
      await reload();
      onBack();
    } catch (e) { showError(`No se pudo guardar: ${e?.message || e}`); }
    setSaving(false);
  };

  const expenseCategoryItems = categories.filter((c) => c.type === "expense" && (!c.deleted || c.id === defaultExpenseCategoryId)).map((c) => ({ value: c.id, label: c.name, icon: c.icon, deleted: c.deleted }));
  const incomeCategoryItems = categories.filter((c) => c.type === "income" && (!c.deleted || c.id === defaultIncomeCategoryId)).map((c) => ({ value: c.id, label: c.name, icon: c.icon, deleted: c.deleted }));

  return (
    <div style={styles.screen}>
      <TopBar title="Valores por defecto" onBack={onBack} />
      <div style={styles.form}>
        <PickerField
          rowLabel="Cuenta por defecto"
          value={defaultAccountId}
          onChange={setDefaultAccountId}
          onClear={() => setDefaultAccountId("")}
          placeholder="Sin preferencia"
          title="Elegí una cuenta"
          groups={groups
            // Mismo criterio que en Filtros/TransactionForm: la cuenta pseudo
            // de EvenGroup no se elige a mano, no tiene sentido como default.
            .filter((g) => !g.deleted && g.system_key !== "split_ledger")
            .map((g) => ({
              label: g.name,
              items: accounts.filter((a) => a.group_id === g.id && ((!a.hidden && !a.deleted) || a.id === defaultAccountId)).map((a) => ({ value: a.id, label: a.name, icon: a.icon, deleted: a.deleted })),
            }))
            .filter((g) => g.items.length > 0)}
        />

        <PickerField
          rowLabel="Categoría de gasto por defecto"
          value={defaultExpenseCategoryId}
          onChange={setDefaultExpenseCategoryId}
          onClear={() => setDefaultExpenseCategoryId("")}
          placeholder="Sin preferencia"
          title="Elegí una categoría"
          groups={[{ label: null, items: expenseCategoryItems }]}
        />

        <PickerField
          rowLabel="Categoría de ingreso por defecto"
          value={defaultIncomeCategoryId}
          onChange={setDefaultIncomeCategoryId}
          onClear={() => setDefaultIncomeCategoryId("")}
          placeholder="Sin preferencia"
          title="Elegí una categoría"
          groups={[{ label: null, items: incomeCategoryItems }]}
        />

        <ToggleField
          label="Transacciones futuras por defecto"
          description="Al crear una transacción con fecha posterior a hoy, la opción de 'Transacción futura' estará activa por defecto: no se va a reflejar en tu saldo ni en Estadísticas hasta que llegue esa fecha."
          checked={defaultFuture}
          onChange={setDefaultFuture}
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
