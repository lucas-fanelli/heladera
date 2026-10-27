/**
 * Súper: dónde se compra cada cosa (D13–D18 en decisiones.md). Todo puro.
 *
 * Reglas que viven acá:
 *  - Un ítem tiene A LO SUMO UN súper. Sin súper = "en cualquiera": es el estado por defecto y de primera clase,
 *    no un dato incompleto, así que va PRIMERO y sin título (es "la lista", no una sección de descartes).
 *  - Un ítem que apunta a un súper que ya no está cuenta como sin súper: la vista nunca depende de datos colgados.
 *  - Se agrupa SOLO si queda más de un grupo: si todo lo que falta es del mismo lado, un título no informa nada.
 *  - Buscar por nombre de súper esconde lo que es de OTRO súper, nunca lo "en cualquiera" (al principio casi todo
 *    está sin etiquetar; esconderlo dejaría a alguien parado en el pasillo viendo 2 ítems de 14).
 */
import type { Item, Mercado } from '@/db/types';
import { coincide } from './coincide';
import { normalizar } from './normalizar';

/**
 * Nombres que se ofrecen la primera vez que alguien abre el selector, para no arrancar con el campo en blanco.
 * NO se crean solos: sin súper creados la lista se ve exactamente como antes (D14).
 */
export const SUGERENCIAS_MERCADOS: string[] = ['Mercadona', 'Lidl', 'Carrefour', 'Dia', 'Aldi'];

/** Mínimo de letras para que la búsqueda mire los nombres de súper: con 1 o 2 ("l") matchearía cualquier cosa. */
export const MIN_CONSULTA_MERCADO = 3;

/** Orden canónico: el que los fueron creando; sin fecha (escritura pendiente) al final; desempate por nombre e id. */
export function ordenarMercados(mercados: Mercado[]): Mercado[] {
  return [...mercados].sort((a, b) => {
    if (a.creadoEn !== b.creadoEn) {
      if (a.creadoEn === null) return 1;
      if (b.creadoEn === null) return -1;
      return a.creadoEn - b.creadoEn;
    }
    return a.nombre.localeCompare(b.nombre, 'es') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

/** El id de súper de un ítem, ya validado contra los que existen (null si no tiene o si apunta a uno que se fue). */
export function mercadoIdDe(item: Pick<Item, 'mercado'>, mercados: Mercado[]): string | null {
  const id = item.mercado ?? null;
  if (id === null) return null;
  return mercados.some(m => m.id === id) ? id : null;
}

/** El súper de un ítem (el objeto), o null. */
export function mercadoDe(item: Pick<Item, 'mercado'>, mercados: Mercado[]): Mercado | null {
  const id = mercadoIdDe(item, mercados);
  return id === null ? null : mercados.find(m => m.id === id) ?? null;
}

/** El súper que se llama así (comparando sin tildes ni mayúsculas), para no crear "Chino" dos veces. */
export function mercadoLlamado(nombre: string, mercados: Mercado[]): Mercado | undefined {
  const n = normalizar(nombre);
  if (!n) return undefined;
  return mercados.find(m => normalizar(m.nombre) === n);
}

/** Súper cuyo nombre coincide con la consulta del buscador (mismo criterio tolerante que los ítems). */
export function buscarMercados(consulta: string, mercados: Mercado[]): Mercado[] {
  if (normalizar(consulta).length < MIN_CONSULTA_MERCADO) return [];
  return ordenarMercados(mercados).filter(m => coincide(consulta, normalizar(m.nombre)));
}

/** Un grupo de la lista: el súper (null = "en cualquiera") y lo que va abajo. */
export interface Seccion<T> {
  /** null = los que no tienen súper */
  mercado: Mercado | null;
  /** key estable para el encabezado (Motion necesita que no cambie cuando el grupo se mueve) */
  key: string;
  filas: T[];
}

export const KEY_SIN_MERCADO = 'sin-mercado';

/**
 * Reparte las filas en secciones, en el orden en que se pintan. Genérico a propósito: el dominio no sabe de la
 * fila de la UI, solo de cómo sacarle el súper.
 *  - sin `primero`: primero los sin súper, después los súper en su orden canónico;
 *  - con `primero` (el súper que se está buscando): ese va arriba de todo y el resto sigue igual.
 * Las secciones vacías no aparecen.
 */
export function agruparPorMercado<T>(
  filas: T[],
  mercadoDeFila: (f: T) => string | null | undefined,
  mercados: Mercado[],
  primero?: string | null,
): Array<Seccion<T>> {
  const existentes = new Set(mercados.map(m => m.id));
  const porId = new Map<string | null, T[]>();
  for (const f of filas) {
    const bruto = mercadoDeFila(f) ?? null;
    const id = bruto !== null && existentes.has(bruto) ? bruto : null;
    const g = porId.get(id);
    if (g) g.push(f); else porId.set(id, [f]);
  }
  const orden: Array<string | null> = [null, ...ordenarMercados(mercados).map(m => m.id)];
  if (primero != null && existentes.has(primero)) {
    orden.splice(orden.indexOf(primero), 1);
    orden.unshift(primero);
  }
  const out: Array<Seccion<T>> = [];
  for (const id of orden) {
    const g = porId.get(id);
    if (!g || g.length === 0) continue;
    out.push({ mercado: id === null ? null : mercados.find(m => m.id === id) ?? null, key: id ?? KEY_SIN_MERCADO, filas: g });
  }
  return out;
}

/** ¿Hay que pintar los títulos? Solo si quedó más de un grupo. */
export function hayQueAgrupar<T>(secciones: Array<Seccion<T>>): boolean {
  return secciones.length > 1;
}
