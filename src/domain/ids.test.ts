import { describe, expect, it } from 'vitest';
import { nuevoId, nuevoIdLista } from './ids';

const ALFABETO_RE = /^[A-Za-z0-9]+$/;

describe('nuevoId', () => {
  it('20 caracteres del alfabeto [A-Za-z0-9]', () => {
    for (let i = 0; i < 50; i++) {
      const id = nuevoId();
      expect(id).toHaveLength(20);
      expect(id).toMatch(ALFABETO_RE);
    }
  });
  it('respeta el largo pedido', () => {
    expect(nuevoId(8)).toHaveLength(8);
    expect(nuevoId(32)).toMatch(/^[A-Za-z0-9]{32}$/);
  });
  it('1000 ids sin repetidos', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(nuevoId());
    expect(ids.size).toBe(1000);
  });
  it('usa todo el alfabeto (no queda pegado en un rango)', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 200; i++) for (const c of nuevoId()) vistos.add(c);
    expect(vistos.size).toBeGreaterThan(40);
  });
});

describe('nuevoIdLista', () => {
  it('también 20 chars del alfabeto', () => {
    const id = nuevoIdLista();
    expect(id).toHaveLength(20);
    expect(id).toMatch(ALFABETO_RE);
  });
});
