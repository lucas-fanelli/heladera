import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearDbFake, type FakeDb } from './fake';
import type { DbError, Vista, Yo } from './types';
import { SEMILLA_SUGERENCIAS } from '@/domain/sugerencias';

const YO: Yo = { memberId: 'm-mama', nombre: 'Mamá' };
const PAPA = { memberId: 'm-papa', nombre: 'Papá' };
const tick = () => new Promise<void>(r => setTimeout(r, 0));
const micro = () => Promise.resolve();

/** Suscribe y devuelve un getter de la última vista y el conteo de llamadas. */
function espiar(db: FakeDb, listId: string) {
  const cb = vi.fn<(v: Vista) => void>();
  const off = db.suscribir(listId, cb);
  return { cb, off, ultima: () => cb.mock.calls.at(-1)?.[0] as Vista, veces: () => cb.mock.calls.length };
}

describe('crearDbFake · crearLista', () => {
  it('devuelve un id de 20 chars y la vista tiene miembros con colores distintos y la semilla de sugerencias', async () => {
    const db = crearDbFake({ semilla: 'vacio' });
    const id = await db.crearLista('  Casa de la abuela ', ['Mamá', ' Papá ', '', 'Ana', 'Abuela']);
    expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    const e = db.estado(id)!;
    expect(e.lista.nombre).toBe('Casa de la abuela');
    expect(e.miembros.map(m => m.nombre)).toEqual(['Mamá', 'Papá', 'Ana', 'Abuela']);
    expect(new Set(e.miembros.map(m => m.color)).size).toBe(4);
    expect(e.miembros.map(m => m.color)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(e.items).toEqual([]);
    expect(e.sugerencias.map(s => s.texto)).toEqual(SEMILLA_SUGERENCIAS);
    expect(e.sugerencias.every(s => s.veces === 0 && s.ultimaVez === null)).toBe(true);
    const { ultima } = espiar(db, id);
    await micro();
    expect(ultima().existe).toBe(true);
    expect(ultima().lista?.id).toBe(id);
    expect(ultima().fromCache).toBe(false);
    expect(ultima().hasPendingWrites).toBe(false);
  });
  it('nombre vacío → "Casa"', async () => {
    const db = crearDbFake();
    const id = await db.crearLista('   ', []);
    expect(db.estado(id)!.lista.nombre).toBe('Casa');
  });
});

describe('la cuenta (D23)', () => {
  it('arranca anónima; guardarla la deja guardada con un email, y el uid no cambia', async () => {
    const db = crearDbFake({ semilla: 'vacio' });
    const uid = db.miUid();
    expect(await db.miCuenta()).toEqual({ estado: 'anonima' });
    await db.guardarCuenta();
    const c = await db.miCuenta();
    expect(c.estado).toBe('guardada');
    expect(c.estado === 'guardada' && c.email).toBeTruthy();
    expect(db.miUid()).toBe(uid);          // guardar NO cambia la identidad: eso es toda la gracia
  });

  it('entrar con la cuenta también la deja guardada (el cambio de identidad real recarga la app: acá no se simula)', async () => {
    const db = crearDbFake({ semilla: 'vacio' });
    await db.entrarConCuenta();
    expect((await db.miCuenta()).estado).toBe('guardada');
  });

  it('el estado inicial se puede inyectar, y el canje de un choque entra con ESA cuenta (conserva su email)', async () => {
    const db = crearDbFake({ semilla: 'vacio', cuenta: { estado: 'choque', email: 'a@b.com' } });
    expect(await db.miCuenta()).toEqual({ estado: 'choque', email: 'a@b.com' });
    await db.entrarConCuenta();
    expect(await db.miCuenta()).toEqual({ estado: 'guardada', email: 'a@b.com' });
  });
});

describe('semilla demo', () => {
  it('tiene 6 pendientes, 3 comprados, 3 miembros y listaDemoId() no es null', () => {
    const db = crearDbFake({ semilla: 'demo' });
    const id = db.listaDemoId();
    expect(id).not.toBeNull();
    const e = db.estado(id!)!;
    expect(e.items.filter(i => i.estado === 'pendiente')).toHaveLength(6);
    expect(e.items.filter(i => i.estado === 'comprado')).toHaveLength(3);
    expect(e.miembros).toHaveLength(3);
    expect(e.items.every(i => !i.pendiente && i.agregadoEn !== null)).toBe(true);
    expect(e.sugerencias.some(s => s.veces > 0)).toBe(true);
  });
  it('sin semilla o "vacio" → listaDemoId() null y la vista de un id desconocido no existe', async () => {
    const db = crearDbFake({ semilla: 'vacio' });
    expect(db.listaDemoId()).toBeNull();
    const { ultima } = espiar(db, 'no-existe');
    await micro();
    expect(ultima().existe).toBe(false);
    expect(ultima().lista).toBeNull();
    expect(ultima().items).toEqual([]);
  });
  it('acepta un demoListId fijo y un estado inicial explícito', () => {
    const db = crearDbFake({ semilla: 'demo', demoListId: 'fijo123' });
    expect(db.listaDemoId()).toBe('fijo123');
    const base = db.estado('fijo123')!;
    const db2 = crearDbFake({ semilla: { listas: { otra: base } } });
    expect(db2.estado('otra')!.items).toHaveLength(base.items.length);
    expect(db2.listaDemoId()).toBeNull();
  });
});

describe('suscribir', () => {
  it('llama al toque (microtarea) con la caché y en cada cambio; desuscribir corta', async () => {
    const db = crearDbFake({ semilla: 'demo' });
    const id = db.listaDemoId()!;
    const { cb, off, veces } = espiar(db, id);
    expect(veces()).toBe(0);
    await micro();
    expect(veces()).toBe(1);
    expect(cb.mock.calls[0]![0].items).toHaveLength(9);
    db.agregarItem(id, 'Fideos', YO);
    expect(veces()).toBe(2);           // sincrónico: la caché local cambió
    await tick();
    expect(veces()).toBe(3);           // confirmación del "servidor"
    off();
    db.agregarItem(id, 'Arroz', YO);
    await tick();
    expect(veces()).toBe(3);
  });
  it('desuscribirse antes de la microtarea evita la primera llamada', async () => {
    const db = crearDbFake({ semilla: 'demo' });
    const cb = vi.fn();
    db.suscribir(db.listaDemoId()!, cb)();
    await micro();
    expect(cb).not.toHaveBeenCalled();
  });
  it('cada suscriptor recibe una copia (mutar la vista no afecta al Db)', async () => {
    const db = crearDbFake({ semilla: 'demo' });
    const id = db.listaDemoId()!;
    const { ultima } = espiar(db, id);
    await micro();
    ultima().items[0]!.texto = 'HACKEADO';
    ultima().miembros[0]!.nombre = 'HACKEADO';
    expect(db.estado(id)!.items[0]!.texto).not.toBe('HACKEADO');
    expect(db.estado(id)!.miembros[0]!.nombre).not.toBe('HACKEADO');
  });
});

describe('agregarItem', () => {
  let db: FakeDb; let id: string;
  beforeEach(() => { db = crearDbFake({ semilla: 'demo' }); id = db.listaDemoId()!; });

  it('devuelve id sync; aparece pendiente:true y agregadoEn null; tras un tick queda confirmado', async () => {
    const { ultima } = espiar(db, id);
    await micro();
    const nuevo = db.agregarItem(id, '  Fideos   moñito ', YO);
    expect(nuevo).toMatch(/^[A-Za-z0-9]{20}$/);
    const it0 = ultima().items.find(i => i.id === nuevo)!;
    expect(it0).toMatchObject({ texto: 'Fideos moñito', textoNorm: 'fideos moñito', estado: 'pendiente', pendiente: true, agregadoEn: null, agregadoPor: 'm-mama', agregadoPorNombre: 'Mamá' });
    expect(ultima().hasPendingWrites).toBe(true);
    expect(ultima().fromCache).toBe(false);
    expect(db.estado(id)!.items.find(i => i.id === nuevo)!.pendiente).toBe(true);
    await tick();
    const it1 = ultima().items.find(i => i.id === nuevo)!;
    expect(it1.pendiente).toBe(false);
    expect(typeof it1.agregadoEn).toBe('number');
    expect(typeof it1.actualizadoEn).toBe('number');
    expect(ultima().hasPendingWrites).toBe(false);
    expect(db.estado(id)!.items.find(i => i.id === nuevo)!.pendiente).toBe(false);
  });
  it('registra el uso en sugerencias', async () => {
    db.agregarItem(id, 'Fideos', YO);
    const s = db.estado(id)!.sugerencias.find(x => x.textoNorm === 'fideos')!;
    expect(s.veces).toBe(1);
    expect(s.texto).toBe('Fideos');
    db.agregarItem(id, 'Leche', YO);
    expect(db.estado(id)!.sugerencias.find(x => x.textoNorm === 'leche')!.veces).toBeGreaterThan(1);
  });
  it('yo anónimo firma como "alguien"', () => {
    const nuevo = db.agregarItem(id, 'Pan', { memberId: null, nombre: null });
    expect(db.estado(id)!.items.find(i => i.id === nuevo)).toMatchObject({ agregadoPor: 'alguien', agregadoPorNombre: 'alguien' });
  });
  it('en una lista inexistente emite error y no rompe', () => {
    const errores: DbError[] = [];
    db.onError(e => errores.push(e));
    const r = db.agregarItem('nada', 'Pan', YO);
    expect(typeof r).toBe('string');
    expect(errores).toHaveLength(1);
    expect(errores[0]!.operacion).toBe('agregarItem');
  });
  it('texto vacío (o solo espacios) → onError validacion con el itemId, no agrega, no notifica y devuelve el id igual (como el real)', async () => {
    const errores: DbError[] = [];
    db.onError(e => errores.push(e));
    const { ultima, veces } = espiar(db, id);
    await micro();
    const n = veces();
    const antes = db.estado(id)!.items.length;
    const r = db.agregarItem(id, '   ', YO);
    expect(r).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatchObject({ tipo: 'validacion', operacion: 'agregarItem', itemId: r });
    expect(db.estado(id)!.items).toHaveLength(antes);
    expect(db.estado(id)!.items.find(i => i.id === r)).toBeUndefined();
    expect(veces()).toBe(n);                          // nada cambió: no hay snapshot nuevo
    expect(ultima().hasPendingWrites).toBe(false);
    // la sugerencia tampoco se registra
    expect(db.estado(id)!.sugerencias.find(s => s.textoNorm === '')).toBeUndefined();
    await tick();
    expect(db.estado(id)!.items).toHaveLength(antes);
  });
  it('con latencia, la confirmación llega recién después de esos ms', async () => {
    vi.useFakeTimers();
    try {
      const dbl = crearDbFake({ semilla: 'demo', latencia: 500 });
      const lid = dbl.listaDemoId()!;
      const nuevo = dbl.agregarItem(lid, 'Pan', YO);
      const item = () => dbl.estado(lid)!.items.find(i => i.id === nuevo)!;
      await vi.advanceTimersByTimeAsync(499);
      expect(item().pendiente).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(item().pendiente).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});

describe('sin conexión', () => {
  it('agregar deja pendiente:true, fromCache:true, hasPendingWrites:true; setOnline(true) confirma todo', async () => {
    vi.useFakeTimers();
    try {
      const db = crearDbFake({ semilla: 'demo' });
      const id = db.listaDemoId()!;
      const { ultima, veces } = espiar(db, id);
      await vi.advanceTimersByTimeAsync(0);
      const antes = veces();
      db.setOnline(false);
      expect(db.estaOnline()).toBe(false);
      expect(veces()).toBe(antes + 1);
      expect(ultima().online).toBe(false);
      expect(ultima().fromCache).toBe(true);
      const a = db.agregarItem(id, 'Pan lactal', YO);
      const b = db.agregarItem(id, 'Arroz', YO);
      db.marcarComprado(id, a, true, YO);
      await vi.advanceTimersByTimeAsync(1000);
      const v = ultima();
      expect(v.items.filter(i => i.pendiente).map(i => i.id).sort()).toEqual([a, b].sort());
      expect(v.hasPendingWrites).toBe(true);
      expect(v.fromCache).toBe(true);
      expect(v.items.find(i => i.id === a)!.agregadoEn).toBeNull();
      expect(v.items.find(i => i.id === a)!.compradoEn).toBeNull();
      expect(vi.getTimerCount()).toBe(0);            // sin red no se programa ninguna confirmación

      db.setOnline(true);
      expect(ultima().online).toBe(true);
      expect(ultima().hasPendingWrites).toBe(true);   // todavía no llegó la confirmación
      await vi.advanceTimersByTimeAsync(0);
      const v2 = ultima();
      expect(v2.items.some(i => i.pendiente)).toBe(false);
      expect(v2.hasPendingWrites).toBe(false);
      expect(v2.fromCache).toBe(false);
      expect(v2.items.find(i => i.id === a)!.agregadoEn).toEqual(expect.any(Number));
      expect(v2.items.find(i => i.id === a)!.compradoEn).toEqual(expect.any(Number));
      expect(v2.ultimaSync).toEqual(expect.any(Number));
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('setOnline con el mismo valor no notifica; volver sin pendientes actualiza ultimaSync', async () => {
    const ahora = vi.fn(() => 1_000);
    const db = crearDbFake({ semilla: 'demo', ahora });
    const id = db.listaDemoId()!;
    const { veces, ultima } = espiar(db, id);
    await micro();
    const n = veces();
    db.setOnline(true);
    expect(veces()).toBe(n);
    db.setOnline(false);
    ahora.mockReturnValue(2_000);
    db.setOnline(true);
    expect(ultima().ultimaSync).toBe(2_000);
    expect(ultima().fromCache).toBe(false);
  });
  it('lo remoto no llega mientras no hay señal, y aparece al volver', async () => {
    const db = crearDbFake({ semilla: 'demo' });
    const id = db.listaDemoId()!;
    const { ultima } = espiar(db, id);
    await micro();
    db.setOnline(false);
    const r = db.remoto.agregar(id, 'Remoto', PAPA);
    expect(ultima().items.find(i => i.id === r)).toBeUndefined();
    db.setOnline(true);
    expect(ultima().items.find(i => i.id === r)).toBeDefined();
  });
});

describe('mutaciones', () => {
  let db: FakeDb; let id: string; let ultima: () => Vista;
  const byTexto = (t: string) => db.estado(id)!.items.find(i => i.texto === t)!;
  beforeEach(async () => { db = crearDbFake({ semilla: 'demo' }); id = db.listaDemoId()!; ({ ultima } = espiar(db, id)); await micro(); });

  it('marcarComprado true/false', async () => {
    const leche = byTexto('Leche');
    db.marcarComprado(id, leche.id, true, YO);
    let it = ultima().items.find(i => i.id === leche.id)!;
    expect(it).toMatchObject({ estado: 'comprado', compradoEn: null, compradoPor: 'm-mama', compradoPorNombre: 'Mamá', pendiente: true });
    await tick();
    it = ultima().items.find(i => i.id === leche.id)!;
    expect(it.pendiente).toBe(false);
    expect(it.compradoEn).toEqual(expect.any(Number));
    db.marcarComprado(id, leche.id, false, YO);
    await tick();
    it = ultima().items.find(i => i.id === leche.id)!;
    expect(it).toMatchObject({ estado: 'pendiente', compradoEn: null, compradoPor: null, compradoPorNombre: null, pendiente: false });
    expect(it.agregadoEn).toBe(leche.agregadoEn);   // no se toca lo de "agregado"
  });
  it('marcarComprado con yo anónimo firma "alguien"', () => {
    const leche = byTexto('Leche');
    db.marcarComprado(id, leche.id, true, { memberId: null, nombre: null });
    expect(byTexto('Leche')).toMatchObject({ compradoPor: 'alguien', compradoPorNombre: 'alguien' });
  });
  it('editarItem cambia texto y textoNorm; vacío se ignora', async () => {
    const leche = byTexto('Leche');
    db.editarItem(id, leche.id, '  Leche   ENTERA ', YO);
    expect(ultima().items.find(i => i.id === leche.id)).toMatchObject({ texto: 'Leche ENTERA', textoNorm: 'leche entera', pendiente: true });
    const antes = ultima();
    db.editarItem(id, leche.id, '   ', YO);
    expect(ultima()).toBe(antes);
    await tick();
    expect(ultima().items.find(i => i.id === leche.id)!.pendiente).toBe(false);
  });
  it('borrarItem lo saca de la vista (borrado lógico) y restaurarItem lo devuelve al estado previo', async () => {
    const leche = byTexto('Leche');
    const pan = byTexto('Pan');
    db.borrarItem(id, leche.id);
    db.borrarItem(id, pan.id);
    expect(ultima().items.find(i => i.id === leche.id)).toBeUndefined();
    expect(byTexto('Leche').estado).toBe('borrado');
    await tick();
    expect(byTexto('Leche').borradoEn).toEqual(expect.any(Number));
    db.restaurarItem(id, leche.id, 'pendiente', YO);
    db.restaurarItem(id, pan.id, 'comprado', YO);
    await tick();
    expect(ultima().items.find(i => i.id === leche.id)).toMatchObject({ estado: 'pendiente', borradoEn: null, pendiente: false });
    expect(ultima().items.find(i => i.id === pan.id)).toMatchObject({ estado: 'comprado', borradoEn: null });
  });
  it('operar sobre un id inexistente no hace nada ni notifica', () => {
    const n = ultima();
    db.marcarComprado(id, 'nada', true, YO);
    db.editarItem(id, 'nada', 'x', YO);
    db.borrarItem(id, 'nada');
    db.restaurarItem(id, 'nada', 'pendiente', YO);
    db.renombrarMiembro(id, 'nada', 'x');
    db.renombrarMiembro('lista-nada', 'm-mama', 'x');
    expect(ultima()).toBe(n);
  });
  it('vaciarComprados borra los 3 comprados y deshacer los devuelve como comprados', async () => {
    const { ids, deshacer } = db.vaciarComprados(id);
    expect(ids).toHaveLength(3);
    expect(ultima().items.filter(i => i.estado === 'comprado')).toHaveLength(0);
    expect(ultima().items).toHaveLength(6);
    expect(ultima().hasPendingWrites).toBe(true);
    await tick();
    expect(ultima().hasPendingWrites).toBe(false);
    deshacer();
    expect(ultima().items.filter(i => i.estado === 'comprado').map(i => i.id).sort()).toEqual([...ids].sort());
    await tick();
    expect(ultima().hasPendingWrites).toBe(false);
  });
  it('vaciarComprados con 0 comprados devuelve ids [] y no notifica ni emite error', async () => {
    const errores: DbError[] = [];
    db.onError(e => errores.push(e));
    db.vaciarComprados(id);
    await tick();
    const antes = ultima();
    const r = db.vaciarComprados(id);
    expect(r.ids).toEqual([]);
    expect(() => r.deshacer()).not.toThrow();
    expect(ultima()).toBe(antes);
    expect(errores).toEqual([]);
    expect(db.vaciarComprados('lista-nada').ids).toEqual([]);
  });
});

describe('miembros', () => {
  let db: FakeDb; let id: string;
  beforeEach(() => { db = crearDbFake({ semilla: 'demo' }); id = db.listaDemoId()!; });

  it('elegirMiembro por memberId devuelve ese miembro', async () => {
    const m = await db.elegirMiembro(id, { memberId: 'm-papa' });
    expect(m).toMatchObject({ id: 'm-papa', nombre: 'Papá', color: 'p3' });
  });
  it('por nombre repetido ("mamá", "MAMA") devuelve el existente y no crea otro', async () => {
    const a = await db.elegirMiembro(id, { nombre: 'mamá' });
    const b = await db.elegirMiembro(id, { nombre: '  MAMA ' });
    expect(a.id).toBe('m-mama');
    expect(b.id).toBe('m-mama');
    expect(db.estado(id)!.miembros).toHaveLength(3);
  });
  it('por nombre nuevo crea con el siguiente color y aparece en la vista', async () => {
    const { ultima } = espiar(db, id);
    await micro();
    const m = await db.elegirMiembro(id, { nombre: '  Abuela   Rosa ' });
    expect(m.nombre).toBe('Abuela Rosa');
    expect(m.color).toBe('p4');
    expect(m.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(m.creadoEn).toEqual(expect.any(Number));
    expect(ultima().miembros.map(x => x.id)).toContain(m.id);
    const otra = await db.elegirMiembro(id, { nombre: 'Tío' });
    expect(otra.color).toBe('p1');   // el quinto vuelve a p1
    expect(db.estado(id)!.miembros).toHaveLength(5);
  });
  it('memberId desconocido + nombre → cae al nombre', async () => {
    const m = await db.elegirMiembro(id, { memberId: 'nadie', nombre: 'papá' });
    expect(m.id).toBe('m-papa');
  });
  it('sin nombre ni memberId válido → rechaza; lista inexistente → rechaza', async () => {
    await expect(db.elegirMiembro(id, {})).rejects.toThrow();
    await expect(db.elegirMiembro(id, { nombre: '   ' })).rejects.toThrow();
    await expect(db.elegirMiembro('nada', { nombre: 'x' })).rejects.toThrow();
  });
  it('renombrarMiembro cambia el nombre y notifica; vacío se ignora', async () => {
    const { ultima } = espiar(db, id);
    await micro();
    db.renombrarMiembro(id, 'm-mama', '  Mami ');
    expect(ultima().miembros.find(m => m.id === 'm-mama')!.nombre).toBe('Mami');
    db.renombrarMiembro(id, 'm-mama', '   ');
    expect(ultima().miembros.find(m => m.id === 'm-mama')!.nombre).toBe('Mami');
    await tick();
  });
});

describe('remoto (otro familiar)', () => {
  let db: FakeDb; let id: string; let ultima: () => Vista;
  beforeEach(async () => { db = crearDbFake({ semilla: 'demo' }); id = db.listaDemoId()!; ({ ultima } = espiar(db, id)); await micro(); });

  it('agregar aparece sin pendiente y con agregadoEn, firmado por quien lo mandó, y registra sugerencia', () => {
    const r = db.remoto.agregar(id, ' Fideos ', PAPA);
    const it = ultima().items.find(i => i.id === r)!;
    expect(it).toMatchObject({ texto: 'Fideos', textoNorm: 'fideos', estado: 'pendiente', pendiente: false, agregadoPor: 'm-papa', agregadoPorNombre: 'Papá' });
    expect(it.agregadoEn).toEqual(expect.any(Number));
    expect(ultima().hasPendingWrites).toBe(false);
    expect(db.estado(id)!.sugerencias.find(s => s.textoNorm === 'fideos')!.veces).toBe(1);
  });
  it('marcarComprado / borrar / editar remotos llegan confirmados', () => {
    const leche = ultima().items.find(i => i.texto === 'Leche')!;
    db.remoto.marcarComprado(id, leche.id, true, PAPA);
    let it = ultima().items.find(i => i.id === leche.id)!;
    expect(it).toMatchObject({ estado: 'comprado', compradoPor: 'm-papa', compradoPorNombre: 'Papá', pendiente: false });
    expect(it.compradoEn).toEqual(expect.any(Number));
    db.remoto.marcarComprado(id, leche.id, false, PAPA);
    it = ultima().items.find(i => i.id === leche.id)!;
    expect(it).toMatchObject({ estado: 'pendiente', compradoEn: null, compradoPor: null });
    db.remoto.editar(id, leche.id, ' Leche descremada ');
    it = ultima().items.find(i => i.id === leche.id)!;
    expect(it).toMatchObject({ texto: 'Leche descremada', textoNorm: 'leche descremada' });
    db.remoto.borrar(id, leche.id);
    expect(ultima().items.find(i => i.id === leche.id)).toBeUndefined();
    expect(db.estado(id)!.items.find(i => i.id === leche.id)!.borradoEn).toEqual(expect.any(Number));
  });
  it('lista inexistente → agregar lanza; ids inexistentes se ignoran', () => {
    expect(() => db.remoto.agregar('nada', 'x', PAPA)).toThrow();
    const antes = ultima();
    db.remoto.marcarComprado(id, 'nada', true, PAPA);
    db.remoto.borrar(id, 'nada');
    db.remoto.editar(id, 'nada', 'x');
    expect(ultima()).toBe(antes);
  });
});

describe('errores', () => {
  it('fallarProxima dispara onError con la operación y no muta; la siguiente sí funciona', async () => {
    const db = crearDbFake({ semilla: 'demo' });
    const id = db.listaDemoId()!;
    const errores: DbError[] = [];
    const off = db.onError(e => errores.push(e));
    const { ultima } = espiar(db, id);
    await micro();
    const antes = db.estado(id)!.items.length;
    db.fallarProxima({ tipo: 'permiso', mensaje: 'no' });
    const nuevo = db.agregarItem(id, 'Fideos', YO);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatchObject({ tipo: 'permiso', operacion: 'agregarItem', mensaje: 'no' });
    expect(db.estado(id)!.items).toHaveLength(antes);
    expect(ultima().items.find(i => i.id === nuevo)).toBeUndefined();
    expect(ultima().hasPendingWrites).toBe(false);
    db.agregarItem(id, 'Fideos', YO);
    expect(errores).toHaveLength(1);
    expect(db.estado(id)!.items).toHaveLength(antes + 1);
    off();
    db.fallarProxima({});
    db.borrarItem(id, db.estado(id)!.items[0]!.id);
    expect(errores).toHaveLength(1);
    await tick();
  });
  it('el error de una operación con itemId lleva el itemId si se pasa', () => {
    const db = crearDbFake({ semilla: 'demo' });
    const id = db.listaDemoId()!;
    const errores: DbError[] = [];
    db.onError(e => errores.push(e));
    const leche = db.estado(id)!.items[0]!;
    db.fallarProxima({ tipo: 'red', itemId: leche.id });
    db.marcarComprado(id, leche.id, true, YO);
    expect(errores[0]).toMatchObject({ tipo: 'red', operacion: 'marcarComprado', itemId: leche.id });
    expect(db.estado(id)!.items[0]!.estado).toBe('pendiente');
  });
});

describe('exportar', () => {
  it('devuelve lista/items/miembros/sugerencias (incluye borrados) y fecha; null si no existe', async () => {
    const db = crearDbFake({ semilla: 'demo', ahora: () => 1_700_000_000_000 });
    const id = db.listaDemoId()!;
    db.borrarItem(id, db.estado(id)!.items[0]!.id);
    const r = await db.exportar(id) as { exportadoEn: string; lista: { id: string }; items: unknown[]; miembros: unknown[]; sugerencias: unknown[] };
    expect(r.lista.id).toBe(id);
    expect(r.items).toHaveLength(9);
    expect(r.miembros).toHaveLength(3);
    expect(r.sugerencias.length).toBeGreaterThan(0);
    expect(r.exportadoEn).toBe(new Date(1_700_000_000_000).toISOString());
    expect(await db.exportar('nada')).toBeNull();
    await tick();
  });
});

describe('timers', () => {
  afterEach(() => vi.useRealTimers());
  it('no quedan timers colgados después de confirmar', async () => {
    vi.useFakeTimers();
    const db = crearDbFake({ semilla: 'demo' });
    const id = db.listaDemoId()!;
    db.agregarItem(id, 'a', YO);
    db.agregarItem(id, 'b', YO);
    db.marcarComprado(id, db.estado(id)!.items[0]!.id, true, YO);
    expect(vi.getTimerCount()).toBe(3);
    await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
    expect(db.estado(id)!.items.some(i => i.pendiente)).toBe(false);
  });
});
