/**
 * Tiempos de DOMINIO (comportamiento, no animación). Inyectables para tests:
 *  - `TIMING_SCALE` (window.__TIMING_SCALE__ o VITE_TIMING_SCALE) multiplica todo (0 en tests → instantáneo).
 *  - En tests de componentes se pueden sobreescribir con `setTiming({...})`.
 * Los tiempos de motion viven aparte, en src/motion/tokens.ts.
 */
export interface Timing {
  /** tachada visible antes de bajar a Comprados */
  HOLD_MS: number;
  /** destachada visible antes de subir a Pendientes */
  UNHOLD_MS: number;
  /** ventana de Deshacer del toast */
  TOAST_MS: number;
  /** la confirmación inline "¿Vaciar los N? Sí" vuelve sola */
  CONFIRM_MS: number;
  /** "Sincronizando…" solo si dura más de esto (anti-parpadeo) */
  SYNC_SHOW_MIN: number;
  /** ...y una vez mostrada, mínimo visible */
  SYNC_HOLD_MIN: number;
  /** highlight de la fila nueva / duplicada */
  HIGHLIGHT_MS: number;
  /** cuánto se considera "recién agregado" para el resalte de un ítem remoto */
  REMOTE_RECENT_MS: number;
  /** la fila que acaba de cambiar de grupo conserva spring.settle este tiempo (debe cubrir su visualDuration) */
  PROTAGONISTA_MS: number;
  /** ventana de Deshacer del toast de "Vaciar" (el diseño dice 8 s) */
  TOAST_VACIADO_MS: number;
  /** mínimo visible del toast al reanudar tras pausa (dedo/foco encima) */
  TOAST_RESUME_MIN_MS: number;
  /** cada cuánto se recalculan los "hace 2 min" (0 → no refrescar) */
  AHORA_TICK_MS: number;
}

const BASE: Timing = {
  // 300 desde D21 (eran 700): con las animaciones un 25% más cortas, la espera vieja se sentía como que "no pasaba
  // nada" después de tachar. Calibrado con el dedo en el teléfono, con ?hold= (ver tiemposDeLaUrl).
  // Sigue siendo una pausa deliberada, no un sobrante: alcanza para VER qué tachaste y para destildar en el lugar.
  HOLD_MS: 300,
  UNHOLD_MS: 250,
  TOAST_MS: 7000,
  CONFIRM_MS: 4000,
  SYNC_SHOW_MIN: 400,
  SYNC_HOLD_MIN: 800,
  HIGHLIGHT_MS: 800,
  REMOTE_RECENT_MS: 4000,
  PROTAGONISTA_MS: 600,
  TOAST_VACIADO_MS: 8000,
  TOAST_RESUME_MIN_MS: 800,
  AHORA_TICK_MS: 30_000,
};

/**
 * Umbrales que NO se escalan en tests (no son tiempos de comportamiento que convenga acelerar).
 */
/** vibración al tildar (Android; iOS la ignora) */
export const HAPTIC_MS = 10;
/** long-press para abrir Editar */
export const LONG_PRESS_MS = 500;
/** movimiento del puntero que cancela el tap (scroll) */
export const MOVE_CANCEL_PX = 8;
/** un teclado virtual nunca mide tan poco: por debajo de esto no re-anclamos las barras */
export const KB_INSET_MIN_PX = 40;
/** cuando cambian más filas que esto a la vez, las salidas se hacen solo con opacity */
export const CAP_SIMULTANEO = 40;

declare global {
  interface Window { __TIMING_SCALE__?: number }
}

function scale(): number {
  const w = typeof window !== 'undefined' ? window.__TIMING_SCALE__ : undefined;
  if (typeof w === 'number') return w;
  const env = typeof import.meta !== 'undefined' ? (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_TIMING_SCALE : undefined;
  if (env !== undefined && env !== '') return Number(env);
  return 1;
}

let overrides: Partial<Timing> = {};

/** Tiempos efectivos (escalados). Se recalcula en cada lectura para que los tests puedan cambiar la escala. */
export function timing(): Timing {
  const k = scale();
  const out = {} as Timing;
  for (const key of Object.keys(BASE) as (keyof Timing)[]) {
    const v = overrides[key] ?? BASE[key];
    out[key] = Math.round(v * k);
  }
  return out;
}

/** Solo para tests (y para la perilla de diagnóstico de abajo). */
export function setTiming(t: Partial<Timing>): void { overrides = { ...overrides, ...t }; }
export function resetTiming(): void { overrides = {}; }

/**
 * Tiempos pedidos por la URL, para calibrar en el teléfono sin recompilar (misma idea que `?motion`):
 *   ?hold=600     cuánto se queda la fila tachada arriba antes de bajar a Comprados
 *   ?unhold=200   lo mismo al destildar
 * Se ignora cualquier valor fuera de 0..5000 ms. Es diagnóstico: lo definitivo vive en BASE.
 */
export function tiemposDeLaUrl(busqueda = typeof location === 'undefined' ? '' : location.search): Partial<Timing> {
  const p = new URLSearchParams(busqueda);
  const out: Partial<Timing> = {};
  const leer = (clave: string): number | null => {
    const v = p.get(clave);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 5000 ? n : null;
  };
  const hold = leer('hold'); if (hold !== null) out.HOLD_MS = hold;
  const unhold = leer('unhold'); if (unhold !== null) out.UNHOLD_MS = unhold;
  return out;
}
