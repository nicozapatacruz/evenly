import "./storagePolyfill.js"; // debe cargarse antes que SplitLedger
import React from "react";
import ReactDOM from "react-dom/client";
import SplitLedger from "./SplitLedger.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SplitLedger />
  </React.StrictMode>
);
