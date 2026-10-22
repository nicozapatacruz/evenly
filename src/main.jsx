import React from "react";
import ReactDOM from "react-dom/client";
import EvenlyApp from "./EvenlyApp.jsx";

// El navegador "recuerda" solo el scroll de la página entera y lo restaura
// después de un refresh (F5), incluso en una SPA — eso pisaba el scroll que
// Transacciones calcula a propósito para dejar el día de hoy arriba (ver
// DiarioTab.jsx). "manual" apaga esa restauración automática: a partir de
// acá, el scroll en cada pantalla es responsabilidad nuestra.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <EvenlyApp />
  </React.StrictMode>
);
