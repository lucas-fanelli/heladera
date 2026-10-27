/**
 * "Lo de siempre" y autocompletado, a partir del historial de la lista.
 */
import type { Item, Sugerencia } from '@/db/types';
import { coincide } from './coincide';
import { canonico, normalizar } from './normalizar';

/** Semilla de productos comunes (Argentina) para que el autocompletar no arranque vacío. veces = 0. */
export const SEMILLA_SUGERENCIAS: string[] = [
  'Leche', 'Yerba', 'Pan', 'Huevos', 'Manteca', 'Queso cremoso', 'Jamón', 'Yogur', 'Dulce de leche', 'Azúcar',
  'Café', 'Té', 'Galletitas', 'Fideos', 'Arroz', 'Aceite', 'Sal', 'Harina', 'Tomates', 'Cebolla',
  'Papas', 'Zanahoria', 'Lechuga', 'Bananas', 'Manzanas', 'Limones', 'Pollo', 'Carne picada', 'Milanesas', 'Salchichas',
  'Gaseosa', 'Agua', 'Cerveza', 'Vino', 'Papel higiénico', 'Papel de cocina', 'Detergente', 'Lavandina', 'Jabón', 'Shampoo',
];

/** Sugerencias ordenadas por veces desc, ultimaVez desc, texto asc; sin las que ya están pendientes. */
export function loDeSiempre(sugerencias: Sugerencia[], items: Item[], n: number): Sugerencia[] {
  const enLista = new Set(items.filter(i => i.estado === 'pendiente').map(i => canonico(i.texto)));
  return [...sugerencias]
    .filter(s => !enLista.has(canonico(s.texto)))
    .sort((a, b) => (b.veces - a.veces) || cmpDescNull(a.ultimaVez, b.ultimaVez) || a.texto.localeCompare(b.texto, 'es'))
    .slice(0, n);
}

/** Autocompletado: exige ≥ 2 letras; coincide por prefijo de palabra; excluye lo que ya está pendiente. */
export function autocompletar(consulta: string, sugerencias: Sugerencia[], items: Item[], n: number): Sugerencia[] {
  if (normalizar(consulta).length < 2) return [];
  return loDeSiempre(sugerencias, items, Number.POSITIVE_INFINITY)
    .filter(s => coincide(consulta, s.textoNorm))
    .slice(0, n);
}

/** Registra un uso de un texto en el mapa de sugerencias (para el Db falso y para derivar en cliente). */
export function registrarUso(sugerencias: Sugerencia[], texto: string, ahora: number): Sugerencia[] {
  const norm = normalizar(texto);
  if (!norm) return sugerencias;
  const idx = sugerencias.findIndex(s => s.textoNorm === norm);
  if (idx >= 0) {
    const s = sugerencias[idx]!;
    const next = [...sugerencias];
    next[idx] = { ...s, texto: texto.trim(), veces: s.veces + 1, ultimaVez: ahora };
    return next;
  }
  return [...sugerencias, { texto: texto.trim(), textoNorm: norm, veces: 1, ultimaVez: ahora }];
}

/** Dónde se compra este producto según lo aprendido (D15). null = nadie lo ubicó nunca. */
export function mercadoAprendido(sugerencias: Sugerencia[], texto: string): string | null {
  const norm = normalizar(texto);
  if (!norm) return null;
  return sugerencias.find(s => s.textoNorm === norm)?.mercado ?? null;
}

/**
 * Aprende (o desaprende, con `null`) dónde se compra un producto: la próxima vez que alguien lo anote, nace ubicado.
 * Si el producto nunca se usó, deja la entrada con `veces: 0` (no cuenta como uso: solo guarda el dónde).
 */
export function aprenderMercado(sugerencias: Sugerencia[], texto: string, mercado: string | null): Sugerencia[] {
  const norm = normalizar(texto);
  if (!norm) return sugerencias;
  const idx = sugerencias.findIndex(s => s.textoNorm === norm);
  if (idx >= 0) {
    const next = [...sugerencias];
    next[idx] = { ...sugerencias[idx]!, mercado };
    return next;
  }
  return [...sugerencias, { texto: texto.trim(), textoNorm: norm, veces: 0, ultimaVez: null, mercado }];
}

function cmpDescNull(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}
