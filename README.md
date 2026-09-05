# Evenly

App para dividir y gestionar gastos en grupo (tipo Splitwise), con planes de
sumar un Money Manager de finanzas personales. Construida originalmente como
un artifact de React de un solo archivo en Claude.ai, bajo el nombre
"SplitLedger" (el componente principal en `src/SplitLedger.jsx` todavía
conserva ese nombre internamente).

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite (normalmente `http://localhost:5173`).

Para generar una build de producción:

```bash
npm run build
npm run preview
```

## ⚠️ Sobre el storage — leer antes de seguir trabajando

`src/SplitLedger.jsx` usa una API `window.storage.get/set/delete/list` que
Claude.ai expone automáticamente dentro de sus artifacts, respaldada por un
backend propio de Anthropic. Esa API **no existe** fuera de Claude.ai.

Para que el proyecto corra tal cual al descargarlo, agregué
`src/storagePolyfill.js`, que reimplementa esa misma interfaz encima de
`localStorage` del navegador (se importa una sola vez, al inicio de
`src/main.jsx`, antes de montar `SplitLedger`).

Esto permite que abras la app y funcione — login, crear grupos, agregar
gastos, etc. — pero con una limitación real:

- `localStorage` es local a **cada navegador/dispositivo**. El modelo
  multi-usuario de la app (invitar a otra persona, que dos personas vean el
  mismo grupo desde sus propios teléfonos) **no funciona de verdad** con este
  polyfill: cada quien tendría su propia copia aislada de los datos.

Para que la app sea multi-usuario de verdad vas a necesitar reemplazar
`storagePolyfill.js` por un backend real que sí comparta datos entre
dispositivos — por ejemplo Supabase, Firebase, o tu propia API con una base
de datos. La interfaz (`get`, `set`, `delete`, `list`, con la misma forma de
respuesta) está pensada para que ese reemplazo sea lo más simple posible: si
implementas esas mismas cuatro funciones contra tu backend, el resto del
código de `SplitLedger.jsx` no debería necesitar cambios.

## Estructura

```
evenly/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx              # punto de entrada
│   ├── storagePolyfill.js    # shim de window.storage sobre localStorage
│   └── SplitLedger.jsx       # toda la app (single-file component)
```
