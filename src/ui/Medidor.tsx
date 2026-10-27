/**
 * Medidor de fluidez, para diagnosticar en el teléfono de verdad (que es donde se siente): se prende agregando
 * `?fps` a la URL y no existe en el resto de los casos. Muestra, por segundo:
 *   fps · el frame más lento del último segundo · cuántas tareas largas (>50 ms) bloquearon el hilo y cuánto sumaron
 *   · qué camino de teclado quedó activo y cuánto está tapando (`vk 345` / `vv 0`), que es lo que hace medible
 *     a D28: sin el número, «pedí vk y no había API» y «vk corrió y el teclado reportó 0» se ven igual.
 * Un frame a 60 fps dura 16 ms: si el peor frame se va a 100 ms, ahí está el problema, y las tareas largas dicen si
 * fue JavaScript (React/Motion) o pintura del navegador (cuando hay jank sin tareas largas).
 */
import { useEffect, useState } from 'react';
import s from './Medidor.module.css';

export interface Medicion {
  fps: number;
  /** frame típico (mediana): 8 ms = 120 Hz, 16 ms = 60 Hz. Dice a qué ritmo va la app cuando NO se traba. */
  tipicoMs: number;
  peorFrameMs: number;
  tareasLargas: number;
  msBloqueado: number;
  /** el modo de teclado que quedó activo, o SIN_DATO si el hook ni siquiera montó */
  teclado: string;
  /** el `--kb-inset` vivo, en px */
  kbInset: number;
}

/** El hook no montó (o no llegó a publicar): un cuarto estado que sin esto sería invisible. */
const SIN_DATO = '—';

/**
 * Qué teclado quedó activo y cuánto está tapando, leído del `<html>` que las superficies leen por CSS.
 * Se lee el DOM y NO `modoTeclado()` a propósito: esto reporta el valor ENTREGADO, no una segunda opinión —
 * si preguntara por su cuenta, después de un `replaceState` que se comiera la query diría `vv` mientras el
 * hook sigue corriendo `vk`, o sea un instrumento que miente.
 */
export function leerTeclado(root: HTMLElement = document.documentElement): { teclado: string; kbInset: number } {
  return {
    teclado: root.dataset.teclado ?? SIN_DATO,
    kbInset: parseInt(getComputedStyle(root).getPropertyValue('--kb-inset'), 10) || 0,
  };
}

/** Mediana de los tiempos entre frames: el ritmo real, sin que un tirón suelto lo ensucie. */
export function mediana(xs: number[]): number {
  if (xs.length === 0) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
}

/** ¿La URL pide el medidor? (`?fps`) */
export function pidenMedidor(busqueda = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(busqueda).has('fps');
}

export function Medidor() {
  const [m, setM] = useState<Medicion>(() => ({ fps: 0, tipicoMs: 0, peorFrameMs: 0, tareasLargas: 0, msBloqueado: 0, ...leerTeclado() }));

  useEffect(() => {
    // el hook del teclado ya corrió su efecto (BarraInput va antes en el árbol): sin esto, el modo se leería
    // recién al cerrar el primer segundo y arrancaría mostrando "—", que es justo la lectura ambigua a evitar
    setM(a => ({ ...a, ...leerTeclado() }));

    let frames = 0, peor = 0, tareas = 0, bloqueado = 0;
    let deltas: number[] = [];
    let ultimo = performance.now();
    let inicio = ultimo;
    let raf = 0;
    let vivo = true;

    let obs: PerformanceObserver | undefined;
    try {
      obs = new PerformanceObserver(lista => {
        for (const e of lista.getEntries()) { tareas++; bloqueado += e.duration; }
      });
      obs.observe({ entryTypes: ['longtask'] });
    } catch { /* Safari no tiene longtask: seguimos con fps y frames */ }

    const paso = (t: number) => {
      if (!vivo) return;
      const dt = t - ultimo;
      ultimo = t;
      frames++;
      deltas.push(dt);
      if (dt > peor) peor = dt;
      if (t - inicio >= 1000) {
        setM({
          fps: Math.round((frames * 1000) / (t - inicio)),
          tipicoMs: Math.round(mediana(deltas) * 10) / 10,
          peorFrameMs: Math.round(peor),
          tareasLargas: tareas,
          msBloqueado: Math.round(bloqueado),
          // acá y no por frame: leer estilo computado fuerza recalculo, y el Medidor no puede falsear lo que mide
          ...leerTeclado(),
        });
        frames = 0; peor = 0; tareas = 0; bloqueado = 0; deltas = []; inicio = t;
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);

    return () => { vivo = false; cancelAnimationFrame(raf); obs?.disconnect(); };
  }, []);

  return (
    <output className={s.medidor} aria-live="off">
      <b>{m.fps}</b> fps · típico <b>{m.tipicoMs}</b> · peor <b>{m.peorFrameMs}</b> ms
      {m.tareasLargas > 0 ? <> · <b>{m.tareasLargas}</b> tareas ({m.msBloqueado} ms)</> : null}
      {' · '}<b>{m.teclado}</b> {m.kbInset}
      {' · '}<span className={s.build}>build {__BUILD__}</span>
    </output>
  );
}
