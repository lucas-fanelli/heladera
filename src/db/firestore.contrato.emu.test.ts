/**
 * El Db real (src/db/firestore.ts) contra el emulador de Firestore: la MISMA suite de contrato que pasa el fake
 * (src/db/contrato.ts) más lo específico de Firestore que el contrato genérico no puede ver (forma de los docs,
 * segundo cliente en tiempo real, "no existe" recién cuando lo dice el servidor, escritura rechazada por reglas).
 * Se corre adentro de `firebase emulators:exec` (npm run test:emu): fuera del emulador el proyecto 'emulador' no existe.
 *
 * Cómo se conecta: @firebase/rules-unit-testing levanta un contexto autenticado (token falso con uid) y da un
 * Firestore ya apuntado al emulador. Ese objeto es el wrapper compat (`firebase.firestore.Firestore`) cuyo `_delegate`
 * es la instancia modular; las funciones modulares (`doc`, `onSnapshot`, `writeBatch`…) desenvuelven el wrapper solas,
 * así que se lo pasamos a `crearDbFirestore({ db })` tal cual, con un cast porque solo el TIPO no coincide.
 * (La alternativa —initializeApp + connectFirestoreEmulator + signInAnonymously contra el emulador de Auth— no hace
 * falta: las reglas solo piden request.auth != null y el token falso alcanza; y así el script no necesita levantar auth.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestContext, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, disableNetwork, doc, enableNetwork, getDoc, setDoc, waitForPendingWrites, type Firestore } from 'firebase/firestore';
import { crearDbFirestore } from './firestore';
import { ESPERA_MS, describeContratoDb, esperarVista, ultimaVista } from './contrato';
import type { Db, DbError, Item, Vista, Yo } from './types';
import { SEMILLA_SUGERENCIAS } from '@/domain/sugerencias';
import { nuevoId } from '@/domain/ids';

const PROJECT_ID = 'demo-heladera';
const EMULADOR = { host: '127.0.0.1', port: 8080 };
const RULES = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

/** Las claves de datos de un ítem, exactamente las que firestore.rules deja pasar (el id es el del doc). */
const CLAVES_ITEM = [
  'texto', 'textoNorm', 'estado',
  'agregadoEn', 'agregadoPor', 'agregadoPorNombre',
  'compradoEn', 'compradoPor', 'compradoPorNombre',
  'borradoEn',
  'actualizadoEn', 'actualizadoPor', 'actualizadoPorNombre',   // D19: la última mano
  'mercado',                                                    // D13: dónde se compra (null = en cualquiera)
] as const;
/** tope de entradas del doc de sugerencias que imponen las reglas (mismo número que firestore.rules) */
const TOPE_SUGERENCIAS = 5000;

let testEnv: RulesTestEnvironment;
let ctx: RulesTestContext;
/** el Firestore (modular, detrás del wrapper compat) del cliente principal */
let fs: Firestore;

const firestoreDe = (c: RulesTestContext): Firestore => c.firestore() as unknown as Firestore;
const item = (v: Vista, id: string): Item | undefined => v.items.find(i => i.id === id);
const esMsONull = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x));
const refSugerenciasDe = (d: Firestore, listId: string) => doc(d, 'listas', listId, 'meta', 'sugerencias');

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES, 'utf8'), ...EMULADOR },
  });
  ctx = testEnv.authenticatedContext('uid-test');
  fs = firestoreDe(ctx);
});
afterEach(async () => {
  // el emulador a veces devuelve 500 en el clear justo después del ciclo disable/enableNetwork de (f):
  // un respiro y reintento — es limpieza entre tests, no semántica de la app
  try { await testEnv.clearFirestore(); }
  catch { await new Promise(r => setTimeout(r, 300)); await testEnv.clearFirestore(); }
});
afterAll(async () => { await testEnv.cleanup(); });

// ---------- la suite de contrato, tal cual la pasa el fake (con el margen del emulador) ----------
describeContratoDb('firestore (emulador)', async () => ({ db: crearDbFirestore({ db: fs, miUid: () => 'uid-test' }) }), { esperaMs: ESPERA_MS });

// ---------- lo específico de Firestore ----------
describe('firestore (emulador) · específico', () => {
  let db: Db;
  let errores: DbError[];
  let offError: () => void;
  const offs: (() => void)[] = [];
  const espiar = (d: Db, listId: string) => { const e = ultimaVista(d, listId); offs.push(e.off); return e; };

  beforeEach(() => { db = crearDbFirestore({ db: fs, miUid: () => 'uid-test' }); errores = []; offError = db.onError(e => errores.push(e)); });
  afterEach(() => { for (const off of offs.splice(0)) off(); offError(); });

  /** lista nueva con Mamá y Papá, esperada hasta que la vista la trae; yo = Mamá */
  async function listaLista(d = db): Promise<{ id: string; yo: Yo; v: Vista }> {
    const id = await d.crearLista('Casa', ['Mamá', 'Papá']);
    const v = await esperarVista(d, id, x => x.existe && x.miembros.length === 2 && x.sugerencias.length > 0, ESPERA_MS, 'la lista creada');
    const mama = v.miembros.find(m => m.nombre === 'Mamá')!;
    return { id, yo: { memberId: mama.id, nombre: 'Mamá' }, v };
  }

  it('(a) el doc del ítem tiene exactamente las claves del esquema, nace "pendiente" y los timestamps son Timestamp; la lista queda sincronizada', async () => {
    const { id, yo } = await listaLista();
    const espia = espiar(db, id);
    const itemId = db.agregarItem(id, 'Leche', yo);
    // "sincronizada" = el ítem confirmado, nada en vuelo y ningún snapshot de caché (los cuatro listeners al día con el servidor)
    const v = await espia.esperar(x => !!item(x, itemId) && !item(x, itemId)!.pendiente && !x.hasPendingWrites && !x.fromCache, ESPERA_MS, 'el ítem confirmado y la lista sincronizada');
    const snap = await getDoc(doc(fs, 'listas', id, 'items', itemId));
    expect(snap.exists()).toBe(true);
    const d = snap.data()!;
    expect(Object.keys(d).sort()).toEqual([...CLAVES_ITEM].sort());
    expect(d).toMatchObject({
      texto: 'Leche', textoNorm: 'leche', estado: 'pendiente',
      agregadoPor: yo.memberId, agregadoPorNombre: 'Mamá',
      compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null,
      // nace firmado por quien lo anotó y sin súper (D13/D19)
      actualizadoPor: yo.memberId, actualizadoPorNombre: 'Mamá', mercado: null,
    });
    expect(d.agregadoEn).toBeInstanceOf(Timestamp);
    expect(d.actualizadoEn).toBeInstanceOf(Timestamp);
    // y la vista mapea a ms y ya no viene de caché
    expect(item(v, itemId)!.agregadoEn).toBe((d.agregadoEn as Timestamp).toMillis());
    expect(v.fromCache).toBe(false);
    expect(v.hasPendingWrites).toBe(false);
    expect(v.ultimaSync).toEqual(expect.any(Number));
    // los docs de lista y miembros también respetan el esquema (las reglas hacen hasOnly)
    const lista = (await getDoc(doc(fs, 'listas', id))).data()!;
    expect(Object.keys(lista).sort()).toEqual(['creadaEn', 'duenio', 'esquema', 'nombre']);   // D22: nace con dueño
    expect(lista.esquema).toBe(2);   // 2 = los ítems traen `mercado` (D13)
    const miembro = (await getDoc(doc(fs, 'listas', id, 'miembros', yo.memberId!))).data()!;
    expect(Object.keys(miembro).sort()).toEqual(['color', 'creadoEn', 'nombre']);
    expect(errores).toEqual([]);
  });

  it('(b) meta/sugerencias es UN doc { entradas } con la clave textoNorm, incluso con puntos ("coca 1.5 l" queda como UNA clave, no se anida)', async () => {
    const { id, yo } = await listaLista();
    const espia = espiar(db, id);
    db.agregarItem(id, 'Coca 1.5 L', yo);
    db.agregarItem(id, 'coca 1.5 l', yo);
    // veces=2 lo muestra ya el eco local (increment); para leer el doc del servidor esperamos a que las escrituras
    // en vuelo (el ítem y el uso en sugerencias, que va aparte) tengan acuse
    const v = await espia.esperar(x => (x.sugerencias.find(s => s.textoNorm === 'coca 1.5 l')?.veces ?? 0) >= 2, ESPERA_MS, 'la sugerencia "coca 1.5 l" con veces 2');
    expect(v.sugerencias.filter(s => s.textoNorm.startsWith('coca'))).toHaveLength(1);
    await waitForPendingWrites(fs);
    const snap = await getDoc(refSugerenciasDe(fs, id));
    const d = snap.data()!;
    expect(Object.keys(d)).toEqual(['entradas']);
    const entradas = d.entradas as Record<string, { texto: string; veces: number; ultimaVez: unknown }>;
    expect(Object.keys(entradas)).toHaveLength(SEMILLA_SUGERENCIAS.length + 1);
    expect(entradas['coca 1.5 l']).toMatchObject({ veces: 2 });
    expect(entradas['coca 1.5 l']!.ultimaVez).toBeInstanceOf(Timestamp);
    // ni "coca" con un mapa "5 l" adentro ni nada parecido: la clave con punto es literal
    expect('coca' in entradas).toBe(false);
    expect(Object.keys(entradas).filter(k => k.startsWith('coca'))).toEqual(['coca 1.5 l']);
    // la semilla está con veces 0 y ultimaVez null
    expect(entradas['leche']).toEqual({ texto: 'Leche', veces: 0, ultimaVez: null });
    expect(errores).toEqual([]);
  });

  it('(b2) el uso en sugerencias es un extra silencioso: sin el doc meta/sugerencias el ítem entra igual y el doc se crea con esa sola entrada; con el doc lleno (tope de las reglas) el ítem entra igual y NO llega ningún error a onError', async () => {
    const { id, yo } = await listaLista();
    const espia = espiar(db, id);
    await espia.esperar(x => x.sugerencias.length > 0, ESPERA_MS, 'la semilla de sugerencias');
    // 1) sin doc: alguien lo borró (o nunca existió)
    await testEnv.withSecurityRulesDisabled(async c => { await deleteDoc(refSugerenciasDe(firestoreDe(c), id)); });
    await espia.esperar(x => x.sugerencias.length === 0, ESPERA_MS, 'la vista sin sugerencias (el doc se borró)');
    const leche = db.agregarItem(id, 'Leche', yo);
    await espia.esperar(x => !!item(x, leche) && !item(x, leche)!.pendiente && x.sugerencias.some(s => s.textoNorm === 'leche' && s.veces === 1), ESPERA_MS, '"Leche" confirmada y su uso en sugerencias');
    await waitForPendingWrites(fs);
    const creado = (await getDoc(refSugerenciasDe(fs, id))).data()!;
    expect(Object.keys(creado)).toEqual(['entradas']);
    expect(Object.keys(creado.entradas)).toEqual(['leche']);
    expect(creado.entradas.leche).toMatchObject({ texto: 'Leche', veces: 1 });
    expect(errores).toEqual([]);
    // 2) doc lleno: la entrada nueva no entra (reglas), pero el ítem sí, y sin ruido
    const llenas: Record<string, unknown> = {};
    for (let i = 0; i < TOPE_SUGERENCIAS; i++) llenas[`producto ${i}`] = { texto: `Producto ${i}`, veces: 0, ultimaVez: null };
    await testEnv.withSecurityRulesDisabled(async c => { await setDoc(refSugerenciasDe(firestoreDe(c), id), { entradas: llenas }); });
    await espia.esperar(x => x.sugerencias.length === TOPE_SUGERENCIAS, ESPERA_MS, 'la vista con el doc lleno');
    const yerba = db.agregarItem(id, 'Yerba', yo);
    const v = await espia.esperar(x => !!item(x, yerba) && !item(x, yerba)!.pendiente && !x.hasPendingWrites, ESPERA_MS, '"Yerba" confirmada y nada en vuelo');
    expect(item(v, yerba)).toMatchObject({ texto: 'Yerba', estado: 'pendiente', pendiente: false });
    await waitForPendingWrites(fs);
    const lleno = (await getDoc(refSugerenciasDe(fs, id))).data()!;
    expect(Object.keys(lleno.entradas)).toHaveLength(TOPE_SUGERENCIAS);
    expect('yerba' in lleno.entradas).toBe(false);
    // el rechazo del uso NO es un error de la operación del usuario: onError sigue en silencio
    expect(errores).toEqual([]);
  });

  it('(c) un segundo cliente (otro uid, otra instancia) ve el ítem del primero en tiempo real, y el primero ve el tilde del segundo', async () => {
    const { id, yo, v: v0 } = await listaLista();
    const papa = v0.miembros.find(m => m.nombre === 'Papá')!;
    const otro: Db = crearDbFirestore({ db: firestoreDe(testEnv.authenticatedContext('uid-otro')), miUid: () => 'uid-otro' });
    await otro.entrar(id, { codigo: await db.invitar(id) });   // sin ventana (D22), la llave entra por invitación
    const erroresOtro: DbError[] = [];
    offs.push(otro.onError(e => erroresOtro.push(e)));
    const espiaOtro = espiar(otro, id);
    const espia = espiar(db, id);
    await espiaOtro.esperar(x => x.existe && x.miembros.length === 2, ESPERA_MS, 'la lista en el segundo cliente');

    const itemId = db.agregarItem(id, 'Yerba', yo);
    const vOtro = await espiaOtro.esperar(x => !!item(x, itemId), ESPERA_MS, 'el ítem en el segundo cliente');
    // le llegó del servidor: no es una escritura suya
    expect(item(vOtro, itemId)).toMatchObject({ texto: 'Yerba', estado: 'pendiente', pendiente: false, agregadoPor: yo.memberId, agregadoPorNombre: 'Mamá' });
    expect(vOtro.hasPendingWrites).toBe(false);

    otro.marcarComprado(id, itemId, true, { memberId: papa.id, nombre: 'Papá' });
    const v = await espia.esperar(x => item(x, itemId)?.estado === 'comprado' && !item(x, itemId)!.pendiente, ESPERA_MS, 'el tilde de Papá en el primer cliente');
    expect(item(v, itemId)).toMatchObject({ compradoPor: papa.id, compradoPorNombre: 'Papá' });
    expect(item(v, itemId)!.compradoEn).toEqual(expect.any(Number));
    // ambos convergen en la misma sugerencia
    await espiaOtro.esperar(x => (x.sugerencias.find(s => s.textoNorm === 'yerba')?.veces ?? 0) === 1, ESPERA_MS, 'la sugerencia "yerba" en el segundo cliente');
    expect(errores).toEqual([]);
    expect(erroresOtro).toEqual([]);
  });

  it('(d) un listId inexistente rebota con permiso tras los reintentos, sin emitir jamás una vista: privacidad — "no existe" y "no es tuya" son indistinguibles (D22)', async () => {
    const listId = `noexiste${nuevoId(12)}`;
    const espia = espiar(db, listId);
    // el error tarda: suscribir reintenta el permission-denied (la llave podría estar en vuelo) antes de rendirse
    const hasta = Date.now() + ESPERA_MS;
    while (!errores.some(e => e.tipo === 'permiso') && Date.now() < hasta) await new Promise(r => setTimeout(r, 50));
    expect(
      errores.some(e => e.tipo === 'permiso' && e.operacion === 'suscribir'),
      `(d) pasaron ${ESPERA_MS} ms esperando un error de permiso en suscribir sobre ${listId} y no llegó; errores recibidos: ${JSON.stringify(errores)}`,
    ).toBe(true);
    // ninguna vista: ni existe=true ni un falso "no existe" salido de la caché vacía
    expect(espia.todas).toEqual([]);
    errores.length = 0;
    espia.off();
  });

  it('(e) una escritura que las reglas rechazan llega a onError como "permiso" (con operación e itemId) y la vista vuelve atrás', async () => {
    const { id, yo } = await listaLista();
    const espia = espiar(db, id);
    const itemId = db.agregarItem(id, 'Leche', yo);
    await espia.esperar(x => !!item(x, itemId) && !item(x, itemId)!.pendiente, ESPERA_MS, 'el ítem confirmado');
    const error = new Promise<DbError>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`No llegó ningún error en ${ESPERA_MS} ms (errores: ${JSON.stringify(errores)})`)), ESPERA_MS);
      offs.push(db.onError(e => { clearTimeout(t); resolve(e); }));
    });
    // 121 caracteres: las reglas exigen texto de 1..120 → permission-denied
    db.editarItem(id, itemId, 'x'.repeat(121), yo);
    const e = await error;
    expect(e).toMatchObject({ tipo: 'permiso', operacion: 'editarItem', itemId });
    expect(typeof e.mensaje).toBe('string');
    // el eco local se deshace: el texto vuelve a ser el confirmado y no queda nada pendiente
    const v = await espia.esperar(x => item(x, itemId)?.texto === 'Leche' && !item(x, itemId)!.pendiente && !x.hasPendingWrites, ESPERA_MS, 'el ítem revertido');
    expect(item(v, itemId)!.textoNorm).toBe('leche');
    expect(errores).toHaveLength(1);
  });

  it('(f) sin red la escritura queda pendiente (eco local, fromCache) y al volver se confirma y la ve el otro cliente', async () => {
    const { id, yo } = await listaLista();
    const otro: Db = crearDbFirestore({ db: firestoreDe(testEnv.authenticatedContext('uid-otro')), miUid: () => 'uid-otro' });
    await otro.entrar(id, { codigo: await db.invitar(id) });   // sin ventana (D22), la llave entra por invitación
    const espiaOtro = espiar(otro, id);
    const espia = espiar(db, id);
    await espiaOtro.esperar(x => x.existe, ESPERA_MS, 'la lista en el segundo cliente');
    const itemId = db.agregarItem(id, 'Pan', yo);
    await espia.esperar(x => !!item(x, itemId) && !item(x, itemId)!.pendiente, ESPERA_MS, 'el ítem confirmado');
    await espiaOtro.esperar(x => !!item(x, itemId), ESPERA_MS, 'el ítem en el segundo cliente');

    await disableNetwork(fs);
    try {
      db.marcarComprado(id, itemId, true, yo);
      const v = await espia.esperar(x => item(x, itemId)?.estado === 'comprado', ESPERA_MS, 'el tilde local sin red');
      expect(item(v, itemId)).toMatchObject({ pendiente: true, compradoPor: yo.memberId });
      // el serverTimestamp todavía no resolvió: null o una estimación local, nunca otra cosa
      expect(esMsONull(item(v, itemId)!.compradoEn)).toBe(true);
      expect(v.hasPendingWrites).toBe(true);
      expect(v.fromCache).toBe(true);
      // el otro no lo ve mientras no hay red (le damos un respiro y seguimos: la prueba fuerte es la de abajo)
      await new Promise(r => setTimeout(r, 300));
      expect(item(espiaOtro.actual()!, itemId)!.estado).toBe('pendiente');
    } finally {
      await enableNetwork(fs);
    }
    const v = await espia.esperar(x => item(x, itemId)?.estado === 'comprado' && !item(x, itemId)!.pendiente && !x.hasPendingWrites, ESPERA_MS, 'el tilde confirmado al volver la red');
    expect(item(v, itemId)!.compradoEn).toEqual(expect.any(Number));
    expect(v.hasPendingWrites).toBe(false);
    const vOtro = await espiaOtro.esperar(x => item(x, itemId)?.estado === 'comprado', ESPERA_MS, 'el tilde en el segundo cliente');
    expect(item(vOtro, itemId)).toMatchObject({ compradoPor: yo.memberId, compradoPorNombre: 'Mamá' });
    expect(errores).toEqual([]);
  });
});
