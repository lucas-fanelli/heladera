/**
 * (7) "Reducir movimiento": sin Fase A. Va en su propio archivo porque Motion cachea la media query
 * `(prefers-reduced-motion)` una sola vez por proceso (useReducedMotion lee ese singleton): el mock de
 * matchMedia tiene que estar puesto ANTES del primer render con el hook, y no se puede cambiar después.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearDbFake, type FakeDb } from '@/db/fake';
import { timing } from '@/domain/timing';
import { textos } from '@/ui/textos';
import { useLista } from './useLista';

const PAPA = { memberId: 'm-papa', nombre: 'Papá' };
const REDUCIDO = ['(prefers-reduced-motion)', '(prefers-reduced-motion: reduce)'];

let db: FakeDb;
let listId: string;

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const avanzar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  // prefers-reduced-motion: reduce (tiene que estar antes del primer useReducedMotion del proceso)
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: REDUCIDO.includes(q), media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  window.__MOTION_SCALE__ = 0;
  db = crearDbFake({ semilla: 'demo' });
  listId = db.listaDemoId()!;
});
afterEach(() => { vi.useRealTimers(); });

describe('useLista · reduced motion (7)', () => {
  it('tildar baja al toque: sin espera, sin tachado arriba, y el Db queda comprado', async () => {
    const { result } = renderHook(() => useLista(db, listId));
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.toggle(leche.id));
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeUndefined();
    const fila = result.current.comprados.find(f => f.item.id === leche.id)!;
    expect(fila).toBeDefined();
    expect(fila.enEspera).toBe(false);
    expect(fila.tachado).toBe(true);
    expect(db.estado(listId)!.items.find(i => i.id === leche.id)!.estado).toBe('comprado');
    // contadores también al toque
    expect(result.current.faltan).toBe(5);
    expect(result.current.vaciar.cantidad).toBe(4);
    // toggle de nuevo = toggle normal (no hay "destocar antes de bajar"): sube al instante
    act(() => result.current.toggle(leche.id));
    expect(result.current.pendientes.find(f => f.item.id === leche.id)!.enEspera).toBe(false);
    expect(result.current.comprados.find(f => f.item.id === leche.id)).toBeUndefined();
    await avanzar(timing().HOLD_MS + timing().UNHOLD_MS);
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeDefined();
  });
  it('destildar sube al toque y "volver" por Enter también (con toast, sin scroll)', async () => {
    const { result } = renderHook(() => useLista(db, listId));
    await flush();
    const pan = result.current.comprados.find(f => f.item.texto === 'Pan')!.item;
    act(() => result.current.toggle(pan.id));
    expect(result.current.comprados.find(f => f.item.id === pan.id)).toBeUndefined();
    expect(result.current.pendientes.find(f => f.item.id === pan.id)!.enEspera).toBe(false);
    act(() => result.current.setConsulta('yogur natural'));
    act(() => result.current.enviar());
    const y = result.current.pendientes.find(f => f.item.texto === 'Yogur natural')!;
    expect(y).toBeDefined();
    expect(y.enEspera).toBe(false);
    expect(y.resaltada).toBe(true);
    expect(result.current.scrollA).toBeNull();
    expect(result.current.toast?.texto).toBe(textos.toasts.volvi('Yogur natural'));
    await avanzar(0);
  });
  it('lo que compra OTRO también baja al toque', async () => {
    const { result } = renderHook(() => useLista(db, listId));
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => db.remoto.marcarComprado(listId, leche.id, true, PAPA));
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeUndefined();
    const fila = result.current.comprados.find(f => f.item.id === leche.id)!;
    expect(fila).toBeDefined();
    expect(fila.enEspera).toBe(false);
  });
});
