import React, { useState } from "react";
import { TopBar, Footer, Field, PickerField } from "../../components/Shared.jsx";
import { styles } from "../../lib/styles.js";
import { useImageUpload, todayInputValue } from "../../lib/helpers.jsx";
import { recognizeReceiptText } from "../../lib/ocrImport.js";
import { parseTransactionCandidates } from "../../lib/ocrLineParser.js";
import { Camera, Trash2, X } from "lucide-react";

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
  const [touched, setTouched] = useState({});
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [showFullPhoto, setShowFullPhoto] = useState(false);

  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));
  const canProcess = !!pendingFile && !!accountId;

  const handleProcess = async () => {
    setTouched({ photo: true, accountId: true });
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

        <Field label="Cuenta" required error={touched.accountId && !accountId ? "Este campo es obligatorio." : ""}>
          <PickerField
            value={accountId}
            onChange={setAccountId}
            onBlur={() => touch("accountId")}
            placeholder="Elegí una cuenta"
            groups={groups
              .filter((g) => !g.deleted)
              .map((g) => ({
                label: g.name,
                items: accounts.filter((a) => a.group_id === g.id && !a.hidden && !a.deleted).map((a) => ({ value: a.id, label: a.name, icon: a.icon })),
              }))
              .filter((g) => g.items.length > 0)}
          />
        </Field>
        <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
          Todas las transacciones de esta foto se van a cargar en esta cuenta, en su moneda.
        </p>

        <Field label="Fecha por defecto">
          <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <p style={{ ...styles.muted, padding: 0, marginTop: -8 }}>
          Se usa solo si el asistente no logra leer la fecha de alguna transacción en la foto: cada una trae la suya propia, editable.
        </p>

        {processing && (
          <p style={{ ...styles.muted, padding: 0, fontWeight: 600 }}>
            Leyendo la foto{progress != null ? ` (${Math.round(progress * 100)}%)` : "…"}
          </p>
        )}
      </div>
      <Footer>
        <button style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }} onClick={onBack} disabled={processing}>Cancelar</button>
        <button style={{ ...styles.btnPrimary, flex: 1, marginTop: 0, opacity: canProcess && !processing ? 1 : 0.5 }} onClick={handleProcess} disabled={processing}>
          {processing ? "Procesando…" : "Procesar foto"}
        </button>
      </Footer>

      {showFullPhoto && previewUrl && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
          onClick={() => setShowFullPhoto(false)}
        >
          <img src={previewUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          <button
            type="button"
            onClick={() => setShowFullPhoto(false)}
            aria-label="Cerrar"
            style={{ position: "absolute", top: 16, right: 16, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <X size={22} color="#fff" />
          </button>
        </div>
      )}
    </div>
  );
}
