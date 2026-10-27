/**
 * Tokens de MOTION (Motion for React). Deben coincidir con las duraciones CSS de tokens.css.
 * `MOTION_SCALE` (window.__MOTION_SCALE__ o VITE_MOTION_SCALE): 1 en prod, 0 en tests/E2E → todo instantáneo.
 * Reduced motion NO usa esta escala: lo maneja <MotionConfig reducedMotion="user"> (apaga transform/layout,
 * conserva opacity y color).
 */
import type { Transition } from 'motion/react';

declare global {
  interface Window { __MOTION_SCALE__?: number }
}

/**
 * Escala pedida por la URL (`?motion=0.6`): para probar en el teléfono cuánto más rápidas se sienten bien las
 * animaciones, sin recompilar. 1 = como están, 0.6 = 40% más cortas, 0 = instantáneas. Fuera del rango se ignora.
 */
export function escalaDeLaUrl(busqueda = typeof location === 'undefined' ? '' : location.search): number | null {
  const v = new URLSearchParams(busqueda).get('motion');
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 3 ? n : null;
}

function scale(): number {
  const w = typeof window !== 'undefined' ? window.__MOTION_SCALE__ : undefined;
  if (typeof w === 'number') return w;
  const env = typeof import.meta !== 'undefined' ? (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_MOTION_SCALE : undefined;
  if (env !== undefined && env !== '') return Number(env);
  return 1;
}
const k = () => scale();

/**
 * Springs (formato visualDuration/bounce).
 *
 * Los tiempos bajaron un 25% (D21) después de medir en el teléfono del dueño: el medidor `?fps` mostró frames
 * clavados en 11,1 ms (90 Hz, sin perder ni uno), así que lo que se sentía "trabado" no era fluidez sino duración —
 * en un teléfono donde el resto del sistema responde al instante, 300 ms se leen como pesadez. Se probó con
 * `?motion` sobre la app real hasta encontrar el punto (0,75) y de ahí salieron estos números.
 */
export const spring = {
  /** press, casilla, chips, contador */
  get snappy(): Transition { return { type: 'spring', visualDuration: 0.17 * k(), bounce: 0 }; },
  /** todo reacomodo de filas (layout): filtrado, tildar/destildar, undo, remoto */
  get move(): Transition { return { type: 'spring', visualDuration: 0.23 * k(), bounce: 0.10 }; },
  /** la fila protagonista viaja apenas más lento que el coro */
  get settle(): Transition { return { type: 'spring', visualDuration: 0.27 * k(), bounce: 0.05 }; },
  /** sheets y toast */
  get sheet(): Transition { return { type: 'spring', visualDuration: 0.26 * k(), bounce: 0.04 }; },
};

/** Duraciones (segundos) para tweens. Mismo recorte del 25% que los springs (D21). */
export const dur = {
  get instant() { return 0.06 * k(); },
  get fast() { return 0.11 * k(); },
  get base() { return 0.17 * k(); },
  get slow() { return 0.24 * k(); },
  get linger() { return 0.60 * k(); },
  /** el colchón se achica y la lista baja a ocupar el hueco (después de que las filas terminaron de salir) */
  get settle() { return 0.34 * k(); },
};

export const ease = {
  out: [0.2, 0, 0, 1] as const,
  in: [0.4, 0, 1, 1] as const,
  std: [0.4, 0, 0.2, 1] as const,
  linear: 'linear' as const,
};

type Bezier = readonly [number, number, number, number];
/** Progreso (0..1) de una cubic-bezier CSS en el tiempo t (0..1): la misma curva que usa Motion para los tweens. */
export function progresoBezier([x1, y1, x2, y2]: Bezier, t: number): number {
  const bx = (u: number) => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
  const by = (u: number) => 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u ** 2 * y2 + u ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (bx(mid) < t) lo = mid; else hi = mid; }
  return by((lo + hi) / 2);
}
/** Tiempo (0..1) en que la curva alcanza cierto progreso (bisección; sirve para curvas que terminan creciendo). */
export function tiempoParaProgreso(curva: Bezier, progreso: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (progresoBezier(curva, mid) < progreso) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Distancias (px) y escalas. */
export const dist = { enter: 8, exit: -6, roll: 6, toastEnter: 16, toastExit: 8 };
export const scl = { press: 0.96, chip: 0.95, row: 0.98, exit: 0.98 };
export const opacity = { dim: 0.55, hold: 0.85, strike: 0.6, hueco: 0.35 };

/** Transición estándar de una fila de la lista. */
export function rowTransition(protagonista = false): Transition {
  return {
    layout: protagonista ? spring.settle : spring.move,
    opacity: { duration: dur.fast },
    scale: { duration: dur.fast },
    y: { duration: dur.fast, ease: ease.out },
  };
}

/** Stagger cortísimo para vaciar (15 ms/fila, tope 10 filas). */
export function staggerExit(i: number): number { return Math.min(i, 10) * 0.011 * k(); }

/**
 * Vuelo al/desde el "bolsillo" (el rótulo "Comprados (N)" de la barra de abajo).
 * Al tildar con Comprados cerrado, la fila se despega y es succionada hasta el centro del rótulo; al abrir,
 * las filas salen de ahí y se acomodan en la lista. Solo transform + opacity (compositor); con reduced motion
 * no hay vuelo (queda el fundido).
 */
export const vuelo = {
  /** duración del vuelo de ida (la vuelta usa spring.settle) */
  get dur() { return 0.27 * k(); },
  /** anticipación (retrocede un toque al despegarse) y aceleración hasta el final: succión.
   *  Camino recorrido: 19 % a la mitad del tiempo, 48 % al 70 %, 66 % al 80 %, 83 % al 90 % — el último cuarto del camino
   *  dura ~3 frames: se la ve llegar, no desaparece en el aire */
  ease: [0.5, -0.06, 0.6, 0.35] as const,
  /** tamaño con el que entra al bolsillo / sale de él */
  escala: 0.2,
  /** la fila se ve entera hasta este punto del CAMINO (no del tiempo: la curva es muy asimétrica); se desvanece recién
   *  en el tramo final, ya metiéndose debajo de la barra (que la tapa): sin fundido en el aire ni "pop" al desmontarse */
  desvanecerDesdeCamino: 0.75,
  /** el mismo punto, como fracción del tiempo del vuelo (resuelto con la propia curva) */
  get desvanecerDesde(): number { return tiempoParaProgreso(vuelo.ease, vuelo.desvanecerDesdeCamino); },
  /** el rótulo "atrapa" la fila: bump al llegar */
  atrapar: 1.06,
  /** stagger para abrir/cerrar el bolsillo (25 ms/fila, tope 10): sin cruces (la más lejana sale primero, la más cercana entra primero) */
  stagger(i: number): number { return Math.min(i, 10) * 0.019 * k(); },
};

/** Delay del "protagonista" al agregar: llega apenas después del coro. */
export const ENTER_DELAY = () => 0.06 * k();
/** El contador confirma, no anticipa: rueda +60 ms después del movimiento que lo causó. */
export const COUNTER_DELAY = () => 0.06 * k();
