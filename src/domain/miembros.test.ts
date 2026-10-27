import { describe, expect, it } from 'vitest';
import { miembro } from '../../tests/helpers/fabrica';
import { COLORES_PERSONA, buscarPorNombre, siguienteColor, textoParaCompartir, validarNombre } from './miembros';

describe('siguienteColor', () => {
  it('rota p1..p4 por orden de llegada', () => {
    const ms: ReturnType<typeof miembro>[] = [];
    const colores: string[] = [];
    for (let i = 0; i < 4; i++) {
      const c = siguienteColor(ms);
      colores.push(c);
      ms.push(miembro(`m${i}`, `N${i}`, c));
    }
    expect(colores).toEqual(['p1', 'p2', 'p3', 'p4']);
    // el quinto vuelve a empezar
    expect(siguienteColor(ms)).toBe('p1');
  });
  it('elige el menos usado; en empate, el primero en orden', () => {
    expect(siguienteColor([miembro('a', 'A', 'p1'), miembro('b', 'B', 'p2'), miembro('c', 'C', 'p4')])).toBe('p3');
    expect(siguienteColor([miembro('a', 'A', 'p1'), miembro('b', 'B', 'p1'), miembro('c', 'C', 'p2')])).toBe('p3');
    expect(siguienteColor([miembro('a', 'A', 'p2'), miembro('b', 'B', 'p3'), miembro('c', 'C', 'p4'), miembro('d', 'D', 'p1'), miembro('e', 'E', 'p3')])).toBe('p1');
  });
  it('sin miembros → p1; devuelve siempre un color válido', () => {
    expect(siguienteColor([])).toBe('p1');
    expect(COLORES_PERSONA).toContain(siguienteColor([miembro('a', 'A', 'p3')]));
  });
});

describe('buscarPorNombre', () => {
  const ms = [miembro('m-mama', 'Mamá'), miembro('m-papa', 'Papá'), miembro('m-ana', 'Ana')];
  it.each<[string, string | undefined]>([
    ['mamá', 'm-mama'],
    ['MAMA', 'm-mama'],
    ['  mama  ', 'm-mama'],
    ['papa', 'm-papa'],
    ['ana', 'm-ana'],
    ['an', undefined],
    ['abuela', undefined],
    ['', undefined],
    ['   ', undefined],
  ])('%j → %j', (nombre, id) => {
    expect(buscarPorNombre(ms, nombre)?.id).toBe(id);
  });
});

describe('validarNombre', () => {
  it.each<[string, ReturnType<typeof validarNombre>]>([
    ['Mamá', { ok: true, nombre: 'Mamá' }],
    ['  Tía   Rosa  ', { ok: true, nombre: 'Tía Rosa' }],
    ['', { ok: false, motivo: 'vacio' }],
    ['    ', { ok: false, motivo: 'vacio' }],
    ['\n\t', { ok: false, motivo: 'vacio' }],
    ['abcdefghijk', { ok: false, motivo: 'largo' }],
    ['abcdefghij', { ok: true, nombre: 'abcdefghij' }],
    ['  abcdefghij  ', { ok: true, nombre: 'abcdefghij' }],   // los espacios no cuentan para el largo
  ])('%j → %j', (nombre, esperado) => {
    expect(validarNombre(nombre, 10)).toEqual(esperado);
  });
});

describe('textoParaCompartir', () => {
  const t = { titulo: (n: string, c: number) => `Lista de ${n} (${c}):`, pie: '— pie', seccion: (n: string) => `——— ${n} ———` };
  const MERCA = { id: 'x-merca', nombre: 'Mercadona', creadoEn: 1 };
  const CARRE = { id: 'x-carre', nombre: 'Carrefour', creadoEn: 2 };

  it('formatea título, líneas "· x" y pie', () => {
    expect(textoParaCompartir('Casa', [{ texto: 'Leche' }, { texto: 'Pan' }], t)).toBe('Lista de Casa (2):\n· Leche\n· Pan\n\n— pie');
  });
  it('lista vacía → título con 0 y pie', () => {
    expect(textoParaCompartir('Casa', [], t)).toBe('Lista de Casa (0):\n\n— pie');
  });
  it('con súper: lo suelto primero y sin título, cada súper con su separador y una línea en blanco antes', () => {
    const pendientes = [
      { texto: 'Leche' },
      { texto: 'Azúcar', mercado: 'x-merca' },
      { texto: 'Detergente' },
      { texto: 'Café', mercado: 'x-merca' },
      { texto: 'Pilas', mercado: 'x-carre' },
    ];
    expect(textoParaCompartir('casa', pendientes, t, [MERCA, CARRE])).toBe(
      ['Lista de casa (5):', '· Leche', '· Detergente', '', '——— Mercadona ———', '· Azúcar', '· Café', '', '——— Carrefour ———', '· Pilas', '', '— pie'].join('\n'),
    );
  });
  it('si todo es del mismo súper no pone ningún separador (no hay nada que agrupar)', () => {
    const pendientes = [{ texto: 'Azúcar', mercado: 'x-merca' }, { texto: 'Café', mercado: 'x-merca' }];
    expect(textoParaCompartir('Casa', pendientes, t, [MERCA])).toBe('Lista de Casa (2):\n· Azúcar\n· Café\n\n— pie');
  });
  it('un súper que ya no está se manda como si no tuviera ninguno', () => {
    expect(textoParaCompartir('Casa', [{ texto: 'Sal', mercado: 'x-fantasma' }], t, [MERCA])).toBe('Lista de Casa (1):\n· Sal\n\n— pie');
  });
});
