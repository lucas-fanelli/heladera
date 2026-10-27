import { describe, expect, it } from 'vitest';
import { aterrizajes, hayVuelos, idsEnBolsillo, modoSalida } from './bolsillo';

const filas = (...ids: string[]) => ids.map(id => ({ item: { id } }));

describe('idsEnBolsillo', () => {
  it('con Comprados cerrado, todos los comprados están en el bolsillo', () => {
    expect([...idsEnBolsillo(filas('a', 'b'), false)]).toEqual(['a', 'b']);
  });
  it('con Comprados abierto (o bajo filtro, que los muestra), el bolsillo está vacío', () => {
    expect(idsEnBolsillo(filas('a', 'b'), true).size).toBe(0);
  });
});

describe('hayVuelos', () => {
  it('sin filtro ahora ni antes: hay vuelos', () => { expect(hayVuelos(false, false)).toBe(true); });
  it('con filtro activo: escribir es liviano, no hay vuelos', () => { expect(hayVuelos(true, false)).toBe(false); });
  it('recién apagado el filtro (agregar, ✕): tampoco, es un reset, no un movimiento', () => { expect(hayVuelos(false, true)).toBe(false); });
  it('con reduced motion tampoco', () => { expect(hayVuelos(false, false, true)).toBe(false); });
});

describe('aterrizajes (cuántas filas llegan volando al rótulo en este render)', () => {
  const set = (...ids: string[]) => new Set(ids);
  it('las que se veían como pendientes y ahora están en el bolsillo (tildar con Comprados cerrado; que otro compre)', () => {
    expect(aterrizajes(set('a', 'b', 'c'), set('a', 'x'), true, 5, 40)).toBe(1);
    expect(aterrizajes(set('a', 'b', 'c'), set('a', 'b'), true, 5, 40)).toBe(2);
  });
  it('un comprado que aparece de la nada (deshacer vaciar, restaurar, snapshot) no cuenta: nada voló', () => {
    expect(aterrizajes(set('a'), set('x', 'y'), true, 5, 40)).toBe(0);
  });
  it('sin vuelos (filtro, reduced motion) o con más filas que el cap: 0', () => {
    expect(aterrizajes(set('a'), set('a'), false, 5, 40)).toBe(0);
    expect(aterrizajes(set('a'), set('a'), true, 41, 40)).toBe(0);
  });
});

describe('modoSalida', () => {
  const custom = (motivo: 'normal' | 'vaciar', enBolsillo: string[]) => ({ motivo, enBolsillo: (id: string) => enBolsillo.includes(id) });

  it('si el ítem quedó comprado y oculto, vuela al bolsillo (aunque el motivo general sea vaciar: cerrar Comprados)', () => {
    expect(modoSalida('a', custom('normal', ['a']), false)).toBe('bolsillo');
    expect(modoSalida('a', custom('vaciar', ['a']), false)).toBe('bolsillo');
  });
  it('si no está en el bolsillo (borrado, vaciado, filtrado, pendiente que se va), sale con el motivo general', () => {
    expect(modoSalida('a', custom('normal', []), false)).toBe('normal');
    expect(modoSalida('a', custom('vaciar', []), false)).toBe('vaciar');
  });
  it('con reduced motion nunca vuela: fundido', () => {
    expect(modoSalida('a', custom('normal', ['a']), true)).toBe('normal');
    expect(modoSalida('a', custom('vaciar', ['a']), true)).toBe('vaciar');
  });
  it('sin custom (fuera de una AnimatePresence): normal', () => {
    expect(modoSalida('a', undefined, false)).toBe('normal');
  });
});
