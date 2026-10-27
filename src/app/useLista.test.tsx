import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearDbFake, type FakeDb } from '@/db/fake';
import type { Db, Vista } from '@/db/types';
import { timing } from '@/domain/timing';
import { textos } from '@/ui/textos';
import { miembro, vista } from '../../tests/helpers/fabrica';
import { useLista } from './useLista';

const PAPA = { memberId: 'm-papa', nombre: 'Papá' };

let db: FakeDb;
let listId: string;

/** Deja correr microtareas (suscripción inicial del Db falso) dentro de act. */
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const avanzar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

function montar(id = listId) {
  const r = renderHook(() => useLista(db, id));
  return r;
}

/**
 * Db "a mano" sobre el falso: la suscripción la manejamos nosotros para emitir Vistas que el falso no produce
 * (la provisional del real: `existe` optimista con `lista` null), y elegirMiembro se puede reemplazar.
 */
function dbAMano(sobre: Partial<Db> = {}) {
  let cb: ((v: Vista) => void) | null = null;
  const stub: Db = { ...db, suscribir(_id, c) { cb = c; return () => { cb = null; }; }, ...sobre };
  return { stub, emitir: (v: Vista) => { cb?.(v); } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  window.__MOTION_SCALE__ = 0;
  db = crearDbFake({ semilla: 'demo' });
  listId = db.listaDemoId()!;
});
afterEach(() => { vi.useRealTimers(); });

describe('useLista · carga', () => {
  it('(a) tras el primer snapshot cargado=true, 6 pendientes, 3 comprados y la vista completa', async () => {
    const { result } = montar();
    expect(result.current.cargado).toBe(false);
    expect(result.current.vista).toBeNull();
    expect(result.current.pendientes).toEqual([]);
    await flush();
    expect(result.current.cargado).toBe(true);
    expect(result.current.vista?.lista?.nombre).toBe('Casa');
    expect(result.current.pendientes).toHaveLength(6);
    expect(result.current.comprados).toHaveLength(3);
    expect(result.current.vacio).toBe('ninguno');
    expect(result.current.vaciar.cantidad).toBe(3);
    expect(result.current.pendientes.every(f => f.grupo === 'pendiente' && !f.tachado && !f.enEspera)).toBe(true);
    expect(result.current.comprados.every(f => f.grupo === 'comprado' && f.tachado)).toBe(true);
    // el último agregado abajo, el último comprado arriba
    expect(result.current.pendientes.at(-1)!.item.texto).toBe('Helado de dulce de leche');
    expect(result.current.comprados[0]!.item.texto).toBe('Pan');
    // se recuerda la última lista abierta
    expect(localStorage.getItem('heladera:ultimaLista')).toContain(listId);
  });
  it('lista inexistente → vacio "noExiste"', async () => {
    const { result } = montar('no-existe');
    await flush();
    expect(result.current.cargado).toBe(true);
    expect(result.current.vacio).toBe('noExiste');
  });
});

describe('useLista · input y filtro', () => {
  it('(b) setConsulta filtra y decide la acción', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.setConsulta('yog'));
    expect(result.current.consulta).toBe('yog');
    expect(result.current.filtrado.activo).toBe(true);
    expect(result.current.pendientes.map(f => f.item.texto)).toEqual(['Yogur de frutilla']);
    expect(result.current.comprados.map(f => f.item.texto)).toEqual(['Yogur natural']);
    expect(result.current.ocultos).toBe(5);
    expect(result.current.accion).toEqual({ tipo: 'agregar', texto: 'yog' });

    act(() => result.current.setConsulta('yogur de frutilla'));
    expect(result.current.accion.tipo).toBe('yaEsta');
    act(() => result.current.setConsulta('yogur natural'));
    expect(result.current.accion.tipo).toBe('volver');
    act(() => result.current.setConsulta('   '));
    expect(result.current.accion.tipo).toBe('nada');
    expect(result.current.filtrado.activo).toBe(false);
    act(() => result.current.setConsulta('zzzz'));
    expect(result.current.vacio).toBe('filtro');
  });
  it('setConsulta recorta al máximo de caracteres', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.setConsulta('a'.repeat(textos.limites.textoMax + 20)));
    expect(result.current.consulta).toHaveLength(textos.limites.textoMax);
  });
  it('(c) enviar con "Fideos" agrega: aparece pendiente nuevo, consulta "" y scrollA = id nuevo', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.setConsulta('  Fideos '));
    act(() => result.current.enviar());
    expect(result.current.consulta).toBe('');
    const nuevo = result.current.pendientes.find(f => f.item.texto === 'Fideos');
    expect(nuevo).toBeDefined();
    expect(nuevo!.item.pendiente).toBe(true);
    expect(nuevo!.resaltada).toBe(true);
    expect(result.current.scrollA).toBe(nuevo!.item.id);
    expect(result.current.pendientes).toHaveLength(7);
    expect(result.current.pendientes.at(-1)!.item.id).toBe(nuevo!.item.id);   // null al final
    expect(result.current.pendientesSync).toBe(1);
    await avanzar(0);   // confirmación del servidor
    expect(result.current.pendientesSync).toBe(0);
    expect(result.current.pendientes.at(-1)!.item.agregadoEn).toEqual(expect.any(Number));
    await avanzar(timing().HIGHLIGHT_MS);
    expect(result.current.scrollA).toBeNull();
    expect(result.current.pendientes.find(f => f.item.texto === 'Fideos')!.resaltada).toBe(false);
  });
  it('enviar con "yaEsta" no agrega y resalta el existente; con vacío no hace nada', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.setConsulta('leche'));
    act(() => result.current.enviar());
    expect(result.current.pendientes.filter(f => f.item.texto === 'Leche')).toHaveLength(1);
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!;
    expect(leche.resaltada).toBe(true);
    expect(result.current.scrollA).toBe(leche.item.id);
    expect(result.current.consulta).toBe('leche');   // "Ya está" no vacía el input
    act(() => result.current.setConsulta(''));
    act(() => result.current.enviar());
    expect(result.current.pendientes).toHaveLength(6);
  });
  it('enviar con "volver" destilda el comprado, lo espera UNHOLD_MS y muestra toast', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.setConsulta('yogur natural'));
    act(() => result.current.enviar());
    expect(result.current.consulta).toBe('');
    // sigue abajo (en espera, destachado) hasta UNHOLD_MS
    const f = result.current.comprados.find(x => x.item.texto === 'Yogur natural')!;
    expect(f).toBeDefined();
    expect(f.enEspera).toBe(true);
    expect(f.tachado).toBe(false);
    expect(f.item.estado).toBe('pendiente');
    expect(result.current.toast?.texto).toBe(textos.toasts.volvi('Yogur natural'));
    // (6) resalta pero SIN auto-scroll
    expect(f.resaltada).toBe(true);
    expect(result.current.scrollA).toBeNull();
    await avanzar(timing().UNHOLD_MS);
    expect(result.current.comprados.find(x => x.item.texto === 'Yogur natural')).toBeUndefined();
    expect(result.current.pendientes.find(x => x.item.texto === 'Yogur natural')).toBeDefined();
  });
});

describe('useLista · agregarTexto (chips) = misma semántica que Enter', () => {
  it('(4) sobre un comprado NO duplica: lo vuelve a anotar (volver) con toast y sin scroll', async () => {
    const { result } = montar();
    await flush();
    const yogur = result.current.comprados.find(f => f.item.texto === 'Yogur natural')!.item;
    act(() => result.current.agregarTexto('yogur natural'));
    expect(result.current.pendientes.filter(f => f.item.textoNorm === yogur.textoNorm)).toHaveLength(0);   // sigue abajo (espera)
    const f = result.current.comprados.find(x => x.item.id === yogur.id)!;
    expect(f.enEspera).toBe(true);
    expect(f.tachado).toBe(false);
    expect(f.item.estado).toBe('pendiente');
    expect(f.resaltada).toBe(true);
    expect(result.current.scrollA).toBeNull();
    expect(result.current.toast?.texto).toBe(textos.toasts.volvi('Yogur natural'));
    await avanzar(timing().UNHOLD_MS);
    // un solo "Yogur natural" en toda la lista, y está arriba
    expect(result.current.pendientes.filter(f => f.item.textoNorm === yogur.textoNorm)).toHaveLength(1);
    expect(result.current.comprados.filter(f => f.item.textoNorm === yogur.textoNorm)).toHaveLength(0);
    expect(db.estado(listId)!.items.filter(i => i.textoNorm === yogur.textoNorm && i.estado !== 'borrado')).toHaveLength(1);
    await avanzar(0);
    expect(db.estado(listId)!.items.filter(i => i.textoNorm === yogur.textoNorm && i.estado !== 'borrado')).toHaveLength(1);
  });
  it('(4) sobre un pendiente NO agrega: resalta el existente (yaEsta) con scroll', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.agregarTexto('LECHE'));
    expect(result.current.pendientes).toHaveLength(6);
    expect(result.current.pendientes.find(f => f.item.id === leche.id)!.resaltada).toBe(true);
    expect(result.current.scrollA).toBe(leche.id);
    expect(result.current.toast).toBeNull();
  });
  it('(4) con texto nuevo agrega y resalta con scroll; con vacío no hace nada', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.agregarTexto(' Fideos '));
    const f = result.current.pendientes.find(x => x.item.texto === 'Fideos')!;
    expect(f).toBeDefined();
    expect(f.resaltada).toBe(true);
    expect(result.current.scrollA).toBe(f.item.id);
    act(() => result.current.agregarTexto('   '));
    expect(result.current.pendientes).toHaveLength(7);
    await avanzar(0);
  });
  it('(4) como Enter, un chip deja el input limpio (lo escrito era la búsqueda): al agregar y al volver; "Ya está" no lo vacía', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.setConsulta('yo'));
    expect(result.current.filtrado.activo).toBe(true);
    act(() => result.current.agregarTexto('Yogur griego'));       // agregar → limpio
    expect(result.current.consulta).toBe('');
    act(() => result.current.setConsulta('yo'));
    act(() => result.current.agregarTexto('Yogur natural'));      // volver (estaba comprado) → limpio
    expect(result.current.consulta).toBe('');
    act(() => result.current.setConsulta('le'));
    act(() => result.current.agregarTexto('Leche'));              // ya está pendiente → se queda la búsqueda
    expect(result.current.consulta).toBe('le');
    await avanzar(timing().UNHOLD_MS);
  });
});

describe('useLista · toggle (Fase A / Fase B)', () => {
  it('(d) tildar: el Db ya lo tiene comprado pero la fila se queda arriba tachada HOLD_MS; después baja y es protagonista', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.toggle(leche.id));
    expect(db.estado(listId)!.items.find(i => i.id === leche.id)!.estado).toBe('comprado');
    let fila = result.current.pendientes.find(f => f.item.id === leche.id)!;
    expect(fila).toBeDefined();
    expect(fila.grupo).toBe('pendiente');
    expect(fila.tachado).toBe(true);
    expect(fila.enEspera).toBe(true);
    expect(fila.item.estado).toBe('comprado');
    expect(result.current.comprados.find(f => f.item.id === leche.id)).toBeUndefined();
    expect(result.current.pendientes).toHaveLength(6);

    await avanzar(0);   // confirmación del Db: sigue en espera
    expect(result.current.pendientes.find(f => f.item.id === leche.id)!.enEspera).toBe(true);

    await avanzar(timing().HOLD_MS);
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeUndefined();
    fila = result.current.comprados.find(f => f.item.id === leche.id)!;
    expect(fila.grupo).toBe('comprado');
    expect(fila.tachado).toBe(true);
    expect(fila.enEspera).toBe(false);
    expect(fila.protagonista).toBe(true);
    expect(result.current.comprados[0]!.item.id).toBe(leche.id);   // recién tildado arriba
    await avanzar(timing().PROTAGONISTA_MS);
    expect(result.current.comprados.find(f => f.item.id === leche.id)!.protagonista).toBe(false);
  });
  it('(8) la espera manda: si un remoto destilda durante el HOLD, la fila sigue ARRIBA tachada hasta que vence', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.toggle(leche.id));
    await avanzar(timing().HOLD_MS / 2);
    act(() => db.remoto.marcarComprado(listId, leche.id, false, PAPA));   // el snapshot ya la trae pendiente
    let fila = result.current.pendientes.find(f => f.item.id === leche.id)!;
    expect(fila).toBeDefined();
    expect(fila.item.estado).toBe('pendiente');
    expect(fila.grupo).toBe('pendiente');
    expect(fila.tachado).toBe(true);
    expect(fila.enEspera).toBe(true);
    expect(result.current.comprados.find(f => f.item.id === leche.id)).toBeUndefined();
    await avanzar(timing().HOLD_MS / 2);
    // vencida la espera, gana el estado real: pendiente destachada, y no baja
    fila = result.current.pendientes.find(f => f.item.id === leche.id)!;
    expect(fila.tachado).toBe(false);
    expect(fila.enEspera).toBe(false);
    expect(result.current.comprados.find(f => f.item.id === leche.id)).toBeUndefined();
  });
  it('(8) la espera manda también al destildar: si un remoto lo vuelve a tildar durante el UNHOLD, sigue ABAJO destachado', async () => {
    const { result } = montar();
    await flush();
    const pan = result.current.comprados.find(f => f.item.texto === 'Pan')!.item;
    act(() => result.current.toggle(pan.id));
    act(() => db.remoto.marcarComprado(listId, pan.id, true, PAPA));
    const fila = result.current.comprados.find(f => f.item.id === pan.id)!;
    expect(fila).toBeDefined();
    expect(fila.item.estado).toBe('comprado');
    expect(fila.tachado).toBe(false);
    expect(fila.enEspera).toBe(true);
    expect(result.current.pendientes.find(f => f.item.id === pan.id)).toBeUndefined();
    await avanzar(timing().UNHOLD_MS);
    expect(result.current.comprados.find(f => f.item.id === pan.id)!.tachado).toBe(true);
    expect(result.current.pendientes.find(f => f.item.id === pan.id)).toBeUndefined();
  });
  it('(d) toggle de nuevo dentro de la espera lo revierte en el lugar (sin tachado, pendiente en el Db)', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.toggle(leche.id));
    await avanzar(timing().HOLD_MS - 50);
    act(() => result.current.toggle(leche.id));
    const fila = result.current.pendientes.find(f => f.item.id === leche.id)!;
    expect(fila.tachado).toBe(false);
    expect(fila.enEspera).toBe(false);
    expect(db.estado(listId)!.items.find(i => i.id === leche.id)!.estado).toBe('pendiente');
    await avanzar(timing().HOLD_MS * 2);
    expect(result.current.pendientes.find(f => f.item.id === leche.id)!.tachado).toBe(false);
    expect(result.current.comprados.find(f => f.item.id === leche.id)).toBeUndefined();
  });
  it('destildar un comprado: UNHOLD_MS abajo destachado y después sube', async () => {
    const { result } = montar();
    await flush();
    const pan = result.current.comprados.find(f => f.item.texto === 'Pan')!.item;
    act(() => result.current.toggle(pan.id));
    const f = result.current.comprados.find(x => x.item.id === pan.id)!;
    expect(f.enEspera).toBe(true);
    expect(f.tachado).toBe(false);
    expect(db.estado(listId)!.items.find(i => i.id === pan.id)!.estado).toBe('pendiente');
    await avanzar(timing().UNHOLD_MS);
    expect(result.current.pendientes.find(x => x.item.id === pan.id)).toBeDefined();
    expect(result.current.comprados.find(x => x.item.id === pan.id)).toBeUndefined();
    // volver a tildar dentro de la espera lo devuelve a comprado
    act(() => result.current.toggle(pan.id));
    await avanzar(timing().UNHOLD_MS - 50);
    act(() => result.current.toggle(pan.id));
    expect(db.estado(listId)!.items.find(i => i.id === pan.id)!.estado).toBe('pendiente');
  });
  it('lo que compra OTRO también se queda tachado arriba HOLD_MS antes de bajar', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => db.remoto.marcarComprado(listId, leche.id, true, PAPA));
    const f = result.current.pendientes.find(x => x.item.id === leche.id)!;
    expect(f).toBeDefined();
    expect(f.tachado).toBe(true);
    expect(f.enEspera).toBe(true);
    await avanzar(timing().HOLD_MS);
    expect(result.current.comprados.find(x => x.item.id === leche.id)).toBeDefined();
  });
  it('toggle de un id inexistente no hace nada', async () => {
    const { result } = montar();
    await flush();
    const antes = result.current.pendientes;
    act(() => result.current.toggle('nada'));
    expect(result.current.pendientes).toBe(antes);
  });
});

describe('useLista · borrar / editar', () => {
  it('(e) borrar muestra toast con Deshacer que restaura el ítem', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.borrar(leche.id));
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeUndefined();
    expect(result.current.pendientes).toHaveLength(5);
    expect(result.current.toast?.texto).toBe(textos.toasts.borrado('Leche'));
    expect(result.current.toast?.accion?.etiqueta).toBe(textos.toasts.deshacer);
    act(() => result.current.toast!.accion!.onClick());
    expect(result.current.toast).toBeNull();
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeDefined();
    expect(result.current.pendientes.find(f => f.item.id === leche.id)!.item.estado).toBe('pendiente');
    await avanzar(0);
  });
  it('borrar un comprado y deshacer lo devuelve a comprados', async () => {
    const { result } = montar();
    await flush();
    const pan = result.current.comprados.find(f => f.item.texto === 'Pan')!.item;
    act(() => result.current.borrar(pan.id));
    expect(result.current.comprados).toHaveLength(2);
    act(() => result.current.toast!.accion!.onClick());
    expect(result.current.comprados.find(f => f.item.id === pan.id)!.item.estado).toBe('comprado');
  });
  it('el toast de borrar se cierra solo a los TOAST_MS y cerrarToast lo cierra antes', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes[0]!.item;
    act(() => result.current.borrar(leche.id));
    expect(result.current.toast).not.toBeNull();
    await avanzar(timing().TOAST_MS);
    expect(result.current.toast).toBeNull();
    act(() => result.current.borrar(result.current.pendientes[0]!.item.id));
    expect(result.current.toast).not.toBeNull();
    act(() => result.current.cerrarToast());
    expect(result.current.toast).toBeNull();
  });
  it('borrar dentro de la espera de tildado cancela la espera', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.toggle(leche.id));
    act(() => result.current.borrar(leche.id));
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeUndefined();
    await avanzar(timing().HOLD_MS);
    expect(result.current.comprados.find(f => f.item.id === leche.id)).toBeUndefined();
  });
  it('editar cambia el texto; vacío se ignora', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.editar(leche.id, '  Leche entera '));
    expect(result.current.pendientes.find(f => f.item.id === leche.id)!.item.texto).toBe('Leche entera');
    act(() => result.current.editar(leche.id, '   '));
    expect(result.current.pendientes.find(f => f.item.id === leche.id)!.item.texto).toBe('Leche entera');
    await avanzar(0);
  });
});

describe('useLista · vaciar', () => {
  it('(f) pedir → confirmando; a los CONFIRM_MS vuelve solo; cancelar también', async () => {
    const { result } = montar();
    await flush();
    expect(result.current.vaciar.confirmando).toBe(false);
    act(() => result.current.vaciar.pedir());
    expect(result.current.vaciar.confirmando).toBe(true);
    await avanzar(timing().CONFIRM_MS - 1);
    expect(result.current.vaciar.confirmando).toBe(true);
    await avanzar(1);
    expect(result.current.vaciar.confirmando).toBe(false);
    act(() => result.current.vaciar.pedir());
    act(() => result.current.vaciar.cancelar());
    expect(result.current.vaciar.confirmando).toBe(false);
  });
  it('(f) pedir + confirmar → 0 comprados y toast con Deshacer que los devuelve', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.vaciar.pedir());
    act(() => result.current.vaciar.confirmar());
    expect(result.current.vaciar.confirmando).toBe(false);
    expect(result.current.comprados).toHaveLength(0);
    expect(result.current.vaciar.cantidad).toBe(0);
    expect(result.current.vacio).toBe('ninguno');
    expect(result.current.toast?.texto).toBe(textos.toasts.vaciado(3));
    expect(result.current.toast?.accion?.etiqueta).toBe(textos.toasts.deshacer);
    act(() => result.current.toast!.accion!.onClick());
    expect(result.current.comprados).toHaveLength(3);
    expect(result.current.toast).toBeNull();
    await avanzar(0);
  });
  it('sin comprados: pedir no abre la confirmación y confirmar no muestra toast', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.vaciar.pedir());
    act(() => result.current.vaciar.confirmar());
    await avanzar(0);
    act(() => result.current.cerrarToast());
    act(() => result.current.vaciar.pedir());
    expect(result.current.vaciar.confirmando).toBe(false);
    act(() => result.current.vaciar.confirmar());
    expect(result.current.toast).toBeNull();
  });
  it('(5) vaciar NO se lleva lo que espera para bajar (el usuario lo ve arriba): lo deja pendiente y sin espera', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.toggle(leche.id));
    expect(result.current.vaciar.cantidad).toBe(3);   // por grupo visual: Leche todavía no bajó
    act(() => result.current.vaciar.pedir());
    act(() => result.current.vaciar.confirmar());
    const fila = result.current.pendientes.find(f => f.item.id === leche.id)!;
    expect(fila).toBeDefined();
    expect(fila.tachado).toBe(false);
    expect(fila.enEspera).toBe(false);
    expect(fila.item.estado).toBe('pendiente');
    expect(db.estado(listId)!.items.find(i => i.id === leche.id)!.estado).toBe('pendiente');
    expect(result.current.comprados).toHaveLength(0);
    expect(result.current.toast?.texto).toBe(textos.toasts.vaciado(3));
    await avanzar(timing().HOLD_MS);
    expect(result.current.comprados).toHaveLength(0);
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeDefined();
  });
  it('el toast de vaciar dura TOAST_VACIADO_MS', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.vaciar.pedir());
    act(() => result.current.vaciar.confirmar());
    await avanzar(timing().TOAST_MS);
    expect(result.current.toast?.texto).toBe(textos.toasts.vaciado(3));
    await avanzar(timing().TOAST_VACIADO_MS - timing().TOAST_MS);
    expect(result.current.toast).toBeNull();
  });
});

describe('useLista · contadores por grupo visual', () => {
  it('(5) faltan y vaciar.cantidad siguen a lo que se VE durante las esperas', async () => {
    const { result } = montar();
    await flush();
    expect(result.current.faltan).toBe(6);
    expect(result.current.vaciar.cantidad).toBe(3);
    // tildar: el Db ya dice comprado, pero la fila sigue arriba → los contadores no cambian hasta que baja
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.toggle(leche.id));
    expect(db.estado(listId)!.items.find(i => i.id === leche.id)!.estado).toBe('comprado');
    expect(result.current.faltan).toBe(6);
    expect(result.current.vaciar.cantidad).toBe(3);
    await avanzar(timing().HOLD_MS);
    expect(result.current.faltan).toBe(5);
    expect(result.current.vaciar.cantidad).toBe(4);
    // destildar: la fila sigue abajo destachada UNHOLD_MS → idem
    const pan = result.current.comprados.find(f => f.item.texto === 'Pan')!.item;
    act(() => result.current.toggle(pan.id));
    expect(result.current.faltan).toBe(5);
    expect(result.current.vaciar.cantidad).toBe(4);
    await avanzar(timing().UNHOLD_MS);
    expect(result.current.faltan).toBe(6);
    expect(result.current.vaciar.cantidad).toBe(3);
  });
  it('(5) sin filas en espera, faltan = pendientes reales (también bajo filtro)', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.setConsulta('yog'));
    expect(result.current.faltan).toBe(6);
    expect(result.current.pendientes).toHaveLength(1);
  });
});

describe('useLista · identidad', () => {
  it('(g) con localStorage vacío quienSosAbierto=true; elegirYo por memberId guarda y cierra', async () => {
    const { result } = montar();
    await flush();
    expect(result.current.yo).toEqual({ memberId: null, nombre: null });
    expect(result.current.quienSosAbierto).toBe(true);
    let m: Awaited<ReturnType<typeof result.current.elegirYo>> = null;
    await act(async () => { m = await result.current.elegirYo({ memberId: 'm-mama' }); });
    expect(m).toMatchObject({ id: 'm-mama', nombre: 'Mamá' });
    expect(result.current.yo).toEqual({ memberId: 'm-mama', nombre: 'Mamá' });
    expect(result.current.quienSosAbierto).toBe(false);
    expect(JSON.parse(localStorage.getItem(`heladera:yo:${listId}`)!)).toEqual({ memberId: 'm-mama', nombre: 'Mamá' });
    // lo que agrego ahora va firmado por mí
    act(() => result.current.agregarTexto('Fideos'));
    expect(result.current.pendientes.find(f => f.item.texto === 'Fideos')!.item.agregadoPor).toBe('m-mama');
    await avanzar(0);
  });
  it('con identidad guardada no pregunta', async () => {
    localStorage.setItem(`heladera:yo:${listId}`, JSON.stringify({ memberId: 'm-papa', nombre: 'Papá' }));
    const { result } = montar();
    await flush();
    expect(result.current.quienSosAbierto).toBe(false);
    expect(result.current.yo.nombre).toBe('Papá');
  });
  it('(g) cerrarQuienSos sin elegir marca descartado en sessionStorage y una acción posterior lo vuelve a abrir UNA sola vez', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.cerrarQuienSos());
    expect(result.current.quienSosAbierto).toBe(false);
    expect(sessionStorage.getItem(`heladera:quienSosDescartado:${listId}`)).toBe('1');
    act(() => result.current.agregarTexto('Fideos'));
    expect(result.current.quienSosAbierto).toBe(true);
    act(() => result.current.cerrarQuienSos());
    act(() => result.current.agregarTexto('Arroz'));
    act(() => result.current.toggle(result.current.pendientes[0]!.item.id));
    expect(result.current.quienSosAbierto).toBe(false);
    // abrir a mano siempre funciona
    act(() => result.current.abrirQuienSos());
    expect(result.current.quienSosAbierto).toBe(true);
    await avanzar(timing().HOLD_MS);
  });
  it('si ya fue descartado en esta sesión, arranca cerrado', async () => {
    sessionStorage.setItem(`heladera:quienSosDescartado:${listId}`, '1');
    const { result } = montar();
    await flush();
    expect(result.current.quienSosAbierto).toBe(false);
  });
  it('elegirYo por nombre nuevo crea el miembro y limpia el descartado', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.cerrarQuienSos());
    await act(async () => { await result.current.elegirYo({ nombre: 'Abuela' }); });
    expect(result.current.yo.nombre).toBe('Abuela');
    expect(result.current.yo.memberId).toEqual(expect.any(String));
    expect(sessionStorage.getItem(`heladera:quienSosDescartado:${listId}`)).toBeNull();
    expect(result.current.vista?.miembros.map(m => m.nombre)).toContain('Abuela');
    await avanzar(0);
  });
  it('(11) elegirYo con datos inválidos devuelve null, no cambia nada y avisa con toast', async () => {
    const { result } = montar();
    await flush();
    let m: unknown = 'x';
    await act(async () => { m = await result.current.elegirYo({}); });
    expect(m).toBeNull();
    expect(result.current.yo.memberId).toBeNull();
    expect(result.current.toast?.texto).toBe(textos.errores.desconocido);
  });
  it('(11) ¿Quién sos? no se abre sobre una lista que no existe (ni antes de cargar)', async () => {
    const { result } = montar('no-existe');
    expect(result.current.quienSosAbierto).toBe(false);
    await flush();
    expect(result.current.vacio).toBe('noExiste');
    expect(result.current.quienSosAbierto).toBe(false);
    act(() => result.current.abrirQuienSos());
    expect(result.current.quienSosAbierto).toBe(false);
  });
  it('(F5) tampoco sobre una vista provisional (existe optimista, lista null, sin miembros): se abre solo cuando la lista baja', async () => {
    const { stub, emitir } = dbAMano();
    const { result } = renderHook(() => useLista(stub, listId));
    act(() => emitir(vista({ lista: null, existe: true, fromCache: true, items: [], miembros: [] })));
    expect(result.current.cargado).toBe(true);
    expect(result.current.vacio).toBe('sinSenalSinCache');
    expect(result.current.quienSosAbierto).toBe(false);          // pedido al abrir, pero gateado
    act(() => result.current.abrirQuienSos());
    expect(result.current.quienSosAbierto).toBe(false);
    // baja la lista con sus miembros: el pedido seguía en pie → se abre
    act(() => emitir(vista({ lista: { id: listId, nombre: 'Casa', creadaEn: 1 }, miembros: [miembro('m-mama', 'Mamá')] })));
    expect(result.current.vacio).toBe('primeraVez');
    expect(result.current.quienSosAbierto).toBe(true);
    await flush();
  });
  it('(F5) si el Db rechaza elegirMiembro ("lista no disponible"), no rompe: null, sin identidad, el sheet sigue abierto y avisa con toast', async () => {
    const { stub, emitir } = dbAMano({ elegirMiembro: async () => { throw new Error('lista no disponible'); } });
    const { result } = renderHook(() => useLista(stub, listId));
    act(() => emitir(vista({ lista: { id: listId, nombre: 'Casa', creadaEn: 1 }, miembros: [miembro('m-mama', 'Mamá')] })));
    expect(result.current.quienSosAbierto).toBe(true);
    let m: unknown = 'x';
    await act(async () => { m = await result.current.elegirYo({ nombre: 'Abuela' }); });
    expect(m).toBeNull();
    expect(result.current.yo).toEqual({ memberId: null, nombre: null });
    expect(localStorage.getItem(`heladera:yo:${listId}`)).toBeNull();
    expect(result.current.quienSosAbierto).toBe(true);
    expect(result.current.toast?.texto).toBe(textos.errores.desconocido);
    await flush();
  });
  it('renombrarme cambia mi nombre en el Db y en yo; sin identidad no hace nada', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.renombrarme('Nadie'));
    expect(result.current.yo.nombre).toBeNull();
    await act(async () => { await result.current.elegirYo({ memberId: 'm-mama' }); });
    act(() => result.current.renombrarme('Mami'));
    expect(result.current.yo.nombre).toBe('Mami');
    expect(result.current.vista?.miembros.find(m => m.id === 'm-mama')?.nombre).toBe('Mami');
    expect(JSON.parse(localStorage.getItem(`heladera:yo:${listId}`)!).nombre).toBe('Mami');
    await avanzar(0);
  });
});

describe('useLista · dedupe', () => {
  it('(h) dos "Leche" remotas más la que ya está → el hook borra los perdedores y avisa con junte()', async () => {
    const { result } = montar();
    await flush();
    const original = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => { db.remoto.agregar(listId, 'Leche', PAPA); db.remoto.agregar(listId, 'leches', PAPA); });
    const leches = result.current.pendientes.filter(f => f.item.textoNorm.startsWith('leche'));
    expect(leches).toHaveLength(1);
    expect(leches[0]!.item.id).toBe(original.id);   // gana el más viejo
    expect(result.current.toast?.texto).toBe(textos.toasts.junte('Papá', 'Leche'));
    const crudo = db.estado(listId)!.items.filter(i => i.textoNorm.startsWith('leche'));
    expect(crudo.filter(i => i.estado === 'borrado')).toHaveLength(2);
    expect(crudo.find(i => i.id === original.id)!.estado).toBe('pendiente');
    await avanzar(0);
    // no vuelve a intentar borrar lo ya borrado
    expect(db.estado(listId)!.items.filter(i => i.textoNorm.startsWith('leche') && i.estado === 'borrado')).toHaveLength(2);
  });
  it('si el perdedor lo anoté yo, el toast dice "Vos"', async () => {
    localStorage.setItem(`heladera:yo:${listId}`, JSON.stringify({ memberId: 'm-mama', nombre: 'Mamá' }));
    const { result } = montar();
    await flush();
    act(() => { db.remoto.agregar(listId, 'Leche', { memberId: 'm-mama', nombre: 'Mamá' }); });
    expect(result.current.toast?.texto).toBe(textos.toasts.junte(textos.meta.vos, 'Leche'));
    await avanzar(0);
  });
  it('un ítem que YO agrego igual a uno existente no se deduplica mientras está pendiente de sync, sí al confirmarse', async () => {
    const { result } = montar();
    await flush();
    // (por el hook ya no se puede duplicar: agregarTexto resalta el existente; escribimos directo al Db, como otra pestaña)
    act(() => { db.agregarItem(listId, 'Leche', { memberId: null, nombre: null }); });
    expect(result.current.pendientes.filter(f => f.item.texto === 'Leche')).toHaveLength(2);
    await avanzar(0);
    expect(result.current.pendientes.filter(f => f.item.texto === 'Leche')).toHaveLength(1);
    expect(result.current.toast?.texto).toBe(textos.toasts.junte(textos.meta.alguien, 'Leche'));
    await avanzar(0);
  });
});

describe('useLista · conexión', () => {
  it('(i) live con demo; offline al cortar; agregar offline suma pendientesSync', async () => {
    const { result } = montar();
    await flush();
    expect(result.current.conexion).toBe('live');
    expect(result.current.pendientesSync).toBe(0);
    expect(result.current.ultimaSync).toEqual(expect.any(Number));
    act(() => db.setOnline(false));
    expect(result.current.conexion).toBe('offline');
    act(() => result.current.agregarTexto('Pan lactal'));
    expect(result.current.pendientesSync).toBe(1);
    await avanzar(1000);
    expect(result.current.pendientesSync).toBe(1);
    expect(result.current.conexion).toBe('offline');
    act(() => db.setOnline(true));
    expect(result.current.conexion).toBe('sync');   // online pero con escrituras sin confirmar
    await avanzar(0);
    expect(result.current.conexion).toBe('live');
    expect(result.current.pendientesSync).toBe(0);
  });
  it('antes del primer snapshot la conexión es "sync"', async () => {
    const { result, unmount } = montar();
    expect(result.current.conexion).toBe('sync');
    unmount();
    await flush();   // la microtarea de la suscripción no encuentra suscriptor: sin setState fuera de act
  });
});

describe('useLista · errores del Db', () => {
  it('un error con itemId muestra "No se pudo guardar «texto»"; sin itemId el mensaje del tipo', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => { db.fallarProxima({ tipo: 'red', itemId: leche.id }); result.current.toggle(leche.id); });
    expect(result.current.toast?.texto).toBe(textos.toasts.noSePudo('Leche'));
    act(() => { db.fallarProxima({ tipo: 'permiso' }); result.current.agregarTexto('Fideos'); });
    expect(result.current.toast?.texto).toBe(textos.errores.permiso);
    await avanzar(timing().HOLD_MS);
  });
  it('un error con itemId de un ítem que no está a la vista (F7: texto vacío nunca se agregó) muestra el mensaje del tipo, no «…»', async () => {
    const { result } = montar();
    await flush();
    // el hook nunca manda vacío (accionPara → nada); lo hace otra pestaña / un llamado directo al Db
    act(() => { db.agregarItem(listId, '   ', { memberId: null, nombre: null }); });
    expect(result.current.toast?.texto).toBe(textos.errores.validacion);
    expect(result.current.pendientes).toHaveLength(6);
  });
});

describe('useLista · toasts', () => {
  it('mostrarToast / pausar / reanudar', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.mostrarToast({ texto: 'Hola' }));
    expect(result.current.toast?.texto).toBe('Hola');
    act(() => result.current.pausarToast());
    await avanzar(timing().TOAST_MS * 2);
    expect(result.current.toast?.texto).toBe('Hola');   // pausado: no se cierra
    act(() => result.current.reanudarToast());
    await avanzar(timing().TOAST_MS);
    expect(result.current.toast).toBeNull();
  });
  it('un toast nuevo reemplaza al anterior', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.mostrarToast({ texto: 'Uno' }));
    act(() => result.current.mostrarToast({ texto: 'Dos' }));
    expect(result.current.toast?.texto).toBe('Dos');
  });
  it('al reanudar tras una pausa queda visible al menos TOAST_RESUME_MIN_MS', async () => {
    // el "restante" se calcula con Date.now(): acá también hay que falsear el reloj
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const { result } = montar();
    await flush();
    act(() => result.current.mostrarToast({ texto: 'Hola' }));
    await avanzar(timing().TOAST_MS - 1);
    act(() => result.current.pausarToast());
    act(() => result.current.reanudarToast());
    await avanzar(timing().TOAST_RESUME_MIN_MS - 1);
    expect(result.current.toast?.texto).toBe('Hola');
    await avanzar(1);
    expect(result.current.toast).toBeNull();
  });
});

describe('useLista · toasts · teclado (13)', () => {
  const tecla = (init: KeyboardEventInit, target: EventTarget = window) =>
    act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); });

  it('Ctrl+Z (y Cmd+Z) con un toast con acción dispara la acción (Deshacer)', async () => {
    const { result } = montar();
    await flush();
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.borrar(leche.id));
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeUndefined();
    await tecla({ key: 'z', ctrlKey: true });
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeDefined();
    expect(result.current.toast).toBeNull();
    // Cmd+Z
    act(() => result.current.borrar(leche.id));
    await tecla({ key: 'Z', metaKey: true });
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeDefined();
    expect(result.current.toast).toBeNull();
    await avanzar(0);
  });
  it('Ctrl+Z dentro de un input con texto NO dispara la acción (es el deshacer del navegador); sin texto sí', async () => {
    const { result } = montar();
    await flush();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.borrar(leche.id));
    input.value = 'algo';
    await tecla({ key: 'z', ctrlKey: true }, input);
    expect(result.current.toast).not.toBeNull();
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeUndefined();
    input.value = '';
    await tecla({ key: 'z', ctrlKey: true }, input);
    expect(result.current.toast).toBeNull();
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeDefined();
    input.remove();
    await avanzar(0);
  });
  it('sin acción, o con el toast ya cerrado, Ctrl+Z no hace nada; Tab re-arma el timer a TOAST_MS', async () => {
    const { result } = montar();
    await flush();
    act(() => result.current.mostrarToast({ texto: 'Sin acción' }));
    await tecla({ key: 'z', ctrlKey: true });
    expect(result.current.toast?.texto).toBe('Sin acción');
    // Tab con acción: el timer vuelve a TOAST_MS completo
    const leche = result.current.pendientes.find(f => f.item.texto === 'Leche')!.item;
    act(() => result.current.borrar(leche.id));
    await avanzar(timing().TOAST_MS - 1);
    await tecla({ key: 'Tab', shiftKey: true });
    await avanzar(timing().TOAST_MS - 1);
    expect(result.current.toast?.texto).toBe(textos.toasts.borrado('Leche'));
    await avanzar(1);
    expect(result.current.toast).toBeNull();
    // cerrado: el listener se fue, Ctrl+Z ya no restaura
    await tecla({ key: 'z', ctrlKey: true });
    expect(result.current.pendientes.find(f => f.item.id === leche.id)).toBeUndefined();
    await avanzar(0);
  });
});
