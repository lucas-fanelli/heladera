import { describe, expect, it } from 'vitest';
import { AUTOSCROLL, GLOBITO, hayQueMover, ladoDelGlobito, seccionEnPunto, SECCION_SIN_MERCADO, velocidadAutoScroll } from './arrastre';

describe('ladoDelGlobito', () => {
  it('va arriba del dedo cuando hay lugar', () => {
    expect(ladoDelGlobito(500)).toBe('arriba');
    expect(ladoDelGlobito(GLOBITO.elevacion + GLOBITO.alto)).toBe('arriba');
  });

  it('se da vuelta cerca del borde de arriba (donde justo se auto-scrollea) para no quedar fuera de pantalla', () => {
    expect(ladoDelGlobito(GLOBITO.elevacion + GLOBITO.alto - 1)).toBe('abajo');
    expect(ladoDelGlobito(0)).toBe('abajo');
  });
});

describe('velocidadAutoScroll', () => {
  const caja = { top: 100, bottom: 700 };

  it('en el medio no scrollea', () => {
    expect(velocidadAutoScroll(400, caja)).toBe(0);
  });

  it('cerca del borde de arriba sube, cerca del de abajo baja', () => {
    expect(velocidadAutoScroll(caja.top + 10, caja)).toBeLessThan(0);
    expect(velocidadAutoScroll(caja.bottom - 10, caja)).toBeGreaterThan(0);
  });

  it('acelera a medida que te acercás al borde, hasta el máximo', () => {
    const lejos = Math.abs(velocidadAutoScroll(caja.top + AUTOSCROLL.zona - 5, caja));
    const cerca = Math.abs(velocidadAutoScroll(caja.top + 5, caja));
    expect(cerca).toBeGreaterThan(lejos);
    expect(Math.abs(velocidadAutoScroll(caja.top - 50, caja))).toBe(AUTOSCROLL.velocidadMax);
  });

  it('en un contenedor más chico que las dos zonas no scrollea (se pisarían)', () => {
    expect(velocidadAutoScroll(50, { top: 0, bottom: AUTOSCROLL.zona })).toBe(0);
  });
});

describe('seccionEnPunto', () => {
  /** un elemento falso con closest() como el del DOM */
  const elemento = (seccion: string | null): Element => ({
    closest: (sel: string) => (sel === '[data-seccion]' && seccion !== null ? { getAttribute: () => seccion } : null),
  } as unknown as Element);

  it('devuelve el id del súper de la sección que hay debajo', () => {
    expect(seccionEnPunto(0, 0, () => elemento('x-merca'))).toBe('x-merca');
  });

  it('la sección sin súper es null (no undefined): soltar ahí saca el súper', () => {
    expect(seccionEnPunto(0, 0, () => elemento(SECCION_SIN_MERCADO))).toBeNull();
  });

  it('afuera de la lista es undefined: soltar ahí no hace nada', () => {
    expect(seccionEnPunto(0, 0, () => null)).toBeUndefined();
    expect(seccionEnPunto(0, 0, () => elemento(null))).toBeUndefined();
  });
});

describe('hayQueMover', () => {
  it('afuera de la lista, no', () => {
    expect(hayQueMover(undefined, 'x-merca')).toBe(false);
  });
  it('sobre su propia sección, no (no se toca el Db al azar)', () => {
    expect(hayQueMover('x-merca', 'x-merca')).toBe(false);
    expect(hayQueMover(null, null)).toBe(false);
    expect(hayQueMover(null, undefined)).toBe(false);
  });
  it('sobre otra sección, sí; y sacarle el súper también cuenta', () => {
    expect(hayQueMover('x-verdu', 'x-merca')).toBe(true);
    expect(hayQueMover('x-verdu', null)).toBe(true);
    expect(hayQueMover(null, 'x-merca')).toBe(true);
  });
});
