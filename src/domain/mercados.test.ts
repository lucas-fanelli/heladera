import { describe, expect, it } from 'vitest';
import type { Item, Mercado } from '@/db/types';
import {
  agruparPorMercado, buscarMercados, hayQueAgrupar, KEY_SIN_MERCADO, mercadoDe, mercadoIdDe, mercadoLlamado,
  ordenarMercados,
} from './mercados';

const mercado = (id: string, nombre: string, creadoEn: number | null = 1000): Mercado => ({ id, nombre, creadoEn });
const MERCADONA = mercado('m-merca', 'Mercadona', 1000);
const VERDU = mercado('m-verdu', 'La Verdulería', 2000);
const CARREFOUR = mercado('m-carre', 'Carrefour', 3000);
const MERCADOS = [VERDU, MERCADONA, CARREFOUR];

const item = (id: string, mercadoId?: string | null): Item => ({
  id, texto: id, textoNorm: id, estado: 'pendiente', agregadoEn: 1, agregadoPor: 'm1', agregadoPorNombre: 'Ana',
  compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null, actualizadoEn: 1,
  ...(mercadoId === undefined ? {} : { mercado: mercadoId }), pendiente: false,
});

describe('ordenarMercados', () => {
  it('respeta el orden en que los fueron creando', () => {
    expect(ordenarMercados(MERCADOS).map(m => m.nombre)).toEqual(['Mercadona', 'La Verdulería', 'Carrefour']);
  });

  it('deja al final el que todavía no confirmó el servidor (creadoEn null) y desempata por nombre', () => {
    const nuevo = mercado('m-x', 'Aldi', null);
    const empate = mercado('m-y', 'Aldi', 1000);
    expect(ordenarMercados([nuevo, MERCADONA, empate]).map(m => m.nombre)).toEqual(['Aldi', 'Mercadona', 'Aldi']);
  });

  it('no toca el array que recibe', () => {
    const entrada = [CARREFOUR, MERCADONA];
    ordenarMercados(entrada);
    expect(entrada.map(m => m.id)).toEqual(['m-carre', 'm-merca']);
  });
});

describe('el súper de un ítem', () => {
  it('null si no tiene, si es null, o si apunta a uno que ya no está', () => {
    expect(mercadoIdDe(item('a'), MERCADOS)).toBeNull();
    expect(mercadoIdDe(item('a', null), MERCADOS)).toBeNull();
    expect(mercadoIdDe(item('a', 'm-fantasma'), MERCADOS)).toBeNull();
    expect(mercadoDe(item('a', 'm-fantasma'), MERCADOS)).toBeNull();
  });

  it('devuelve el súper cuando existe', () => {
    expect(mercadoIdDe(item('a', 'm-verdu'), MERCADOS)).toBe('m-verdu');
    expect(mercadoDe(item('a', 'm-verdu'), MERCADOS)?.nombre).toBe('La Verdulería');
  });
});

describe('mercadoLlamado', () => {
  it('compara sin tildes ni mayúsculas, para no crear el mismo súper dos veces', () => {
    expect(mercadoLlamado('  mercadona ', MERCADOS)?.id).toBe('m-merca');
    expect(mercadoLlamado('LA VERDULERIA', MERCADOS)?.id).toBe('m-verdu');
  });

  it('no encuentra nada con nombre vacío ni con uno que no está', () => {
    expect(mercadoLlamado('   ', MERCADOS)).toBeUndefined();
    expect(mercadoLlamado('Dia', MERCADOS)).toBeUndefined();
  });
});

describe('buscarMercados', () => {
  it('coincide por prefijo de palabra', () => {
    expect(buscarMercados('merc', MERCADOS).map(m => m.id)).toEqual(['m-merca']);
    expect(buscarMercados('verdu', MERCADOS).map(m => m.id)).toEqual(['m-verdu']);
  });

  it('ignora consultas cortas: con una o dos letras matchearía cualquier cosa', () => {
    expect(buscarMercados('m', MERCADOS)).toEqual([]);
    expect(buscarMercados('ca', MERCADOS)).toEqual([]);
    expect(buscarMercados('car', MERCADOS).map(m => m.id)).toEqual(['m-carre']);
  });

  it('devuelve vacío cuando lo escrito es un producto', () => {
    expect(buscarMercados('leche', MERCADOS)).toEqual([]);
  });
});

describe('agruparPorMercado', () => {
  const mercadoDeFila = (i: Item): string | null | undefined => i.mercado;

  it('pone primero y sin súper a los que no tienen, y después los súper en su orden', () => {
    const filas = [item('a', 'm-carre'), item('b'), item('c', 'm-merca'), item('d', null)];
    const secciones = agruparPorMercado(filas, mercadoDeFila, MERCADOS);
    expect(secciones.map(s => s.mercado?.nombre ?? null)).toEqual([null, 'Mercadona', 'Carrefour']);
    expect(secciones[0]!.filas.map(f => f.id)).toEqual(['b', 'd']);
    expect(secciones[0]!.key).toBe(KEY_SIN_MERCADO);
    expect(secciones[1]!.key).toBe('m-merca');
  });

  it('no deja secciones vacías', () => {
    const secciones = agruparPorMercado([item('a', 'm-verdu')], mercadoDeFila, MERCADOS);
    expect(secciones).toHaveLength(1);
    expect(secciones[0]!.mercado?.id).toBe('m-verdu');
  });

  it('cuenta como sin súper lo que apunta a un súper que ya no está', () => {
    const secciones = agruparPorMercado([item('a', 'm-fantasma')], mercadoDeFila, MERCADOS);
    expect(secciones.map(s => s.mercado)).toEqual([null]);
  });

  it('con `primero` (el súper que se está buscando) lo sube arriba de todo', () => {
    const filas = [item('a'), item('b', 'm-carre'), item('c', 'm-merca')];
    const secciones = agruparPorMercado(filas, mercadoDeFila, MERCADOS, 'm-carre');
    expect(secciones.map(s => s.mercado?.nombre ?? 'sin')).toEqual(['Carrefour', 'sin', 'Mercadona']);
  });

  it('ignora un `primero` que no existe', () => {
    const secciones = agruparPorMercado([item('a'), item('b', 'm-merca')], mercadoDeFila, MERCADOS, 'm-fantasma');
    expect(secciones.map(s => s.mercado?.nombre ?? 'sin')).toEqual(['sin', 'Mercadona']);
  });

  it('sin súper definidos deja una sola sección: la lista se ve como antes', () => {
    const secciones = agruparPorMercado([item('a'), item('b', 'm-merca')], mercadoDeFila, []);
    expect(secciones).toHaveLength(1);
    expect(hayQueAgrupar(secciones)).toBe(false);
  });

  it('solo hay que pintar títulos si quedó más de un grupo', () => {
    const unSolo = agruparPorMercado([item('a', 'm-merca'), item('b', 'm-merca')], mercadoDeFila, MERCADOS);
    expect(hayQueAgrupar(unSolo)).toBe(false);
    const dos = agruparPorMercado([item('a', 'm-merca'), item('b')], mercadoDeFila, MERCADOS);
    expect(hayQueAgrupar(dos)).toBe(true);
  });
});
