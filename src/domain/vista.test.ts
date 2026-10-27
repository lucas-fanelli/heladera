import { describe, expect, it } from 'vitest';
import { comprado, item, mercado, miembro, vista } from '../../tests/helpers/fabrica';
import {
  accionPara, estadoConexion, estadoVacio, filtrar, inicial, nombreDe, ordenarComprados, ordenarPendientes, pendientesDeSync, ultimaMano,
  type EstadoConexion, type EstadoVacio,
} from './vista';

const T = { vos: 'Vos', alguien: 'alguien' };

describe('ultimaMano (D19): la fila muestra al último que lo tocó', () => {
  it('sin firma, un pendiente sigue mostrando a quien lo anotó (ítems anteriores a D19)', () => {
    const it = item('Leche', { agregadoPor: 'm-ana', agregadoPorNombre: 'Ana', agregadoEn: 100 });
    expect(ultimaMano(it)).toEqual({ por: 'm-ana', nombre: 'Ana', en: 100 });
  });

  it('sin firma, un comprado muestra a quien lo compró', () => {
    const it = comprado('Leche', { agregadoPor: 'm-ana', agregadoPorNombre: 'Ana', compradoPor: 'm-mama', compradoPorNombre: 'Mamá', compradoEn: 500 });
    expect(ultimaMano(it)).toEqual({ por: 'm-mama', nombre: 'Mamá', en: 500 });
  });

  it('con firma manda la firma: si Mamá lo destildó, la fila es de Mamá aunque lo haya anotado Ana', () => {
    const it = item('Leche', {
      agregadoPor: 'm-ana', agregadoPorNombre: 'Ana', agregadoEn: 100,
      actualizadoPor: 'm-mama', actualizadoPorNombre: 'Mamá', actualizadoEn: 900,
    });
    expect(ultimaMano(it)).toEqual({ por: 'm-mama', nombre: 'Mamá', en: 900 });
  });

  it('la firma también le gana a quien lo compró (alguien lo editó después de comprarlo)', () => {
    const it = comprado('Leche', {
      compradoPor: 'm-mama', compradoPorNombre: 'Mamá', compradoEn: 500,
      actualizadoPor: 'm-papa', actualizadoPorNombre: 'Papá', actualizadoEn: 900,
    });
    expect(ultimaMano(it)).toEqual({ por: 'm-papa', nombre: 'Papá', en: 900 });
  });

  it('mientras la escritura está en vuelo la fecha puede ser null, y se muestra igual', () => {
    const it = item('Leche', { actualizadoPor: 'm-mama', actualizadoPorNombre: 'Mamá', actualizadoEn: null, pendiente: true });
    expect(ultimaMano(it)).toEqual({ por: 'm-mama', nombre: 'Mamá', en: null });
  });
});

describe('filtrar por nombre de súper (D17)', () => {
  const MERCA = mercado('x-merca', 'Mercadona');
  const VERDU = mercado('x-verdu', 'La Verdulería');
  const MERCADOS = [MERCA, VERDU];
  const items = [
    item('Fideos', { id: 'f', mercado: 'x-merca' }),
    item('Arroz', { id: 'a', mercado: 'x-merca' }),
    item('Yerba', { id: 'y', mercado: 'x-verdu' }),
    item('Detergente', { id: 'd' }),
    comprado('Pan', { id: 'p', mercado: 'x-verdu' }),
  ];

  it('escribir el nombre de un súper deja lo de ese súper Y lo que no tiene ninguno', () => {
    const f = filtrar(items, 'mercadona', MERCADOS);
    expect(f.pendientes.map(i => i.id).sort()).toEqual(['a', 'd', 'f']);
    expect(f.mercados.map(m => m.id)).toEqual(['x-merca']);
  });

  it('lo que es de OTRO súper queda afuera (es lo único que se esconde)', () => {
    const f = filtrar(items, 'mercadona', MERCADOS);
    expect(f.pendientes.some(i => i.id === 'y')).toBe(false);
    expect(f.comprados.some(i => i.id === 'p')).toBe(false);
    expect(f.ocultos).toBe(1);
  });

  it('también filtra los comprados por súper', () => {
    const f = filtrar(items, 'verdu', MERCADOS);
    expect(f.comprados.map(i => i.id)).toEqual(['p']);
    expect(f.pendientes.map(i => i.id).sort()).toEqual(['d', 'y']);
  });

  it('un producto sigue filtrando por texto: no arrastra a los sin súper', () => {
    const f = filtrar(items, 'fideos', MERCADOS);
    expect(f.pendientes.map(i => i.id)).toEqual(['f']);
    expect(f.mercados).toEqual([]);
  });

  it('sin súper definidos se comporta igual que siempre', () => {
    expect(filtrar(items, 'mercadona').pendientes).toEqual([]);
    expect(filtrar(items, 'mercadona', []).pendientes).toEqual([]);
  });

  it('un ítem que apunta a un súper que ya no está cuenta como "en cualquiera"', () => {
    const huerfano = [item('Lavandina', { id: 'l', mercado: 'x-fantasma' })];
    expect(filtrar(huerfano, 'mercadona', MERCADOS).pendientes.map(i => i.id)).toEqual(['l']);
  });
});

describe('ordenarPendientes', () => {
  it('ordena por agregadoEn asc, null al final, desempate por id; ignora lo que no es pendiente', () => {
    const items = [
      item('C', { id: 'c', agregadoEn: 300 }),
      item('nulo-b', { id: 'nb', agregadoEn: null }),
      item('A', { id: 'a', agregadoEn: 100 }),
      item('nulo-a', { id: 'na', agregadoEn: null }),
      item('B2', { id: 'b2', agregadoEn: 200 }),
      item('B1', { id: 'b1', agregadoEn: 200 }),
      comprado('X', { id: 'x', agregadoEn: 50 }),
      item('borrado', { id: 'z', estado: 'borrado', agregadoEn: 10 }),
    ];
    expect(ordenarPendientes(items).map(i => i.id)).toEqual(['a', 'b1', 'b2', 'c', 'na', 'nb']);
  });
  it('no muta el arreglo original', () => {
    const items = [item('B', { agregadoEn: 2 }), item('A', { agregadoEn: 1 })];
    const copia = [...items];
    ordenarPendientes(items);
    expect(items).toEqual(copia);
  });
});

describe('ordenarComprados', () => {
  it('ordena por compradoEn desc, null PRIMERO, desempate por id; ignora pendientes', () => {
    const items = [
      comprado('viejo', { id: 'v', compradoEn: 100 }),
      comprado('nulo-b', { id: 'nb', compradoEn: null }),
      comprado('nuevo', { id: 'n', compradoEn: 300 }),
      comprado('nulo-a', { id: 'na', compradoEn: null }),
      comprado('medio-2', { id: 'm2', compradoEn: 200 }),
      comprado('medio-1', { id: 'm1', compradoEn: 200 }),
      item('pend', { id: 'p' }),
    ];
    expect(ordenarComprados(items).map(i => i.id)).toEqual(['na', 'nb', 'n', 'm1', 'm2', 'v']);
  });
});

describe('filtrar', () => {
  const items = [
    item('Leche', { id: 'l', agregadoEn: 1 }),
    item('Yogur de frutilla', { id: 'yf', agregadoEn: 2 }),
    item('Pan', { id: 'p', agregadoEn: 3 }),
    comprado('Yogur natural', { id: 'yn', compradoEn: 10 }),
    comprado('Huevos', { id: 'h', compradoEn: 20 }),
  ];
  it('sin consulta: inactivo, todo ordenado, 0 ocultos, coincidencias = pendientes', () => {
    const f = filtrar(items, '');
    expect(f.activo).toBe(false);
    expect(f.pendientes.map(i => i.id)).toEqual(['l', 'yf', 'p']);
    expect(f.comprados.map(i => i.id)).toEqual(['h', 'yn']);
    expect(f.ocultos).toBe(0);
    expect(f.coincidencias).toBe(3);
  });
  it('consulta de solo espacios o símbolos no activa el filtro', () => {
    expect(filtrar(items, '   ').activo).toBe(false);
    expect(filtrar(items, '!!').activo).toBe(false);
  });
  it('con consulta: filtra pendientes y comprados y cuenta ocultos/coincidencias', () => {
    const f = filtrar(items, 'yog');
    expect(f.activo).toBe(true);
    expect(f.consulta).toBe('yog');
    expect(f.pendientes.map(i => i.id)).toEqual(['yf']);
    expect(f.comprados.map(i => i.id)).toEqual(['yn']);
    expect(f.ocultos).toBe(2);
    expect(f.coincidencias).toBe(1);
  });
  it('consulta sin coincidencias: todo vacío y todos los pendientes ocultos', () => {
    const f = filtrar(items, 'zapallo');
    expect(f.pendientes).toEqual([]);
    expect(f.comprados).toEqual([]);
    expect(f.ocultos).toBe(3);
    expect(f.coincidencias).toBe(0);
  });
});

describe('accionPara', () => {
  const items = [item('Leche', { id: 'l' }), item('Yogur de frutilla', { id: 'yf' }), comprado('Pan', { id: 'p' }), comprado('Huevos', { id: 'h' })];
  it.each<[string, ReturnType<typeof accionPara>['tipo']]>([
    ['', 'nada'],
    ['   ', 'nada'],
    ['!!', 'nada'],
    ['Fideos', 'agregar'],
    ['leche ', 'yaEsta'],
    ['LECHE', 'yaEsta'],
    ['yogures de frutilla', 'yaEsta'],
    ['pan', 'volver'],
    ['Huevo', 'volver'],
    ['Yogur', 'agregar'],           // no es exacto → agrega
    ['lech', 'agregar'],
  ])('%j → %s', (consulta, tipo) => {
    expect(accionPara(consulta, items).tipo).toBe(tipo);
  });
  it('agregar lleva el texto recortado', () => {
    expect(accionPara('  Fideos  ', items)).toEqual({ tipo: 'agregar', texto: 'Fideos' });
  });
  it('yaEsta / volver llevan el ítem', () => {
    expect(accionPara('leche', items)).toEqual({ tipo: 'yaEsta', item: items[0] });
    expect(accionPara('pan', items)).toEqual({ tipo: 'volver', item: items[2] });
  });
  it('si hay un pendiente y un comprado iguales, gana el pendiente', () => {
    const dos = [comprado('Pan', { id: 'pc' }), item('Pan', { id: 'pp' })];
    const a = accionPara('pan', dos);
    expect(a.tipo).toBe('yaEsta');
    if (a.tipo === 'yaEsta') expect(a.item.id).toBe('pp');
  });
});

describe('estadoConexion (tabla completa)', () => {
  it.each<[boolean, boolean, boolean, EstadoConexion]>([
    // online, fromCache, hasPendingWrites → estado
    [false, false, false, 'offline'],
    [false, false, true, 'offline'],
    [false, true, false, 'offline'],
    [false, true, true, 'offline'],
    [true, false, false, 'live'],
    [true, false, true, 'sync'],
    [true, true, false, 'sync'],
    [true, true, true, 'sync'],
  ])('online=%s fromCache=%s pendientes=%s → %s', (online, fromCache, hasPendingWrites, esperado) => {
    expect(estadoConexion({ online, fromCache, hasPendingWrites })).toBe(esperado);
  });
});

describe('estadoVacio', () => {
  const sinFiltro = (items = [] as ReturnType<typeof item>[]) => filtrar(items, '');
  it.each<[string, Parameters<typeof estadoVacio>, EstadoVacio]>([
    ['no cargado → ninguno (aunque esté vacía)', [vista(), sinFiltro(), false], 'ninguno'],
    ['no existe', [vista({ existe: false, lista: null }), sinFiltro(), true], 'noExiste'],
    ['vacía, con señal → primeraVez', [vista(), sinFiltro(), true], 'primeraVez'],
    // "sin señal ni caché" es la caché SIN el doc de la lista (lista null + fromCache), no una cuestión de online/ultimaSync
    ['la caché no tiene la lista (lista null, fromCache) → sinSenalSinCache', [vista({ lista: null, fromCache: true, online: false, ultimaSync: null }), sinFiltro(), true], 'sinSenalSinCache'],
    ['ídem aunque navigator.onLine diga true (Vista provisional sin servidor)', [vista({ lista: null, fromCache: true, online: true, ultimaSync: null }), sinFiltro(), true], 'sinSenalSinCache'],
    ['ídem con ultimaSync de esta sesión', [vista({ lista: null, fromCache: true, online: false, ultimaSync: 5 }), sinFiltro(), true], 'sinSenalSinCache'],
    // reabrir sin señal una lista vacía ya cacheada: la lista está (viene de la caché) → primeraVez, no "sin señal"
    ['vacía, sin señal pero con la lista en caché (ultimaSync null) → primeraVez', [vista({ fromCache: true, online: false, ultimaSync: null }), sinFiltro(), true], 'primeraVez'],
    ['vacía, sin señal pero con caché → primeraVez', [vista({ fromCache: true, online: false, ultimaSync: 5 }), sinFiltro(), true], 'primeraVez'],
    // lista null pero el snapshot ya vino del servidor (instante entre ítems y lista): no decimos nada
    ['lista null sin fromCache → ninguno', [vista({ lista: null, fromCache: false }), sinFiltro(), true], 'ninguno'],
    ['lista null pero con ítems en caché → se muestran, ninguno', [vista({ lista: null, fromCache: true, items: [item('Pan')] }), sinFiltro([item('Pan')]), true], 'ninguno'],
    ['todo comprado', [vista({ items: [comprado('Pan')] }), sinFiltro([comprado('Pan')]), true], 'todoComprado'],
    ['hay pendientes → ninguno', [vista({ items: [item('Pan')] }), sinFiltro([item('Pan')]), true], 'ninguno'],
    // sin permiso (D22): manda sobre todo lo demás y NO espera a `cargado`, porque si las reglas rechazan la
    // suscripción el primer snapshot no llega nunca y esperarlo sería quedarse mudo para siempre
    ['sin permiso → sinAcceso', [vista(), sinFiltro(), true, true], 'sinAcceso'],
    ['sin permiso, todavía sin cargar → sinAcceso igual', [vista(), sinFiltro(), false, true], 'sinAcceso'],
    ['sin permiso gana aunque la lista no exista', [vista({ existe: false, lista: null }), sinFiltro(), true, true], 'sinAcceso'],
  ])('%s', (_n, args, esperado) => {
    expect(estadoVacio(...args)).toBe(esperado);
  });
  it('sin la lista en caché, el filtro no tapa el "sin señal" (no hay nada que filtrar)', () => {
    const v = vista({ lista: null, fromCache: true });
    expect(estadoVacio(v, filtrar([], 'zzz'), true)).toBe('sinSenalSinCache');
  });
  it('filtro activo sin coincidencias → filtro; con alguna → ninguno', () => {
    const items = [item('Leche'), comprado('Pan')];
    const v = vista({ items });
    expect(estadoVacio(v, filtrar(items, 'zzz'), true)).toBe('filtro');
    expect(estadoVacio(v, filtrar(items, 'lec'), true)).toBe('ninguno');
    expect(estadoVacio(v, filtrar(items, 'pan'), true)).toBe('ninguno');   // coincide un comprado: no está vacío
  });
  it('filtro activo con lista totalmente comprada muestra filtro/ninguno según coincidencia, no todoComprado', () => {
    const items = [comprado('Pan')];
    expect(estadoVacio(vista({ items }), filtrar(items, 'zzz'), true)).toBe('filtro');
  });
  it('no muestra primeraVez mientras no cargó', () => {
    expect(estadoVacio(vista({ items: [] }), sinFiltro(), false)).toBe('ninguno');
  });
});

describe('pendientesDeSync', () => {
  it('cuenta los ítems con escrituras locales sin confirmar', () => {
    expect(pendientesDeSync([item('a', { pendiente: true }), item('b'), comprado('c', { pendiente: true })])).toBe(2);
    expect(pendientesDeSync([])).toBe(0);
  });
});

describe('nombreDe', () => {
  const miembros = [miembro('m-mama', 'Mamá', 'p1'), miembro('m-papa', 'Papá', 'p2')];
  it('"Vos" si soy yo', () => {
    expect(nombreDe('m-mama', 'Mamá', miembros, { memberId: 'm-mama', nombre: 'Mamá' }, T)).toBe('Vos');
  });
  it('nombre ACTUAL del miembro aunque el denormalizado sea viejo', () => {
    expect(nombreDe('m-mama', 'Mami (viejo)', miembros, { memberId: 'm-papa', nombre: 'Papá' }, T)).toBe('Mamá');
  });
  it('denormalizado si el miembro ya no existe', () => {
    expect(nombreDe('m-abuela', 'Abuela', miembros, { memberId: null, nombre: null }, T)).toBe('Abuela');
  });
  it('"alguien" si no hay nada', () => {
    expect(nombreDe(null, null, miembros, { memberId: null, nombre: null }, T)).toBe('alguien');
    expect(nombreDe('m-nadie', '   ', miembros, { memberId: null, nombre: null }, T)).toBe('alguien');
    expect(nombreDe('alguien', '', miembros, { memberId: null, nombre: null }, T)).toBe('alguien');
  });
  it('yo anónimo nunca coincide con nadie', () => {
    expect(nombreDe(null, 'X', miembros, { memberId: null, nombre: null }, T)).toBe('X');
  });
});

describe('inicial', () => {
  it.each<[string | null | undefined, string]>([
    ['Mamá', 'M'],
    ['  ñoquis', 'Ñ'],
    ['', '?'],
    ['   ', '?'],
    [null, '?'],
    [undefined, '?'],
    ['!!x', 'X'],
    ['🍎 Ana', 'A'],
    ['42', '4'],
    ['ángel', 'Á'],
  ])('%j → %j', (nombre, esperado) => {
    expect(inicial(nombre)).toBe(esperado);
  });
});
