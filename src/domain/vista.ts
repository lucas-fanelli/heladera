/**
 * Derivación de la vista: orden, filtro, contador, estado de conexión, acción del botón.
 * Todo puro: entra la `Vista` (o partes) y sale lo que la UI pinta. Sin fechas del sistema adentro:
 * `ahora` se inyecta cuando hace falta.
 */
import type { Item, Mercado, Miembro, Vista, Yo } from '@/db/types';
import { coincide } from './coincide';
import { buscarMercados, mercadoIdDe } from './mercados';
import { mismoItem, normalizar } from './normalizar';

/** Pendientes por agregadoEn asc (lo nuevo abajo); null (escritura pendiente) al final; desempate por id. */
export function ordenarPendientes(items: Item[]): Item[] {
  return items.filter(i => i.estado === 'pendiente').sort((a, b) => cmpAsc(a.agregadoEn, b.agregadoEn) || cmpStr(a.id, b.id));
}
/** Comprados por compradoEn desc (lo último tildado arriba); null (recién tildado) PRIMERO. */
export function ordenarComprados(items: Item[]): Item[] {
  return items.filter(i => i.estado === 'comprado').sort((a, b) => cmpDescNullFirst(a.compradoEn, b.compradoEn) || cmpStr(a.id, b.id));
}
function cmpAsc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
function cmpDescNullFirst(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return b - a;
}
function cmpStr(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

export interface Filtrado {
  consulta: string;
  activo: boolean;
  pendientes: Item[];         // pendientes que coinciden (o todos, si no hay filtro), ya ordenados
  comprados: Item[];          // comprados que coinciden (o todos), ordenados
  ocultos: number;            // pendientes que no coinciden
  coincidencias: number;      // pendientes que coinciden (para "· N coinciden")
  mercados: Mercado[];        // súper cuyo nombre coincide con lo escrito (D17); vacío casi siempre
}

/**
 * Aplica el filtro del input sobre la vista. Con consulta vacía devuelve todo.
 *
 * Si lo escrito coincide con el nombre de un súper (D17), el filtro deja de ser solo por texto: pasan también los
 * ítems de ese súper y los que no tienen ninguno ("en cualquiera" se compra en todos lados). Lo que queda afuera es
 * lo que es de OTRO súper, que es justo lo que uno no quiere ver parado en el pasillo.
 */
export function filtrar(items: Item[], consulta: string, mercados: Mercado[] = []): Filtrado {
  const activo = normalizar(consulta) !== '';
  const pend = ordenarPendientes(items);
  const comp = ordenarComprados(items);
  if (!activo) return { consulta, activo, pendientes: pend, comprados: comp, ocultos: 0, coincidencias: pend.length, mercados: [] };
  const ms = buscarMercados(consulta, mercados);
  const ids = new Set(ms.map(m => m.id));
  const pasa = (i: Item): boolean =>
    coincide(consulta, i.textoNorm) || (ids.size > 0 && (() => { const id = mercadoIdDe(i, mercados); return id === null || ids.has(id); })());
  const p = pend.filter(pasa);
  const c = comp.filter(pasa);
  return { consulta, activo, pendientes: p, comprados: c, ocultos: pend.length - p.length, coincidencias: p.length, mercados: ms };
}

export type Accion =
  | { tipo: 'nada' }                                  // input vacío
  | { tipo: 'agregar'; texto: string }                // no hay coincidencia exacta → Enter agrega
  | { tipo: 'yaEsta'; item: Item }                    // coincide exacto con un pendiente → no agrega, resalta
  | { tipo: 'volver'; item: Item };                   // coincide exacto con un comprado → lo devuelve a pendientes

/** Qué va a pasar al apretar Enter / el botón, con el texto actual del input. */
export function accionPara(consulta: string, items: Item[]): Accion {
  const texto = consulta.trim();
  if (normalizar(texto) === '') return { tipo: 'nada' };
  const pend = items.find(i => i.estado === 'pendiente' && mismoItem(i.texto, texto));
  if (pend) return { tipo: 'yaEsta', item: pend };
  const comp = items.find(i => i.estado === 'comprado' && mismoItem(i.texto, texto));
  if (comp) return { tipo: 'volver', item: comp };
  return { tipo: 'agregar', texto };
}

export type EstadoConexion = 'live' | 'offline' | 'sync';
/**
 * Tabla de verdad de la pastilla:
 *  online=false                          → offline (cualquier resto)
 *  online, fromCache=false, sin pendientes → live
 *  online, hay pendientes                → sync
 *  online, fromCache=true                → sync (hay señal pero todavía no llegó el servidor)
 */
export function estadoConexion(v: Pick<Vista, 'fromCache' | 'hasPendingWrites' | 'online'>): EstadoConexion {
  if (!v.online) return 'offline';
  if (v.hasPendingWrites) return 'sync';
  if (v.fromCache) return 'sync';
  return 'live';
}

export type EstadoVacio = 'ninguno' | 'primeraVez' | 'todoComprado' | 'sinSenalSinCache' | 'filtro' | 'noExiste' | 'sinAcceso';
/**
 * Qué estado vacío mostrar (si alguno). `cargado` = ya llegó el primer snapshot (evita el flash de "primera vez").
 *
 * "Sin señal ni caché" se lee del propio snapshot, no de la conectividad: `lista === null` con `fromCache` quiere
 * decir que la copia local no tiene el doc de la lista y el servidor todavía no habló (ni `online` ni `ultimaSync`
 * sirven: `navigator.onLine` puede decir true sin conectividad real, y `ultimaSync` vive solo en memoria, así que
 * reabrir sin señal una lista vacía ya cacheada los engañaba). "Primera vez" solo cuando la lista está y no tiene nada.
 */
export function estadoVacio(v: Vista, filtrado: Filtrado, cargado: boolean, sinPermiso = false): EstadoVacio {
  // "Sin permiso" va primero y no depende de `cargado`: si las reglas rechazan, el primer snapshot no llega nunca,
  // así que esperar a que cargue sería quedarse mudo para siempre (D22).
  if (sinPermiso) return 'sinAcceso';
  if (!cargado) return 'ninguno';
  if (!v.existe) return 'noExiste';
  const pend = v.items.filter(i => i.estado === 'pendiente').length;
  const comp = v.items.filter(i => i.estado === 'comprado').length;
  // sin el doc de la lista y sin ítems no hay nada que mostrar ni filtrar: si es la caché, es "sin señal ni caché";
  // si ya habló el servidor por los ítems pero todavía no por la lista, es un instante en el que mejor no decir nada
  if (v.lista === null && pend === 0 && comp === 0) return v.fromCache ? 'sinSenalSinCache' : 'ninguno';
  if (filtrado.activo) return filtrado.pendientes.length === 0 && filtrado.comprados.length === 0 ? 'filtro' : 'ninguno';
  if (pend === 0 && comp === 0) return 'primeraVez';
  if (pend === 0) return 'todoComprado';
  return 'ninguno';
}

/**
 * Quién tocó el ítem por última vez y cuándo (D19): es lo que muestra la fila. Cualquier mutación (tildar, destildar,
 * editar, mover de súper) deja su firma en `actualizadoPor`; si el ítem es anterior a D19 y no la trae, se cae a quien
 * lo compró (si está comprado) o a quien lo anotó, que es lo que se mostraba antes.
 */
export function ultimaMano(item: Item): { por: string | null; nombre: string | null; en: number | null } {
  if (item.actualizadoPor != null && item.actualizadoPor !== '') {
    return { por: item.actualizadoPor, nombre: item.actualizadoPorNombre ?? null, en: item.actualizadoEn };
  }
  if (item.estado === 'comprado' && item.compradoPor) {
    return { por: item.compradoPor, nombre: item.compradoPorNombre, en: item.compradoEn };
  }
  return { por: item.agregadoPor, nombre: item.agregadoPorNombre, en: item.agregadoEn };
}

/** Cuántos ítems tienen escrituras locales sin confirmar. */
export function pendientesDeSync(items: Item[]): number { return items.filter(i => i.pendiente).length; }

/** Nombre a mostrar para un memberId: "Vos" si soy yo; el nombre actual del miembro; o el denormalizado; o "alguien". */
export function nombreDe(memberId: string | null, nombreDenormalizado: string | null, miembros: Miembro[], yo: Yo, textos: { vos: string; alguien: string }): string {
  if (memberId && yo.memberId && memberId === yo.memberId) return textos.vos;
  const m = memberId ? miembros.find(x => x.id === memberId) : undefined;
  if (m) return m.nombre;
  if (nombreDenormalizado && nombreDenormalizado.trim() !== '') return nombreDenormalizado;
  return textos.alguien;
}

/** Inicial para el avatar (primera letra alfanumérica en mayúscula; "?" si no hay nombre). */
export function inicial(nombre: string | null | undefined): string {
  if (!nombre) return '?';
  const m = nombre.trim().match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : '?';
}
