import { describe, expect, it } from 'vitest';
import { alturaQueSeVa, hayEntradas } from './colchon';

const alturas: Record<string, number> = { a: 56, b: 72, c: 56, nota: 30 };
const medir = (id: string) => alturas[id] ?? 0;

describe('alturaQueSeVa', () => {
  it('suma el alto de las filas que estaban y ya no están (cerrar Comprados, tildar, filtrar, vaciar)', () => {
    expect(alturaQueSeVa(['a', 'b', 'c'], new Set(['a']), medir)).toBe(128);
    expect(alturaQueSeVa(['a', 'b', 'nota', 'c'], new Set(['a', 'b', 'c']), medir)).toBe(30);
  });
  it('0 si nada se fue (entran filas, o cambia el orden)', () => {
    expect(alturaQueSeVa(['a', 'b'], new Set(['a', 'b', 'c']), medir)).toBe(0);
    expect(alturaQueSeVa(['a', 'b'], new Set(['b', 'a']), medir)).toBe(0);
  });
  it('una fila que no se pudo medir no aporta (mejor un colchón corto que uno inventado)', () => {
    expect(alturaQueSeVa(['zzz'], new Set(), medir)).toBe(0);
  });
});

describe('hayEntradas', () => {
  it('true si aparece alguna fila nueva; false si solo se van o cambia el orden', () => {
    expect(hayEntradas(new Set(['a']), ['a', 'b'])).toBe(true);
    expect(hayEntradas(new Set(['a', 'b']), ['a'])).toBe(false);
    expect(hayEntradas(new Set(['a', 'b']), ['b', 'a'])).toBe(false);
  });
});
