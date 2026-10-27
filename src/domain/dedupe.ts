/**
 * Deduplicación determinista (§5 del diseño): si dos personas anotaron lo mismo sin verse, quedan dos ítems
 * con el mismo texto canónico. Cualquier cliente que lo note conserva el más antiguo (agregadoEn asc,
 * desempate por id) y marca el resto como borrado. Solo se consideran ítems CONFIRMADOS por el servidor
 * (`pendiente === false`) y con timestamp final: así todos los clientes toman la misma decisión.
 */
import type { Item } from '@/db/types';
import { canonico } from './normalizar';

export interface Duplicado {
  ganador: Item;
  perdedor: Item;
  /**
   * Súper que el ganador tiene que adoptar: el perdedor estaba ubicado y el ganador no (D13). Se juntan igual —
   * el súper es una propiedad del producto, no dos compras distintas—, pero el dato no se tira.
   */
  heredaMercado: string | null;
}

export function duplicadosParaBorrar(items: Item[]): Duplicado[] {
  const grupos = new Map<string, Item[]>();
  for (const it of items) {
    if (it.estado === 'borrado' || it.pendiente || it.agregadoEn === null) continue;
    const k = canonico(it.texto);
    if (!k) continue;
    const g = grupos.get(k);
    if (g) g.push(it); else grupos.set(k, [it]);
  }
  const out: Duplicado[] = [];
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (a.agregadoEn! - b.agregadoEn!) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const ganador = g[0]!;
    for (const perdedor of g.slice(1)) {
      const heredaMercado = (ganador.mercado ?? null) === null ? perdedor.mercado ?? null : null;
      out.push({ ganador, perdedor, heredaMercado });
    }
  }
  return out;
}
