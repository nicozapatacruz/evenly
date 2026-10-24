import React, { useState } from "react";
import { TopBar, FormFooter, Field, PickerField, DateRow, PhotoLightbox, Hint } from "../../components/Shared.jsx";
import { styles } from "../../lib/styles.js";
import { useImageUpload, todayInputValue, useTouched } from "../../lib/helpers.jsx";
import { recognizeReceiptText } from "../../lib/ocrImport.js";
import { parseTransactionCandidates } from "../../lib/ocrLineParser.js";
import { Camera, Trash2 } from "lucide-react";

/* =========================================================================
   IMPORTAR DESDE FOTO — paso 1: elegís la foto, la cuenta (y con ella la
   moneda) y una fecha de respaldo (ver PhotoImportWizardScreen: el OCR
   detecta su propia fecha por transacción, esta solo se usa si no pudo).
   El OCR corre acá mismo, en el navegador (ver src/lib/ocrImport.js): la
   foto nunca se sube a ningún lado, por eso no se usa resolvePhotoUrl como
   en el resto de la app.
   ========================================================================= */
export default function PhotoImportEntryScreen({ groups, accounts, onBack, onExtracted, showError }) {
  const { previewUrl, pendingFile, handleImageChange, clear } = useImageUpload(null, showError);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [touched, touch] = useTouched();
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [showFullPhoto, setShowFullPhoto] = useState(false);

  const canProcess = !!pendingFile && !!accountId;

  const handleProcess = async () => {
    touch("photo");
    touch("accountId");
    if (!canProcess || processing) return;
    setProcessing(true);
    setProgress(null);
    try {
      const text = await recognizeReceiptText(pendingFile, (p) => {
        if (p.status === "recognizing text") setProgress(p.progress);
      });
      const candidates = parseTransactionCandidates(text);
      if (candidates.length === 0) {
        showError("No se reconoció ningún texto en la foto. Probá con otra más nítida.");
        return;
      }
      onExtracted(candidates, accountId, date);
    } catch (e) {
      showError(`No se pudo leer la foto: ${e?.message || e}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={styles.screen}>
      <TopBar title="Importar gastos" onBack={onBack} />
      <div style={styles.form}>
        <p style={{ ...styles.muted, padding: 0 }}>
          Subí una foto de la lista de transacciones de tu banco. Se procesa
          en tu propio celular: la foto nunca se sube a ningún servidor.
        </p>

        <Field label="Foto" required error={touched.photo && !pendingFile ? "Elegí una foto." : ""}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {previewUrl && (
              <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 0.8", borderRadius: 16, overflow: "hidden", border: "1px solid #DDD2BE" }}>
                <button
                  type="button"
                  onClick={() => setShowFullPhoto(true)}
                  aria-label="Ver foto completa"
                  style={{ width: "100%", height: "100%", padding: 0, border: "none", background: "none", display: "block", cursor: "zoom-in" }}
                >
                  <img src={previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
                <button
                  type="button"
                  onClick={clear}
                  aria-label="Quitar foto"
                  style={{ position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: "50%", border: "none", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.25)", cursor: "pointer" }}
                >
                  <Trash2 size={17} color="#B0473A" />
                </button>
              </div>
            )}
            <label style={{ ...styles.btnDashed, cursor: "pointer" }}>
              <Camera size={14} /> {previewUrl ? "Cambiar foto" : "Añadir foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageChange} />
            </label>
          </div>
        </Field>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Field error={touched.accountId && !accountId ? "Este campo es obligatorio." : ""}>
            <PickerField
              rowLabel="Cuenta"
              required
              value={accountId}
              onChange={setAccountId}
              onBlur={() => touch("accountId")}
              placeholder="Elegí una cuenta"
              groups={groups
                .filter((g) => !g.deleted && g.system_key !== "split_ledger")
                .map((g) => ({
                  label: g.name,
                  items: accounts.filter((a) => a.group_id === g.id && !a.hidden && !a.deleted).map((a) => ({ value: a.id, label: a.name, icon: a.icon })),
                }))
                .filter((g) => g.items.length > 0)}
            />
          </Field>
          <Hint>Todas las transacciones de esta foto se van a cargar en esta cuenta, en su moneda.</Hint>

          <DateRow label="Fecha por defecto" value={date} onChange={setDate} />
          <Hint>Se usa solo si el asistente no logra leer la fecha de alguna transacción en la foto: cada una trae la suya propia, editable.</Hint>
        </div>

        {processing && (
          <p style={{ ...styles.muted, padding: 0, fontWeight: 600 }}>
            Leyendo la foto{progress != null ? ` (${Math.round(progress * 100)}%)` : "…"}
          </p>
        )}
      </div>
      <FormFooter
        onCancel={onBack}
        cancelDisabled={processing}
        onConfirm={handleProcess}
        confirmLabel={processing ? "Procesando…" : "Procesar foto"}
        confirmDisabled={processing}
        confirmDim={!canProcess}
      />

      <PhotoLightbox open={showFullPhoto} src={previewUrl} onClose={() => setShowFullPhoto(false)} />
    </div>
  );
}
