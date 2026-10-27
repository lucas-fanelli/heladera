import { describe, expect, it } from 'vitest';
import { comprado, item } from '../../tests/helpers/fabrica';
import { duplicadosParaBorrar } from './dedupe';

describe('duplicadosParaBorrar', () => {
  it('sin duplicados → []', () => {
    expect(duplicadosParaBorrar([item('Leche'), item('Pan'), item('Yogur de frutilla'), item('Yogur natural')])).toEqual([]);
    expect(duplicadosParaBorrar([])).toEqual([]);
  });

  it('dos confirmados con el mismo canónico → 1 duplicado; gana el más viejo', () => {
    const viejo = item('Leche', { id: 'zzz', agregadoEn: 100 });
    const nuevo = item('leches ', { id: 'aaa', agregadoEn: 200 });
    const d = duplicadosParaBorrar([nuevo, viejo]);
    expect(d).toEqual([{ ganador: viejo, perdedor: nuevo, heredaMercado: null }]);
  });

  it('empate en agregadoEn → gana el id menor', () => {
    const a = item('Pan', { id: 'a', agregadoEn: 100 });
    const b = item('Pan', { id: 'b', agregadoEn: 100 });
    expect(duplicadosParaBorrar([b, a])).toEqual([{ ganador: a, perdedor: b, heredaMercado: null }]);
  });

  it('el resultado es el mismo sin importar el orden de entrada (determinista)', () => {
    const a = item('Pan', { id: 'a', agregadoEn: 100 });
    const b = item('Pan', { id: 'b', agregadoEn: 50 });
    const c = item('Pan', { id: 'c', agregadoEn: 100 });
    const r1 = duplicadosParaBorrar([a, b, c]);
    const r2 = duplicadosParaBorrar([c, a, b]);
    expect(r1).toEqual(r2);
    expect(r1.map(d => d.perdedor.id)).toEqual(['a', 'c']);
  });

  it('3 iguales → 2 perdedores con el mismo ganador', () => {
    const g = item('Huevos', { id: 'g', agregadoEn: 1 });
    const p1 = item('huevo', { id: 'p1', agregadoEn: 2 });
    const p2 = item('HUEVOS', { id: 'p2', agregadoEn: 3 });
    const d = duplicadosParaBorrar([p2, g, p1]);
    expect(d.map(x => x.ganador.id)).toEqual(['g', 'g']);
    expect(d.map(x => x.perdedor.id)).toEqual(['p1', 'p2']);
  });

  it('ignora escrituras pendientes, agregadoEn null y borrados', () => {
    const base = item('Leche', { id: 'base', agregadoEn: 100 });
    expect(duplicadosParaBorrar([base, item('Leche', { id: 'p', pendiente: true, agregadoEn: 200 })])).toEqual([]);
    expect(duplicadosParaBorrar([base, item('Leche', { id: 'n', agregadoEn: null })])).toEqual([]);
    expect(duplicadosParaBorrar([base, item('Leche', { id: 'b', estado: 'borrado', agregadoEn: 200 })])).toEqual([]);
  });

  it('pendiente y comprado con el mismo texto SÍ cuentan como duplicados (ambos activos)', () => {
    const p = item('Pan', { id: 'p', agregadoEn: 100 });
    const c = comprado('Pan', { id: 'c', agregadoEn: 200 });
    expect(duplicadosParaBorrar([p, c])).toEqual([{ ganador: p, perdedor: c, heredaMercado: null }]);
  });

  it('si el perdedor estaba ubicado y el ganador no, el ganador hereda el súper (no se tira el dato)', () => {
    const g = item('Pan', { id: 'g', agregadoEn: 100 });
    const p = item('Pan', { id: 'p', agregadoEn: 200, mercado: 'm-merca' });
    expect(duplicadosParaBorrar([p, g])[0]!.heredaMercado).toBe('m-merca');
  });

  it('si el ganador ya tiene súper, no hereda nada (aunque el perdedor tenga otro)', () => {
    const g = item('Pan', { id: 'g', agregadoEn: 100, mercado: 'm-verdu' });
    const p = item('Pan', { id: 'p', agregadoEn: 200, mercado: 'm-merca' });
    expect(duplicadosParaBorrar([p, g])[0]!.heredaMercado).toBeNull();
  });

  it('ítems con canónico vacío (solo símbolos) no se agrupan', () => {
    expect(duplicadosParaBorrar([item('!!', { id: 'a' }), item('??', { id: 'b' })])).toEqual([]);
  });

  it('grupos independientes', () => {
    const d = duplicadosParaBorrar([
      item('Pan', { id: 'p1', agregadoEn: 1 }), item('Pan', { id: 'p2', agregadoEn: 2 }),
      item('Leche', { id: 'l1', agregadoEn: 1 }), item('Leche', { id: 'l2', agregadoEn: 2 }),
    ]);
    expect(d.map(x => `${x.ganador.id}>${x.perdedor.id}`).sort()).toEqual(['l1>l2', 'p1>p2']);
  });
});
