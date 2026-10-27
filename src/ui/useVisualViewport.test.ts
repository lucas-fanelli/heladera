import { describe, expect, expectTypeOf, it } from 'vitest';
import { KB_INSET_MIN_PX } from '@/domain/timing';
import { calcularInset, insetDeTecladoVirtual, modoTeclado, useVisualViewport, type ModoTeclado } from './useVisualViewport';

describe('calcularInset (teclado virtual vs. visual viewport)', () => {
  it('teclado abierto en iOS: innerHeight - alto visible - offsetTop, redondeado hacia abajo', () => {
    expect(calcularInset({ height: 500.6, offsetTop: 0, scale: 1 }, 800)).toBe(299);
    expect(calcularInset({ height: 500, offsetTop: 20, scale: 1 }, 800)).toBe(280);
  });

  it('sin teclado (viewport completo) → 0', () => {
    expect(calcularInset({ height: 800, offsetTop: 0, scale: 1 }, 800)).toBe(0);
  });

  it('insets chicos (barra del navegador, redondeos) se ignoran: un teclado nunca mide tan poco', () => {
    expect(calcularInset({ height: 800 - (KB_INSET_MIN_PX - 1), offsetTop: 0, scale: 1 }, 800)).toBe(0);
    expect(calcularInset({ height: 800 - KB_INSET_MIN_PX, offsetTop: 0, scale: 1 }, 800)).toBe(KB_INSET_MIN_PX);
  });

  it('pinch-zoom (scale > 1) NO es teclado: 0 aunque el visual viewport sea chico', () => {
    expect(calcularInset({ height: 300, offsetTop: 120, scale: 2.5 }, 800)).toBe(0);
  });

  it('nunca negativo', () => {
    expect(calcularInset({ height: 900, offsetTop: 0, scale: 1 }, 800)).toBe(0);
  });
});

/**
 * El camino de Chromium (D28). Acá el `boundingRect` YA es el teclado, así que no hay resta: lo que se fija
 * es que las dos vías no puedan diferir en el borde, porque conviven en el mismo producto y alimentan la
 * MISMA variable CSS. Si una ignorara un teclado de 40 px y la otra no, el bug aparecería en un solo teléfono.
 */
describe('insetDeTecladoVirtual (camino virtualKeyboard)', () => {
  it('el alto del teclado es el inset, redondeado hacia abajo', () => {
    expect(insetDeTecladoVirtual({ height: 345 })).toBe(345);
    expect(insetDeTecladoVirtual({ height: 345.9 })).toBe(345);
  });

  it('teclado guardado (rect en 0) → 0', () => {
    expect(insetDeTecladoVirtual({ height: 0 })).toBe(0);
  });

  it('mismo piso que el otro camino: las dos vías coinciden en el borde', () => {
    expect(insetDeTecladoVirtual({ height: KB_INSET_MIN_PX - 1 })).toBe(0);
    expect(insetDeTecladoVirtual({ height: KB_INSET_MIN_PX })).toBe(KB_INSET_MIN_PX);
    // el mismo teclado medido por las dos vías da lo mismo (800 de ventana, 345 de teclado)
    expect(insetDeTecladoVirtual({ height: 345 })).toBe(calcularInset({ height: 800 - 345, offsetTop: 0, scale: 1 }, 800));
  });
});

/**
 * La perilla. El default es `vv` A PROPÓSITO hasta que la medición en el teléfono diga otra cosa: `vk` prende
 * `overlaysContent`, que apaga el redimensionado del que hoy vive Android normal.
 *
 * Lo que se cae acá el día que alguien mueva el default es la FUNCIÓN: lo que `modoTeclado` DEVUELVE. Eso NO
 * es la promesa de D28 — la promesa es que con el default el hook no le toque nada al navegador, y eso es el
 * USO. Lo fija `useVisualViewport.dom.test.tsx` (proyecto `ui`, jsdom, con un doble de
 * `navigator.virtualKeyboard`), y hace falta de verdad: está MEDIDO que «simplificar» el `modo === 'vk' ?` del
 * `useRef` —con lo que `overlaysContent` se le prende a toda la familia— deja esta suite entera en verde. Los
 * dos archivos se leen juntos; ninguno de los dos alcanza solo.
 */
describe('modoTeclado (la perilla ?teclado=)', () => {
  /**
   * Un storage de mentira, y se le pasa EXPLÍCITO a cada caso: la perilla ahora escribe, así que compartir el
   * storage de verdad haría que un caso le prendiera `vk` al siguiente — y el que no se puede aflojar es justo
   * el del default.
   */
  function memoria(inicial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
    const m = new Map(Object.entries(inicial));
    return {
      getItem: k => m.get(k) ?? null,
      setItem: (k, v) => { m.set(k, v); },
      removeItem: k => { m.delete(k); },
    };
  }

  /**
   * El default es `vk` desde D28, y el permiso para que lo sea NO es que alguien lo prefiera: es que se midió
   * en el teléfono en las DOS direcciones (con la feature de edge-to-edge activa y apagada), incluido el
   * teclado adentro de una hoja. Si alguien mueve este valor, este test se cae, y volver a ponerlo en verde
   * pide la misma prueba: dos mediciones, no un razonamiento. Es el mismo guardarraíl que ya se cayó una vez
   * —cuando el default era `vv`— y que obligó a que la medición existiera.
   */
  it('sin parámetro, el default es vk: la app se hace cargo del teclado en todo Chromium', () => {
    expect(modoTeclado('', memoria())).toBe('vk');
    expect(modoTeclado('?fps', memoria())).toBe('vk');
  });

  it('?teclado=vk pide el camino de Chromium; ?teclado=vv fuerza el viejo (vuelta atrás sin deployar)', () => {
    expect(modoTeclado('?teclado=vk', memoria())).toBe('vk');
    expect(modoTeclado('?teclado=vv', memoria())).toBe('vv');
    expect(modoTeclado('?fps&teclado=vk', memoria())).toBe('vk');
  });

  it('cualquier otra cosa cae en el default, no rompe', () => {
    expect(modoTeclado('?teclado=', memoria())).toBe('vk');
    expect(modoTeclado('?teclado=jaja', memoria())).toBe('vk');
  });

  /**
   * EL BUG: la perilla se pedía una vez y se leía de la URL para siempre, en una app que arranca en
   * `start_url: '/'` y que el protocolo de D28 obliga a relanzar (el flag de edge-to-edge) entre corrida y
   * corrida. La segunda medición salía del modo de control disfrazada de la del experimento.
   */
  it('la vuelta atrás sobrevive a la URL pelada: se pide una vez y sigue pedida', () => {
    const m = memoria();
    expect(modoTeclado('?teclado=vv', m)).toBe('vv');
    // relanzamiento desde el ícono: la app entra en `/` y la URL ya no dice nada
    expect(modoTeclado('', m)).toBe('vv');
    expect(modoTeclado('?fps', m)).toBe('vv');
  });

  it('?teclado=vk borra lo recordado: volver al default es tan explícito como salirse', () => {
    const m = memoria({ 'heladera:teclado': 'vv' });
    expect(modoTeclado('?teclado=vk', m)).toBe('vk');
    expect(modoTeclado('', m)).toBe('vk');
  });

  /**
   * Los teléfonos que participaron de la medición tienen un `'vk'` guardado de cuando ESE era el no-default.
   * No hay migración: `'vk'` no es `'vv'`, así que cae al default, que ahora es `vk` — el mismo valor. Sin
   * este test, invertir la asimetría en el futuro dejaría a esos teléfonos decidiendo con un dato viejo.
   */
  it('un vk guardado de antes de que fuera default se lee como default, sin migrar nada', () => {
    expect(modoTeclado('', memoria({ 'heladera:teclado': 'vk' }))).toBe('vk');
  });

  /**
   * La asimetría —se guarda el NO-default, nunca el default— es lo que permitió invertir el default sin dejar
   * un valor viejo clavado en ningún teléfono. Si alguien la rompe guardando los dos, el próximo cambio de
   * default se lleva puestos a los que ya usaron la perilla.
   */
  it('el default no se escribe nunca: pedir vk no deja nada clavado en el teléfono', () => {
    const m = memoria();
    modoTeclado('?teclado=vk', m);
    expect(m.getItem('heladera:teclado')).toBeNull();
    modoTeclado('?teclado=vv', m);
    expect(m.getItem('heladera:teclado')).toBe('vv');   // el no-default sí, para que la vuelta atrás aguante
  });

  /**
   * Con storage roto se cae al DEFAULT, que ahora es el camino que anda. Cuando el default era `vv` esto era
   * benigno; ahora importa más: un teléfono en modo privado, o con el storage desalojado, sigue teniendo el
   * teclado que funciona en vez de quedarse con el mecanismo que edge-to-edge deja ciego.
   */
  it('storage bloqueado o ausente: cae al default (el que anda) y no explota', () => {
    const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); }, removeItem: () => {} };
    expect(modoTeclado('', roto)).toBe('vk');
    expect(modoTeclado('?teclado=vv', roto)).toBe('vv');   // lo pedido en la URL manda igual, aunque no se pueda guardar
    expect(modoTeclado('', null)).toBe('vk');
  });
});

/**
 * El contrato de lo que el hook PUBLICA. No es pulido: es el único lugar donde puede fallar que un camino
 * devuelva un número que no midió. `vk` no consulta `visualViewport` —no tiene `scale`, ni `offsetTop`, ni el
 * alto del viewport—, así que un estado con esos campos ahí solo se puede llenar con literales, y TypeScript
 * los deja pasar porque chequea forma y no significado (por eso el bug no lo agarraba ningún test: sin
 * consumidor, un `scale: 1` inventado no rompe nada... hasta el día que alguien lo lea para decidir algo).
 * La lista de acá abajo se cae A PROPÓSITO si aparece un campo nuevo: volver a ponerla en verde obliga a
 * decir cómo lo mide CADA camino. Muerde también en la puerta 2 de `verificar-release.mjs`
 * (`tsc --noEmit`, y el tsconfig incluye `src`), no solo cuando corren los tests.
 */
describe('lo que publica useVisualViewport (el contrato de los dos caminos)', () => {
  it('solo el inset y el modo: nadie puede leer un scale/soportado que el camino vk nunca midió', () => {
    expectTypeOf(useVisualViewport).returns.toEqualTypeOf<{ kbInset: number; modo: ModoTeclado }>();
  });
});
