/* Fábricas para tests: ítems, miembros y sugerencias con defaults razonables. */
import type { Item, Mercado, Miembro, Sugerencia, Vista } from '@/db/types';
import { normalizar } from '@/domain/normalizar';

let seq = 0;

export function item(texto: string, extra: Partial<Item> = {}): Item {
  seq += 1;
  const id = extra.id ?? `it-${String(seq).padStart(3, '0')}`;
  return {
    id, texto, textoNorm: normalizar(texto), estado: 'pendiente',
    agregadoEn: 1_000 + seq, agregadoPor: 'm-1', agregadoPorNombre: 'Uno',
    compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null, actualizadoEn: 1_000 + seq, pendiente: false,
    ...extra,
  };
}

export function comprado(texto: string, extra: Partial<Item> = {}): Item {
  return item(texto, { estado: 'comprado', compradoEn: 5_000, compradoPor: 'm-1', compradoPorNombre: 'Uno', ...extra });
}

export function miembro(id: string, nombre: string, color: Miembro['color'] = 'p1'): Miembro {
  return { id, nombre, color, creadoEn: 1 };
}

export function sugerencia(texto: string, veces = 0, ultimaVez: number | null = null): Sugerencia {
  return { texto, textoNorm: normalizar(texto), veces, ultimaVez };
}

export function mercado(id: string, nombre: string, creadoEn: number | null = 1): Mercado {
  return { id, nombre, creadoEn };
}

export function vista(extra: Partial<Vista> = {}): Vista {
  return {
    lista: { id: 'l1', nombre: 'Casa', creadaEn: 1 }, existe: true, items: [], miembros: [], mercados: [], sugerencias: [],
    fromCache: false, hasPendingWrites: false, online: true, ultimaSync: 1,
    ...extra,
  };
}

/** Deja pasar microtareas (suscripciones del Db falso, promesas). */
export const tick = () => new Promise<void>(r => setTimeout(r, 0));
export const microtick = () => Promise.resolve();
