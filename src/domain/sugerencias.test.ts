import { describe, expect, it } from 'vitest';
import { item, sugerencia } from '../../tests/helpers/fabrica';
import { SEMILLA_SUGERENCIAS, autocompletar, loDeSiempre, registrarUso } from './sugerencias';

const sugs = [
  sugerencia('Leche', 5, 100),
  sugerencia('Yerba', 5, 200),
  sugerencia('Pan', 3, 300),
  sugerencia('Huevos', 3, null),
  sugerencia('Yogur', 3, 300),
  sugerencia('Azúcar', 0, null),
  sugerencia('Aceite', 0, null),
];

describe('loDeSiempre', () => {
  it('ordena por veces desc, ultimaVez desc (null al final), texto asc', () => {
    expect(loDeSiempre(sugs, [], 10).map(s => s.texto)).toEqual(['Yerba', 'Leche', 'Pan', 'Yogur', 'Huevos', 'Aceite', 'Azúcar']);
  });
  it('excluye lo que ya está pendiente (por canónico: plural/tildes)', () => {
    const items = [item('leches'), item('YOGUR'), item('Pan', { estado: 'comprado' })];
    expect(loDeSiempre(sugs, items, 10).map(s => s.texto)).toEqual(['Yerba', 'Pan', 'Huevos', 'Aceite', 'Azúcar']);
  });
  it('corta en n', () => {
    expect(loDeSiempre(sugs, [], 2).map(s => s.texto)).toEqual(['Yerba', 'Leche']);
    expect(loDeSiempre(sugs, [], 0)).toEqual([]);
  });
  it('la semilla (veces 0) queda al final', () => {
    const semilla = SEMILLA_SUGERENCIAS.map(t => sugerencia(t, 0, null));
    const con = [...semilla, sugerencia('Cerveza', 1, 1)];
    const r = loDeSiempre(con, [], con.length);
    expect(r[0]!.texto).toBe('Cerveza');
    expect(r.slice(1).every(s => s.veces === 0)).toBe(true);
  });
  it('no muta la entrada', () => {
    const copia = sugs.map(s => ({ ...s }));
    loDeSiempre(sugs, [], 3);
    expect(sugs).toEqual(copia);
  });
});

describe('autocompletar', () => {
  it.each<[string]>([[''], ['y'], [' y '], ['!'], ['ñ']])('%j (menos de 2 letras) → []', (q) => {
    expect(autocompletar(q, sugs, [], 5)).toEqual([]);
  });
  it('coincide por prefijo de palabra y respeta el orden de loDeSiempre', () => {
    expect(autocompletar('ye', sugs, [], 5).map(s => s.texto)).toEqual(['Yerba']);
    expect(autocompletar('yo', sugs, [], 5).map(s => s.texto)).toEqual(['Yogur']);
    expect(autocompletar('a', sugs, [], 5)).toEqual([]);
    expect(autocompletar('ac', sugs, [], 5).map(s => s.texto)).toEqual(['Aceite']);
    expect(autocompletar('azu', sugs, [], 5).map(s => s.texto)).toEqual(['Azúcar']);
  });
  it('prefijo por palabra (no solo la primera)', () => {
    const s = [sugerencia('Dulce de leche', 2, 1), sugerencia('Leche', 1, 1)];
    expect(autocompletar('lec', s, [], 5).map(x => x.texto)).toEqual(['Dulce de leche', 'Leche']);
  });
  it('excluye lo que ya está pendiente', () => {
    expect(autocompletar('le', sugs, [item('Leche')], 5)).toEqual([]);
  });
  it('máximo n', () => {
    const muchas = ['Pan', 'Papas', 'Papel', 'Palta', 'Paleta'].map((t, i) => sugerencia(t, 5 - i, 1));
    expect(autocompletar('pa', muchas, [], 3).map(s => s.texto)).toEqual(['Pan', 'Papas', 'Papel']);
  });
});

describe('registrarUso', () => {
  it('suma veces y actualiza texto y ultimaVez si ya existe (por textoNorm)', () => {
    const r = registrarUso(sugs, '  LECHE ', 999);
    const l = r.find(s => s.textoNorm === 'leche')!;
    expect(l).toEqual({ texto: 'LECHE', textoNorm: 'leche', veces: 6, ultimaVez: 999 });
    expect(r.length).toBe(sugs.length);
  });
  it('agrega si no existe (veces 1)', () => {
    const r = registrarUso(sugs, 'Fideos', 5);
    expect(r.length).toBe(sugs.length + 1);
    expect(r[r.length - 1]).toEqual({ texto: 'Fideos', textoNorm: 'fideos', veces: 1, ultimaVez: 5 });
  });
  it('ignora textos vacíos', () => {
    expect(registrarUso(sugs, '   ', 5)).toBe(sugs);
    expect(registrarUso(sugs, '!!', 5)).toBe(sugs);
  });
  it('no muta la entrada', () => {
    const copia = sugs.map(s => ({ ...s }));
    registrarUso(sugs, 'Leche', 1);
    registrarUso(sugs, 'Nuevo', 1);
    expect(sugs).toEqual(copia);
  });
});
