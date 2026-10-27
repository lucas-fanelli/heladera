/**
 * Reglas de Firestore (firestore.rules) contra el emulador, con @firebase/rules-unit-testing.
 * Un positivo y un negativo por rama de cada `allow`. Se corre adentro de `firebase emulators:exec` (npm run test:emu):
 * fuera del emulador el proyecto 'emulador' de vitest ni existe.
 *
 * Los tests escriben con el SDK modular (`doc`, `setDoc`, `updateDoc`…) sobre la instancia que da el contexto de
 * rules-unit-testing: es un wrapper compat cuyo `_delegate` es el Firestore modular, y las funciones modulares lo
 * desenvuelven solas (getModularInstance). Solo el TIPO no coincide → un cast en `fs()`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestContext, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  FieldPath, Timestamp, collection, collectionGroup, deleteDoc, deleteField, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where,
  type Firestore,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-heladera';
const EMULADOR = { host: '127.0.0.1', port: 8080 };
const RULES = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

/** Las claves de datos de un ítem, exactamente las que las reglas dejan pasar (el id va en el doc, no adentro). */
const CLAVES_ITEM = ['texto', 'textoNorm', 'estado', 'agregadoEn', 'agregadoPor', 'agregadoPorNombre', 'compradoEn', 'compradoPor', 'compradoPorNombre', 'borradoEn', 'actualizadoEn', 'actualizadoPor', 'actualizadoPorNombre', 'mercado'] as const;

let testEnv: RulesTestEnvironment;

/** El Firestore modular detrás del contexto (ver nota de arriba). */
const fs = (ctx: RulesTestContext): Firestore => ctx.firestore() as unknown as Firestore;
const yo = () => fs(testEnv.authenticatedContext('uid-mama'));
const otro = () => fs(testEnv.authenticatedContext('uid-papa'));
const nadie = () => fs(testEnv.unauthenticatedContext());

const LISTA = 'lista0000000000000001';
const refLista = (db: Firestore) => doc(db, 'listas', LISTA);
const refMiembro = (db: Firestore, id = 'm-mama') => doc(db, 'listas', LISTA, 'miembros', id);
const refItem = (db: Firestore, id = 'item0000000000000001') => doc(db, 'listas', LISTA, 'items', id);
const refMercado = (db: Firestore, id = 'merc0000000000000001') => doc(db, 'listas', LISTA, 'mercados', id);
const refSug = (db: Firestore) => doc(db, 'listas', LISTA, 'meta', 'sugerencias');

const itemValido = (extra: Record<string, unknown> = {}) => ({
  texto: 'Leche', textoNorm: 'leche', estado: 'pendiente',
  agregadoEn: serverTimestamp(), agregadoPor: 'm-mama', agregadoPorNombre: 'Mamá',
  compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null,
  actualizadoEn: serverTimestamp(), actualizadoPor: 'm-mama', actualizadoPorNombre: 'Mamá',
  mercado: null,
  ...extra,
});
const miembroValido = (extra: Record<string, unknown> = {}) => ({ nombre: 'Mamá', color: 'p1', creadoEn: serverTimestamp(), ...extra });
const mercadoValido = (extra: Record<string, unknown> = {}) => ({ nombre: 'Mercadona', creadoEn: serverTimestamp(), ...extra });
const listaValida = (extra: Record<string, unknown> = {}) => ({ nombre: 'Casa', creadaEn: serverTimestamp(), esquema: 1, ...extra });
const entradas = (n: number): Record<string, { texto: string; veces: number; ultimaVez: null }> => {
  const e: Record<string, { texto: string; veces: number; ultimaVez: null }> = {};
  for (let i = 0; i < n; i++) e[`producto ${i}`] = { texto: `Producto ${i}`, veces: 0, ultimaVez: null };
  return e;
};

/** Datos de partida escritos sin reglas: una lista con un miembro, un ítem pendiente y sugerencias con la semilla
 *  mínima. Desde el cierre de la ventana (D22) también las LLAVES de uid-mama y uid-papa: sin membresía, ninguna
 *  de las operaciones de la suite pasaría — que es exactamente el modelo. */
async function sembrar(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = fs(ctx);
    await setDoc(refLista(db), listaValida());
    for (const uid of ['uid-mama', 'uid-papa']) {
      await setDoc(doc(db, 'listas', LISTA, 'acceso', uid), { uid, memberId: null, entroEn: serverTimestamp() });
    }
    await setDoc(refMiembro(db), miembroValido());
    await setDoc(refMercado(db), mercadoValido());
    await setDoc(refItem(db), itemValido());
    await setDoc(refSug(db), { entradas: { leche: { texto: 'Leche', veces: 0, ultimaVez: null } } });
  });
}

/** Solo las llaves de uid-mama y uid-papa: para los tests que arman su propio escenario sin sembrar().
 *  Desde el cierre de la ventana (D22), sin llave no hay escritura que pase — ni la del propio test. */
async function sembrarLlaves(listId = LISTA): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = fs(ctx);
    for (const uid of ['uid-mama', 'uid-papa']) {
      await setDoc(doc(db, 'listas', listId, 'acceso', uid), { uid, memberId: null, entroEn: serverTimestamp() });
    }
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES, 'utf8'), ...EMULADOR },
  });
});
afterEach(async () => { await testEnv.clearFirestore(); });
afterAll(async () => { await testEnv.cleanup(); });

describe('reglas · sin auth nada', () => {
  it('sin usuario no se puede leer ni escribir nada (lista, miembro, ítem, sugerencias)', async () => {
    await sembrar();
    const db = nadie();
    await assertFails(getDoc(refLista(db)));
    await assertFails(getDoc(refMiembro(db)));
    await assertFails(getDoc(refItem(db)));
    await assertFails(getDoc(refSug(db)));
    await assertFails(setDoc(refItem(db, 'otro00000000000000001'), itemValido()));
    await assertFails(setDoc(doc(db, 'listas', 'nueva000000000000001'), listaValida()));
    // el mismo get, con usuario, pasa (la rama positiva de auth())
    await assertSucceeds(getDoc(refLista(yo())));
  });
});

describe('reglas · listas/{listId}/mercados/{mercadoId}', () => {
  it('leer con usuario sí, sin usuario no', async () => {
    await sembrar();
    await assertSucceeds(getDoc(refMercado(yo())));
    await assertSucceeds(getDocs(collection(yo(), 'listas', LISTA, 'mercados')));
    await assertFails(getDoc(refMercado(nadie())));
  });
  it('create: nombre 1..40 con creadoEn; vacío, de 41, no-string o con clave desconocida falla', async () => {
    await sembrar();
    const db = yo();
    await assertSucceeds(setDoc(refMercado(db, 'm1000000000000000001'), mercadoValido()));
    await assertSucceeds(setDoc(refMercado(db, 'm2000000000000000001'), mercadoValido({ nombre: 'x'.repeat(40) })));
    await assertFails(setDoc(refMercado(db, 'm3000000000000000001'), mercadoValido({ nombre: 'x'.repeat(41) })));
    await assertFails(setDoc(refMercado(db, 'm4000000000000000001'), mercadoValido({ nombre: '' })));
    await assertFails(setDoc(refMercado(db, 'm5000000000000000001'), mercadoValido({ nombre: 7 })));
    await assertFails(setDoc(refMercado(db, 'm6000000000000000001'), mercadoValido({ color: 'p1' })));
  });
  it('update: renombrar sí, vacío no', async () => {
    await sembrar();
    const db = yo();
    await assertSucceeds(updateDoc(refMercado(db), { nombre: 'La Verdulería' }));
    await assertFails(updateDoc(refMercado(db), { nombre: '' }));
  });
  it('delete: SÍ (el único borrado físico de la app), pero sigue haciendo falta estar autenticado', async () => {
    await sembrar();
    await assertFails(deleteDoc(refMercado(nadie())));
    await assertSucceeds(deleteDoc(refMercado(yo())));
    // y se puede revivir con el mismo id (así funciona el Deshacer)
    await assertSucceeds(setDoc(refMercado(yo()), mercadoValido()));
  });
});

describe('reglas · listas/{listId}', () => {
  it('get sí, list no (la URL es la llave: nadie enumera listas)', async () => {
    await sembrar();
    const db = yo();
    await assertSucceeds(getDoc(refLista(db)));
    await assertFails(getDocs(collection(db, 'listas')));
  });
  it('create: nombre 1..60 con creadaEn y esquema OK; sin esquema también; nombre de 61 o vacío falla; clave desconocida falla', async () => {
    const db = yo();
    await assertSucceeds(setDoc(doc(db, 'listas', 'l1000000000000000001'), listaValida()));
    await assertSucceeds(setDoc(doc(db, 'listas', 'l2000000000000000001'), { nombre: 'Casa', creadaEn: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, 'listas', 'l3000000000000000001'), listaValida({ nombre: 'x'.repeat(60) })));
    await assertFails(setDoc(doc(db, 'listas', 'l4000000000000000001'), listaValida({ nombre: 'x'.repeat(61) })));
    await assertFails(setDoc(doc(db, 'listas', 'l5000000000000000001'), listaValida({ nombre: '' })));
    await assertFails(setDoc(doc(db, 'listas', 'l6000000000000000001'), listaValida({ nombre: 123 })));
    await assertFails(setDoc(doc(db, 'listas', 'l7000000000000000001'), listaValida({ sarasa: 1 })));
    // 'duenio' SÍ es una clave conocida desde la Etapa 1, pero solo la tuya: no se crea una lista a nombre de otro
    await assertSucceeds(setDoc(doc(db, 'listas', 'l8000000000000000001'), listaValida({ duenio: 'uid-mama' })));
    await assertFails(setDoc(doc(db, 'listas', 'l9000000000000000001'), listaValida({ duenio: 'uid-papa' })));
  });
  it('update: solo el nombre (1..60); tocar creadaEn o esquema falla; nombre de 61 falla', async () => {
    await sembrar();
    const db = yo();
    await assertSucceeds(updateDoc(refLista(db), { nombre: 'Casa de la abuela' }));
    await assertFails(updateDoc(refLista(db), { nombre: 'x'.repeat(61) }));
    await assertFails(updateDoc(refLista(db), { nombre: '' }));
    await assertFails(updateDoc(refLista(db), { creadaEn: serverTimestamp() }));
    await assertFails(updateDoc(refLista(db), { nombre: 'Casa', esquema: 2 }));
  });
  it('delete: nunca', async () => {
    await sembrar();
    await assertFails(deleteDoc(refLista(yo())));
  });
});

describe('reglas · miembros/{memberId}', () => {
  it('read con auth OK', async () => {
    await sembrar();
    await assertSucceeds(getDoc(refMiembro(yo())));
    await assertSucceeds(getDocs(collection(yo(), 'listas', LISTA, 'miembros')));
  });
  it('create: { nombre 1..30, color, creadoEn } OK; nombre de 31 o vacío falla; clave extra falla', async () => {
    await sembrar();
    const db = yo();
    await assertSucceeds(setDoc(refMiembro(db, 'm-papa'), miembroValido({ nombre: 'Papá', color: 'p2' })));
    await assertSucceeds(setDoc(refMiembro(db, 'm-largo'), miembroValido({ nombre: 'x'.repeat(30) })));
    await assertFails(setDoc(refMiembro(db, 'm-largo2'), miembroValido({ nombre: 'x'.repeat(31) })));
    await assertFails(setDoc(refMiembro(db, 'm-vacio'), miembroValido({ nombre: '' })));
    await assertFails(setDoc(refMiembro(db, 'm-extra'), miembroValido({ uid: 'uid-mama' })));
  });
  it('update: renombrar OK (también desde otro uid: la identidad es el memberId); nombre de 31 falla; delete nunca', async () => {
    await sembrar();
    await assertSucceeds(updateDoc(refMiembro(yo()), { nombre: 'Mami' }));
    await assertSucceeds(updateDoc(refMiembro(otro()), { nombre: 'Mamá' }));
    await assertFails(updateDoc(refMiembro(yo()), { nombre: 'x'.repeat(31) }));
    await assertFails(deleteDoc(refMiembro(yo())));
  });
});

describe('reglas · items/{itemId}', () => {
  it('create: exactamente las 14 claves de datos y estado "pendiente" OK; una clave extra falla; una clave de menos falla', async () => {
    await sembrar();
    const db = yo();
    const datos = itemValido();
    expect(Object.keys(datos).sort()).toEqual([...CLAVES_ITEM].sort());
    await assertSucceeds(setDoc(refItem(db, 'nuevo000000000000001'), datos));
    await assertFails(setDoc(refItem(db, 'nuevo000000000000002'), itemValido({ borradoPor: 'm-mama' })));
    await assertFails(setDoc(refItem(db, 'nuevo000000000000003'), itemValido({ uid: 'uid-mama' })));
    // hasOnly solo (subconjunto) dejaría nacer un ítem incompleto: exigimos también hasAll, así que falta UNA cualquiera y falla
    for (const clave of CLAVES_ITEM) {
      const sinClave: Record<string, unknown> = { ...datos };
      delete sinClave[clave];
      await assertFails(setDoc(refItem(db, `sin-${clave}`), sinClave));
    }
  });
  it('create: texto vacío o de 121 falla, de 120 OK; nacer "comprado" o "borrado" falla', async () => {
    await sembrar();
    const db = yo();
    await assertSucceeds(setDoc(refItem(db, 'largo000000000000001'), itemValido({ texto: 'x'.repeat(120) })));
    await assertFails(setDoc(refItem(db, 'largo000000000000002'), itemValido({ texto: 'x'.repeat(121) })));
    await assertFails(setDoc(refItem(db, 'vacio000000000000001'), itemValido({ texto: '' })));
    await assertFails(setDoc(refItem(db, 'numero00000000000001'), itemValido({ texto: 42 })));
    await assertFails(setDoc(refItem(db, 'compr000000000000001'), itemValido({ estado: 'comprado', compradoEn: serverTimestamp(), compradoPor: 'm-mama', compradoPorNombre: 'Mamá' })));
    await assertFails(setDoc(refItem(db, 'borr0000000000000001'), itemValido({ estado: 'borrado', borradoEn: serverTimestamp() })));
  });
  it('update: tildar/destildar/editar/borrar OK; estado fuera del enum falla; texto vacío falla', async () => {
    await sembrar();
    const db = yo();
    await assertSucceeds(updateDoc(refItem(db), { estado: 'comprado', compradoEn: serverTimestamp(), compradoPor: 'm-mama', compradoPorNombre: 'Mamá', actualizadoEn: serverTimestamp() }));
    await assertSucceeds(updateDoc(refItem(db), { estado: 'pendiente', compradoEn: null, compradoPor: null, compradoPorNombre: null, actualizadoEn: serverTimestamp() }));
    await assertSucceeds(updateDoc(refItem(db), { texto: 'Leche entera', textoNorm: 'leche entera', actualizadoEn: serverTimestamp() }));
    await assertSucceeds(updateDoc(refItem(db), { estado: 'borrado', borradoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }));
    await assertFails(updateDoc(refItem(db), { estado: 'archivado' }));
    await assertFails(updateDoc(refItem(db), { texto: '' }));
    await assertFails(updateDoc(refItem(db), { texto: 'x'.repeat(121) }));
  });
  it('mercado: nacer o quedar en un súper (string) o sin ninguno (null) OK; cualquier otro tipo falla', async () => {
    await sembrar();
    const db = yo();
    await assertSucceeds(setDoc(refItem(db, 'merca000000000000001'), itemValido({ mercado: 'merc0000000000000001' })));
    await assertFails(setDoc(refItem(db, 'merca000000000000002'), itemValido({ mercado: 7 })));
    await assertSucceeds(updateDoc(refItem(db), { mercado: 'merc0000000000000001', actualizadoEn: serverTimestamp() }));
    await assertSucceeds(updateDoc(refItem(db), { mercado: null, actualizadoEn: serverTimestamp() }));
    await assertFails(updateDoc(refItem(db), { mercado: 7 }));
  });
  it('reclamar lo anónimo: de "alguien" a una persona SÍ; de una persona a otra (o de vuelta a alguien) no', async () => {
    await sembrar();
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(refItem(fs(ctx), 'anon0000000000000001'), itemValido({ agregadoPor: 'alguien', agregadoPorNombre: 'alguien' }));
    });
    const db = yo();
    const anon = () => refItem(db, 'anon0000000000000001');
    // el que estaba firmado por una persona no se puede reasignar
    await assertFails(updateDoc(refItem(db), { agregadoPor: 'm-papa', agregadoPorNombre: 'Papá' }));
    // el anónimo sí
    await assertSucceeds(updateDoc(anon(), { agregadoPor: 'm-papa', agregadoPorNombre: 'Papá', actualizadoEn: serverTimestamp() }));
    // y una vez reclamado ya no se puede volver a mover (ni siquiera a "alguien")
    await assertFails(updateDoc(anon(), { agregadoPor: 'm-mama' }));
    await assertFails(updateDoc(anon(), { agregadoPor: 'alguien' }));
  });
  it('update: no se puede tocar agregadoPor ni agregadoEn (ni aunque el resto sea válido)', async () => {
    await sembrar();
    const db = yo();
    await assertFails(updateDoc(refItem(db), { agregadoPor: 'm-papa' }));
    await assertFails(updateDoc(refItem(db), { agregadoEn: serverTimestamp() }));
    await assertFails(updateDoc(refItem(db), { estado: 'comprado', agregadoPor: 'm-papa' }));
    // sin tocarlos, la misma actualización pasa
    await assertSucceeds(updateDoc(refItem(db), { estado: 'comprado', compradoPor: 'm-papa', compradoPorNombre: 'Papá', compradoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }));
  });
  it('OTRO uid puede tildar el ítem que agregó otro (la identidad es el memberId, no el uid del teléfono)', async () => {
    await sembrar();
    await assertSucceeds(updateDoc(refItem(otro()), { estado: 'comprado', compradoPor: 'm-papa', compradoPorNombre: 'Papá', compradoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }));
    await assertSucceeds(updateDoc(refItem(otro()), { texto: 'Leche descremada', textoNorm: 'leche descremada', actualizadoEn: serverTimestamp() }));
  });
  it('read con auth OK (get y query por estado); delete nunca (borrado lógico)', async () => {
    await sembrar();
    await assertSucceeds(getDoc(refItem(yo())));
    await assertSucceeds(getDocs(collection(yo(), 'listas', LISTA, 'items')));
    await assertFails(deleteDoc(refItem(yo())));
    await assertFails(deleteDoc(refItem(otro())));
  });
});

describe('reglas · meta/sugerencias', () => {
  it('read con auth OK; sin auth no', async () => {
    await sembrar();
    await assertSucceeds(getDoc(refSug(yo())));
    await assertFails(getDoc(refSug(nadie())));
  });
  it('create (sin doc previo): 5001 entradas falla; otra clave además de entradas falla; 5000 OK', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(refLista(fs(ctx)), listaValida()); });
    await sembrarLlaves();
    const db = yo();
    // no hay doc: cada setDoc de acá es un CREATE de verdad (los rechazos no dejan nada, así que el positivo del final también lo es)
    expect((await getDoc(refSug(db))).exists()).toBe(false);
    await assertFails(setDoc(refSug(db), { entradas: entradas(5001) }));
    await assertFails(setDoc(refSug(db), { entradas: entradas(3), version: 1 }));
    await assertFails(setDoc(refSug(db), { sugerencias: entradas(3) }));
    expect((await getDoc(refSug(db))).exists()).toBe(false);
    await assertSucceeds(setDoc(refSug(db), { entradas: entradas(5000) }));
  });
  it('update: el tope de 5000 es sobre el doc resultante: sumar la 5000ª entrada pasa; la 5001ª falla, tanto por setDoc merge (el camino de agregarItem) como por FieldPath+increment; incrementar una existente con el doc lleno pasa', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(refLista(fs(ctx)), listaValida());
      await setDoc(refSug(fs(ctx)), { entradas: entradas(4999) });
    });
    await sembrarLlaves();
    const db = yo();
    const uso = (texto: string) => ({ texto, veces: increment(1), ultimaVez: serverTimestamp() });
    // 4999 → 5000: OK
    await assertSucceeds(setDoc(refSug(db), { entradas: { 'nueva 5000': uso('Nueva 5000') } }, { merge: true }));
    // 5000 → 5001: falla, por los dos caminos
    await assertFails(setDoc(refSug(db), { entradas: { 'nueva 5001': uso('Nueva 5001') } }, { merge: true }));
    await assertFails(updateDoc(refSug(db), new FieldPath('entradas', 'nueva 5001', 'veces'), increment(1)));
    // incrementar una que ya está no agranda el mapa: pasa
    await assertSucceeds(setDoc(refSug(db), { entradas: { 'producto 0': { veces: increment(1) } } }, { merge: true }));
    const e = (await getDoc(refSug(db))).data()!.entradas as Record<string, { veces: number }>;
    expect(Object.keys(e)).toHaveLength(5000);
    expect(e['producto 0']!.veces).toBe(1);
    expect('nueva 5001' in e).toBe(false);
  });
  it('update por setDoc merge (el camino de agregarItem): la clave con punto ("coca 1.5 l") queda como UNA entrada, no anidada; la semilla no se pierde; repetir suma; sin doc previo lo crea', async () => {
    await sembrar();
    const db = yo();
    const clave = 'coca 1.5 l';
    const uso = (texto: string) => ({ texto, veces: increment(1), ultimaVez: serverTimestamp() });
    // en set()/setDoc() las claves del objeto son nombres literales (los puntos NO anidan; eso solo pasa en update())
    await assertSucceeds(setDoc(refSug(db), { entradas: { [clave]: uso('Coca 1.5 L') } }, { merge: true }));
    await assertSucceeds(setDoc(refSug(db), { entradas: { [clave]: uso('coca 1.5 l') } }, { merge: true }));
    let e = (await getDoc(refSug(db))).data()!.entradas as Record<string, { texto: string; veces: number; ultimaVez: unknown }>;
    expect(Object.keys(e).sort()).toEqual([clave, 'leche'].sort());
    expect(e[clave]).toMatchObject({ texto: 'coca 1.5 l', veces: 2 });
    expect(e[clave]!.ultimaVez).not.toBeNull();
    expect('coca' in e).toBe(false);
    expect(e['leche']).toEqual({ texto: 'Leche', veces: 0, ultimaVez: null });
    // la semilla que ya estaba pasa de 0 a 1 sin duplicarse
    await assertSucceeds(setDoc(refSug(db), { entradas: { leche: uso('Leche') } }, { merge: true }));
    e = (await getDoc(refSug(db))).data()!.entradas;
    expect(Object.keys(e)).toHaveLength(2);
    expect(e['leche']!.veces).toBe(1);
    // sin doc previo (otra lista): el mismo merge lo crea con esa sola entrada
    const otraLista = 'lista0000000000000002';
    await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(doc(fs(ctx), 'listas', otraLista), listaValida()); });
    await sembrarLlaves(otraLista);
    const refOtra = doc(db, 'listas', otraLista, 'meta', 'sugerencias');
    await assertSucceeds(setDoc(refOtra, { entradas: { [clave]: uso('Coca 1.5 L') } }, { merge: true }));
    const creado = (await getDoc(refOtra)).data()!;
    expect(Object.keys(creado)).toEqual(['entradas']);
    expect(Object.keys(creado.entradas)).toEqual([clave]);
    expect(creado.entradas[clave]).toMatchObject({ texto: 'Coca 1.5 L', veces: 1 });
  });
  it('update por FieldPath (el otro camino): incremento y clave con punto también quedan como UNA entrada', async () => {
    await sembrar();
    const db = yo();
    const clave = 'coca 1.5 l';
    await assertSucceeds(updateDoc(refSug(db),
      new FieldPath('entradas', clave, 'veces'), increment(1),
      new FieldPath('entradas', clave, 'texto'), 'Coca 1.5 L',
      new FieldPath('entradas', clave, 'ultimaVez'), serverTimestamp(),
    ));
    await assertSucceeds(updateDoc(refSug(db), new FieldPath('entradas', clave, 'veces'), increment(1)));
    const e = (await getDoc(refSug(db))).data()!.entradas as Record<string, { texto: string; veces: number; ultimaVez: unknown }>;
    expect(Object.keys(e).sort()).toEqual([clave, 'leche'].sort());
    expect(e[clave]).toMatchObject({ texto: 'Coca 1.5 L', veces: 2 });
    expect('coca' in e).toBe(false);
  });
  it('update que mete otra clave además de entradas falla; delete nunca', async () => {
    await sembrar();
    const db = yo();
    await assertFails(updateDoc(refSug(db), { version: 2 }));
    await assertFails(deleteDoc(refSug(db)));
  });
});

/**
 * Etapa 0 (D22): los agujeros que encontró la auditoría. Cada uno tiene su negativo —lo que ANTES pasaba y ahora
 * no— y su positivo, para no cerrar de más y romperle una escritura legítima a la familia.
 */
describe('reglas · Etapa 0: lo que antes pasaba y ahora no', () => {
  describe('items · el update también acota las claves', () => {
    it('no se le pueden meter claves inventadas a un ítem que ya existe', async () => {
      await sembrar();
      const db = yo();
      // el camino del doc de 1 MB: `create` tenía hasOnly, `update` no
      await assertFails(updateDoc(refItem(db), { basura: 'x'.repeat(900_000) }));
      await assertFails(updateDoc(refItem(db), { borradoPor: 'm-papa' }));
    });
    it('un ítem viejo al que le falta una clave nueva se sigue pudiendo tocar', async () => {
      await sembrar();
      // hasOnly NO exige que estén todas: un ítem anterior a `mercado` y a la firma tiene que seguir andando
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await setDoc(refItem(fs(ctx), 'viejo00000000000001'), {
          texto: 'Yerba', textoNorm: 'yerba', estado: 'pendiente',
          agregadoEn: serverTimestamp(), agregadoPor: 'm-mama', agregadoPorNombre: 'Mamá',
        });
      });
      const db = yo();
      await assertSucceeds(updateDoc(refItem(db, 'viejo00000000000001'), { estado: 'comprado', compradoEn: serverTimestamp(), compradoPor: 'm-mama', compradoPorNombre: 'Mamá' }));
    });
  });

  describe('items · las 11 claves que no se miraban', () => {
    it('textoNorm tiene que ser string y acotado, pero puede ser vacío', async () => {
      await sembrar();
      const db = yo();
      await assertFails(setDoc(refItem(db, 'i1'), itemValido({ textoNorm: 123 })));
      await assertFails(setDoc(refItem(db, 'i2'), itemValido({ textoNorm: 'x'.repeat(121) })));
      // `normalizar('...')` no deja nada y ese ítem es válido igual
      await assertSucceeds(setDoc(refItem(db, 'i3'), itemValido({ texto: '...', textoNorm: '' })));
    });
    it('los nombres de persona están acotados (uno de 3.000 caracteres rompía el layout de todos)', async () => {
      await sembrar();
      const db = yo();
      await assertFails(setDoc(refItem(db, 'i4'), itemValido({ agregadoPorNombre: 'x'.repeat(41) })));
      await assertFails(updateDoc(refItem(db), { actualizadoPorNombre: 'x'.repeat(3000) }));
      await assertFails(updateDoc(refItem(db), { compradoPor: 'x'.repeat(41) }));
      await assertSucceeds(updateDoc(refItem(db), { actualizadoPorNombre: 'Papá', actualizadoPor: 'm-papa', actualizadoEn: serverTimestamp() }));
    });
    it('las fechas tienen que ser timestamp o null, nunca otra cosa', async () => {
      await sembrar();
      const db = yo();
      await assertFails(setDoc(refItem(db, 'i5'), itemValido({ compradoEn: 'ayer' })));
      await assertFails(setDoc(refItem(db, 'i6'), itemValido({ borradoEn: 'x'.repeat(900_000) })));
      await assertFails(updateDoc(refItem(db), { actualizadoEn: 12345 }));
      await assertSucceeds(updateDoc(refItem(db), { borradoEn: serverTimestamp(), estado: 'borrado' }));
    });
  });

  describe('listas · creadaEn y esquema', () => {
    it('no se pueden crear listas con basura adentro (el camino al GiB lleno)', async () => {
      const db = yo();
      // no hace falta conocer NINGÚN id: la lista se crea donde se le cante
      await assertFails(setDoc(doc(db, 'listas', 'basura00000000000001'), listaValida({ creadaEn: 'x'.repeat(900_000) })));
      await assertFails(setDoc(doc(db, 'listas', 'basura00000000000002'), listaValida({ esquema: 'x'.repeat(900_000) })));
      await assertFails(setDoc(doc(db, 'listas', 'basura00000000000003'), listaValida({ esquema: 0 })));
    });
    it('una lista normal se sigue creando igual', async () => {
      const db = yo();
      await assertSucceeds(setDoc(doc(db, 'listas', 'nueva000000000000001'), listaValida()));
    });
  });

  describe('miembros · el color es de la paleta', () => {
    it('un color inventado no entra', async () => {
      await sembrar();
      const db = yo();
      await assertFails(setDoc(refMiembro(db, 'm-nuevo'), miembroValido({ color: 'p5' })));
      await assertFails(setDoc(refMiembro(db, 'm-nuevo'), miembroValido({ color: 'red; background: url(x)' })));
    });
    it('los cuatro de la paleta entran, y el color es opcional', async () => {
      await sembrar();
      const db = yo();
      for (const c of ['p1', 'p2', 'p3', 'p4']) {
        await assertSucceeds(setDoc(refMiembro(db, `m-${c}`), miembroValido({ color: c })));
      }
      await assertSucceeds(setDoc(refMiembro(db, 'm-sincolor'), { nombre: 'Tía', creadoEn: serverTimestamp() }));
    });
  });

  describe('sugerencias · no se vacían de un saque', () => {
    it('pisar el doc entero borra todo lo aprendido: no se puede', async () => {
      await sembrarLlaves();   // con llave: lo que frena es el tope, no la membresía
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await setDoc(refSug(fs(ctx)), { entradas: entradas(40) });
      });
      const db = yo();
      await assertFails(setDoc(refSug(db), { entradas: {} }));
      await assertFails(setDoc(refSug(db), { entradas: entradas(5) }));
    });
    it('con pocas entradas tampoco (el tope de claves tocadas solo no alcanzaba)', async () => {
      // con 3 entradas, vaciar mueve 3 claves: pasaba el tope de 20 y borraba todo igual. Lo frena el piso de tamaño.
      await sembrarLlaves();   // con llave: lo que frena es el piso, no la membresía
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await setDoc(refSug(fs(ctx)), { entradas: entradas(3) });
      });
      await assertFails(setDoc(refSug(yo()), { entradas: {} }));
    });
    it('borrar UNA sugerencia sí, que es lo que hace la app', async () => {
      await sembrarLlaves();
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await setDoc(refSug(fs(ctx)), { entradas: entradas(4) });
      });
      const db = yo();
      await assertSucceeds(updateDoc(refSug(db), new FieldPath('entradas', 'producto 0'), deleteField()));
      const e = (await getDoc(refSug(db))).data()!.entradas as Record<string, unknown>;
      expect(Object.keys(e).sort()).toEqual(['producto 1', 'producto 2', 'producto 3']);
    });
    it('y anotar un uso nuevo sigue andando', async () => {
      await sembrar();
      await assertSucceeds(setDoc(refSug(yo()), { entradas: { pan: { texto: 'Pan', veces: increment(1), ultimaVez: serverTimestamp() } } }, { merge: true }));
    });
  });
});

/**
 * Etapa 1 (D22): membresía, invitaciones y expulsión. Se cargan LAS MISMAS reglas del repo pero con la fecha de
 * la ventana de migración movida al pasado, que es la única forma de probar la postura definitiva sin esperar al
 * 4 de septiembre: `request.time` no se puede mover desde el test. Cuando la ventana se saque de verdad, este
 * reemplazo deja de encontrar nada y el test de arriba avisa.
 */
describe('reglas · Etapa 1: con la ventana de migración cerrada', () => {
  let env: RulesTestEnvironment;
  const fs2 = (ctx: RulesTestContext): Firestore => ctx.firestore() as unknown as Firestore;
  const duenia = () => fs2(env.authenticatedContext('uid-mama'));      // dueña de la lista
  const socio = () => fs2(env.authenticatedContext('uid-papa'));       // miembro, no dueño
  const forastero = () => fs2(env.authenticatedContext('uid-ajeno'));  // tiene el link y nada más

  const rLista = (db: Firestore) => doc(db, 'listas', LISTA);
  const rItem = (db: Firestore, id = 'item0000000000000001') => doc(db, 'listas', LISTA, 'items', id);
  const rAcceso = (db: Firestore, uid: string) => doc(db, 'listas', LISTA, 'acceso', uid);
  const rInv = (db: Firestore, cod: string) => doc(db, 'listas', LISTA, 'invitaciones', cod);

  const CODIGO = 'inv1234567890123456789012';
  const dentroDe = (ms: number) => Timestamp.fromMillis(Date.now() + ms);
  const DIA = 864e5;

  /** La lista con dueña, un ítem, y acceso para los uid que se pidan (escrito sin reglas). */
  async function sembrar2(conAcceso: string[] = ['uid-mama', 'uid-papa']): Promise<void> {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = fs2(ctx);
      await setDoc(rLista(db), { ...listaValida(), duenio: 'uid-mama' });
      await setDoc(doc(db, 'listas', LISTA, 'miembros', 'm-mama'), miembroValido());
      await setDoc(rItem(db), itemValido());
      await setDoc(doc(db, 'listas', LISTA, 'meta', 'sugerencias'), { entradas: {} });
      for (const uid of conAcceso) await setDoc(rAcceso(db, uid), { uid, memberId: 'm-mama', entroEn: serverTimestamp() });
    });
  }
  async function sembrarInvitacion(cod = CODIGO, extra: Record<string, unknown> = {}): Promise<void> {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(rInv(fs2(ctx), cod), { creadaPor: 'uid-papa', creadaEn: serverTimestamp(), venceEn: dentroDe(7 * DIA), revocada: false, ...extra });
    });
  }

  beforeAll(async () => {
    // la ventana se cerró el 2026-08-26 (antes de su fecha, a pedido de Ana): estas ya son LAS reglas, sin
    // reemplazos. La guarda queda para que la ventana no vuelva sin que este archivo se entere.
    const reglas = readFileSync(RULES, 'utf8');
    expect(reglas).not.toContain('ventanaMigracion');
    env = await initializeTestEnvironment({ projectId: 'demo-heladera-cerrada', firestore: { rules: reglas, ...EMULADOR } });
  });
  afterEach(async () => { await env.clearFirestore(); });
  afterAll(async () => { await env.cleanup(); });

  describe('el link deja de ser la llave', () => {
    it('el forastero autenticado no lee NADA, aunque sepa el id de la lista', async () => {
      await sembrar2();
      const db = forastero();
      await assertFails(getDoc(rLista(db)));
      await assertFails(getDoc(rItem(db)));
      await assertFails(getDocs(collection(db, 'listas', LISTA, 'items')));
      await assertFails(getDocs(collection(db, 'listas', LISTA, 'miembros')));
      await assertFails(getDocs(collection(db, 'listas', LISTA, 'mercados')));
      await assertFails(getDoc(doc(db, 'listas', LISTA, 'meta', 'sugerencias')));
    });
    it('ni escribe: ni anota, ni tacha, ni renombra la lista, ni crea súper', async () => {
      await sembrar2();
      const db = forastero();
      await assertFails(setDoc(rItem(db, 'nuevo000000000000001'), itemValido()));
      await assertFails(updateDoc(rItem(db), { estado: 'comprado' }));
      await assertFails(updateDoc(rLista(db), { nombre: 'Mía' }));
      await assertFails(setDoc(doc(db, 'listas', LISTA, 'mercados', 'm1000000000000000001'), mercadoValido()));
    });
    it('el miembro sí hace todo eso', async () => {
      await sembrar2();
      const db = socio();
      await assertSucceeds(getDoc(rLista(db)));
      await assertSucceeds(getDocs(collection(db, 'listas', LISTA, 'items')));
      await assertSucceeds(setDoc(rItem(db, 'nuevo000000000000001'), itemValido()));
      await assertSucceeds(updateDoc(rItem(db), { estado: 'comprado', compradoEn: serverTimestamp(), compradoPor: 'm-mama', compradoPorNombre: 'Mamá' }));
      await assertSucceeds(updateDoc(rLista(db), { nombre: 'Casa nueva' }));
    });
  });

  describe('canje de invitación (sin backend)', () => {
    it('el forastero NO puede leer la invitación, y aun así puede canjearla', async () => {
      await sembrar2();
      await sembrarInvitacion();
      const db = forastero();
      // la puerta no se puede espiar: ni el doc ni la colección
      await assertFails(getDoc(rInv(db, CODIGO)));
      await assertFails(getDocs(collection(db, 'listas', LISTA, 'invitaciones')));
      // pero presentarla funciona: el get() de las reglas lo hace el servidor y no se re-evalúa contra las reglas
      await assertSucceeds(setDoc(rAcceso(db, 'uid-ajeno'), { uid: 'uid-ajeno', memberId: null, entroEn: serverTimestamp(), porCodigo: CODIGO }));
      // y desde ese momento entra
      await assertSucceeds(getDoc(rItem(forastero())));
    });
    it('sin código no se entra, y con un código que no existe tampoco', async () => {
      await sembrar2();
      const db = forastero();
      await assertFails(setDoc(rAcceso(db, 'uid-ajeno'), { uid: 'uid-ajeno', memberId: null, entroEn: serverTimestamp() }));
      await assertFails(setDoc(rAcceso(db, 'uid-ajeno'), { uid: 'uid-ajeno', memberId: null, entroEn: serverTimestamp(), porCodigo: 'noexiste1234567890123456' }));
    });
    /** La OTRA rama del mismo `allow create`: la que autoriza por `duenio` en vez de por invitación. El comentario
     *  de las reglas la presenta como la afordancia del ALTA —el que crea la lista se da la llave en el mismo
     *  lote—, pero fuera de un lote `getAfter` == `get`, así que es también la puerta de vuelta del dueño que se
     *  fue: `salir()` borra `acceso/{uid}` y no toca el campo `duenio`. De este hecho sale la cola de
     *  `accesos.salirTexto` para el dueño («no hace falta invitación») y su contraria para el que no lo es. El
     *  test de arriba cubre «sin código no se entra» con el forastero solamente: los otros dos roles quedaban
     *  sin mirar, y la frase dependía de que alguien se acordara. Si mañana esta rama se acota al lote del alta,
     *  acá se pone rojo y el copy cambia con él. */
    it('el dueño que se fue vuelve SIN código; el que no es dueño, no', async () => {
      await sembrar2([]);   // la lista con dueña y NINGUNA llave: se fueron todos
      const llave = (uid: string) => ({ uid, memberId: null, entroEn: serverTimestamp() });
      await assertSucceeds(setDoc(rAcceso(duenia(), 'uid-mama'), llave('uid-mama')));
      await assertFails(setDoc(rAcceso(socio(), 'uid-papa'), llave('uid-papa')));
    });
    it('vencida no, revocada no, y de otra lista tampoco', async () => {
      await sembrar2();
      await sembrarInvitacion('vencida12345678901234567', { venceEn: dentroDe(-DIA) });
      await sembrarInvitacion('revocada1234567890123456', { revocada: true });
      await env.withSecurityRulesDisabled(async ctx => {   // una invitación válida pero de OTRA lista
        await setDoc(doc(fs2(ctx), 'listas', 'otra00000000000000001', 'invitaciones', 'deotra12345678901234567'),
          { creadaPor: 'uid-papa', creadaEn: serverTimestamp(), venceEn: dentroDe(7 * DIA), revocada: false });
      });
      const db = forastero();
      const canje = (cod: string) => setDoc(rAcceso(db, 'uid-ajeno'), { uid: 'uid-ajeno', memberId: null, entroEn: serverTimestamp(), porCodigo: cod });
      await assertFails(canje('vencida12345678901234567'));
      await assertFails(canje('revocada1234567890123456'));
      await assertFails(canje('deotra12345678901234567'));
    });
    it('con un código válido no se le abre la puerta a OTRO uid, ni se entra como dueño', async () => {
      await sembrar2();
      await sembrarInvitacion();
      const db = forastero();
      await assertFails(setDoc(rAcceso(db, 'uid-tercero'), { uid: 'uid-tercero', memberId: null, entroEn: serverTimestamp(), porCodigo: CODIGO }));
      await assertFails(setDoc(rAcceso(db, 'uid-ajeno'), { uid: 'uid-mama', memberId: null, entroEn: serverTimestamp(), porCodigo: CODIGO }));
      // 'duenio' no es una clave de acceso: el dueño vive en el doc de la lista y no se toca desde acá
      await assertFails(setDoc(rAcceso(db, 'uid-ajeno'), { uid: 'uid-ajeno', memberId: null, entroEn: serverTimestamp(), porCodigo: CODIGO, rol: 'duenio' }));
      await assertFails(updateDoc(rLista(db), { duenio: 'uid-ajeno' }));
    });
  });

  describe('invitar: cualquier miembro; ver y revocar: el dueño', () => {
    it('un miembro crea invitaciones; el forastero no', async () => {
      await sembrar2();
      const buena = { creadaPor: 'uid-papa', creadaEn: serverTimestamp(), venceEn: dentroDe(7 * DIA), revocada: false };
      await assertSucceeds(setDoc(rInv(socio(), 'nueva123456789012345678'), buena));
      await assertFails(setDoc(rInv(forastero(), 'ajena123456789012345678'), { ...buena, creadaPor: 'uid-ajeno' }));
    });
    it('no se fabrica una invitación eterna, ni a nombre de otro, ni ya revocada', async () => {
      await sembrar2();
      const db = socio();
      const base = { creadaPor: 'uid-papa', creadaEn: serverTimestamp(), venceEn: dentroDe(7 * DIA), revocada: false };
      await assertFails(setDoc(rInv(db, 'eterna12345678901234567'), { ...base, venceEn: dentroDe(400 * DIA) }));
      await assertFails(setDoc(rInv(db, 'pasada12345678901234567'), { ...base, venceEn: dentroDe(-DIA) }));
      await assertFails(setDoc(rInv(db, 'ajena123456789012345678'), { ...base, creadaPor: 'uid-mama' }));
      await assertFails(setDoc(rInv(db, 'corto1'), base));                               // código muy corto
    });
    it('el dueño las lista y revoca; el miembro raso no las lista', async () => {
      await sembrar2();
      await sembrarInvitacion();
      await assertSucceeds(getDocs(collection(duenia(), 'listas', LISTA, 'invitaciones')));
      await assertFails(getDocs(collection(socio(), 'listas', LISTA, 'invitaciones')));
      await assertSucceeds(updateDoc(rInv(duenia(), CODIGO), { revocada: true }));
    });
    it('una invitación revocada no se resucita ni se estira', async () => {
      await sembrar2();
      await sembrarInvitacion(CODIGO, { revocada: true });
      await assertFails(updateDoc(rInv(duenia(), CODIGO), { revocada: false }));
      await assertFails(updateDoc(rInv(duenia(), CODIGO), { venceEn: dentroDe(400 * DIA) }));
      // borrarla pasó a ser parte del desarme del dueño (borrarLista); el miembro raso sigue sin poder
      await assertFails(deleteDoc(rInv(socio(), CODIGO)));
    });
  });

  describe('expulsar', () => {
    it('el dueño echa y el echado deja de leer EN EL ACTO', async () => {
      await sembrar2();
      await assertSucceeds(getDoc(rItem(socio())));
      await assertSucceeds(deleteDoc(rAcceso(duenia(), 'uid-papa')));
      await assertFails(getDoc(rItem(socio())));
    });
    it('un miembro raso no echa a nadie, pero se puede ir solo', async () => {
      await sembrar2();
      await assertFails(deleteDoc(rAcceso(socio(), 'uid-mama')));
      await assertSucceeds(deleteDoc(rAcceso(socio(), 'uid-papa')));
    });
    it('echar SIN revocar no alcanza: vuelve a entrar con su propio código', async () => {
      // esto es la razón de que Db.expulsar haga las dos cosas en el mismo lote
      await sembrar2();
      await sembrarInvitacion(CODIGO, { creadaPor: 'uid-papa' });
      await assertSucceeds(deleteDoc(rAcceso(duenia(), 'uid-papa')));
      const vuelve = () => setDoc(rAcceso(socio(), 'uid-papa'), { uid: 'uid-papa', memberId: null, entroEn: serverTimestamp(), porCodigo: CODIGO });
      await assertSucceeds(vuelve());                                    // ← con la invitación viva, vuelve
      await assertSucceeds(deleteDoc(rAcceso(duenia(), 'uid-papa')));
      await assertSucceeds(updateDoc(rInv(duenia(), CODIGO), { revocada: true }));
      await assertFails(vuelve());                                       // ← revocada, ya no
    });
    it('nadie toca el acceso ajeno más que para borrarlo, y solo el suyo se edita', async () => {
      await sembrar2();
      await assertFails(updateDoc(rAcceso(socio(), 'uid-mama'), { memberId: 'm-otro' }));
      await assertSucceeds(updateDoc(rAcceso(socio(), 'uid-papa'), { memberId: 'm-papa' }));
      await assertFails(updateDoc(rAcceso(socio(), 'uid-papa'), { uid: 'uid-mama' }));
    });

    /** NINGUNO de los tres poderes del dueño cuelga de su llave: `esDuenio()` es un get() al campo `duenio` del
     *  doc de la lista y no pide membresía, y el `allow delete` de la lista mira `resource.data.duenio` directo.
     *  `salir()` borra `acceso/{uid}` y no toca ese campo, así que el que se fue los conserva enteros. De acá
     *  sale el «nadie MÁS» de `accesos.salirTexto`: la enumeración es lo que pierden LOS QUE QUEDAN, y un
     *  «nadie» sin acotar incluiría al que está leyendo la pregunta. Si mañana `esDuenio()` pasara a exigir
     *  membresía —o el borrado de la lista a exigirla—, acá se pone rojo y el copy cambia con él. */
    it('el que se fue conserva los tres poderes: sin llave, todavía echa, anula y borra la lista', async () => {
      await sembrar2();
      await sembrarInvitacion();                                       // creadaPor 'uid-papa': revocarla NO pasa por `creadaPor`
      await assertSucceeds(deleteDoc(rAcceso(duenia(), 'uid-mama')));   // la dueña sale: borra SU llave
      await assertFails(getDoc(rItem(duenia())));                      // y deja de leer, como cualquiera
      await assertSucceeds(deleteDoc(rAcceso(duenia(), 'uid-papa')));   // …y sin embargo sigue echando
      await assertSucceeds(updateDoc(rInv(duenia(), CODIGO), { revocada: true }));   // …sigue anulando invitaciones
      await assertSucceeds(deleteDoc(rLista(duenia())));                // …y sigue borrando la lista (al final: el get() la necesita)
    });
  });

  // D26: las etiquetas por dispositivo se fueron. Las reglas ya no las aceptan (ni de nadie, ni del dueño),
  // así que ningún cliente viejo puede seguir escribiéndolas. Lo que quedó escrito en llaves viejas se ignora al leer.
  describe('etiquetas de dispositivos (borradas en D26)', () => {
    it('nadie puede escribir una etiqueta: ni la propia, ni el dueño la ajena', async () => {
      await sembrar2();
      await assertFails(updateDoc(rAcceso(socio(), 'uid-papa'), { etiqueta: 'tablet' }));
      await assertFails(updateDoc(rAcceso(duenia(), 'uid-papa'), { etiqueta: 'celu de papá' }));
      await assertFails(updateDoc(rAcceso(socio(), 'uid-papa'), { etiqueta: null }));
    });
    it('ni el dueño toca la identidad ajena', async () => {
      await sembrar2();
      // QUIÉN es cada llave no lo decide nadie más.
      // (con un valor DISTINTO: escribir el mismo memberId es un diff vacío y pasa, porque no cambia nada)
      await assertFails(updateDoc(rAcceso(duenia(), 'uid-papa'), { memberId: 'm-otro' }));
    });
    it('una llave VIEJA que todavía tiene etiqueta se sigue pudiendo actualizar, y el campo no se limpia desde el cliente', async () => {
      await sembrar2();
      // la llave que YA está en la Firestore de la familia: la escribió el cliente de D22, con etiqueta adentro.
      // De que `affectedKeys()` mire lo que CAMBIA (y no lo que hay) depende que entrar() siga anotando a quién
      // decís ser en esas llaves; sin este positivo, endurecer el update a un `keys().hasOnly([...])` —la forma
      // que ya tiene el `create` de arriba— pasaría las puertas en verde y rompería a los que más usaron la app.
      await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(rAcceso(fs2(ctx), 'uid-papa'), { uid: 'uid-papa', memberId: 'm-mama', entroEn: serverTimestamp(), etiqueta: 'la compu' });
      });
      // (con un valor DISTINTO del sembrado: el mismo memberId sería un diff vacío y pasaría por la razón equivocada)
      await assertSucceeds(updateDoc(rAcceso(socio(), 'uid-papa'), { memberId: 'm-papa' }));
      // y el campo viejo no se toca desde el cliente ni para migrarlo: se queda donde está
      await assertFails(updateDoc(rAcceso(socio(), 'uid-papa'), { etiqueta: null }));
      await assertFails(updateDoc(rAcceso(socio(), 'uid-papa'), { etiqueta: deleteField() }));
    });
  });

  describe('el índice "en qué listas estoy" (collection group)', () => {
    it('las llaves propias sí; las ajenas no; sin filtro no', async () => {
      await sembrar2();
      const grupo = (db: Firestore) => collectionGroup(db, 'acceso');
      // el socio encuentra su llave filtrando por su uid
      await assertSucceeds(getDocs(query(grupo(socio()), where('uid', '==', 'uid-papa'))));
      // pescar llaves ajenas por el filtro, o barrer el grupo entero sin filtro: denegado
      await assertFails(getDocs(query(grupo(socio()), where('uid', '==', 'uid-mama'))));
      await assertFails(getDocs(grupo(socio())));
      // y el forastero con su propio uid: query legal, cero resultados (no tiene llaves)
      const vacio = await getDocs(query(grupo(forastero()), where('uid', '==', 'uid-ajeno')));
      expect(vacio.size).toBe(0);
    });
  });

  describe('borrar la lista: solo el dueño, y es el desarme entero', () => {
    it('el socio no borra ni un ítem ni la lista; el dueño desarma todo, la lista al final', async () => {
      await sembrar2();
      await assertFails(deleteDoc(rItem(socio())));
      await assertFails(deleteDoc(rLista(socio())));
      await assertFails(deleteDoc(doc(socio(), 'listas', LISTA, 'miembros', 'm-mama')));
      await assertFails(deleteDoc(rLista(forastero())));
      // el dueño: primero lo de adentro (mientras la lista existe, el get() de esDuenio la puede leer)…
      await assertSucceeds(deleteDoc(rItem(duenia())));
      await assertSucceeds(deleteDoc(doc(duenia(), 'listas', LISTA, 'miembros', 'm-mama')));
      await assertSucceeds(deleteDoc(doc(duenia(), 'listas', LISTA, 'meta', 'sugerencias')));
      // …y la lista al final, autorizada por su propio doc (resource.data.duenio)
      await assertSucceeds(deleteDoc(rLista(duenia())));
    });
    it('una lista sin dueño no la borra nadie', async () => {
      await env.withSecurityRulesDisabled(async ctx => { await setDoc(rLista(fs2(ctx)), listaValida()); });
      await assertFails(deleteDoc(rLista(duenia())));
    });
  });

  describe('el primer reclamo se sacó con la ventana', () => {
    it('una lista sin dueño ya no se puede apropiar: el dueño nace con la lista o no existe', async () => {
      await env.withSecurityRulesDisabled(async ctx => {
        const db = fs2(ctx);
        await setDoc(rLista(db), listaValida());                          // sin `duenio` (como Casa quedó un tiempo)
        await setDoc(rAcceso(db, 'uid-mama'), { uid: 'uid-mama', memberId: null, entroEn: serverTimestamp() });
      });
      // ni siquiera un miembro: la regla transitoria se fue y renombrar es lo único que el update permite
      await assertFails(updateDoc(rLista(duenia()), { duenio: 'uid-mama' }));
    });
  });
});
