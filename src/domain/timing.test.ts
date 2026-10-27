import { afterEach, describe, expect, it } from 'vitest';
import { resetTiming, setTiming, tiemposDeLaUrl, timing } from './timing';

afterEach(() => resetTiming());

describe('tiemposDeLaUrl', () => {
  it('lee ?hold y ?unhold en ms', () => {
    expect(tiemposDeLaUrl('?hold=600')).toEqual({ HOLD_MS: 600 });
    expect(tiemposDeLaUrl('?fps&hold=0&unhold=120')).toEqual({ HOLD_MS: 0, UNHOLD_MS: 120 });
  });

  it('ignora lo que no es un tiempo razonable, y sin parámetros no pide nada', () => {
    expect(tiemposDeLaUrl('')).toEqual({});
    expect(tiemposDeLaUrl('?motion=0.75')).toEqual({});
    expect(tiemposDeLaUrl('?hold=rapido')).toEqual({});
    expect(tiemposDeLaUrl('?hold=-1')).toEqual({});
    expect(tiemposDeLaUrl('?hold=99999')).toEqual({});
  });

  it('lo que pide la URL manda sobre el valor de diseño', () => {
    expect(timing().HOLD_MS).toBe(300);      // el de BASE, calibrado en el teléfono (D21)
    setTiming(tiemposDeLaUrl('?hold=650'));
    expect(timing().HOLD_MS).toBe(650);
    expect(timing().UNHOLD_MS).toBe(250);    // lo que no se pide no se toca
  });
});
