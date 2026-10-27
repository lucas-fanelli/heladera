/**
 * Geometría del vuelo al bolsillo: cuánto hay que trasladar una fila para que su centro caiga sobre el centro
 * del destino (el rótulo "Comprados (N)"). Se mide en el momento del vuelo, en coordenadas de viewport (así el scroll
 * y el teclado no importan). El ORIGEN se mide por su caja de layout (offset*), no por la caja visual: si la fila ya
 * tiene un transform (está entrando desde el bolsillo, se acomoda por layout, o trae el y: 8 de la entrada), el
 * traslado x/y que le pedimos a Motion es relativo a su caja de layout, no a donde se la ve. Puro y testeable.
 */

/** Lo que necesitamos de un DOMRect. */
export interface Caja { left: number; top: number; width: number; height: number }

/** Traslación (px) de centro a centro. */
export function deltaHacia(desde: Caja, hasta: Caja): { x: number; y: number } {
  return {
    x: (hasta.left + hasta.width / 2) - (desde.left + desde.width / 2),
    y: (hasta.top + hasta.height / 2) - (desde.top + desde.height / 2),
  };
}

/** Caja de layout de un elemento (sin sus transforms), en coordenadas de viewport. */
export function cajaDeLayout(el: Element): Caja {
  const h = el as HTMLElement;
  const padre = h.offsetParent as HTMLElement | null;
  if (typeof h.offsetLeft !== 'number' || !padre) return el.getBoundingClientRect();   // sin offsetParent (fixed, oculto, SVG): la visual
  const r = padre.getBoundingClientRect();
  return { left: r.left + padre.clientLeft + h.offsetLeft, top: r.top + padre.clientTop + h.offsetTop, width: h.offsetWidth, height: h.offsetHeight };
}

/** Delta entre dos elementos del DOM; null si falta alguno o si el destino no está en pantalla (sin tamaño). */
export function vueloEntre(origen: Element | null | undefined, destino: Element | null | undefined): { x: number; y: number } | null {
  if (!origen || !destino) return null;
  const b = destino.getBoundingClientRect();
  if (b.width === 0 && b.height === 0) return null;   // el destino todavía no se pintó (o ya no está)
  return deltaHacia(cajaDeLayout(origen), b);
}
