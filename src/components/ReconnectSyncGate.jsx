import React from "react";
import { styles } from "../lib/styles.js";

// Tapa toda la app (sin desmontarla, para no perder scroll/formularios en
// curso) mientras se sincroniza al arrancar o al reconectar — ver
// syncEngine.js. Vive en AppShell, al mismo nivel que el loading inicial de
// moneyManager/groups.
export default function ReconnectSyncGate() {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(251, 248, 242, 0.96)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
      }}
    >
      <div style={{ ...styles.emptyIcon, margin: 0 }}>
        <div
          style={{
            width: 22, height: 22, borderRadius: "50%",
            border: "3px solid #ECE3D3", borderTopColor: "#A8754A",
            animation: "evenly-spin 0.8s linear infinite",
          }}
        />
      </div>
      <p style={{ ...styles.muted, padding: 0 }}>Trayendo datos…</p>
      <style>{"@keyframes evenly-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}
