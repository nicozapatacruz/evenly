import React, { useState, useEffect, useRef } from "react";
import { X, Menu, Plus, Trash2, Copy, Star, Divide, Lock } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { offlineSupabase as supabase } from "../../lib/offlineSupabase.js";
import { styles } from "../../lib/styles.js";
import { TopBar, Footer, FormFooter, ConfirmInline, IconInput, PickerField, Field, Modal, CalculatorAmountInput, CurrencyConversionField, SegmentedControl, DateRow, TextRow, formatDateRow, Hint } from "../../components/Shared.jsx";
import { parseAmountInput, todayInputValue, dateInputValue, dateInputValueInZone, money, fmtDate, useScrollToTopOnChange, useScrollIntoViewOnChange, normalizeForSearch, CURRENCIES, useTouched } from "../../lib/helpers.jsx";
import { RECURRING_FREQUENCIES, nextOccurrence, computeAmountMain, useRecentNoteTitles } from "../../lib/evenCapitalData.js";

const TYPE_INFO = {
  income: { label: "Ingreso", newLabel: "Nuevo ingreso", color: "#3B6E62" },
  expense: { label: "Gasto", newLabel: "Nuevo gasto", color: "#C75D3B" },
  transfer: { label: "Transferencia", newLabel: "Nueva transferencia", color: "#4A6FA5" },
};

// "Este gasto"/"Este ingreso"/"Esta transferencia" -- para el cartel de
// isSynced, único lugar donde hace falta la frase completa con género.
const TYPE_DEMONYM = { income: "Este ingreso", expense: "Este gasto", transfer: "Esta transferencia" };

// Color del importe "hero" — distinto de TYPE_INFO[type].color (que sigue
// siendo el acento terracota/verde/azul usado en otros lugares de la app,
// como antes); acá es rojo/verde/tinta plana, igual que el resto de montos
// con signo en Evenly. Sin signo −/+ antepuesto (a pedido: el color ya
// comunica gasto/ingreso, el signo sobraba).
const AMOUNT_COLOR = { expense: "#B0473A", income: "#3B6E62", transfer: "#2B2420" };

// Deriva freqValue/freqInterval (estado de este formulario) a partir de una
// fila de mm_recurring ya existente — mismo criterio de "match exacto, si no
// cae en la variante -x" que ya usa freqLabel en RecurringScreen.jsx.
function recurringToFreqState(r) {
  const exact = RECURRING_FREQUENCIES.find((f) => f.unit === r.repeat_unit && f.interval === r.repeat_interval);
  if (exact) return { freqValue: exact.value, freqInterval: String(r.repeat_interval) };
  return { freqValue: r.repeat_unit === "week" ? "week-x" : "month-x", freqInterval: String(r.repeat_interval) };
}

/* =========================================================================
   NUEVA TRANSACCIÓN — Ingreso/Gasto/Transferencia en un solo formulario
   (igual que la app que estamos replicando). Los nombres de columna no
   coinciden con las etiquetas que ve el usuario: "Descripción" (lo que
   identifica el gasto, se ve en todos lados) mapea a `title`; "Nota" (info
   extra, solo visible al abrir la transacción) mapea a `memo`.
   ========================================================================= */

export default function TransactionForm({
  session, settings, groups, accounts, categories, onCancel, onSave, onSaveRecurring, onDelete, onDeleteRecurring, onBookmark, reloadCategories, showError, showInfo,
  forceRecurringOpen = false, hideRemoveRecurring = false, editingTransaction = null, editingRecurring = null, defaultDate = null, defaultAccountId = null,
  prefillBookmark = null, slLinks = null, onOpenEvenGroupExpense = null, isOnline = true,
}) {
  const [managingCategoryType, setManagingCategoryType] = useState(null); // "income" | "expense" | null
  useScrollToTopOnChange(managingCategoryType);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  // Copiar no navega a ningún lado ni guarda nada solo: convierte este mismo
  // formulario en uno de "nueva transacción" con los datos ya completados
  // (como pediste, igual que la app original) — así el usuario puede ajustar
  // algo más antes de guardar, en vez de tener que reabrir lo recién creado.
  const [isCopyMode, setIsCopyMode] = useState(false);
  const effectiveEditing = isCopyMode ? null : editingTransaction;

  // Viene de EvenGroup — la reconciliación controla para siempre monto,
  // cuenta, fecha y tipo (se recalculan solos la próxima vez que corra); acá
  // quedan bloqueados para no pelear contra eso. Categoría y nota quedan
  // libres — esos nunca los toca la reconciliación. En modo copia deja de
  // aplicar: la copia es una transacción independiente, no sincronizada.
  const isSynced = !isCopyMode && !!editingTransaction?.sl_link_id;
  // De dónde volver en EvenGroup — `sl_link_id` es el vínculo, no el
  // grupo directamente.
  const splitLink = isSynced ? slLinks?.find((l) => l.id === editingTransaction.sl_link_id) : null;
  const splitGroupId = splitLink?.group_id;
  // El nombre del grupo para el cartel de abajo -- NO se lee de `memo`
  // (ahí se siembra el nombre del grupo al sincronizar, pero es editable
  // como "Nota" después, así que puede no serlo más). La cuenta pseudo del
  // vínculo sí se llama como el grupo, y esa nunca la toca el usuario.
  const splitGroupName = splitLink ? accounts.find((a) => a.id === splitLink.pseudo_account_id)?.name : null;

  // prefillBookmark solo aplica cuando no hay editingTransaction (un
  // marcador arranca "Nueva transacción", nunca "Editar") — y nunca trae
  // fecha, siempre arranca en hoy (o defaultDate si vino de otro lado).
  // editingRecurring (fila de mm_recurring) es la 3ra fuente posible de
  // valores iniciales, junto a editingTransaction/prefillBookmark — nunca
  // coincide con las otras dos a la vez (ver ConfigScreen.jsx).
  const [type, setType] = useState(editingTransaction?.type || editingRecurring?.type || prefillBookmark?.type || "expense");
  const [date, setDate] = useState(
    editingTransaction ? dateInputValueInZone(new Date(editingTransaction.date).getTime(), editingTransaction.timezone)
    : editingRecurring ? dateInputValue(new Date(editingRecurring.start_date).getTime())
    : (defaultDate || todayInputValue())
  );
  const [amount, setAmount] = useState(editingTransaction ? String(editingTransaction.amount) : editingRecurring ? String(editingRecurring.amount) : (prefillBookmark ? String(prefillBookmark.amount) : ""));
  const [currency, setCurrency] = useState(
    editingTransaction?.currency || editingRecurring?.currency || prefillBookmark?.currency
    || accounts.find((a) => a.id === (prefillBookmark?.account_id || defaultAccountId))?.currency
    || settings.main_currency
  );
  // Se guarda siempre como "cuántas {moneda de la transacción} vale 1
  // {moneda de la cuenta}" (ver ExchangeRateField: ahí se puede cargar como
  // tasa o como monto ya convertido, pero lo que sube acá siempre queda en
  // este mismo formato canónico).
  const [exchangeRate, setExchangeRate] = useState(
    (editingTransaction?.exchange_rate || editingRecurring?.exchange_rate || prefillBookmark?.exchange_rate)
      ? String(editingTransaction?.exchange_rate || editingRecurring?.exchange_rate || prefillBookmark?.exchange_rate) : ""
  );
  const [categoryId, setCategoryId] = useState(editingTransaction?.category_id || editingRecurring?.category_id || prefillBookmark?.category_id || "");
  // Sube cada vez que el botón "Ok" del teclado de Importe confirma el monto
  // y pide saltar directo a elegir cuenta (ver CalculatorAmountInput) — el
  // campo que sigue a Importe desde que Cuenta pasó a ir antes que Categoría.
  const [openAccountSignal, setOpenAccountSignal] = useState(0);
  // Sube cada vez que la moneda cambia a una distinta de la cuenta, para que
  // CurrencyConversionField se abra solo (ver abajo, cerca del campo Importe).
  const [openConversionSignal, setOpenConversionSignal] = useState(0);
  const [accountId, setAccountId] = useState(editingTransaction?.account_id || editingRecurring?.account_id || prefillBookmark?.account_id || defaultAccountId || "");
  const [toAccountId, setToAccountId] = useState(editingTransaction?.to_account_id || editingRecurring?.to_account_id || prefillBookmark?.to_account_id || "");
  const [note, setNote] = useState(editingTransaction?.title || editingRecurring?.title || prefillBookmark?.title || "");
  // Separado en dos banderas a propósito: "noteFocused" sigue al foco real,
  // "noteDismissed" se prende solo al elegir una sugerencia (para que se
  // cierre aunque queden otras coincidencias, ej. "Mercadona" vs "Mercadona
  // Mercado") y se apaga con CUALQUIER edición posterior — no con un
  // refoco sin cambios, que no debería reabrir nada por sí solo.
  const [noteFocused, setNoteFocused] = useState(false);
  const [noteDismissed, setNoteDismissed] = useState(false);
  const recentNoteTitles = useRecentNoteTitles(session.userId);
  const noteSuggestions = settings.autocomplete_notes && note.trim()
    ? recentNoteTitles.filter((t) => normalizeForSearch(t).includes(normalizeForSearch(note.trim())) && normalizeForSearch(t) !== normalizeForSearch(note.trim())).slice(0, 5)
    : [];
  const [description, setDescription] = useState(editingTransaction?.memo || editingRecurring?.memo || prefillBookmark?.memo || "");
  const [saving, setSaving] = useState(false);
  const [touched, touch, setTouched] = useTouched();

  // Si esta transacción viene de EvenGroup y la reconciliación le actualiza
  // monto/cuenta/fecha/tipo/moneda mientras esta pantalla sigue montada (ej.
  // volviste de "Original" después de cambiar algo ahí), los useState de
  // arriba no se enteran solos — su valor inicial ya quedó fijado la primera
  // vez que se montó este formulario, React no los vuelve a mirar. Este
  // efecto los sincroniza de nuevo cuando cambian esos campos puntuales —
  // son los únicos que la reconciliación controla, y los únicos que ya
  // quedan bloqueados en pantalla cuando isSynced, así que nunca pisa una
  // edición del usuario (no se puede estar editando algo deshabilitado).
  useEffect(() => {
    if (!isSynced || !editingTransaction) return;
    setType(editingTransaction.type);
    setDate(dateInputValueInZone(new Date(editingTransaction.date).getTime(), editingTransaction.timezone));
    setAmount(String(editingTransaction.amount));
    setCurrency(editingTransaction.currency);
    setAccountId(editingTransaction.account_id || "");
    setToAccountId(editingTransaction.to_account_id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSynced, editingTransaction?.type, editingTransaction?.date, editingTransaction?.amount, editingTransaction?.currency, editingTransaction?.account_id, editingTransaction?.to_account_id, editingTransaction?.timezone]);

  // Moneda de la cuenta elegida — es una restricción dura (ver PENDIENTES.md
  // sección B): toda transacción queda en la moneda de SU cuenta, no en una
  // principal global. El fallback a main_currency es solo para cuando
  // todavía no se eligió ninguna cuenta.
  const accountCurrency = accounts.find((a) => a.id === accountId)?.currency || settings.main_currency;
  // Sugiere la moneda de la cuenta recién elegida — pero no en el primer
  // render (ahí ya la sembró el useState de `currency` de arriba, a partir
  // de editingTransaction/prefillBookmark/defaultAccountId) y no si el
  // usuario ya tocó el selector de moneda a mano.
  //
  // OJO: NO alcanza con un flag "ya corrió una vez" (useRef(true) que se
  // apaga solo) — React StrictMode (en desarrollo) corre cada efecto DOS
  // veces a propósito, y ese flag se consume en la primera, dejando pasar
  // la segunda igual — al reabrir una transacción ya guardada, eso pisaba
  // su moneda original con la de la cuenta (bug real, encontrado probando).
  // En cambio, comparar contra el ÚLTIMO accountId que de verdad procesamos
  // es inmune a eso: las dos corridas de StrictMode ven el mismo accountId
  // sin cambios, así que las dos se saltean por igual.
  const lastSuggestedAccountId = useRef(accountId);
  useEffect(() => {
    if (accountId === lastSuggestedAccountId.current) return;
    lastSuggestedAccountId.current = accountId;
    if (touched.currency || isSynced) return;
    const acc = accounts.find((a) => a.id === accountId);
    if (acc) setCurrency(acc.currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const [recurringOpen, setRecurringOpen] = useState(forceRecurringOpen || !!editingRecurring);
  // Scroll al contenido recién revelado -- si tocás "Hacer recurrente" con
  // la vista ya baja, los campos nuevos pueden quedar fuera de pantalla sin
  // ningún indicio de que pasó algo. Ver helpers.jsx.
  const recurringRef = useRef(null);
  useScrollIntoViewOnChange(recurringRef, recurringOpen);
  const initialFreq = editingRecurring ? recurringToFreqState(editingRecurring) : null;
  const [freqValue, setFreqValue] = useState(initialFreq?.freqValue || "month-1");
  const [freqInterval, setFreqInterval] = useState(initialFreq?.freqInterval || "3");
  const [endDate, setEndDate] = useState(editingRecurring?.end_date ? dateInputValue(new Date(editingRecurring.end_date).getTime()) : "");

  // Igual que con cuentas ocultas: una categoría eliminada no aparece para
  // elegir en transacciones nuevas, pero si es la que ya tiene asignada
  // ESTA transacción, se sigue mostrando (con su nombre/ícono reales) en
  // vez de desaparecer de golpe al abrir para editar.
  const typeCategories = categories.filter((c) => c.type === (type === "income" ? "income" : "expense") && (!c.deleted || c.id === categoryId));

  useEffect(() => {
    if (type === "transfer") { setCategoryId(""); return; }
    // Si la categoría elegida ya no es válida para este tipo, queda vacía
    // en vez de autoseleccionar la primera de la lista. Sin categoría es
    // una opción válida (queda como "Sin categoría"), no hace falta forzar
    // ninguna acá.
    if (categoryId && !typeCategories.find((c) => c.id === categoryId)) setCategoryId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, categories]);

  // Si la transacción ya tenía una moneda que después se sacó de "Otras
  // monedas" en Ajustes, igual la mostramos acá — si no, el select se queda
  // sin esa opción y no hay forma de mantenerla al editar.
  const currencyOptions = [settings.main_currency, ...(settings.other_currencies || [])];
  if (!currencyOptions.includes(currency)) currencyOptions.push(currency);
  // La moneda de la cuenta elegida tiene que poder elegirse siempre en este
  // selector, aunque no esté en "Otras monedas" de Ajustes — es el caso
  // normal (sin tasa), no una excepción.
  if (!currencyOptions.includes(accountCurrency)) currencyOptions.push(accountCurrency);
  const currencyItems = currencyOptions.map((c) => ({ value: c, label: c, icon: CURRENCIES[c]?.symbol, sublabel: CURRENCIES[c]?.name }));
  const currencyNote = accountId && accounts.find((a) => a.id === accountId)
    ? `Solo para este movimiento. ${accounts.find((a) => a.id === accountId).name} sigue en ${accountCurrency}; si elegís otra moneda te vamos a pedir la tasa de cambio.`
    : null;

  const numericAmount = parseAmountInput(amount);
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;
  const canonicalRate = parseAmountInput(exchangeRate);
  const needsRate = currency !== accountCurrency;
  const validRate = !needsRate || (!isNaN(canonicalRate) && canonicalRate > 0);

  // Cambiar la moneda de la transacción a una distinta de la cuenta abre
  // sola la hoja de conversión (CurrencyConversionField), pero no en el montaje
  // inicial (ej. al editar una transacción que ya tenía esa combinación).
  const prevCurrencyRef = useRef(currency);
  useEffect(() => {
    if (prevCurrencyRef.current !== currency) {
      if (needsRate) setOpenConversionSignal((n) => n + 1);
      prevCurrencyRef.current = currency;
    }
  }, [currency, needsRate]);

  // Recién acá (después de TODOS los hooks, no antes) — React exige que se
  // llamen siempre en el mismo orden en cada render, un "return" anticipado
  // más arriba se saltearía el useRef/useEffect de arriba y tiraba "Rendered
  // fewer hooks than expected" (bug real, encontrado al crear una categoría
  // nueva desde el selector).
  if (managingCategoryType) {
    return (
      <ManageCategories
        session={session}
        type={managingCategoryType}
        categories={categories}
        reload={reloadCategories}
        showError={showError}
        showInfo={showInfo}
        onBack={() => setManagingCategoryType(null)}
        initialCreating
      />
    );
  }

  const freq = RECURRING_FREQUENCIES.find((f) => f.value === freqValue);
  const customInterval = parseInt(freqInterval, 10);
  const recurringValid = !recurringOpen || (freq && (freq.interval !== null || customInterval >= 2));

  // Al editar, no dejar guardar si no se cambió nada — creando una siempre
  // es "dirty" (no hay un original con qué comparar), y copiar cuenta como
  // crear (effectiveEditing ya es null en modo copia). Editar una recurrente
  // sigue la misma lógica, comparando contra editingRecurring en vez de
  // editingTransaction (son objetos distintos, con sus propios campos).
  const isDirty = editingRecurring ? (
    type !== editingRecurring.type
    || amount !== String(editingRecurring.amount)
    || currency !== (editingRecurring.currency || settings.main_currency)
    || exchangeRate !== (editingRecurring.exchange_rate ? String(editingRecurring.exchange_rate) : "")
    || categoryId !== (editingRecurring.category_id || "")
    || accountId !== (editingRecurring.account_id || "")
    || toAccountId !== (editingRecurring.to_account_id || "")
    || note !== (editingRecurring.title || "")
    || description !== (editingRecurring.memo || "")
    || freqValue !== initialFreq.freqValue
    || freqInterval !== initialFreq.freqInterval
    || endDate !== (editingRecurring.end_date ? dateInputValue(new Date(editingRecurring.end_date).getTime()) : "")
  ) : !effectiveEditing || (
    type !== editingTransaction.type
    || date !== dateInputValueInZone(new Date(editingTransaction.date).getTime(), editingTransaction.timezone)
    || amount !== String(editingTransaction.amount)
    || currency !== (editingTransaction.currency || settings.main_currency)
    || exchangeRate !== (editingTransaction.exchange_rate ? String(editingTransaction.exchange_rate) : "")
    || categoryId !== (editingTransaction.category_id || "")
    || accountId !== (editingTransaction.account_id || "")
    || toAccountId !== (editingTransaction.to_account_id || "")
    || note !== (editingTransaction.title || "")
    || description !== (editingTransaction.memo || "")
    || recurringOpen
  );

  // Categoría es opcional (queda como "Sin categoría" si no se elige
  // ninguna) — solo transferencia exige sus dos cuentas.
  const canSave = validAmount && validRate && !!accountId && recurringValid && isDirty && (
    type !== "transfer" || (!!toAccountId && toAccountId !== accountId && accounts.find((a) => a.id === toAccountId)?.currency === accountCurrency)
  );

  const handleSave = async () => {
    if (saving) return;
    if (!canSave) {
      setTouched({ amount: true, exchangeRate: true, accountId: true, toAccountId: true, freqInterval: true });
      return;
    }
    setSaving(true);
    try {
      const rate = needsRate ? canonicalRate : null;
      const amountMain = computeAmountMain(numericAmount, currency, accountCurrency, rate);
      // Editar una recurrente ya existente cambia la plantilla en sí (mm_recurring),
      // no crea una transacción nueva -- un UPDATE aparte, sin tocar start_date/
      // next_date (el calendario ya en curso no se toca acá, solo el "qué").
      if (editingRecurring) {
        const interval = freq.interval ?? customInterval;
        await onSaveRecurring(editingRecurring.id, {
          type,
          account_id: accountId,
          to_account_id: type === "transfer" ? toAccountId : null,
          category_id: type === "transfer" ? null : (categoryId || null),
          currency,
          amount: numericAmount,
          exchange_rate: rate,
          amount_main: amountMain,
          title: note.trim() || null,
          memo: description.trim() || null,
          repeat_unit: freq.unit,
          repeat_interval: interval,
          end_date: endDate ? new Date(endDate + "T12:00:00").toISOString() : null,
        });
        return;
      }
      const txDate = new Date(date + "T12:00:00");
      let recurring = null;
      if (recurringOpen) {
        const interval = freq.interval ?? customInterval;
        recurring = {
          repeat_unit: freq.unit,
          repeat_interval: interval,
          start_date: txDate.toISOString(),
          next_date: nextOccurrence(txDate, freq.unit, interval, txDate).toISOString(),
          end_date: endDate ? new Date(endDate + "T12:00:00").toISOString() : null,
        };
      }
      await onSave({
        id: effectiveEditing?.id,
        type,
        account_id: accountId,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" ? null : (categoryId || null),
        currency,
        amount: numericAmount,
        exchange_rate: rate,
        amount_main: amountMain,
        date: txDate.getTime(),
        title: note.trim() || null,
        memo: description.trim() || null,
        recurring,
      });
    } finally {
      setSaving(false);
    }
  };

  // Guarda esto mismo como marcador (plantilla reutilizable, sin fecha) —
  // no navega ni cambia nada en este formulario, solo crea el marcador aparte.
  const handleBookmark = async () => {
    if (!validAmount || !accountId || (type === "transfer" && (!toAccountId || toAccountId === accountId))) {
      setTouched((t) => ({ ...t, amount: true, accountId: true, toAccountId: true }));
      return;
    }
    const rate = needsRate ? canonicalRate : null;
    await onBookmark({
      type,
      account_id: accountId,
      to_account_id: type === "transfer" ? toAccountId : null,
      category_id: type === "transfer" ? null : (categoryId || null),
      currency,
      amount: numericAmount,
      exchange_rate: rate,
      title: note.trim() || null,
      memo: description.trim() || null,
    });
  };

  // Copiar no guarda nada: deja el formulario con los mismos datos, listo
  // para seguir editando (o guardar tal cual) como una transacción nueva.
  const handlePickCopyDate = (useToday) => {
    setDate(useToday
      ? todayInputValue()
      : dateInputValueInZone(new Date(editingTransaction.date).getTime(), editingTransaction.timezone));
    setIsCopyMode(true);
    setShowCopyModal(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar
        title={editingRecurring ? "Editar recurrente" : effectiveEditing ? `Editar ${TYPE_INFO[type].label}` : TYPE_INFO[type].newLabel}
        onBack={onCancel}
        right={(effectiveEditing || editingRecurring) && (
          <div style={{ display: "flex", gap: 4 }}>
            {onBookmark && !isSynced && !editingRecurring && (
              <button style={styles.iconBtnGhost} onClick={handleBookmark} aria-label="Guardar como marcador">
                <Star size={17} />
              </button>
            )}
            {!isSynced && !editingRecurring && (
              <button style={styles.iconBtnGhost} onClick={() => setShowCopyModal(true)} aria-label="Copiar">
                <Copy size={17} />
              </button>
            )}
            {!isSynced && (
              <button style={styles.iconBtnGhost} onClick={() => setConfirmDelete(true)} aria-label="Eliminar">
                <Trash2 size={17} />
              </button>
            )}
          </div>
        )}
      />
      {showCopyModal && (
        <Modal title="Copiar transacción" onClose={() => setShowCopyModal(false)}>
          <p style={{ margin: "0 0 14px", fontSize: 14, fontFamily: "system-ui, sans-serif", color: "#6B6355", whiteSpace: "pre-line" }}>
            {"Se completa un formulario nuevo con estos mismos datos.\nElegí la fecha."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button style={{ ...styles.btnSecondary, marginTop: 0 }} onClick={() => handlePickCopyDate(true)}>
              Con la fecha de hoy ({fmtDate(new Date(todayInputValue() + "T12:00:00").getTime())})
            </button>
            <button style={{ ...styles.btnSecondary, marginTop: 0 }} onClick={() => handlePickCopyDate(false)}>
              Con la fecha del registro ({fmtDate(new Date(editingTransaction.date).getTime())})
            </button>
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <ConfirmInline
          message={editingRecurring
            ? "¿Eliminar esta transacción recurrente? No borra las que ya se generaron."
            : `¿Eliminar este ${TYPE_INFO[type].label.toLowerCase()}?`}
          confirmLabel={deleting ? "Eliminando…" : "Eliminar"}
          confirmDisabled={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setDeleting(true);
            if (editingRecurring) await onDeleteRecurring(editingRecurring.id);
            else await onDelete(editingTransaction.id);
            setDeleting(false);
          }}
          style={{ margin: "6px 20px 12px", borderRadius: 12, borderTop: "1px solid #EBC9BA" }}
        />
      )}
      {/* key cambia SOLO al entrar en modo copia — fuerza a React a remontar
          este div para que la animación (mismo mecanismo que useMonthSlide)
          arranque, dando la sensación de "pantalla nueva" aunque sea el
          mismo formulario. Sin className al abrir normalmente (isCopyMode
          empieza en false) — la animación es solo para esa transición. */}
      {/* animationDuration inline (no tocar .ec-slide-next en sí) — esa clase
          es compartida con el cambio de mes, y acá se quiere un poco más
          lenta que ahí sin afectarlo. */}
      {/* gap:20 pisa el 14 default de styles.form (compartido con otras
          pantallas que SÍ tienen campos con caja, donde 14 queda bien) —
          acá separa el toggle del body de filas de abajo, que tiene su
          PROPIO gap:8 más junto (filas finitas de una línea, no cajas). */}
      <div key={isCopyMode ? "copy" : "orig"} className={isCopyMode ? "ec-slide-next" : undefined} style={{ ...styles.form, gap: 20, animationDuration: isCopyMode ? "0.32s" : undefined }}>
        {isSynced && (
          // Nombre real del grupo (no "EvenGroup" genérico) + su ícono.
          // Todo el cartel es tocable y reemplaza al botón "Original" que
          // antes vivía aparte, arriba a la derecha -- un solo lugar que
          // conecta "esto está bloqueado" con "acá lo cambiás".
          splitGroupId && onOpenEvenGroupExpense ? (
            <button
              type="button"
              onClick={() => onOpenEvenGroupExpense(splitGroupId, editingTransaction.sl_source_kind, editingTransaction.sl_source_id)}
              style={{ ...styles.muted, padding: 0, border: "none", background: "transparent", textAlign: "left", cursor: "pointer", display: "block", width: "100%" }}
            >
              {TYPE_DEMONYM[type]} viene de{" "}
              <Divide size={12} color="#A8754A" style={{ display: "inline", verticalAlign: "middle", marginBottom: 2 }} />{" "}
              {splitGroupName || "EvenGroup"}.{" "}
              El monto, la cuenta, la fecha y el tipo solo se pueden editar en{" "}
              <span style={{ color: "#A8754A", fontWeight: 600, whiteSpace: "nowrap" }}>Original →</span>
              {needsRate && " Es en una moneda distinta a tu principal -- ingresá la tasa de cambio para que se calcule bien en tus totales."}
            </button>
          ) : (
            <p style={{ ...styles.muted, padding: 0 }}>
              {TYPE_DEMONYM[type]} viene de{" "}
              <Divide size={12} color="#A8754A" style={{ display: "inline", verticalAlign: "middle", marginBottom: 2 }} />{" "}
              {splitGroupName || "EvenGroup"}.{" "}
              El monto, la cuenta, la fecha y el tipo solo se pueden editar en el original. Podés cambiarle la categoría o la nota.
              {needsRate && " Es en una moneda distinta a tu principal -- ingresá la tasa de cambio para que se calcule bien en tus totales."}
            </p>
          )
        )}
        <SegmentedControl
          // Sin candado acá -- a diferencia de Fecha/Cuenta (que se ven
          // igual estén bloqueados o no), este control YA se ve claramente
          // distinto cuando está disabled (atenuado, sin poder tocarlo).
          options={Object.keys(TYPE_INFO).map((t) => ({ value: t, label: TYPE_INFO[t].label, color: TYPE_INFO[t].color }))}
          value={type}
          onChange={setType}
          disabled={isSynced}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {needsRate ? (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            {/* A diferencia del resto del formulario cuando isSynced, la
                tasa/el monto convertido sí quedan editables acá: es el único
                dato que la reconciliación de EvenGroup NO puede completar
                sola (no hay nadie mirando un formulario en ese momento), así
                que queda "pendiente" hasta que lo cargues. El importe en sí
                sigue bloqueado cuando isSynced, igual que el resto del form. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <CurrencyConversionField
                amount={amount}
                onChangeAmount={setAmount}
                currency={currency}
                accountCurrency={accountCurrency}
                rate={exchangeRate}
                onChangeRate={setExchangeRate}
                onBlur={() => { touch("amount"); touch("exchangeRate"); }}
                onConfirmNext={type !== "transfer" ? () => setOpenAccountSignal((n) => n + 1) : undefined}
                openSignal={openConversionSignal}
                amountDisabled={isSynced}
                required
              />
            </div>
            <PickerField
              compact
              value={currency}
              onChange={(v) => { setCurrency(v); touch("currency"); }}
              disabled={isSynced}
              title="Elegí la moneda"
              note={currencyNote}
              groups={[{ label: null, items: currencyItems }]}
            />
          </div>
        ) : (
          // Importe "hero": número grande, sin el recuadro/etiqueta de un
          // campo normal (ver PENDIENTES.md) — la moneda es una zona de
          // toque aparte (el chip de al lado), no parte del mismo campo,
          // para que quede claro que son 2 acciones distintas (editar el
          // monto vs. elegir la moneda). Signo y color según el tipo. 54 es
          // el tamaño BASE/máximo — CalculatorAmountInput lo achica solo si
          // hace falta, midiendo el ancho real (ver Shared.jsx); para que
          // ese cálculo sirva de algo, esta fila tiene que ser "flex de
          // verdad" (no inline-flex envolvente): el botón usa flex:"0 1
          // auto" + minWidth:0 para poder ENCOGERSE por debajo de su propio
          // contenido cuando no entra, en vez de empujar todo más ancho que
          // la pantalla — el chip de moneda nunca se achica (flexShrink:0).
          <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, width: "100%" }}>
              <CalculatorAmountInput
                value={amount}
                onChange={setAmount}
                onBlur={() => touch("amount")}
                onConfirmNext={type !== "transfer" ? () => setOpenAccountSignal((n) => n + 1) : undefined}
                placeholder="0,00"
                disabled={isSynced}
                style={{ flex: "0 1 auto", minWidth: 0, width: "auto", height: 56, border: "none", background: "transparent", padding: "0 10px", lineHeight: 1, fontSize: 40, fontWeight: 400, fontFamily: "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif", color: AMOUNT_COLOR[type], textAlign: "center", justifyContent: "center", borderRadius: 14 }}
                focusStyle={{ background: "#F3ECE0", boxShadow: "none" }}
                placeholderColor="#A3968B"
              />
              <div style={{ flexShrink: 0 }}>
                <PickerField
                  compact
                  value={currency}
                  onChange={(v) => { setCurrency(v); touch("currency"); }}
                  disabled={isSynced}
                  title="Elegí la moneda"
                  note={currencyNote}
                  groups={[{ label: null, items: currencyItems }]}
                />
              </div>
            </div>
          </div>
        )}
        {/* El error vive FUERA del Field/hero para que no le sume altura a
            esa columna sola (needsRate: el select de moneda, hermano en el
            flex de arriba, quedaba alineado con el error en vez de con el
            input). En el caso simple (hero), la misma línea hace de pista
            ("Tocá el número...") cuando está vacío y de error al tocarlo. */}
        {needsRate ? (
          touched.amount && (!validAmount || !validRate) && (
            <span style={{ fontSize: 12, fontWeight: 400, color: "#B0473A", marginTop: -8, fontFamily: "system-ui, sans-serif" }}>
              Completá el importe y la tasa de conversión.
            </span>
          )
        ) : (
          (touched.amount && !validAmount) || !amount ? (
            <p style={{ margin: "-6px 0 0", fontSize: 13, textAlign: "center", color: touched.amount && !validAmount ? "#B0473A" : "#8A7F72", fontFamily: "system-ui, sans-serif" }}>
              {touched.amount && !validAmount ? "Ingresá un importe válido." : "Tocá el número para escribir el importe."}
            </p>
          ) : null
        )}

        {isSynced && needsRate && !validRate && (
          <p style={{ margin: 0, marginTop: -8, fontSize: 12.5, fontWeight: 600, color: "#B0473A", fontFamily: "system-ui, sans-serif" }}>
            Debés llenar la tasa de cambio para poder tener en cuenta esta transacción en tus totales.
          </p>
        )}

        {needsRate && validAmount && validRate && (
          <Hint style={{ marginTop: -8 }}>
            {money(numericAmount, currency)} equivalen a {money(numericAmount / canonicalRate, accountCurrency)}.
          </Hint>
        )}

        {/* Al editar una recurrente no hay "fecha de esta ocurrencia" que
            mostrar -- el calendario (start_date/next_date) no se toca desde
            acá, ver handleSave. `date` igual se mantiene en estado (con el
            start_date original) para que RecurringFields siga mostrando
            bien el mensaje de "se repite los días X". */}
        {!editingRecurring && (
          <DateRow label="Fecha" value={date} onChange={setDate} disabled={isSynced} lockedValue={isSynced} />
        )}

        <Field error={touched.accountId && !accountId ? "Este campo es obligatorio." : ""}>
          <PickerField
            rowLabel={type === "transfer" ? "De" : "Cuenta"}
            lockedValue={isSynced}
            required
            value={accountId}
            onChange={setAccountId}
            onClear={() => setAccountId("")}
            onBlur={() => touch("accountId")}
            openSignal={openAccountSignal}
            placeholder="Elegí una cuenta"
            disabled={isSynced}
            groups={groups
              // El grupo "EvenGroup" (auto-creado al vincular un grupo
              // compartido) no se elige a mano acá — lo maneja solo la
              // sincronización. Si esta transacción YA es una sincronizada,
              // se deja ver igual (si no, el picker no encuentra el value
              // en ninguna opción y muestra el placeholder en vez del
              // nombre real de la cuenta pseudo).
              .filter((g) => !g.deleted && (g.system_key !== "split_ledger" || isSynced))
              .map((g) => ({
                label: g.name,
                // Ocultas o eliminadas no se muestran acá — salvo que sea la
                // que ya tenía elegida esta transacción, para no perder la
                // selección al editar una que usaba una cuenta que después
                // ocultaste o eliminaste.
                items: accounts.filter((a) => a.group_id === g.id && ((!a.hidden && !a.deleted) || a.id === accountId)).map((a) => ({ value: a.id, label: a.name, icon: a.icon, deleted: a.deleted })),
              }))
              .filter((g) => g.items.length > 0)}
          />
        </Field>
        {accounts.find((a) => a.id === accountId)?.deleted && (
          <p style={{ ...styles.muted, padding: 0, marginTop: -8, color: "#B0473A", display: "flex", alignItems: "center", gap: 5 }}>
            <Trash2 size={13} /> Esta cuenta fue eliminada.
          </p>
        )}

        {type === "transfer" && (
          <Field
            error={touched.toAccountId
              ? (!toAccountId
                  ? "Este campo es obligatorio."
                  : toAccountId === accountId
                    ? 'No puede ser la misma cuenta que "De".'
                    : (accounts.find((a) => a.id === toAccountId)?.currency !== accountCurrency ? "Tiene que ser una cuenta de la misma moneda." : ""))
              : ""}
          >
            <PickerField
              rowLabel="A"
              lockedValue={isSynced}
              required
              value={toAccountId}
              onChange={setToAccountId}
              onClear={() => setToAccountId("")}
              onBlur={() => touch("toAccountId")}
              placeholder="Elegí una cuenta"
              disabled={isSynced}
              groups={groups
                .filter((g) => !g.deleted && (g.system_key !== "split_ledger" || isSynced))
                .map((g) => ({
                  label: g.name,
                  // Entre monedas distintas no se puede transferir (ver
                  // PENDIENTES.md sección B) — se filtra acá, salvo que sea
                  // la cuenta ya elegida (igual que ocultas/eliminadas, para
                  // no perder la selección al editar algo viejo).
                  items: accounts.filter((a) => a.group_id === g.id && a.id !== accountId && (a.currency === accountCurrency || a.id === toAccountId) && ((!a.hidden && !a.deleted) || a.id === toAccountId)).map((a) => ({ value: a.id, label: a.name, icon: a.icon, deleted: a.deleted })),
                }))
                .filter((g) => g.items.length > 0)}
            />
          </Field>
        )}
        {type === "transfer" && accounts.find((a) => a.id === toAccountId)?.deleted && (
          <p style={{ ...styles.muted, padding: 0, marginTop: -8, color: "#B0473A", display: "flex", alignItems: "center", gap: 5 }}>
            <Trash2 size={13} /> Esta cuenta fue eliminada.
          </p>
        )}

        {type !== "transfer" && (
          <Field>
            <PickerField
              rowLabel="Categoría"
              value={categoryId}
              onChange={(v) => {
                if (v === "__new__") { setManagingCategoryType(type === "income" ? "income" : "expense"); return; }
                setCategoryId(v);
              }}
              onClear={() => setCategoryId("")}
              placeholder="Sin categoría"
              title="Elegí una categoría"
              groups={[{
                label: null,
                items: [
                  ...typeCategories.map((c) => ({ value: c.id, label: c.name, icon: c.icon, deleted: c.deleted })),
                  { value: "__new__", label: "Nueva", icon: "➕", action: true },
                ],
              }]}
            />
          </Field>
        )}
        {type !== "transfer" && categories.find((c) => c.id === categoryId)?.deleted && (
          <p style={{ ...styles.muted, padding: 0, marginTop: -8, color: "#B0473A", display: "flex", alignItems: "center", gap: 5 }}>
            <Trash2 size={13} /> Esta categoría fue eliminada.
          </p>
        )}

        <TextRow
          label="Descripción"
          value={note}
          onChange={(v) => { setNote(v); setNoteDismissed(false); }}
          onFocus={() => setNoteFocused(true)}
          onBlur={() => setNoteFocused(false)}
          placeholder="Añadir descripción"
          suggestions={noteFocused && !noteDismissed ? noteSuggestions : []}
          onPickSuggestion={(s) => { setNote(s); setNoteDismissed(true); }}
        />

        <TextRow
          label="Nota"
          value={description}
          onChange={setDescription}
          placeholder="Añadir nota"
          multiline
        />

        {!isSynced && !recurringOpen && !forceRecurringOpen && (
          <button style={styles.btnDashed} onClick={() => setRecurringOpen(true)}>
            Hacer {type === "transfer" ? "esta" : "este"} {TYPE_INFO[type].label.toLowerCase()} recurrente
          </button>
        )}

        {!isSynced && recurringOpen && (
          <div ref={recurringRef}>
            <RecurringFields
              type={type}
              date={date}
              freqValue={freqValue}
              setFreqValue={setFreqValue}
              freqInterval={freqInterval}
              setFreqInterval={setFreqInterval}
              intervalTouched={touched.freqInterval}
              onIntervalBlur={() => touch("freqInterval")}
              endDate={endDate}
              setEndDate={setEndDate}
              onRemove={(hideRemoveRecurring || editingRecurring) ? null : () => setRecurringOpen(false)}
            />
          </div>
        )}
        </div>
      </div>

      <FormFooter
        onCancel={onCancel}
        onConfirm={handleSave}
        confirmLabel={saving ? "Guardando…" : "Guardar"}
        confirmDisabled={saving}
        confirmDim={!canSave}
      />
    </div>
  );
}

/* =========================================================================
   CAMPOS DE RECURRENCIA — Frecuencia (con intervalo custom para "Cada X
   semanas/meses"), Fecha de fin, y dos mensajes separados: uno informativo
   (siempre presente, dice CUÁNDO se repite) y una advertencia (solo cuando
   el día elegido puede no existir en algún mes/año futuro).
   ========================================================================= */

function RecurringFields({ type, date, freqValue, setFreqValue, freqInterval, setFreqInterval, intervalTouched, onIntervalBlur, endDate, setEndDate, onRemove }) {
  const freq = RECURRING_FREQUENCIES.find((f) => f.value === freqValue);
  const customInterval = parseInt(freqInterval, 10);
  const intervalInvalid = freq?.interval === null && !(customInterval >= 2);
  const txDate = date ? new Date(date + "T12:00:00") : null;
  // "Fecha de arriba" podía interpretarse mal (¿arriba de qué?) — referirse
  // directo a qué es esa fecha (la del gasto/ingreso/transferencia) no deja
  // dudas, sin importar cómo quede acomodado el formulario.
  const typeNoun = type === "income" ? "del ingreso" : type === "transfer" ? "de la transferencia" : "del gasto";
  const dayOfMonth = txDate?.getDate();
  const monthIndex = txDate?.getMonth(); // 0 = enero, 1 = febrero...
  const monthName = txDate?.toLocaleDateString("es-ES", { month: "long" });
  const weekdayName = txDate?.toLocaleDateString("es-ES", { weekday: "long" });
  const interval = freq?.interval ?? parseInt(freqInterval, 10);

  // Mensaje informativo — siempre presente, explica CUÁNDO se repite.
  let explanation = "";
  if (freq?.unit === "week" && weekdayName) {
    const cadence = interval === 1 ? "cada semana" : `cada ${interval} semanas`;
    explanation = `Se repetirá ${cadence}, siempre los días ${weekdayName} (el mismo día de la semana que la fecha ${typeNoun}).`;
  } else if (freq?.unit === "month" && dayOfMonth) {
    const cadence = interval === 1 ? "de cada mes" : `de cada ${interval} meses`;
    explanation = `Se repetirá el día ${dayOfMonth} ${cadence} (el mismo día que la fecha ${typeNoun}).`;
  } else if (freq?.unit === "year" && dayOfMonth) {
    explanation = `Se repetirá cada año el ${dayOfMonth} de ${monthName} (la misma fecha ${typeNoun}).`;
  }

  // Advertencia — solo aparece cuando el ajuste de fin de mes de verdad puede
  // pasar. Para "cada mes", cualquier día 29/30/31 puede caer en un mes corto.
  // Para "cada año", el único caso real es el 29 de febrero en un año no
  // bisiesto — el 30 o 31 de cualquier otro mes existe todos los años igual.
  let warning = "";
  if (freq?.unit === "month" && dayOfMonth >= 29) {
    warning = `El día ${dayOfMonth} no existe en todos los meses. Cuando eso pase, se va a usar el último día real de ese mes.`;
  } else if (freq?.unit === "year" && dayOfMonth === 29 && monthIndex === 1) {
    warning = "El 29 de febrero no existe en los años no bisiestos. Esos años se va a usar el 28.";
  }

  return (
    // Mismas filas (label izquierda / valor derecha, sin caja) que el resto
    // del formulario — antes esto era una tarjeta blanca con bordes propios
    // y <select>/<input> con caja, un lenguaje visual totalmente distinto.
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <PickerField
        rowLabel="Frecuencia"
        value={freqValue}
        onChange={setFreqValue}
        listStyle
        title="Frecuencia"
        groups={[{ label: null, items: RECURRING_FREQUENCIES.map((f) => ({ value: f.value, label: f.label })) }]}
      />

      {freq?.interval === null && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40, borderBottom: "1px solid #ECE3D3" }}>
            <span style={{ flexShrink: 0, fontSize: 13, color: "#6B6355", fontFamily: "system-ui, sans-serif" }}>
              {freq.unit === "week" ? "Cada cuántas semanas" : "Cada cuántos meses"}
              <span style={{ color: "#B0473A" }}> *</span>
            </span>
            <input
              type="number"
              min={2}
              className="row-input"
              value={freqInterval}
              onChange={(e) => setFreqInterval(e.target.value)}
              onBlur={onIntervalBlur}
              style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13.5, fontFamily: "system-ui, sans-serif", border: "none", background: "transparent", padding: 0, color: "#2B2420" }}
            />
          </div>
          {intervalTouched && intervalInvalid && (
            <span style={{ fontSize: 12, fontWeight: 400, color: "#B0473A", fontFamily: "system-ui, sans-serif" }}>Debe ser al menos 2.</span>
          )}
        </div>
      )}

      <DateRow label="Fecha de fin" value={endDate} onChange={setEndDate} placeholder="Opcional" />

      {(explanation || warning) && (
        <div style={{ padding: "12px 0 0" }}>
          {explanation && <Hint>{explanation}</Hint>}
          {warning && <Hint color="#A8754A">{warning}</Hint>}
        </div>
      )}

      {onRemove && (
        <button style={{ background: "none", border: "none", color: "#B0473A", fontSize: 13.5, fontWeight: 600, fontFamily: "system-ui, sans-serif", padding: "12px 0 4px", textAlign: "left", cursor: "pointer" }} onClick={onRemove}>
          Eliminar recurrencia
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   GESTIONAR CATEGORÍAS (de ingreso o de gasto — son 2 listas separadas,
   sin subcategorías por ahora)
   ========================================================================= */

export function ManageCategories({ session, type, categories, reload, showError, showInfo, onBack, initialCreating = false }) {
  const [creating, setCreating] = useState(initialCreating);
  useScrollToTopOnChange(creating);
  const typeCategories = categories.filter((c) => c.type === type && !c.deleted);
  const [names, setNames] = useState(() => Object.fromEntries(typeCategories.map((c) => [c.id, c.name])));
  const [icons, setIcons] = useState(() => Object.fromEntries(typeCategories.map((c) => [c.id, c.icon])));
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [removingCategoryId, setRemovingCategoryId] = useState(null);
  const [order, setOrder] = useState(() => typeCategories.map((c) => c.id));

  useEffect(() => {
    setOrder(typeCategories.map((c) => c.id));
    setNames(Object.fromEntries(typeCategories.map((c) => [c.id, c.name])));
    setIcons(Object.fromEntries(typeCategories.map((c) => [c.id, c.icon])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, type]);

  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const newOrder = arrayMove(order, order.indexOf(active.id), order.indexOf(over.id));
    setOrder(newOrder);
    try {
      const results = await Promise.all(newOrder.map((id, i) => supabase.from("mm_categories").update({ sort_order: i }).eq("id", id)));
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      await reload();
    } catch (e) { showError(`No se pudo guardar el orden: ${e?.message || e}`); await reload(); }
  };

  const renameCategory = async (id) => {
    const name = (names[id] || "").trim();
    const cat = typeCategories.find((c) => c.id === id);
    if (!name || name === cat.name) return;
    try {
      const { error } = await supabase.from("mm_categories").update({ name }).eq("id", id);
      if (error) throw error;
      await reload();
      showInfo("Nombre actualizado.");
    } catch (e) { showError(`No se pudo renombrar: ${e?.message || e}`); }
  };

  const saveIcon = async (id, icon) => {
    const cat = typeCategories.find((c) => c.id === id);
    if ((icon || null) === (cat.icon || null)) return;
    try {
      const { error } = await supabase.from("mm_categories").update({ icon: icon || null }).eq("id", id);
      if (error) throw error;
      await reload();
      showInfo("Ícono actualizado.");
    } catch (e) { showError(`No se pudo guardar el ícono: ${e?.message || e}`); }
  };

  const removeCategory = async (id) => {
    const name = typeCategories.find((c) => c.id === id)?.name;
    setRemovingCategoryId(id);
    try {
      const { error } = await supabase.from("mm_categories").update({ deleted: true }).eq("id", id);
      if (error) throw error;
      await reload();
      showInfo(`"${name}" eliminada.`);
    } catch (e) { showError(`No se pudo borrar: ${e?.message || e}`); }
    setRemovingCategoryId(null);
    setConfirmRemoveId(null);
  };

  if (creating) {
    return (
      <NewCategoryForm
        session={session}
        type={type}
        categories={categories}
        reload={reload}
        showError={showError}
        onCancel={initialCreating ? onBack : () => setCreating(false)}
        onCreated={initialCreating ? onBack : () => setCreating(false)}
      />
    );
  }

  return (
    <div style={{ ...styles.screen, paddingBottom: 0 }}>
      <TopBar
        title={type === "income" ? "Categorías de ingreso" : "Categorías de gasto"}
        onBack={onBack}
        right={<button style={styles.iconBtnGhost} onClick={() => setCreating(true)} aria-label="Nueva categoría"><Plus size={20} /></button>}
      />
      <div style={styles.form}>
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {order.map((id) => {
                const c = typeCategories.find((x) => x.id === id);
                if (!c) return null;
                return (
                  <div key={id}>
                    <SortableCategoryManageRow
                      id={id}
                      name={names[id] ?? c.name}
                      icon={icons[id] ?? c.icon}
                      onChangeName={(v) => setNames((prev) => ({ ...prev, [id]: v }))}
                      onBlur={() => renameCategory(id)}
                      onChangeIcon={(v) => { setIcons((prev) => ({ ...prev, [id]: v })); saveIcon(id, v); }}
                      onRemove={() => setConfirmRemoveId(id)}
                      isConfirming={confirmRemoveId === id}
                      draggable={order.length > 1}
                    />
                    {confirmRemoveId === id && (
                      <ConfirmInline
                        message={`¿Borrar "${c.name}"?`}
                        confirmLabel={removingCategoryId === id ? "Borrando…" : "Borrar"}
                        confirmDisabled={removingCategoryId === id}
                        onCancel={() => setConfirmRemoveId(null)}
                        onConfirm={() => removeCategory(id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

// Formulario de "nueva categoría" propio (TopBar + Footer), mismo patrón que
// NewGroupForm/NewAccountForm — reemplaza el input+botón sueltos de abajo.
function NewCategoryForm({ session, type, categories, reload, showError, onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const canSave = !!name.trim();

  const create = async () => {
    if (saving) return;
    if (!canSave) { setNameTouched(true); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("mm_categories").insert({
        // 999 en vez de "contar activas" — con categorías eliminadas de por
        // medio (que ocupan sort_order pero no cuentan como activas), contar
        // se desalinea del máximo real y la nueva no cae al final. Mismo
        // patrón que ya usan las cuentas nuevas.
        user_id: session.userId, type, name: name.trim(), icon: icon || null, sort_order: 999,
      });
      if (error) throw error;
      await reload();
      onCreated();
    } catch (e) { showError(`No se pudo crear: ${e?.message || e}`); }
    setSaving(false);
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Nueva categoría" onBack={onCancel} />
      <div style={styles.form}>
        <Field label="Nombre" required error={nameTouched && !canSave ? "Este campo es obligatorio." : ""}>
          <div style={{ display: "flex", gap: 8 }}>
            <IconInput value={icon} onChange={setIcon} />
            <input style={{ ...styles.input, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setNameTouched(true)} placeholder="Nombre" onKeyDown={(e) => e.key === "Enter" && canSave && create()} />
          </div>
        </Field>
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onCancel}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: (saving || !canSave) ? 0.5 : 1 }} onClick={create} disabled={saving}>
          {saving ? "Creando…" : "Crear"}
        </button>
      </Footer>
    </div>
  );
}

function SortableCategoryManageRow({ id, name, icon, onChangeName, onBlur, onChangeIcon, onRemove, isConfirming, draggable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !draggable });
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
      {/* gap:6 acá adentro (no en la fila entera) — el handle solo necesita
          4px hasta lo siguiente, pero IconInput/input/botón sí son cajas
          separadas que necesitan su propio espacio visible. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        <IconInput value={icon} onChange={onChangeIcon} />
        <input style={{ ...styles.input, flex: 1, padding: "7px 10px", fontSize: 14 }} value={name} onChange={(e) => onChangeName(e.target.value)} onBlur={onBlur} />
        <button style={styles.iconBtnGhost} onClick={onRemove} aria-label="Borrar categoría">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
