/**
 * El "bolsillo": los comprados que NO se ven (Comprados cerrado, sin filtro) viven detrás del rótulo
 * "Comprados (N)". Estas reglas deciden, sin tocar el DOM, cuándo una fila vuela hacia él o sale de él.
 *  - Sale al bolsillo: una fila que se va de la lista y cuyo ítem quedó comprado y oculto (tildar con Comprados
 *    cerrado cuando termina la espera; cerrar Comprados; que otro lo compre desde su teléfono).
 *  - Sale del bolsillo: una fila que aparece y cuyo ítem estaba comprado y oculto en el render anterior
 *    (abrir Comprados; destildar/deshacer desde otro teléfono).
 *  - Con filtro (ahora o recién apagado) no hay vuelos: escribir tiene que sentirse liviano y "Ya lo compraron"
 *    es una vista, no un movimiento. Borrar y vaciar tampoco vuelan (eso es basura, no bolsillo).
 */

/** Ids de los comprados que no se muestran (el contenido del bolsillo en este render). */
export function idsEnBolsillo(comprados: ReadonlyArray<{ item: { id: string } }>, mostrarComprados: boolean): Set<string> {
  if (mostrarComprados) return new Set();
  return new Set(comprados.map(f => f.item.id));
}

/** Hay vuelos solo cuando el filtro no está activo ni lo estaba en el render anterior (y sin reduced motion). */
export function hayVuelos(filtroActivo: boolean, filtroPrevio: boolean, reducido = false): boolean {
  return !filtroActivo && !filtroPrevio && !reducido;
}

/**
 * Cuántas filas están volando al rótulo en este render: las que se veían como pendientes en el render anterior y ahora
 * están en el bolsillo (comprado y oculto). Deshacer, restaurar o un snapshot que trae un comprado nuevo NO cuentan:
 * nada voló. Con más de CAP filas en pantalla tampoco (la salida es solo con opacity).
 */
export function aterrizajes(
  pendientesPrevios: ReadonlySet<string>,
  bolsillo: ReadonlySet<string>,
  vuelos: boolean,
  filasEnPantalla: number,
  cap: number,
): number {
  if (!vuelos || filasEnPantalla > cap) return 0;
  let n = 0;
  for (const id of bolsillo) if (pendientesPrevios.has(id)) n++;
  return n;
}

/** Cómo sale una fila: al bolsillo, con el stagger de vaciar, o normal (fundido). */
export function modoSalida(
  itemId: string,
  custom: { motivo: 'normal' | 'vaciar'; enBolsillo: (id: string) => boolean } | undefined,
  reducido: boolean,
): 'bolsillo' | 'vaciar' | 'normal' {
  if (!custom) return 'normal';
  if (!reducido && custom.enBolsillo(itemId)) return 'bolsillo';
  return custom.motivo;
}
