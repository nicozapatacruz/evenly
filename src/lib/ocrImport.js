import { createWorker, OEM } from "tesseract.js";

// Assets de Tesseract auto-alojados acá mismo (public/tesseract/), no en el
// CDN público que usa por defecto — así la foto nunca genera ninguna
// petición de red hacia un tercero, ni siquiera para descargar el motor.
// Las 3 claves de abajo son las únicas que tesseract.js resuelve a una URL
// absoluta antes de mandárselas al worker (ver resolvePaths en su código
// fuente); si se te escapa alguna, cae sola al CDN de jsdelivr sin avisar.
// Para copiar estos archivos de nuevo (ej. tras actualizar la librería):
//   cp node_modules/tesseract.js/dist/worker.min.js public/tesseract/
//   cp node_modules/tesseract.js-core/tesseract-core-{lstm,simd-lstm,relaxedsimd-lstm}.wasm.js public/tesseract/core/
//   cp node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz public/tesseract/lang-data/
const base = import.meta.env.BASE_URL;
const workerPath = `${base}tesseract/worker.min.js`;
const corePath = `${base}tesseract/core`; // directorio: tesseract.js elige sola la variante (simd/relaxedsimd/plano) según el dispositivo
const langPath = `${base}tesseract/lang-data`;

// Reconoce el texto de una foto. `file` es el File/Blob que ya da
// useImageUpload (src/lib/helpers.jsx) sin necesidad de subirlo a ningún
// lado — el procesamiento es 100% local, en la sandbox de WebAssembly del
// navegador. `onProgress` recibe los eventos propios de Tesseract
// ({ status, progress }), para mostrar un indicador mientras procesa.
export async function recognizeReceiptText(file, onProgress) {
  const worker = await createWorker("spa", OEM.LSTM_ONLY, {
    workerPath,
    corePath,
    langPath,
    gzip: true,
    logger: onProgress,
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
