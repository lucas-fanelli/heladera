/**
 * Quién soy en este teléfono, por lista. Vive en localStorage (no en Firestore):
 * la identidad es "la persona elegida en este teléfono", no el uid del dispositivo.
 * Si el storage se pierde (iOS purga), la app vuelve a preguntar; lo ya anotado sigue firmado.
 */
import type { Yo } from '@/db/types';

const KEY_YO = (listId: string) => `heladera:yo:${listId}`;
const KEY_ULTIMA = 'heladera:ultimaLista';
const KEY_DESCARTADO = (listId: string) => `heladera:quienSosDescartado:${listId}`;

function safeGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* storage lleno o bloqueado: seguimos en memoria */ } }
function safeDel(k: string): void { try { localStorage.removeItem(k); } catch { /* idem */ } }

export const YO_ANONIMO: Yo = { memberId: null, nombre: null };

export function leerYo(listId: string): Yo {
  const raw = safeGet(KEY_YO(listId));
  if (!raw) return YO_ANONIMO;
  try {
    const p = JSON.parse(raw) as Partial<Yo>;
    if (typeof p.memberId === 'string' && typeof p.nombre === 'string') return { memberId: p.memberId, nombre: p.nombre };
  } catch { /* corrupto */ }
  return YO_ANONIMO;
}
export function guardarYo(listId: string, yo: Yo): void {
  if (!yo.memberId) { safeDel(KEY_YO(listId)); return; }
  safeSet(KEY_YO(listId), JSON.stringify(yo));
}

/** El sheet "¿Quién sos?" se descartó en esta sesión: no insistir hasta la próxima acción. */
export function marcarDescartado(listId: string): void { try { sessionStorage.setItem(KEY_DESCARTADO(listId), '1'); } catch { /* */ } }
export function fueDescartado(listId: string): boolean { try { return sessionStorage.getItem(KEY_DESCARTADO(listId)) === '1'; } catch { return false; } }
export function limpiarDescartado(listId: string): void { try { sessionStorage.removeItem(KEY_DESCARTADO(listId)); } catch { /* */ } }

/**
 * Lo que tocaste en este teléfono ANTES de decir quién sos (D20). Este es el único lugar del mundo que sabe que esos
 * "alguien" son tuyos, así que se guarda acá hasta que elegís nombre y se los reclama. Tope para no crecer sin fin.
 */
const KEY_ANONIMOS = (listId: string) => `heladera:anonimos:${listId}`;
const MAX_ANONIMOS = 200;

export function anotarAnonimo(listId: string, itemId: string): void {
  const ids = leerAnonimos(listId);
  if (ids.includes(itemId)) return;
  ids.push(itemId);
  safeSet(KEY_ANONIMOS(listId), JSON.stringify(ids.slice(-MAX_ANONIMOS)));
}
export function leerAnonimos(listId: string): string[] {
  const raw = safeGet(KEY_ANONIMOS(listId));
  if (!raw) return [];
  try { const p: unknown = JSON.parse(raw); return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}
export function limpiarAnonimos(listId: string): void { safeDel(KEY_ANONIMOS(listId)); }

export function leerUltimaLista(): { id: string; nombre: string } | null {
  const raw = safeGet(KEY_ULTIMA);
  if (!raw) return null;
  try { const p = JSON.parse(raw) as { id?: string; nombre?: string }; if (p.id) return { id: p.id, nombre: p.nombre ?? '' }; } catch { /* */ }
  return null;
}
export function guardarUltimaLista(id: string, nombre: string): void { safeSet(KEY_ULTIMA, JSON.stringify({ id, nombre })); }
/** Al entrar con una cuenta (D23) la identidad cambia: el recuerdo era de la anterior y no puede pintar primero. */
export function olvidarUltimaLista(): void { safeDel(KEY_ULTIMA); }
