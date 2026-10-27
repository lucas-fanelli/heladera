/**
 * Filtro tolerante del input ("el input es filtro y alta a la vez").
 * Una consulta coincide con un ítem si CADA palabra de la consulta es prefijo de alguna palabra del ítem
 * (comparando en singular), o está a un error de tipeo (Levenshtein ≤ 1) de una palabra de ≥ 5 letras.
 *   "yog"     ⇒ "Yogur de frutilla"   (prefijo)
 *   "yogures" ⇒ "Yogur"               (plural simple)
 *   "yogurt"  ⇒ "Yogur"               (un error de tipeo, palabra ≥ 5)
 *   "le po"   ⇒ "Leche en polvo"      (varias palabras, cualquier orden; "le pa" NO: "pa" no es prefijo de ninguna)
 *   "lechu"   ⇒ "Leche"               (5 letras y una sola edición: la tolerancia a tipeo la acepta; decisión documentada)
 */
import { normalizar, palabras, singular } from './normalizar';

const FUZZY_MIN_LEN = 5;

export function coincide(consulta: string, textoNorm: string): boolean {
  const q = palabras(normalizar(consulta)).map(singular);
  if (q.length === 0) return true;
  const ps = palabras(textoNorm).map(singular);
  if (ps.length === 0) return false;
  return q.every(qw => ps.some(pw => pw.startsWith(qw) || (qw.length >= FUZZY_MIN_LEN && levenshtein1(qw, pw))));
}

/** ¿`a` y `b` están a distancia de edición ≤ 1 (o `a` es prefijo de `b` con un error)? */
export function levenshtein1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) {
    // permitir "prefijo con un error": comparar contra el prefijo de b de largo la o la+1
    if (lb > la + 1) return levenshtein1(a, b.slice(0, la)) || levenshtein1(a, b.slice(0, la + 1));
    return false;
  }
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; }        // sustitución
    else if (la > lb) { i++; }          // borrado en a
    else { j++; }                       // inserción en a
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** Resalta las partes que coinciden (para el <mark> estático de la fila). Devuelve segmentos [texto, coincide]. */
export function segmentosResaltados(consulta: string, texto: string): Array<[string, boolean]> {
  const q = palabras(normalizar(consulta));
  if (q.length === 0) return [[texto, false]];
  const out: Array<[string, boolean]> = [];
  const re = /[\p{L}\p{N}]+/gu;
  let last = 0;
  for (const m of texto.matchAll(re)) {
    const start = m.index ?? 0;
    const palabra = m[0];
    const norm = normalizar(palabra);
    const hit = q.some(qw => singular(norm).startsWith(singular(qw)) || norm.startsWith(qw));
    if (start > last) out.push([texto.slice(last, start), false]);
    if (hit) {
      // resaltar solo el prefijo que coincide (largo de la consulta más larga que matchea)
      const len = Math.max(...q.filter(qw => norm.startsWith(qw)).map(qw => qw.length), 0);
      const cut = len > 0 ? Math.min(len, palabra.length) : palabra.length;
      out.push([palabra.slice(0, cut), true]);
      if (cut < palabra.length) out.push([palabra.slice(cut), false]);
    } else {
      out.push([palabra, false]);
    }
    last = start + palabra.length;
  }
  if (last < texto.length) out.push([texto.slice(last), false]);
  return out;
}
