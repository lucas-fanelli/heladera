import { describe, expect, it } from 'vitest';
import { coincide, levenshtein1, segmentosResaltados } from './coincide';
import { normalizar } from './normalizar';

const n = normalizar;

describe('coincide', () => {
  it.each<[string, string, boolean]>([
    ['yog', 'yogur de frutilla', true],          // prefijo
    ['yogures', 'yogur', true],                  // plural simple
    ['yogur', 'yogures', true],
    ['yogurt', 'yogur', true],                   // un error de tipeo, ≥ 5 letras
    ['yogurr', 'yogur', true],
    ['le po', 'leche en polvo', true],           // varias palabras, cualquier orden
    ['po le', 'leche en polvo', true],
    ['le pa', 'leche en polvo', false],          // "pa" no es prefijo de ninguna palabra (ni llega al fuzzy)
    ['yog', 'leche', false],
    ['', 'cualquier cosa', true],                // vacío ⇒ todo
    ['   ', 'cualquier cosa', true],
    ['lech', 'leche', true],
    ['leche', 'leche', true],
    ['LECHE', 'leche', true],
    ['azucar', 'azucar rubia', true],
    ['Azúcar', 'azucar', true],
    // decisión documentada: 5 letras a distancia 1 se aceptan como error de tipeo (misma regla que "yogurt")
    ['lechu', 'leche', true],
    ['lechug', 'leche', false],                  // 6 vs 5: dos ediciones (sustituir + borrar)
    ['leche', 'lechuga', true],                  // no es prefijo ("lechu"), pero a una edición del prefijo de 5
    ['lechuga', 'leche', false],                 // 7 vs 5: dos ediciones
    ['pap', 'papel de cocina', true],
    ['papas', 'papel de cocina', false],         // "papa" no es prefijo de "papel"; 4 letras: sin fuzzy
    ['abc', 'abd', false],                       // 3 letras: sin tolerancia
    ['1.5', 'coca 1.5 l', true],
    ['palo', 'yerba c/palo', true],
    ['x', '', false],                            // ítem sin palabras nunca coincide con consulta no vacía
  ])('%j ⇒ %j → %s', (consulta, textoNorm, esperado) => {
    expect(coincide(consulta, n(textoNorm))).toBe(esperado);
  });
});

describe('levenshtein1', () => {
  it.each<[string, string, boolean]>([
    ['yogur', 'yogur', true],
    ['yogurt', 'yogur', true],       // borrado
    ['yogur', 'yogurt', true],       // inserción
    ['yogur', 'yogar', true],        // sustitución
    ['yogur', 'yagar', false],       // dos sustituciones
    ['leche', 'lechuga', true],      // 5 vs 7: se compara contra el prefijo "lechu" (una sustitución) → prefijo con un error
    ['lecha', 'lechuga', true],      // prefijo con un error
    ['lechuga', 'leche', false],     // al revés no: 7 vs 5 son dos borrados
    ['abc', 'xyz', false],
    ['abcd', 'abc', true],
  ])('%j ~ %j → %s', (a, b, esperado) => {
    expect(levenshtein1(a, b)).toBe(esperado);
  });
});

describe('segmentosResaltados', () => {
  it('sin consulta devuelve el texto entero sin marcar', () => {
    expect(segmentosResaltados('', 'Leche')).toEqual([['Leche', false]]);
    expect(segmentosResaltados('  ', 'Leche')).toEqual([['Leche', false]]);
  });

  it('marca solo el prefijo coincidente de cada palabra', () => {
    expect(segmentosResaltados('yog', 'Yogur de frutilla')).toEqual([
      ['Yog', true], ['ur', false], [' ', false], ['de', false], [' ', false], ['frutilla', false],
    ]);
  });

  it('respeta mayúsculas y tildes del texto original', () => {
    expect(segmentosResaltados('azu', 'Azúcar')).toEqual([['Azú', true], ['car', false]]);
    expect(segmentosResaltados('LECHE', 'leche')).toEqual([['leche', true]]);
  });

  it('con varias palabras marca cada prefijo', () => {
    expect(segmentosResaltados('le po', 'Leche en polvo')).toEqual([
      ['Le', true], ['che', false], [' ', false], ['en', false], [' ', false], ['po', true], ['lvo', false],
    ]);
  });

  it('con plural marca la palabra entera', () => {
    expect(segmentosResaltados('yogures', 'Yogur')).toEqual([['Yogur', true]]);
  });

  it('conserva la puntuación y espacios entre palabras', () => {
    expect(segmentosResaltados('c', 'Yerba c/palo')).toEqual([
      ['Yerba', false], [' ', false], ['c', true], ['/', false], ['palo', false],
    ]);
  });

  it('el texto se reconstruye entero al concatenar los segmentos', () => {
    for (const [q, t] of [['yog', 'Yogur de frutilla'], ['le po', 'Leche en polvo'], ['zzz', 'Pan (lactal) 1.5 kg'], ['', 'x']]) {
      expect(segmentosResaltados(q!, t!).map(s => s[0]).join('')).toBe(t);
    }
  });
});
