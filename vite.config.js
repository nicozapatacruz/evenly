import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Cachea la "app shell" (JS/CSS/HTML/íconos) para que un recargo de
    // página offline muestre la app en vez de la pantalla de "sin conexión"
    // del navegador -- los datos ya los resuelve Dexie (ver localDb.js),
    // esto es la otra mitad de "modo offline". `manifest: false` porque ya
    // existe public/manifest.json enlazado a mano en index.html, no hace
    // falta que el plugin genere/inyecte el suyo. tesseract/** (modelos de
    // OCR, ~13MB) queda afuera a propósito: se descarga sola la primera vez
    // que se usa "Importar foto", no tiene sentido inflar la precarga
    // inicial de la app con algo que la mayoría de las sesiones ni toca.
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,ico,json}"],
        globIgnores: ["tesseract/**"],
      },
    }),
  ],
  base: "/evenly/",
  test: {
    environment: "node",
  },
});
