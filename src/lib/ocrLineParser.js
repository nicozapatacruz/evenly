import { parseAmountInput } from "./helpers.jsx";

// Nombres de mes en español (abreviados y completos) tal como aparecen en
// los bancos que probamos ("8 oct", "29 sept", "14 SEPT 2026") — la
// búsqueda en MONTHS es case-insensitive (la clave siempre se normaliza a
// minúsculas antes de buscar).
const MONTHS = {
  ene: 0, enero: 0,
  feb: 1, febrero: 1,
  mar: 2, marzo: 2,
  abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5,
  jul: 6, julio: 6,
  ago: 7, agosto: 7,
  sep: 8, sept: 8, setiembre: 8, septiembre: 8,
  oct: 9, octubre: 9,
  nov: 10, noviembre: 10,
  dic: 11, diciembre: 11,
};

// Encabezado de fecha: día de la semana opcional + coma, día, mes (en
// palabras), año opcional. Cubre "Jueves, 8 oct", "Lunes, 5 oct" y
// "14 SEPT 2026" (sin día de la semana, con año). El día de la semana no
// se valida contra una lista (cualquier palabra + coma sirve) — lo que de
// verdad filtra una línea que NO es una fecha es que el mes tiene que
// existir en MONTHS; si no, esta función devuelve null y la línea se trata
// como texto normal.
const DATE_HEADER_PATTERN = /^(?:[a-záéíóúñ]+,\s*)?(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)\.?(?:\s+(\d{4}))?$/i;

// Una línea que es SOLO un año de 4 dígitos (ej. el "2026" que algunos
// bancos muestran una sola vez, lejos de la fecha, en vez de repetirlo en
// cada renglón) — actualiza el año conocido sin ser en sí misma un
// encabezado de fecha.
const BARE_YEAR_PATTERN = /^(\d{4})$/;

// Busca, al final de la línea, algo con pinta de monto: signo opcional,
// símbolo de moneda opcional (el OCR suele arruinar "€"), el número en sí,
// y de nuevo un símbolo opcional al final. Ancla al final de línea a
// propósito: es donde casi todas las apps de banco muestran el importe. El
// número se captura como un bloque ancho de dígitos/separadores (sin
// describir grupos de miles con cuantificadores anidados ni alternancias de
// texto como "EUR"/"USD", que un linter marcó con riesgo de backtracking
// cuadrático): parseAmountInput ya sabe distinguir "1.234,56" de
// "1,234.56" de "55,00", no hace falta que el regex también lo sepa, y un
// código de moneda en letras es raro en estas capturas comparado con el
// símbolo. El signo acepta guión largo/mediano además de "+-": el OCR a
// veces reconoce el propio signo menos del monto como "—" o "–" en vez de
// "-", y si no se admite acá, ese carácter queda afuera del match y termina
// colgado como "basura" al final de la descripción en lugar de reconocerse
// como el signo (el signo en sí se descarta de todos modos: el monto
// siempre se guarda en valor absoluto).
const AMOUNT_PATTERN = /([+\-–—])?\s*[€$£]?\s*(\d[\d.,]*)\s*[€$£]?\s*$/;

// Lo que queda de una línea después de sacarle el monto a veces es solo un
// código de moneda en letras (ej. "COP" antes del "$" — ver captura real de
// un banco), no texto de descripción real. Códigos de moneda van siempre en
// mayúsculas, así que no se confunde con una descripción corta real.
const CURRENCY_CODE_ONLY = /^[A-Z]{2,4}$/;

function parseDateHeader(line, lastKnownYear, today) {
  const match = line.match(DATE_HEADER_PATTERN);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const monthIndex = MONTHS[match[2].toLowerCase()];
  if (monthIndex === undefined || day < 1 || day > 31) return null;
  if (match[3]) return { day, monthIndex, year: parseInt(match[3], 10) };
  if (lastKnownYear != null) return { day, monthIndex, year: lastKnownYear };
  // Sin ningún año visto todavía: asumimos el año actual, salvo que eso
  // deje la fecha en el futuro — un extracto bancario nunca tiene
  // transacciones futuras, así que en ese caso es el año anterior.
  const currentYear = today.getFullYear();
  const guess = new Date(currentYear, monthIndex, day);
  return { day, monthIndex, year: guess > today ? currentYear - 1 : currentYear };
}

// Convierte el texto reconocido por el OCR en una lista de candidatos a
// transacción. A diferencia de una heurística "una línea = una
// transacción", acá se recorren las líneas acumulando contexto: una línea
// de fecha actualiza "la fecha vigente" (sin generar candidato), las líneas
// de texto sin monto se acumulan como posible descripción (cubre bancos que
// separan descripción y monto en líneas distintas), y recién cuando aparece
// un monto se cierra una transacción con todo lo acumulado + esa fecha
// vigente. Esto también resuelve solo texto de interfaz que no es una
// transacción (ej. "Ver opciones de fraccionar pago"): queda acumulado
// pero nunca llega un monto antes del siguiente encabezado de fecha, así
// que se descarta sin generar un paso falso en el asistente.
export function parseTransactionCandidates(rawText, { today = new Date() } = {}) {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const candidates = [];
  let currentDate = null;
  let lastKnownYear = null;
  let pendingDescriptionLines = [];

  for (const line of lines) {
    const bareYear = line.match(BARE_YEAR_PATTERN);
    if (bareYear) {
      lastKnownYear = parseInt(bareYear[1], 10);
      continue;
    }

    const dateHeader = parseDateHeader(line, lastKnownYear, today);
    if (dateHeader) {
      currentDate = dateHeader;
      lastKnownYear = dateHeader.year;
      pendingDescriptionLines = [];
      continue;
    }

    const amountMatch = line.match(AMOUNT_PATTERN);
    if (amountMatch) {
      // El guión corto no es el único separador que aparece pegado al
      // final de la descripción: el OCR a veces lo lee como guión largo
      // (—) o mediano (–), según cómo haya interpretado el espacio antes
      // del monto en una captura real.
      const inline = line.slice(0, amountMatch.index).trim().replace(/[-:·|—–]+$/, "").trim();
      const inlineDescription = CURRENCY_CODE_ONLY.test(inline) ? "" : inline;
      const description = [...pendingDescriptionLines, inlineDescription].filter(Boolean).join(" ").trim();
      const numeric = parseAmountInput(amountMatch[2]);
      const amount = isNaN(numeric) ? null : Math.abs(numeric);
      const date = currentDate ? new Date(currentDate.year, currentDate.monthIndex, currentDate.day, 12).getTime() : null;
      candidates.push({ rawText: line, description: description || line, amount, date });
      pendingDescriptionLines = [];
      continue;
    }

    pendingDescriptionLines.push(line);
  }

  return candidates;
}
