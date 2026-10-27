import { describe, expect, it } from 'vitest';
import { cajaDeLayout, deltaHacia, vueloEntre } from './vuelo';

const caja = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe('deltaHacia', () => {
  it('traslada de centro a centro (la fila ancha cae sobre el rótulo chico)', () => {
    // fila: 0..320 × 100..156 (centro 160,128) → rótulo: 40..140 × 500..524 (centro 90,512)
    expect(deltaHacia(caja(0, 100, 320, 56), caja(40, 500, 100, 24))).toEqual({ x: -70, y: 384 });
  });
  it('es antisimétrica: la vuelta es el negativo de la ida', () => {
    const a = caja(0, 100, 320, 56), b = caja(40, 500, 100, 24);
    const ida = deltaHacia(a, b), vuelta = deltaHacia(b, a);
    expect(vuelta).toEqual({ x: -ida.x, y: -ida.y });
  });
  it('cero si ya están superpuestos', () => {
    expect(deltaHacia(caja(10, 10, 20, 20), caja(10, 10, 20, 20))).toEqual({ x: 0, y: 0 });
  });
});

describe('vueloEntre', () => {
  const el = (r: ReturnType<typeof caja>) => ({ getBoundingClientRect: () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height }) }) as unknown as Element;

  it('mide en el momento (viewport): el scroll no importa', () => {
    expect(vueloEntre(el(caja(0, 100, 320, 56)), el(caja(40, 500, 100, 24)))).toEqual({ x: -70, y: 384 });
  });
  it('el origen se mide por su caja de LAYOUT (offset*), no por la visual: un transform en curso no corre el destino', () => {
    // la fila se ve 40 px más abajo (translateY en curso) pero su layout está en top 100 dentro de una <ul> en top 0
    const ul = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 600 }), clientLeft: 0, clientTop: 0 };
    const fila = { getBoundingClientRect: () => ({ left: 0, top: 140, width: 320, height: 56 }), offsetParent: ul, offsetLeft: 0, offsetTop: 100, offsetWidth: 320, offsetHeight: 56 } as unknown as Element;
    expect(cajaDeLayout(fila)).toEqual({ left: 0, top: 100, width: 320, height: 56 });
    expect(vueloEntre(fila, el(caja(40, 500, 100, 24)))).toEqual({ x: -70, y: 384 });
  });
  it('null si falta el origen o el destino', () => {
    expect(vueloEntre(null, el(caja(0, 0, 10, 10)))).toBeNull();
    expect(vueloEntre(el(caja(0, 0, 10, 10)), undefined)).toBeNull();
  });
  it('null si el destino no tiene tamaño (todavía no se pintó, o ya no está)', () => {
    expect(vueloEntre(el(caja(0, 0, 320, 56)), el(caja(0, 0, 0, 0)))).toBeNull();
  });
});
