/**
 * Arrastrar una fila entre secciones (D18). La pulsación larga la levanta (eso lo detecta la Fila, que ya distinguía
 * tap de scroll); acá vive lo que pasa desde que se levanta hasta que se suelta.
 *
 *  - El dedo que arrastra deja de scrollear: al activarse todavía no hubo movimiento (la pulsación larga lo exige),
 *    así que el touchmove sigue siendo cancelable y lo bloqueamos. Ver la nota larga en ui/arrastre.ts.
 *  - Para llegar a una sección que no está a la vista, auto-scroll en los bordes mientras sostenés.
 *  - Se sigue con listeners en window (no en la fila): el dedo se va de la fila en el primer píxel.
 *  - Escape o pointercancel cancelan sin mover nada.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { HAPTIC_MS } from '@/domain/timing';
import { hayQueMover, seccionEnPunto, velocidadAutoScroll } from './arrastre';

export interface Arrastrando {
  itemId: string;
  texto: string;
  /** posición del dedo en la pantalla (la sombra la sigue) */
  x: number;
  y: number;
  /** sección bajo el dedo: id de súper, null = "en cualquiera", undefined = afuera de la lista */
  destino: string | null | undefined;
}

export interface OpcionesArrastre {
  /** el contenedor que scrollea (para el auto-scroll de los bordes) */
  scroll: { current: HTMLElement | null };
  /** soltar sobre una sección distinta */
  onSoltar: (itemId: string, mercadoId: string | null) => void;
  /** para tests: qué elemento hay en un punto (default: document.elementFromPoint) */
  enPunto?: (x: number, y: number) => Element | null;
}

const vibrar = (): void => {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try { navigator.vibrate(HAPTIC_MS); } catch { /* sin háptica */ }
};

export function useArrastre({ scroll, onSoltar, enPunto }: OpcionesArrastre) {
  const [arrastrando, setArrastrando] = useState<Arrastrando | null>(null);
  /** todo lo vivo del gesto en un ref: los listeners de window no se re-crean en cada movimiento */
  const gesto = useRef<{ pointerId: number; itemId: string; mercadoActual: string | null; destino: string | null | undefined; y: number; x: number; limpiar: () => void } | null>(null);
  const onSoltarRef = useRef(onSoltar); onSoltarRef.current = onSoltar;

  const cancelar = useCallback(() => {
    gesto.current?.limpiar();
    gesto.current = null;
    setArrastrando(null);
  }, []);
  useEffect(() => cancelar, [cancelar]);

  const empezar = useCallback((item: { id: string; texto: string; mercado?: string | null }, e: PointerEvent) => {
    if (gesto.current) return;
    const puntoEn = enPunto ?? ((x: number, y: number) => (typeof document === 'undefined' ? null : document.elementFromPoint(x, y)));
    vibrar();

    const mover = (ev: PointerEvent): void => {
      const g = gesto.current;
      if (!g || ev.pointerId !== g.pointerId) return;
      g.x = ev.clientX; g.y = ev.clientY;
      g.destino = seccionEnPunto(ev.clientX, ev.clientY, puntoEn);
      setArrastrando({ itemId: g.itemId, texto: item.texto, x: g.x, y: g.y, destino: g.destino });
    };
    const soltar = (ev: PointerEvent): void => {
      const g = gesto.current;
      if (!g || ev.pointerId !== g.pointerId) return;
      const destino = seccionEnPunto(ev.clientX, ev.clientY, puntoEn);
      const { itemId, mercadoActual } = g;
      cancelar();
      if (hayQueMover(destino, mercadoActual)) onSoltarRef.current(itemId, destino);
    };
    const escapar = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') cancelar(); };
    // el dedo que arrastra no scrollea (ver arrastre.ts): listener NO pasivo, si no preventDefault no hace nada
    const bloquearScroll = (ev: TouchEvent): void => { if (ev.cancelable) ev.preventDefault(); };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', cancelar);
    window.addEventListener('keydown', escapar);
    window.addEventListener('touchmove', bloquearScroll, { passive: false });

    // auto-scroll: mientras el dedo esté en la zona de un borde, el contenedor se mueve solo
    let raf = 0;
    const paso = (): void => {
      const g = gesto.current;
      const cont = scroll.current;
      if (g && cont) {
        const caja = cont.getBoundingClientRect();
        const v = velocidadAutoScroll(g.y, { top: caja.top, bottom: caja.bottom });
        if (v !== 0) {
          cont.scrollTop += v;
          // al moverse el contenido, cambia lo que hay bajo el dedo
          g.destino = seccionEnPunto(g.x, g.y, puntoEn);
          setArrastrando({ itemId: g.itemId, texto: item.texto, x: g.x, y: g.y, destino: g.destino });
        }
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);

    gesto.current = {
      pointerId: e.pointerId,
      itemId: item.id,
      mercadoActual: item.mercado ?? null,
      destino: undefined,
      x: e.clientX,
      y: e.clientY,
      limpiar: () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        window.removeEventListener('pointercancel', cancelar);
        window.removeEventListener('keydown', escapar);
        window.removeEventListener('touchmove', bloquearScroll);
      },
    };
    setArrastrando({ itemId: item.id, texto: item.texto, x: e.clientX, y: e.clientY, destino: seccionEnPunto(e.clientX, e.clientY, puntoEn) });
  }, [scroll, cancelar, enPunto]);

  return { arrastrando, empezar, cancelar };
}
