/**
 * Normalización de texto (`textoNorm`): la clave de duplicados, sugerencias y filtro.
 * Reglas (decisión de producto, ver decisiones.md):
 *  - minúsculas, sin tildes/diéresis (á→a, ü→u), pero la ñ SE CONSERVA ("ñoquis" ≠ "noquis");
 *  - espacios colapsados y recortados;
 *  - se quitan emojis y símbolos; se conservan letras, dígitos, espacios y . , / - (para "coca 1.5 l", "yerba c/palo");
 *  - idempotente: normalizar(normalizar(x)) === normalizar(x).
 */
// Construimos los caracteres especiales con códigos para que el archivo no dependa de la normalización
// Unicode del editor (NFC/NFD) ni contenga caracteres invisibles.
const ENYE_MARK = String.fromCodePoint(0xE000);                 // marcador temporal (área de uso privado)
const ENYE_DESCOMPUESTA = new RegExp('n' + String.fromCodePoint(0x0303), 'g'); // n + virgulilla (tras NFD)
const DIACRITICOS = new RegExp('[' + String.fromCodePoint(0x0300) + '-' + String.fromCodePoint(0x036F) + ']', 'g');
const ENYE_MARK_RE = new RegExp(ENYE_MARK, 'g');

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(ENYE_DESCOMPUESTA, ENYE_MARK)      // ñ descompuesta → marcador
    .replace(DIACRITICOS, '')                    // fuera el resto de diacríticos
    .replace(ENYE_MARK_RE, '\u00F1')             // ñ de vuelta (precompuesta)
    .replace(/[^\p{L}\p{N}\s.,/-]/gu, ' ')       // fuera emojis y símbolos
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras del texto normalizado (para el filtro por prefijo de palabra). */
export function palabras(textoNorm: string): string[] {
  return textoNorm.split(/[\s,/]+/).filter(Boolean);
}

/**
 * Singular "simple" para comparar: yogures→yogur, papas→papa, huevos→huevo. No es lingüística: es una
 * heurística barata para que "yogur" y "yogures" cuenten como lo mismo al detectar duplicados y filtrar.
 */
export function singular(palabra: string): string {
  if (palabra.length <= 3) return palabra;
  if (/ces$/.test(palabra)) return palabra.slice(0, -3) + 'z';                            // luces → luz
  // la regla "-es" va ANTES que "-s": si no, "yogures" caía en /[aeiou]s$/ y daba "yogure" (bug detectado por tests)
  if (/[rlndj]es$/.test(palabra) && palabra.length >= 5) return palabra.slice(0, -2);     // yogures → yogur, panes → pan
  if (/[aeiou]s$/.test(palabra) && palabra.length > 4) return palabra.slice(0, -1);        // papas → papa, huevos → huevo
  return palabra;
}

/** Forma canónica para comparar dos ítems ("mismo ítem"): palabras en singular, unidas por espacio. */
export function canonico(texto: string): string {
  return palabras(normalizar(texto)).map(singular).join(' ');
}

/** ¿Son el mismo ítem? ("Yogur" ≈ "yogures" ≈ "YOGUR ") */
export function mismoItem(a: string, b: string): boolean {
  const ca = canonico(a), cb = canonico(b);
  return ca !== '' && ca === cb;
}

/**
 * Clave segura para usar como nombre de campo en Firestore (`entradas.<clave>`):
 * sin . / ~ * [ ] y sin empezar/terminar con __. Es determinista a partir de textoNorm.
 */
export function claveSegura(textoNorm: string): string {
  const k = textoNorm.replace(/[.~*/[\]]/g, '_').replace(/\s+/g, ' ').trim() || '_';
  // se envuelve de los DOS lados: antes "leche__" quedaba "k leche__" y seguía terminando en __ (bug detectado por tests)
  return k.startsWith('__') || k.endsWith('__') ? `k ${k} k` : k;
}
