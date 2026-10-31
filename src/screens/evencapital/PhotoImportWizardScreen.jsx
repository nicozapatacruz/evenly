import React, { useEffect, useState } from "react";
import { TopBar, Footer, FormFooter, Field, PickerField, DateRow, TextRow, CalculatorAmountInput, EmptyState, Modal, SegmentedControl } from "../../components/Shared.jsx";
import { styles } from "../../lib/styles.js";
import { money, parseAmountInput, dateInputValue, useScrollToTopOnChange, normalizeForSearch, useTouched, CURRENCIES } from "../../lib/helpers.jsx";
import { computeAmountMain, useRecentNoteTitles } from "../../lib/evenCapitalData.js";
import { useDescriptionRules, findDescriptionRule, upsertDescriptionRule, normalizeDescription } from "../../lib/descriptionRulesData.js";
import { Check, Inbox, RefreshCw, X } from "lucide-react";

const TYPE_LABEL = { income: "Ingreso", expense: "Gasto" };
// Mismos colores que AMOUNT_COLOR en TransactionForm.jsx -- acá solo gasto/
// ingreso, no hay transferencia en este asistente.
const AMOUNT_COLOR = { expense: "#B0473A", income: "#3B6E62" };

// Busca, dentro de lo ya confirmado en ESTE mismo lote (no en la base
// todavía: nada se guarda hasta el final), la confirmación más reciente
// para la misma descripción detectada por el OCR. Esto es lo que hace que
// confirmar el comercio #1 de la foto autocomplete el #2 y el #3 sin
// esperar a que termine de guardarse nada. Si no hay nada local, el
// llamador cae a la regla de la base (findDescriptionRule). Devuelve la
// misma forma que una fila de la base (title/type/category_id/memo) para
// que WizardStep no tenga que distinguir el origen.
function findLocalRule(entries, matchText) {
  if (!matchText) return null;
  const normalized = normalizeDescription(matchText);
  for (let i = entries.length - 1; i >= 0; i--) {
    const ruleArgs = entries[i]?.ruleArgs;
    if (ruleArgs && normalizeDescription(ruleArgs.matchText) === normalized) {
      return { title: ruleArgs.title, type: ruleArgs.type, category_id: ruleArgs.categoryId || null, memo: ruleArgs.memo || null };
    }
  }
  return null;
}

/* =========================================================================
   ASISTENTE DE IMPORTACIÓN — un paso por candidato detectado en la foto,
   más un resumen final (mismo componente, 2 modos internos, para no armar
   una tercera pantalla solo para el resumen). La cuenta/moneda vienen fijas
   desde PhotoImportEntryScreen (acá no hay tasa de cambio en ningún paso);
   la fecha, en cambio, es por transacción — cada paso trae la que el OCR
   detectó para esa transacción puntual (ver ocrLineParser.js), con la
   fecha elegida en la pantalla anterior como respaldo si no se detectó
   ninguna.

   Nada se guarda en la base de datos hasta que se recorrió el lote entero:
   cada "Confirmar" solo acumula la transacción en memoria y avanza de
   paso. Esto es a propósito (no una optimización): si guardáramos paso a
   paso, "Atrás" no podría deshacer nada (ya estaría en la base), y salir a
   mitad de camino dejaría transacciones sueltas ya guardadas sin que el
   usuario lo haya pedido. Guardando todo junto al final, "Atrás" es
   gratis y "Salir" (ver el botón de la topbar) nunca necesita borrar nada.
   ========================================================================= */
export default function PhotoImportWizardScreen({ userId, settings, accounts, categories, accountId, candidates, date, onBack, onFinish, onSaveMoneyTransaction, showError }) {
  const { rules, loading: rulesLoading } = useDescriptionRules(userId);
  const [stepIndex, setStepIndex] = useState(0);
  // Una casilla por paso (no un array que crece con cada "Confirmar"): si
  // volvés atrás y volvés a confirmar el mismo paso, tiene que REEMPLAZAR su
  // entrada, no sumar una segunda — si no, ese paso queda guardado 2 veces
  // al final.
  const [entries, setEntries] = useState(() => new Array(candidates.length).fill(null)); // entries[i] = { status: "confirmed", tx, ruleArgs } | { status: "skipped" }
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState(null); // transacciones efectivamente guardadas, una vez termina el guardado
  useScrollToTopOnChange(stepIndex, results !== null);

  const account = accounts.find((a) => a.id === accountId);
  const accountCurrency = account?.currency;
  const allConfirmed = stepIndex >= candidates.length;

  const advance = (entry) => {
    setEntries((prev) => {
      const next = [...prev];
      next[stepIndex] = entry;
      return next;
    });
    setStepIndex((i) => i + 1);
  };

  useEffect(() => {
    if (!allConfirmed || saving || results !== null) return;
    setSaving(true);
    (async () => {
      const saved = [];
      for (const entry of entries) {
        if (entry?.status !== "confirmed") continue;
        const ok = await onSaveMoneyTransaction(entry.tx);
        if (!ok) continue;
        if (entry.ruleArgs) {
          try {
            await upsertDescriptionRule(userId, entry.ruleArgs);
          } catch (e) { showError(`No se pudo recordar esta descripción: ${e?.message || e}`); }
        }
        saved.push(entry.tx);
      }
      setResults(saved);
      setSaving(false);
    })();
  }, [allConfirmed, saving, results, entries, onSaveMoneyTransaction, userId, showError]);

  // Bloquea el arranque hasta que terminen de cargar las reglas guardadas:
  // si el primer paso montara antes de tener `rules`, quedaría precargado
  // sin sugerencia para siempre (WizardStep solo lee `rule` una vez, al
  // montar) — y como es la misma foto en el mismo orden, la próxima
  // reimportación perdería la carrera exactamente igual.
  if (rulesLoading) {
    return (
      <div style={styles.screen}>
        <TopBar title="Importar gastos" />
        <div style={styles.form}>
          <EmptyState icon={<RefreshCw size={28} strokeWidth={1.5} className="spin" />} title="Cargando…" />
        </div>
      </div>
    );
  }

  if (allConfirmed) {
    if (results === null) {
      return (
        <div style={styles.screen}>
          <TopBar title="Importar gastos" />
          <div style={styles.form}>
            <EmptyState icon={<RefreshCw size={28} strokeWidth={1.5} className="spin" />} title="Guardando transacciones…" />
          </div>
        </div>
      );
    }
    const skippedEntries = entries.filter((e) => e?.status === "skipped");
    const skipped = skippedEntries.length;
    return (
      <div style={styles.screen}>
        <TopBar title="Importar gastos" />
        <div style={styles.form}>
          {results.length === 0 && skipped === 0 ? (
            <EmptyState icon={<Inbox size={28} strokeWidth={1.5} />} title="No se guardó ninguna transacción" />
          ) : (
            <>
              <p style={{ ...styles.muted, padding: 0 }}>
                Se guardaron {results.length} transaccion{results.length === 1 ? "" : "es"}
                {skipped > 0 ? `, se omitieron ${skipped}.` : "."}
              </p>
              {/* Una sola tarjeta compartida por sección, filas separadas por
                  línea fina -- antes cada fila era su propia tarjeta
                  `shareRow`, idéntica a las SÍ clickeables de otras
                  pantallas (ver EvenGroupTab.jsx/ExpenseDetail, mismo
                  arreglo). Pedido de Nicolas, 2026-10-31. */}
              {results.length > 0 && (
                <div style={{ borderRadius: 12, border: "1px solid #ECE3D3", background: "#FAF7F2", overflow: "hidden" }}>
                  {results.map((tx, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", fontSize: 14, fontFamily: "system-ui, sans-serif", borderBottom: i < results.length - 1 ? "1px solid #F0EBE2" : "none" }}>
                      <span style={{ ...styles.avatar, background: tx.type === "income" ? "#3B6E62" : "#C75D3B" }}>
                        <Check size={16} color="#fff" />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block" }}>{tx.title || "Sin descripción"}</span>
                        <span style={{ fontSize: 11, color: "#6B6355", fontFamily: "system-ui, sans-serif" }}>{TYPE_LABEL[tx.type]}</span>
                      </div>
                      <span style={styles.shareAmount}>{money(tx.amount, accountCurrency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {skipped > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <p style={{ ...styles.muted, padding: 0, margin: 0 }}>Omitidas</p>
                  <div style={{ borderRadius: 12, border: "1px solid #ECE3D3", background: "#FAF7F2", overflow: "hidden" }}>
                  {skippedEntries.map((entry, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", fontSize: 14, fontFamily: "system-ui, sans-serif", borderBottom: i < skippedEntries.length - 1 ? "1px solid #F0EBE2" : "none" }}>
                      <span style={{ ...styles.avatar, background: "#A89A87" }}>
                        <X size={16} color="#fff" />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block" }}>{entry.candidate?.description || "Sin descripción"}</span>
                      </div>
                      {entry.candidate?.amount != null && (
                        <span style={styles.shareAmount}>{money(entry.candidate.amount, accountCurrency)}</span>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <Footer>
          <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0 }} onClick={onFinish}>Listo</button>
        </Footer>
      </div>
    );
  }

  const candidate = candidates[stepIndex];
  return (
    <WizardStep
      key={stepIndex}
      userId={userId}
      settings={settings}
      candidate={candidate}
      savedEntry={entries[stepIndex]}
      rule={findLocalRule(entries, candidate.description) || findDescriptionRule(rules, candidate.description)}
      categories={categories}
      accountCurrency={accountCurrency}
      fallbackDate={date}
      stepNumber={stepIndex + 1}
      totalSteps={candidates.length}
      onBack={stepIndex === 0 ? onBack : () => setStepIndex((i) => i - 1)}
      onExit={onFinish}
      onSkip={() => advance({ status: "skipped", candidate })}
      onConfirm={({ amount, title, type, categoryId, memo, date: stepDate }) => {
        const amountMain = computeAmountMain(amount, accountCurrency, accountCurrency, null);
        const tx = {
          type,
          account_id: accountId,
          to_account_id: null,
          category_id: categoryId || null,
          currency: accountCurrency,
          amount,
          exchange_rate: null,
          amount_main: amountMain,
          date: new Date(stepDate + "T12:00:00").getTime(),
          title: title || null,
          memo: memo || null,
        };
        const ruleArgs = candidate.description && title ? { matchText: candidate.description, type, title, categoryId, memo } : null;
        advance({ status: "confirmed", tx, ruleArgs });
      }}
    />
  );
}

function WizardStep({ userId, settings, candidate, savedEntry, rule, categories, accountCurrency, fallbackDate, stepNumber, totalSteps, onBack, onExit, onSkip, onConfirm }) {
  // Si ya habías confirmado este paso y volviste (ej. con "Atrás"), hay que
  // precargar lo que editaste entonces, no los datos crudos del OCR de
  // nuevo — si no, cualquier corrección se perdía apenas volvías a pasar
  // por acá.
  const saved = savedEntry?.status === "confirmed" ? savedEntry.tx : null;
  const [amount, setAmount] = useState(saved ? String(saved.amount) : (candidate.amount != null ? String(candidate.amount) : ""));
  const [title, setTitle] = useState(saved ? (saved.title || "") : (rule?.title || candidate.description || ""));
  const [type, setType] = useState(saved ? saved.type : (rule?.type || "expense"));
  const [categoryId, setCategoryId] = useState(saved ? (saved.category_id || "") : (rule?.category_id || ""));
  const [memo, setMemo] = useState(saved ? (saved.memo || "") : (rule?.memo || ""));
  // Precargada con la fecha que el OCR detectó para esta transacción puntual
  // (encabezado de fecha más cercano arriba de ella en la foto); si no se
  // detectó ninguna, cae a la fecha elegida en la pantalla anterior.
  const [date, setDate] = useState(saved ? dateInputValue(saved.date) : (candidate.date != null ? dateInputValue(candidate.date) : fallbackDate));
  const [touched, touch] = useTouched();
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Mismo autocompletado de "Descripción" que TransactionForm (misma fuente,
  // mismo filtro por substring) — acá la variable ya se llama "title" (el
  // nombre real de la columna) en vez de "note", no hace falta repetir esa
  // inversión de nombres.
  const [titleFocused, setTitleFocused] = useState(false);
  const [titleDismissed, setTitleDismissed] = useState(false);
  const recentTitles = useRecentNoteTitles(userId);
  const titleSuggestions = settings.autocomplete_notes && title.trim()
    ? recentTitles.filter((t) => normalizeForSearch(t).includes(normalizeForSearch(title.trim())) && normalizeForSearch(t) !== normalizeForSearch(title.trim())).slice(0, 5)
    : [];

  const numericAmount = parseAmountInput(amount);
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;
  const typeCategories = categories.filter((c) => c.type === type && !c.deleted);

  const handleConfirm = () => {
    touch("amount");
    if (!validAmount) return;
    onConfirm({ amount: numericAmount, title: title.trim(), type, categoryId, memo: memo.trim(), date });
  };

  return (
    <div style={styles.screen}>
      <TopBar
        title={`Transacción ${stepNumber} de ${totalSteps}`}
        onBack={onBack}
        right={
          <button style={styles.iconBtnGhost} onClick={() => setShowExitConfirm(true)} aria-label="Salir del asistente">
            <X size={20} />
          </button>
        }
      />
      <div style={styles.form}>
        <SegmentedControl
          options={[
            { value: "expense", label: "Gasto" },
            { value: "income", label: "Ingreso", color: "#3B6E62" },
          ]}
          value={type}
          onChange={setType}
        />

        {/* Importe "hero": mismo bloque que TransactionForm.jsx (número
            grande centrado, sin caja/etiqueta, moneda como chip aparte) --
            acá la moneda es fija (la de la cuenta elegida en el paso 1, para
            todo el lote), así que el chip es solo informativo, no un picker. */}
        <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, width: "100%" }}>
            <CalculatorAmountInput
              value={amount}
              onChange={setAmount}
              onBlur={() => touch("amount")}
              placeholder="0,00"
              style={{ flex: "0 1 auto", minWidth: 0, width: "auto", height: 56, border: "none", background: "transparent", padding: "0 10px", lineHeight: 1, fontSize: 40, fontWeight: 400, fontFamily: "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif", color: AMOUNT_COLOR[type], textAlign: "center", justifyContent: "center", borderRadius: 14 }}
              focusStyle={{ background: "#F3ECE0", boxShadow: "none" }}
              placeholderColor="#A3968B"
            />
            {/* Simple etiqueta, no un botón -- a diferencia de TransactionForm.jsx,
                acá la moneda es fija (la de la cuenta elegida en el paso 1,
                para todo el lote), no hay nada para tocar. Sin fondo/borde y
                atenuada, como cualquier otro elemento disabled de la app. */}
            {/* Sin caja, solo el símbolo -- el código abajo (ej. "EUR") se ve
                descentrado sin la caja que antes los agrupaba. */}
            <div style={{ fontFamily: "system-ui, sans-serif", color: "#2B2420", height: 56, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }}>
              <span style={{ fontSize: 25, fontFamily: "'Iowan Old Style', 'Georgia', 'Source Serif Pro', serif", lineHeight: 1 }}>{CURRENCIES[accountCurrency]?.symbol || accountCurrency}</span>
            </div>
          </div>
        </div>
        {(touched.amount && !validAmount) || !amount ? (
          <p style={{ margin: "-6px 0 0", fontSize: 13, textAlign: "center", color: touched.amount && !validAmount ? "#B0473A" : "#8A7F72", fontFamily: "system-ui, sans-serif" }}>
            {touched.amount && !validAmount ? "Ingresá un importe válido." : "Tocá el número para escribir el importe."}
          </p>
        ) : null}

        <DateRow label="Fecha" value={date} onChange={setDate} />

        <Field>
          <PickerField
            rowLabel="Categoría"
            value={categoryId}
            onChange={setCategoryId}
            onClear={() => setCategoryId("")}
            placeholder="Sin categoría"
            title="Elegí una categoría"
            groups={[{ label: null, items: typeCategories.map((c) => ({ value: c.id, label: c.name, icon: c.icon })) }]}
          />
        </Field>

        <TextRow
          label="Descripción"
          value={title}
          onChange={(v) => { setTitle(v); setTitleDismissed(false); }}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => setTitleFocused(false)}
          placeholder="Cena, taxi, supermercado…"
          suggestions={titleFocused && !titleDismissed ? titleSuggestions : []}
          onPickSuggestion={(s) => { setTitle(s); setTitleDismissed(true); }}
        />

        <TextRow label="Nota" value={memo} onChange={setMemo} placeholder="Opcional" multiline />
      </div>
      <FormFooter
        onCancel={onSkip}
        cancelLabel="Omitir"
        onConfirm={handleConfirm}
        confirmLabel="Confirmar"
      />

      {showExitConfirm && (
        <Modal title="¿Salir del asistente?" onClose={() => setShowExitConfirm(false)}>
          <p style={{ margin: "0 0 14px", fontSize: 14, fontFamily: "system-ui, sans-serif", color: "#6B6355" }}>
            Se va a perder la importación de esta foto, con todo lo que ya confirmaste.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...styles.btnGhostSmall, flex: 1, justifyContent: "center" }} onClick={() => setShowExitConfirm(false)}>Cancelar</button>
            <button style={{ ...styles.btnDangerSmall, flex: 1 }} onClick={onExit}>Salir</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
