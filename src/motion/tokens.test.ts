import { afterEach, describe, expect, it } from 'vitest';
import { escalaDeLaUrl, progresoBezier, tiempoParaProgreso, vuelo, ease, staggerExit } from './tokens';

afterEach(() => { delete (globalThis as { window?: unknown }).window; });

describe('escalaDeLaUrl', () => {
  it('lee ?motion y acepta de 0 a 3', () => {
    expect(escalaDeLaUrl('?motion=0.6')).toBe(0.6);
    expect(escalaDeLaUrl('?fps&motion=0')).toBe(0);
    expect(escalaDeLaUrl('?motion=2')).toBe(2);
  });
  it('sin el parámetro, o con un valor raro, no toca nada', () => {
    expect(escalaDeLaUrl('')).toBeNull();
    expect(escalaDeLaUrl('?fps')).toBeNull();
    expect(escalaDeLaUrl('?motion=rapido')).toBeNull();
    expect(escalaDeLaUrl('?motion=-1')).toBeNull();
    expect(escalaDeLaUrl('?motion=99')).toBeNull();
  });
});

describe('progresoBezier / tiempoParaProgreso', () => {
  it('linear y extremos', () => {
    expect(progresoBezier([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 3);
    expect(progresoBezier(ease.in, 0)).toBeCloseTo(0, 3);
    expect(progresoBezier(ease.in, 1)).toBeCloseTo(1, 3);
  });
  it('ease-in va lento al principio y rápido al final', () => {
    expect(progresoBezier(ease.in, 0.5)).toBeLessThan(0.5);
    expect(progresoBezier(ease.out, 0.5)).toBeGreaterThan(0.5);
  });
  it('la inversa: el tiempo en que se alcanza un progreso', () => {
    const t = tiempoParaProgreso(vuelo.ease, 0.75);
    expect(progresoBezier(vuelo.ease, t)).toBeCloseTo(0.75, 2);
    expect(t).toBeGreaterThan(0.75);   // la curva de succión es asimétrica: el 75 % del camino llega después del 75 % del tiempo
  });
});

describe('vuelo', () => {
  it('la curva anticipa (retrocede un toque) y después acelera hasta el final', () => {
    expect(progresoBezier(vuelo.ease, 0.15)).toBeLessThan(0);
    expect(progresoBezier(vuelo.ease, 0.5)).toBeLessThan(0.25);
    expect(progresoBezier(vuelo.ease, 0.9)).toBeGreaterThan(0.7);
  });
  it('desvanecerDesde es una fracción del TIEMPO derivada del punto del camino, dentro del vuelo', () => {
    expect(vuelo.desvanecerDesde).toBeGreaterThan(0.5);
    expect(vuelo.desvanecerDesde).toBeLessThan(1);
    expect(progresoBezier(vuelo.ease, vuelo.desvanecerDesde)).toBeCloseTo(vuelo.desvanecerDesdeCamino, 2);
  });
  it('el stagger del bolsillo tiene tope, como el de vaciar, y escala con MOTION_SCALE', () => {
    expect(vuelo.stagger(3)).toBeCloseTo(0.057, 5);
    expect(vuelo.stagger(30)).toBe(vuelo.stagger(10));
    expect(staggerExit(30)).toBe(staggerExit(10));
    (globalThis as { window?: unknown }).window = { __MOTION_SCALE__: 0 };
    expect(vuelo.stagger(3)).toBe(0);
    expect(vuelo.dur).toBe(0);
  });
});
