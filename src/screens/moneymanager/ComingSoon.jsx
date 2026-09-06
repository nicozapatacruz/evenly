import React from "react";
import { Sparkles } from "lucide-react";
import { styles } from "../../lib/styles.js";

export default function ComingSoon({ title }) {
  return (
    <div style={styles.screen}>
      <div style={{ ...styles.emptyState, marginTop: 80 }}>
        <div style={styles.emptyIcon}><Sparkles size={26} strokeWidth={1.5} /></div>
        <p style={styles.emptyTitle}>{title}</p>
        <p style={styles.muted}>Todavía estamos construyendo Money Manager. Vuelve pronto.</p>
      </div>
    </div>
  );
}
