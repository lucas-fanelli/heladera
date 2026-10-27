/**
 * El "colchón": cuando filas se van de la lista, la <ul> pierde su alto en el mismo instante (popLayout las saca del
 * flujo) y, si el usuario está al fondo, el navegador recorta el scroll de golpe: el contenido salta y la salida ni se
 * ve. Un div al final de la lista sostiene ese alto mientras las filas salen y después se achica despacio: primero la
 * animación, después la lista baja a ocupar el hueco. Estas funciones son las reglas puras; la Lista mide y anima.
 */

/** Alto (px) que suman las filas que estaban en el render anterior y ya no están, medidas en el DOM previo (todavía en flujo). */
export function alturaQueSeVa(idsAntes: readonly string[], idsAhora: ReadonlySet<string>, medir: (id: string) => number): number {
  let alto = 0;
  for (const id of idsAntes) if (!idsAhora.has(id)) alto += medir(id);
  return alto;
}

/** ¿Aparece alguna fila que no estaba? (entonces el hueco se llena solo: el colchón se suelta) */
export function hayEntradas(idsAntes: ReadonlySet<string>, idsAhora: readonly string[]): boolean {
  return idsAhora.some(id => !idsAntes.has(id));
}
