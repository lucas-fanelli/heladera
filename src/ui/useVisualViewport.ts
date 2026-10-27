/**
 * Cuánto del layout viewport tapa el teclado virtual. Escribe la variable CSS `--kb-inset` en `<html>`, y de
 * ahí la leen por CSS las superficies que suben con el teclado (quiénes son, sin re-listarlas acá:
 * `grep -rn -- --kb-inset src/`). La única que NO se acomoda sola con la variable es `.centro` de
 * `Sheet.module.css`, que limita el alto con el inset pero se centra sobre el `100dvh` sin achicar — ver la
 * excepción escrita en D28. Es el ÚNICO que escribe esa variable: como la pone por estilo inline, le gana
 * a cualquier hoja de estilos, así que el valor tiene que salir de un solo lugar y no apilarse con un `env()`.
 *
 * Hay DOS caminos, uno por plataforma, y la elección es de D28 — no un tercer condicional (ver decisiones.md):
 *
 *  - `vk` · **Chromium** (`navigator.virtualKeyboard`). La app se hace cargo del teclado SIEMPRE:
 *    `overlaysContent = true` le dice al navegador que no toque el viewport, y el alto sale de
 *    `boundingRect` en cada `geometrychange`. Cubre los dos mundos de Chromium con el mismo código: la
 *    ventana que se achica sola y la que NO se achica (la PWA instalada en edge-to-edge, donde está MEDIDO
 *    que ni `visualViewport` ni `100dvh` se enteran de que hay un teclado: 345 px de 919 sin reportar nada).
 *    Acá NO hay guarda de pinch-zoom y no hace falta: el `boundingRect` ES el teclado (guardado mide 0, haya
 *    zoom o no) y este camino no escucha scroll, así que panear zoomeado no re-ancla nada. Por eso tampoco
 *    mira `scale` ni `offsetTop`: nunca toca `visualViewport`, y lo que no mide no lo publica.
 *
 *  - `vv` · **iOS Safari y cualquiera sin la API**. El layout viewport no cambia y `visualViewport` sí, así
 *    que el inset se calcula restando. Es el mundo para el que se escribió este archivo. Y como se calcula
 *    restando, acá la guarda de pinch-zoom SÍ hace falta: con `vv.scale > 1` el visual viewport se achica sin
 *    que haya teclado (inset 0), y tampoco se re-ancla nada mientras se panea zoomeado.
 *
 * `overlaysContent` es TODO-O-NADA (la spec obliga al navegador a no redimensionar mientras esté activo), así
 * que `vk` apaga el mecanismo del que vivía Android normal (`interactive-widget=resizes-content`, declarado en
 * index.html, que hacía que acá el inset diera 0 a propósito). Eso NO es un efecto colateral que se banca: es
 * el punto. Un solo mecanismo cubre los dos mundos de Chromium, en vez de dos que cada uno cubre el suyo y
 * ninguno el tercero — que es cómo se llegó a este bug.
 *
 * `vk` ES EL DEFAULT, y lo es porque se midió en el teléfono EN LAS DOS DIRECCIONES (D28, 2026-08-30), que era
 * la condición que D25 no cumplió: con la feature de edge-to-edge activa el inset pasó de no reportarse a
 * 345 px y la barra subió; con la feature apagada —el mundo que ya andaba— dio el MISMO resultado visual por
 * otro camino (la ventana deja de achicarse, la barra sube por la variable), incluido el teclado adentro de
 * una hoja, que es donde viven la mitad de los campos de la app. Medir un solo lado y generalizar es el error
 * de D25; acá los dos lados tienen su captura. `?teclado=vv` es la vuelta atrás, desde el teléfono y sin
 * deployar.
 *
 * La perilla se PIDE por URL y QUEDA PEDIDA en este teléfono (`heladera:teclado` en localStorage), y en eso NO
 * es hermana de `?fps`: perder el medidor se ve (desaparece de la pantalla), perder el modo degradaría la
 * corrida al modo de control sin que nada cambie. Y perderlo es el camino normal, no el raro: el manifest
 * arranca en `start_url: '/'` y el paso 4 del protocolo de D28 obliga a tocar
 * `chrome://flags/#web-app-short-edges-cutout-mode`, que relanza la app instalada — donde además no hay barra
 * de direcciones para volver a escribir nada. `?teclado=vv` lo borra: la vuelta atrás sigue siendo explícita y
 * el default no se escribe nunca. Para el operador: armarlo desde una pestaña de Chrome debería alcanzar
 * (mismo origen, mismo storage que la WebAPK), pero eso NO está medido — confirmá el modo en el Medidor
 * (`?fps`) antes de anotar un número, que es exactamente el control positivo del paso 3.
 *
 * Detalles que valen para los dos caminos porque los implementan las DOS funciones puras (no un comentario):
 *  - Insets menores a KB_INSET_MIN_PX (barra del navegador, redondeos) se ignoran: un teclado nunca mide tan poco.
 *  - Math.floor: nunca subir la barra 1 px de más (dejaría una línea de fondo entre la barra y el teclado).
 * Feature-detect en los dos: sin la API que le toca, devuelve 0 y no hace nada (jsdom incluido).
 *
 * Y como el producto de esta release es una MEDICIÓN, el instrumento tiene que decir si está prendido: pedir
 * `vk` donde no hay API cae a `vv` en silencio, y desde el teléfono eso se ve idéntico a «`vk` corrió y el
 * teclado reportó 0» (en los dos casos la barra no sube) aunque decidan cosas opuestas sobre el default. Por
 * eso el modo EFECTIVO se publica en `<html data-teclado>` junto a la variable, y el Medidor (`?fps`) lo
 * muestra al lado del inset vivo: `vk 345` / `vv 0`. Se lee un número, no «¿subió la barra?».
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { KB_INSET_MIN_PX } from '@/domain/timing';

/**
 * Lo que el hook publica: los dos números que los DOS caminos miden de verdad, y nada más. No se llama
 * `VisualViewportState` porque en `vk` no hay visual viewport que describir. El que quiera agregar un campo
 * tiene que poder decir de dónde sale en los dos caminos y medirlo: rellenar el que no sabe con un literal
 * (`scale: 1`, `soportado: true`) compila igual —TypeScript chequea forma, no significado— y el que después
 * lo lea para decidir algo se come el bug en un solo teléfono.
 */
export interface EstadoTeclado {
  /** px que el teclado tapa por debajo del layout viewport (0 si nada, 0 con pinch-zoom en `vv`) */
  kbInset: number;
  /**
   * El camino que quedó activo DE VERDAD, no el pedido: `?teclado=vk` sin la API cae acá como `'vv'`.
   * Es el valor que se publica en `<html data-teclado>` y el que lee el Medidor.
   */
  modo: ModoTeclado;
}

const CSS_VAR = '--kb-inset';

/** Los dos caminos. `vk` es el default (D28, medido en el teléfono); `vv` es la vuelta atrás. */
export type ModoTeclado = 'vv' | 'vk';

/** Dónde queda pedido el camino, en este teléfono. Mismo prefijo que el resto del proyecto (`identidad/yo.ts`). */
const CLAVE_MODO = 'heladera:teclado';

/** Lo mínimo del `Storage` que se usa acá; se recibe por parámetro para poder pasar uno de mentira en los tests. */
type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Sin storage (node, modo privado, storage bloqueado) la perilla vale para esta carga y nada más. */
function almacen(): Almacen | null {
  try { return localStorage; } catch { return null; }
}

/**
 * El camino por default, y cómo se lo pisa. `vk` ES EL DEFAULT desde la medición del 2026-08-30 (D28): la app
 * se hace cargo del teclado en todo Chromium, con la feature de edge-to-edge activa o no. `?teclado=vv`
 * vuelve al mecanismo del navegador y QUEDA PEDIDO en este teléfono; `?teclado=vk` lo devuelve al default.
 *
 * El que se recuerda es el NO-DEFAULT, nunca el default. Esa asimetría es a propósito y ya nos salvó una vez:
 * cuando el default era `vv`, lo que se guardaba era `vk`, y al invertirlo no quedó un `vv` viejo clavado en
 * ningún teléfono decidiendo por su cuenta. La vuelta atrás tiene que sobrevivir a un relanzado: tocar el flag
 * de edge-to-edge relanza la app instalada, que arranca en `start_url: '/'` (vite.config.ts) y en modo
 * standalone no tiene barra de direcciones donde volver a escribir la perilla. (Moverse por dentro de la app
 * ya no la pierde: de eso se ocupa `conPerillas` en `app/router.ts`.)
 *
 * Un `'vk'` guardado de antes de que fuera default se lee como «no es `vv`» → default. No hay que migrarlo.
 */
export function modoTeclado(
  busqueda = typeof location === 'undefined' ? '' : location.search,
  donde: Almacen | null = almacen(),
): ModoTeclado {
  const pedido = new URLSearchParams(busqueda).get('teclado');
  if (pedido === 'vk' || pedido === 'vv') {
    try {
      if (pedido === 'vv') donde?.setItem(CLAVE_MODO, 'vv');
      else donde?.removeItem(CLAVE_MODO);
    } catch { /* storage lleno o bloqueado: vale para esta carga y nada más */ }
    return pedido;
  }
  try { if (donde?.getItem(CLAVE_MODO) === 'vv') return 'vv'; } catch { /* idem */ }
  return 'vk';
}

/** Cuánto tapa el teclado, dado el visual viewport (camino `vv`). Puro: testeable sin DOM. */
export function calcularInset(vv: { height: number; offsetTop: number; scale: number }, innerHeight: number): number {
  if (vv.scale > 1) return 0;   // pinch-zoom: el visual viewport se achica pero no hay teclado
  const inset = Math.floor(innerHeight - vv.height - vv.offsetTop);
  return inset >= KB_INSET_MIN_PX ? inset : 0;
}

/**
 * Cuánto tapa el teclado, dado el `boundingRect` de la API de teclado virtual (camino `vk`). Puro.
 * Acá el alto YA es el del teclado (0 cuando está guardado), así que no hay nada que restar; se mantiene el
 * mismo piso que el otro camino para que las dos vías no puedan diferir en el borde por un redondeo.
 * Ese «YA es el del teclado» está MEDIDO con el teclado acoplado al borde de abajo (345 de 919); flotante y
 * dividido no se midieron, y el paso 5 del protocolo de D28 los deja afuera de la sesión: por eso acá no se
 * mira `rect.y` todavía — el día que la posición importe, se codea con el número en la mano y no antes.
 */
export function insetDeTecladoVirtual(rect: { height: number }): number {
  const inset = Math.floor(rect.height);
  return inset >= KB_INSET_MIN_PX ? inset : 0;
}

/** Lo mínimo de `navigator.virtualKeyboard` que se usa acá (todavía no está en lib.dom). */
interface TecladoVirtual {
  overlaysContent: boolean;
  boundingRect: { height: number };
  addEventListener(tipo: 'geometrychange', cb: () => void): void;
  removeEventListener(tipo: 'geometrychange', cb: () => void): void;
}

function tecladoVirtual(): TecladoVirtual | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { virtualKeyboard?: TecladoVirtual }).virtualKeyboard;
}

/**
 * Lo que mide `leer()`, que es el camino `vv` y NADA más: el inset y la escala del pinch-zoom (el insumo de
 * la guarda de zoom-paneo, el único que lee `scale`). No sale del módulo ni es el estado del hook: el camino
 * `vk` no puede llenarlo porque nunca consulta `visualViewport`.
 */
interface MedidaVv {
  kbInset: number;
  /** escala del pinch-zoom (1 = sin zoom) */
  scale: number;
}

function leer(): MedidaVv {
  if (typeof window === 'undefined') return { kbInset: 0, scale: 1 };
  const vv = window.visualViewport;
  if (!vv) return { kbInset: 0, scale: 1 };
  const scale = vv.scale || 1;
  return { kbInset: calcularInset({ height: vv.height, offsetTop: vv.offsetTop, scale }, window.innerHeight), scale };
}

export function useVisualViewport(): EstadoTeclado {
  /**
   * El modo se decide UNA vez, al montar: cambiarlo en caliente dejaría `overlaysContent` a medio camino.
   * Con inicializador perezoso y NO `useRef(modoTeclado())`: el argumento de `useRef` se evalúa en cada
   * render, y `modoTeclado` ahora escribe (deja la perilla pedida en el teléfono) — sería un `setItem` por
   * tecla tipeada en la barra de anotar, justo en el hilo que el Medidor está midiendo.
   */
  const [modo] = useState(modoTeclado);
  /**
   * ¿Está la API? Se pregunta UNA vez y en UN solo lugar. Volver a preguntar donde se reporta el modo sería
   * un segundo criterio, y un instrumento que dice `vk` mientras el hook corre `vv` es peor que no tenerlo.
   *
   * Este ref es también el ÚNICO dueño de cuándo se suscribe el efecto de abajo, y por eso ese efecto va sin
   * deps: `[vk]` sería este mismo `[]` escrito de forma que promete lo contrario —que el camino se re-elige en
   * caliente— cuando el ref existe justo para impedirlo. Y no es cosmético a futuro: re-suscribirse corre el
   * cleanup, o sea `overlaysContent = false` y desenganchar el `geometrychange`, en medio de la sesión de
   * medición. El síntoma sería «vk anduvo una vez y la segunda no», que es textual uno de los disparadores de
   * abandono de D28. Un solo dueño del criterio: acá.
   */
  const vk = useRef(modo === 'vk' ? tecladoVirtual() : undefined).current;
  /** el camino que quedó activo de verdad: pedir `vk` sin API es `vv`, y ahora se dice en vez de callarse */
  const efectivo: ModoTeclado = vk ? 'vk' : 'vv';

  /** el único número del estado: los dos caminos lo miden, y React ya hace bail-out si repite valor */
  const [kbInset, setKbInset] = useState<number>(() => leer().kbInset);

  useEffect(() => {
    if (vk) {
      // la app se hace cargo: el navegador deja de redimensionar y el alto lo dice el teclado
      vk.overlaysContent = true;
      const actualizar = (): void => setKbInset(insetDeTecladoVirtual(vk.boundingRect));
      vk.addEventListener('geometrychange', actualizar);
      actualizar();
      return () => {
        vk.removeEventListener('geometrychange', actualizar);
        // devolver el viewport al navegador: si el componente se va, nadie queda posicionando la pantalla
        vk.overlaysContent = false;
      };
    }

    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    if (!vv) return;
    /** lo último medido; vive acá adentro porque el único que lo lee es la guarda de dos líneas más abajo */
    let ultimo = leer();
    let raf = 0;
    const actualizar = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const n = leer();
        // zoomeado, el scroll del visual viewport cambia offsetTop/height todo el tiempo: no re-anclar nada
        if (n.scale > 1 && ultimo.scale > 1 && ultimo.kbInset === 0) return;
        ultimo = n;
        // SOLO re-renderizamos cuando cambia lo que alguien usa (el inset del teclado): React hace bail-out si
        // el número repite. En un teléfono, esconder la barra del navegador al scrollear dispara este evento en
        // cada frame, y re-renderizar ahí era pura pérdida.
        setKbInset(n.kbInset);
      });
    };
    vv.addEventListener('resize', actualizar);
    vv.addEventListener('scroll', actualizar);
    window.addEventListener('resize', actualizar);
    actualizar();
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', actualizar);
      vv.removeEventListener('scroll', actualizar);
      window.removeEventListener('resize', actualizar);
    };
  }, []);   // sin deps a propósito: cuándo se suscribe lo decide el ref de `vk` (arriba), que no cambia nunca

  // El único dueño de <html>: acá se escriben la variable Y el modo efectivo, juntos. Va en ESTE efecto y no
  // en el de arriba a propósito: aquel se va por el `return` temprano cuando no hay `visualViewport` (jsdom,
  // y cualquier navegador viejo), y justo ahí el modo tendría que verse igual. Sale con el mismo cleanup.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (kbInset > 0) root.style.setProperty(CSS_VAR, `${kbInset}px`);
    else root.style.removeProperty(CSS_VAR);
    root.dataset.teclado = efectivo;
    return () => { root.style.removeProperty(CSS_VAR); delete root.dataset.teclado; };
  }, [kbInset, efectivo]);

  // El mismo objeto mientras el inset no se mueva: la barra de anotar re-renderiza con cada tecla, y devolver
  // uno nuevo cada vez haría re-correr cualquier efecto que dependa de lo que este hook devuelve.
  return useMemo(() => ({ kbInset, modo: efectivo }), [kbInset, efectivo]);
}
