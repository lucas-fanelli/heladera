/**
 * El hook contra el DOM (jsdom): lo que las funciones puras de `useVisualViewport.test.ts` no pueden ver.
 *
 * Lo que se fija acá es que el INSTRUMENTO diga si está prendido. D28 sale detrás de `?teclado=` y su único
 * producto es una medición en el teléfono: si pedir `vk` donde no hay API cayera a `vv` en silencio, «el
 * mecanismo no sirve para este mundo» y «la perilla no llegó» darían la MISMA observación (la barra no sube)
 * y decidirían cosas opuestas sobre el default. El modo efectivo viaja en el estado y se publica en
 * `<html data-teclado>` —de donde lo lee el Medidor— así que las dos lecturas dejan de ser la misma.
 *
 * Y lo otro que se fija acá es el efecto del camino `vk` entero, que es lo ÚNICO que D28 agrega en runtime:
 * engancharse al `geometrychange`, mover `--kb-inset` con lo que el teclado avise, y devolverle el viewport al
 * navegador al desmontar. Las funciones puras no lo ven y en jsdom la API no existe, así que va con un doble.
 *
 * Va en un `.test.tsx` a propósito: el proyecto `unit` corre en node y no tiene DOM (vite.config.ts).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVisualViewport } from './useVisualViewport';

/** Doble de `navigator.virtualKeyboard`: guarda los `geometrychange` para poder emitirlos a mano. */
function montarApiTeclado(alto: number) {
  /** los `geometrychange` enganchados. Es del DOBLE, no de la API: es lo que deja emitirlos y contarlos. */
  const oyentes = new Set<() => void>();
  const api = {
    overlaysContent: false,
    boundingRect: { height: alto },
    oyentes,
    addEventListener: (_t: 'geometrychange', cb: () => void) => { oyentes.add(cb); },
    removeEventListener: (_t: 'geometrychange', cb: () => void) => { oyentes.delete(cb); },
  };
  Object.defineProperty(navigator, 'virtualKeyboard', { value: api, configurable: true });
  return api;
}

/** El teclado se mueve y el navegador avisa: lo único que en el teléfono pasa DESPUÉS de montar. */
function moverTeclado(api: ReturnType<typeof montarApiTeclado>, alto: number): void {
  api.boundingRect = { height: alto };
  act(() => { for (const avisar of api.oyentes) avisar(); });
}

const perilla = (busqueda: string) => { history.replaceState(null, '', busqueda); };
const root = () => document.documentElement;
const kbInset = () => root().style.getPropertyValue('--kb-inset');

afterEach(() => {
  Reflect.deleteProperty(navigator, 'virtualKeyboard');
  history.replaceState(null, '', '/');
  // la perilla queda pedida en el teléfono (localStorage), así que si no se limpia acá el `?teclado=vk` de un
  // caso le prende `vk` al siguiente — y el siguiente es el que fija que el default NO se mueve solo
  localStorage.clear();
  delete root().dataset.teclado;
  root().style.removeProperty('--kb-inset');
});

describe('el modo efectivo se ve (D28: el instrumento dice si está prendido)', () => {
  it('EL BUG: ?teclado=vk sin la API cae a vv, y ahora lo DICE en vez de callárselo', () => {
    perilla('/?teclado=vk');
    // sin montar el doble: es el navegador que pidieron medir y no tiene virtualKeyboard
    const { result } = renderHook(() => useVisualViewport());

    expect(result.current.modo).toBe('vv');
    expect(root().dataset.teclado).toBe('vv');
  });

  it('?teclado=vk con la API: modo vk y el inset del teclado en la variable que leen las superficies', () => {
    perilla('/?teclado=vk');
    const api = montarApiTeclado(345);
    const { result } = renderHook(() => useVisualViewport());

    expect(result.current.modo).toBe('vk');
    expect(root().dataset.teclado).toBe('vk');
    expect(result.current.kbInset).toBe(345);
    expect(kbInset()).toBe('345px');
    // la app se hizo cargo del viewport: sin esto el navegador no reporta nada en edge-to-edge
    expect(api.overlaysContent).toBe(true);
  });

  it('vk con el teclado guardado: el modo sigue siendo vk aunque el inset sea 0 — que es LA distinción', () => {
    perilla('/?teclado=vk');
    montarApiTeclado(0);
    const { result } = renderHook(() => useVisualViewport());

    expect(result.current.modo).toBe('vk');   // corrió
    expect(result.current.kbInset).toBe(0);   // y midió 0: un resultado, no una ausencia
    expect(root().dataset.teclado).toBe('vk');
  });

  /**
   * El default, después de la medición de D28: sin perilla y con la API presente, la app SE HACE CARGO. Es el
   * caso de toda la familia, así que es el que más caro sale equivocarse — por eso afirma las dos mitades: que
   * el modo diga `vk` (el instrumento) y que además HAYA hecho lo suyo (`overlaysContent` prendido y el oyente
   * enganchado). Sin la segunda mitad, un default que se anuncia pero no se aplica pasaría en verde.
   */
  it('sin perilla, el default es vk: la app toma el teclado y lo dice', () => {
    const api = montarApiTeclado(345);
    const { result } = renderHook(() => useVisualViewport());

    expect(result.current.modo).toBe('vk');
    expect(root().dataset.teclado).toBe('vk');
    expect(result.current.kbInset).toBe(345);
    expect(kbInset()).toBe('345px');
    expect(api.overlaysContent).toBe(true);
    expect(api.oyentes.size).toBe(1);
  });

  /**
   * Y la otra mitad del default, que es la que protege a iOS: `vk` es lo que se PIDE, no lo que se puede. Sin
   * `navigator.virtualKeyboard` (Safari, navegadores viejos) el default cae a `vv` — el camino escrito para
   * ese mundo — y el instrumento lo dice en vez de callarlo.
   */
  it('sin la API, el default cae a vv y no rompe a quien no es Chromium', () => {
    const { result } = renderHook(() => useVisualViewport());   // sin montarApiTeclado: no hay virtualKeyboard
    expect(result.current.modo).toBe('vv');
    expect(root().dataset.teclado).toBe('vv');
  });

  /**
   * La vuelta atrás explícita: `?teclado=vv` tiene que dejar al navegador exactamente como estaba, sin tocar
   * `overlaysContent` ni enganchar nada. Es el botón de pánico si algo sale mal en un teléfono de la familia.
   */
  it('?teclado=vv no le toca NADA al navegador, aunque la API esté ahí', () => {
    perilla('/?teclado=vv');
    const api = montarApiTeclado(345);
    const { result } = renderHook(() => useVisualViewport());

    expect(result.current.modo).toBe('vv');
    expect(root().dataset.teclado).toBe('vv');
    expect(api.overlaysContent).toBe(false);
    expect(api.oyentes.size).toBe(0);
  });

  it('al desmontar se va todo: ni el modo ni la variable se filtran al resto de la app', () => {
    perilla('/?teclado=vk');
    const api = montarApiTeclado(345);
    const { unmount } = renderHook(() => useVisualViewport());
    expect(root().dataset.teclado).toBe('vk');

    unmount();

    expect(root().dataset.teclado).toBeUndefined();
    expect(kbInset()).toBe('');
    // y el viewport vuelve al navegador, sin dejar a nadie escuchando al teclado de un hook que ya no está
    expect(api.overlaysContent).toBe(false);
    expect(api.oyentes.size).toBe(0);
  });
});

/**
 * Lo de acá abajo es lo que NINGÚN test miraba: que el hook se enganche al `geometrychange`. Está MEDIDO que
 * borrarle al efecto las dos líneas de `addEventListener`/`removeEventListener` dejaba la suite entera en
 * verde, y esas dos líneas son las que en el teléfono hacen el trabajo: el montaje no las necesita porque el
 * efecto lee el `boundingRect` una vez a mano, pero el teclado aparece siempre DESPUÉS de montar.
 */
describe('el enganche al geometrychange (D28: el teclado avisa después de montar)', () => {
  it('EL BUG: el teclado se abre DESPUÉS de montar y el aviso mueve la variable que leen las superficies', () => {
    perilla('/?teclado=vk');
    // arranca guardado a propósito: así lo que se mida abajo no puede venir de la lectura del montaje
    const api = montarApiTeclado(0);
    renderHook(() => useVisualViewport());
    expect(kbInset()).toBe('');
    expect(api.oyentes.size).toBe(1);

    moverTeclado(api, 345);   // los 345 de 919 medidos por CDP en el teléfono del dueño

    expect(kbInset()).toBe('345px');
  });

  it('y el teclado que se guarda baja las superficies de vuelta', () => {
    perilla('/?teclado=vk');
    const api = montarApiTeclado(345);
    renderHook(() => useVisualViewport());
    expect(kbInset()).toBe('345px');

    moverTeclado(api, 0);

    expect(kbInset()).toBe('');
  });
});

/**
 * Y esto fija que la perilla se lea una vez por INSTANCIA y no una vez por RENDER. `useRef(modoTeclado())` es
 * lo que parece guardar un valor estable, pero no tiene inicializador perezoso: evalúa su argumento en TODOS
 * los renders y tira el resultado desde el segundo. `BarraInput` re-renderiza con cada tecla (cambia `valor`,
 * y con él `accion` y el rótulo del botón), así que sería un parseo de la URL —y en `vk`, un `setItem`— POR
 * CARÁCTER anotado en el súper: trabajo agregado al camino default, en el caso crítico, por una release cuya
 * afirmación central es que para la familia no cambia ningún comportamiento.
 * Está MEDIDO que volver a `useRef(modoTeclado())` deja los 245 tests del proyecto `ui` en verde: sin estos
 * dos casos, el comentario de `useVisualViewport` es la única cosa que lo sostiene, y un comentario no corre.
 */
describe('la perilla se lee UNA vez, al montar (no una por render)', () => {
  it('EL BUG: en el camino default, re-renderizar no vuelve a parsear location.search', () => {
    const Real = globalThis.URLSearchParams;
    let parseos = 0;
    class Contada extends Real {
      constructor(init?: ConstructorParameters<typeof Real>[0]) { super(init); parseos++; }
    }
    vi.stubGlobal('URLSearchParams', Contada);
    try {
      const { rerender } = renderHook(() => useVisualViewport());
      // la línea base se toma DESPUÉS del montaje: cuántas veces renderice React al montar no es lo que se mide
      const enElMontaje = parseos;

      rerender(); rerender(); rerender();

      expect(parseos).toBe(enElMontaje);   // con `useRef(modoTeclado())` daría enElMontaje + 3
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('y en vk tampoco se reescribe la perilla: un setItem por tecla tipeada, no', () => {
    perilla('/?teclado=vk');
    montarApiTeclado(345);
    const escrituras = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const { rerender } = renderHook(() => useVisualViewport());
      const enElMontaje = escrituras.mock.calls.length;

      rerender(); rerender(); rerender();

      expect(escrituras.mock.calls.length).toBe(enElMontaje);
    } finally {
      escrituras.mockRestore();
    }
  });
});

/**
 * Y esto fija la otra mitad de «una vez, al montar»: no alcanza con LEER la perilla una vez, también hay que
 * SUSCRIBIRSE una vez. El camino queda congelado en un ref y el efecto va sin deps porque ese ref es su único
 * dueño; poner el camino en las deps prometería que se re-elige en caliente, y re-elegir corre el cleanup
 * —`overlaysContent = false` y desenganchar el `geometrychange`— en medio de la sesión de medición. Desde el
 * teléfono eso se vería como «vk anduvo una vez y la segunda no», que es textual uno de los disparadores de
 * abandono de D28: el arreglo equivocado no se ve feo, hace abandonar el enfoque por una causa falsa.
 * Está MEDIDO que las dos formas del array (`[]` y el camino puesto ahí) dejan la suite igual de verde hoy:
 * lo que este caso clava no es el síntoma —no hay— sino la rama que el arreglo eligió.
 */
describe('el camino se suscribe UNA vez, al montar (no se re-elige en caliente)', () => {
  it('EL BUG: la sesión pierde la perilla (URL y storage) y el enganche al teclado sigue en pie', () => {
    perilla('/l/abc?teclado=vk');
    const api = montarApiTeclado(345);
    const engancha = vi.spyOn(api, 'addEventListener');
    const desengancha = vi.spyOn(api, 'removeEventListener');
    const { rerender } = renderHook(() => useVisualViewport());
    expect(engancha).toHaveBeenCalledTimes(1);
    expect(api.overlaysContent).toBe(true);

    // el peor caso, las dos memorias de la perilla perdidas a la vez: el router limpia `?anotar` y deja
    // `/l/<id>` pelado (`conPerillas` en app/router.ts), y el storage se bloquea o alguien lo limpia
    perilla('/l/abc');
    localStorage.clear();
    rerender(); rerender();

    // cantidad exacta y no `toHaveBeenCalled`: re-suscribirse deja `oyentes` en 1 igual, así que sin contar
    // los enganches el caso aprobaría en vacío
    expect(engancha).toHaveBeenCalledTimes(1);
    expect(desengancha).not.toHaveBeenCalled();
    expect(api.overlaysContent).toBe(true);
    expect(api.oyentes.size).toBe(1);
  });
});
