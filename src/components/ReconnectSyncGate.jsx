import React from "react";
import { RefreshCw } from "lucide-react";
import { styles } from "../lib/styles.js";

// Banner no bloqueante (antes tapaba toda la app) mientras se sincroniza al
// arrancar o al reconectar — ver syncEngine.js. Los datos locales (Dexie) ya
// están mostrados debajo, esto solo avisa que puede haber algo más fresco
// en camino. Vive en AppShell, mismo lugar que antes.
export default function ReconnectSyncGate() {
  return (
    <output style={{ ...styles.toast, display: "flex", alignItems: "center", gap: 8 }}>
      <RefreshCw size={14} className="spin" />
      <span>Sincronizando…</span>
    </output>
  );
}
