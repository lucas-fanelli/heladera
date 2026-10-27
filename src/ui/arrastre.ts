/**
 * Piezas puras del arrastre de una fila entre secciones (D18). Sin React ni DOM propio: reciben lo que necesitan.
 *
 * Por qué el auto-scroll y no "un dedo arrastra y el otro scrollea" (que es lo que hace iOS): el navegador decide si
 * un dedo va a scrollear en el instante en que toca la pantalla, mirando el `touch-action` de lo que hay debajo.
 * El arrastre se activa medio segundo después, cuando esa decisión ya está tomada, y cancelarla a mitad de camino
 * (preventDefault en touchmove) cancela el gesto ENTERO, segundo dedo incluido. Lo que sí podemos: como la pulsación
 * larga exige quedarse quieto, cuando se activa el navegador todavía no empezó a scrollear, así que ahí sí se puede
 * bloquear el scroll y movernos nosotros. De ahí el auto-scroll en los bordes, que además se usa con una sola mano.
 */

import { KEY_SIN_MERCADO } from '@/domain/mercados';

/** Zona sensible en cada borde y velocidad máxima (px por frame). */
export const AUTOSCROLL = { zona: 72, velocidadMax: 16 } as const;

/**
 * Cuánto scrollear (px por frame) según qué tan adentro de la zona del borde está el dedo.
 * Negativo = hacia arriba, positivo = hacia abajo, 0 = quieto. Crece parejo desde el borde de la zona.
 */
export function velocidadAutoScroll(
  y: number,
  caja: { top: number; bottom: number },
  zona: number = AUTOSCROLL.zona,
  max: number = AUTOSCROLL.velocidadMax,
): number {
  if (caja.bottom - caja.top <= zona * 2) return 0;      // contenedor muy chico: las dos zonas se pisarían
  const arriba = y - caja.top;
  if (arriba < zona) return -Math.round(max * (1 - Math.max(arriba, 0) / zona));
  const abajo = caja.bottom - y;
  if (abajo < zona) return Math.round(max * (1 - Math.max(abajo, 0) / zona));
  return 0;
}

/**
 * El globito que sigue al dedo: cuánto se despega (px) y cuánto espacio necesita para entrar arriba.
 * El dedo tapa un círculo de ~44 px (el target mínimo), así que apoyarlo justo encima no alcanza: se ve la mitad.
 */
export const GLOBITO = { elevacion: 56, alto: 44 } as const;

/**
 * De qué lado del dedo va el globito. Arriba salvo que no entre — que es justo lo que pasa arrastrando contra el
 * borde de arriba para auto-scrollear, donde quedaría fuera de la pantalla.
 */
export function ladoDelGlobito(y: number, elevacion: number = GLOBITO.elevacion, alto: number = GLOBITO.alto): 'arriba' | 'abajo' {
  return y >= elevacion + alto ? 'arriba' : 'abajo';
}

/** Valor de `data-seccion` para el grupo sin súper: el mismo que usa la Lista como key (una sola fuente). */
export const SECCION_SIN_MERCADO = KEY_SIN_MERCADO;

/**
 * Qué sección hay bajo un punto de la pantalla: el id del súper, `null` si es la de "en cualquiera",
 * o `undefined` si ahí no hay lista (soltar afuera no hace nada).
 * `enPunto` se inyecta (document.elementFromPoint en el navegador) para poder probarlo sin layout real.
 */
export function seccionEnPunto(x: number, y: number, enPunto: (x: number, y: number) => Element | null): string | null | undefined {
  const el = enPunto(x, y);
  const cont = el?.closest?.('[data-seccion]');
  if (!cont) return undefined;
  const v = cont.getAttribute('data-seccion');
  if (v === null || v === '' || v === SECCION_SIN_MERCADO) return null;
  return v;
}

/** ¿Soltar acá cambia algo? (undefined = afuera de la lista; igual que el actual = no se toca el Db) */
export function hayQueMover(destino: string | null | undefined, actual: string | null | undefined): destino is string | null {
  if (destino === undefined) return false;
  return destino !== (actual ?? null);
}
