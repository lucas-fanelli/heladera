import { describe, expect, it } from 'vitest';
import { canonico, claveSegura, mismoItem, normalizar, palabras, singular } from './normalizar';

const ENYE_NFD = 'n' + String.fromCodePoint(0x0303);   // n + virgulilla combinante
const ENYE_NFC = 'ñ';

describe('normalizar', () => {
  it.each<[string, string]>([
    ['Leche', 'leche'],
    ['  LECHE   entera ', 'leche entera'],
    ['Azúcar', 'azucar'],
    ['Ñoquis', 'ñoquis'],
    ['ÑOQUIS', 'ñoquis'],
    ['Coca 1.5 L', 'coca 1.5 l'],
    ['Yerba c/palo', 'yerba c/palo'],
    ['Pan, manteca', 'pan, manteca'],
    ['Queso-crema', 'queso-crema'],
    ['   ', ''],
    ['', ''],
    ['🍎 Manzanas!!', 'manzanas'],
    ['¡Huevos! (12)', 'huevos 12'],
    ['Pingüino', 'pinguino'],
    ['Café éÉ', 'cafe ee'],
    ['tab\tnueva\nlínea', 'tab nueva linea'],
  ])('%j → %j', (entrada, esperado) => {
    expect(normalizar(entrada)).toBe(esperado);
  });

  it('es idempotente', () => {
    for (const s of ['Leche', '  Azúcar   Rubia ', 'Ñoquis 🍝', 'Coca 1.5 L', 'yerba c/palo']) {
      const una = normalizar(s);
      expect(normalizar(una)).toBe(una);
    }
  });

  it('NFC y NFD del mismo texto dan lo mismo (ñ precompuesta y n+virgulilla)', () => {
    expect(normalizar(ENYE_NFC + 'oquis')).toBe('ñoquis');
    expect(normalizar(ENYE_NFD + 'oquis')).toBe('ñoquis');
    expect(normalizar('Azúcar'.normalize('NFD'))).toBe(normalizar('Azúcar'.normalize('NFC')));
    expect(normalizar('Ñandú'.normalize('NFD'))).toBe(normalizar('Ñandú'.normalize('NFC')));
    // el resultado siempre lleva la ñ precompuesta
    expect(normalizar(ENYE_NFD)).toBe(ENYE_NFC);
  });
});

describe('palabras', () => {
  it.each<[string, string[]]>([
    ['leche entera', ['leche', 'entera']],
    ['yerba c/palo', ['yerba', 'c', 'palo']],
    ['pan, manteca', ['pan', 'manteca']],
    ['', []],
    ['coca 1.5 l', ['coca', '1.5', 'l']],
  ])('%j → %j', (entrada, esperado) => {
    expect(palabras(entrada)).toEqual(esperado);
  });
});

describe('singular', () => {
  it.each<[string, string]>([
    ['papas', 'papa'],
    ['huevos', 'huevo'],
    ['yogures', 'yogur'],
    ['panes', 'pan'],
    ['luces', 'luz'],
    ['nueces', 'nuez'],
    ['limones', 'limon'],
    ['jamones', 'jamon'],
    ['tomates', 'tomate'],
    ['milanesas', 'milanesa'],
    ['pan', 'pan'],
    ['yogur', 'yogur'],
    ['leche', 'leche'],
    ['mes', 'mes'],
    ['gas', 'gas'],
    ['tres', 'tres'],
    ['sal', 'sal'],
    ['té', 'té'],
    ['1.5', '1.5'],
  ])('%j → %j', (entrada, esperado) => {
    expect(singular(entrada)).toBe(esperado);
  });
});

describe('canonico', () => {
  it.each<[string, string]>([
    ['Yogures', 'yogur'],
    ['  Huevos   de campo ', 'huevo de campo'],
    ['Papas!!', 'papa'],
    ['', ''],
  ])('%j → %j', (entrada, esperado) => {
    expect(canonico(entrada)).toBe(esperado);
  });
});

describe('mismoItem', () => {
  it.each<[string, string, boolean]>([
    ['Yogur', 'yogures ', true],
    ['Yogur', 'YOGUR', true],
    ['Azúcar', 'azucar', true],
    ['Papas', 'papa', true],
    ['Yogur', 'Yogur de frutilla', false],
    ['Leche', 'Lechuga', false],
    ['', '', false],
    ['   ', '  ', false],
    ['🍎', '🍎', false],
  ])('%j vs %j → %s', (a, b, esperado) => {
    expect(mismoItem(a, b)).toBe(esperado);
    expect(mismoItem(b, a)).toBe(esperado);
  });
});

describe('claveSegura', () => {
  it.each<[string, string]>([
    ['coca 1.5 l', 'coca 1_5 l'],
    ['yerba c/palo', 'yerba c_palo'],
    ['a~b*c[d]e', 'a_b_c_d_e'],
    ['leche', 'leche'],
    ['', '_'],
  ])('%j → %j', (entrada, esperado) => {
    expect(claveSegura(entrada)).toBe(esperado);
  });

  it('nunca empieza ni termina con __ ni contiene caracteres prohibidos', () => {
    for (const s of ['__leche', 'leche__', '__', '.__.', '~~x', 'a/b/c', '[x]', '*']) {
      const k = claveSegura(s);
      expect(k).not.toMatch(/^__/);
      expect(k).not.toMatch(/__$/);
      expect(k).not.toMatch(/[.~*/[\]]/);
      expect(k.length).toBeGreaterThan(0);
    }
  });

  it('es determinista', () => {
    expect(claveSegura('coca 1.5 l')).toBe(claveSegura('coca 1.5 l'));
  });
});
