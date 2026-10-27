/**
 * Suite de contrato de la interfaz `Db`: lo que CUALQUIER implementación tiene que cumplir.
 * Se registra con vitest desde un archivo de test por implementación:
 *   describeContratoDb('fake', async () => ({ db: crearDbFake({ semilla: 'vacio', latencia: 0 }) }), { esperaMs: 1500 });
 *   describeContratoDb('firestore (emulador)', async () => ({ db: crearDbFirestore({ db }) }), { esperaMs: ESPERA_MS });
 * Es una compuerta, no un porcentaje: el fake tiene que pasarla igual que el real, así el fake nunca miente.
 *
 * Cómo está escrita para que valga en las dos:
 *  - cada test crea SU lista (id aleatorio) → no se pisan entre sí ni entre implementaciones;
 *  - nada se afirma "de inmediato": se espera a que la Vista cumpla un predicado (`esperar`), con timeout
 *    y un mensaje que cuenta qué se esperaba y qué había. El timeout lo pone quien registra la suite (`esperaMs`):
 *    tiene que quedar por debajo del testTimeout del proyecto CON margen —el testTimeout es por `it` y un `it`
 *    encadena varias esperas—, si no el mensaje diagnóstico nunca se ve. Lo hace cumplir un test
 *    (tests/unit/reloj-suite-contrato.test.ts: testTimeout ≥ 3 × la espera), no la buena voluntad;
 *  - mientras un ítem está `pendiente` (serverTimestamp sin resolver) sus fechas pueden venir `null` (el fake) o
 *    como una estimación (Firestore con serverTimestamps:'estimate'): las aserciones sobre fechas esperan
 *    `!it.pendiente` y aceptan `number | null` donde corresponde;
 *  - el orden de ítems/miembros/sugerencias no importa (Firestore no lo garantiza): se compara por conjuntos;
 *  - cada test que escribe termina viendo su escritura en la Vista (el eco local ya viene con hasPendingWrites):
 *    el afterEach espera a que no quede nada en vuelo ANTES de mirar `errores`, así un rechazo del servidor que
 *    llega después del eco no se escapa. Los tests que provocan un error lo consumen (`consumirErrores`).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db, DbError, Item, Miembro, Sugerencia, Vista, Yo } from './types';
import { normalizar } from '@/domain/normalizar';
import { SEMILLA_SUGERENCIAS } from '@/domain/sugerencias';
import { nuevoId } from '@/domain/ids';

/**
 * Espera por defecto: la de los helpers sueltos (`ultimaVista`, `esperarVista`) y la de quien registra la suite
 * sin pasar `esperaMs` — hoy, la del emulador.
 *
 * No es "el margen del emulador, que confirma en decenas de ms": eso era cierto y dejó de serlo. El camino feliz
 * sí resuelve en ms, pero dos tests de la suite se montan sobre la escalera de reintentos que `suscribir` hace
 * ante permission-denied (REINTENTO_PERMISO en src/db/firestore.ts: 500+1000+2000 = 3500 ms de sleep deliberado),
 * y miden ~3,5 s de piso. Encima esta espera dejó de ser la de un test que se re-corre cuando sale raro: desde
 * scripts/verificar-release.mjs es el presupuesto de una PUERTA obligatoria de deploy, encadenada justo después
 * de unit+ui, o sea en el peor momento de carga y con todo en frío (Windows). Una puerta se dimensiona para el
 * peor caso: su rojo falso no cuesta el minuto perdido, cuesta que después se la ignore cuando grita en serio —
 * y acá el mensaje del rojo acusa al producto ("no llegó NINGUNA vista"), que es peor todavía. En verde no cuesta
 * nada: lo que se cumple, se cumple en ms.
 */
export const ESPERA_MS = 20_000;

export interface ContratoCtx {
  db: Db;
  /** limpieza al final de cada test (opcional: cerrar listeners, borrar datos, etc.) */
  limpiar?: () => Promise<void>;
}

export interface ContratoOpts {
  /** tiempo máximo de espera por una condición sobre la Vista o por un error (default: ESPERA_MS) */
  esperaMs?: number;
}

/** Predicado sobre una vista. Si tira (por ejemplo `.pendiente` de un ítem que todavía no está), cuenta como falso. */
export type PredVista = (v: Vista) => boolean;

export interface Espia {
  /** todas las vistas recibidas, en orden */
  todas: Vista[];
  /** la última vista recibida (undefined si todavía no llegó ninguna) */
  actual: () => Vista | undefined;
  /** resuelve con la primera vista (la actual o una futura) que cumpla `pred`; rechaza por timeout con detalle */
  esperar: (pred: PredVista, timeoutMs?: number, que?: string) => Promise<Vista>;
  /** false después de `off()` */
  activo: () => boolean;
  /** corta la suscripción; limpia sus timers y rechaza las esperas colgadas */
  off: () => void;
}

/**
 * Suscribe a la lista y guarda la última vista (y todas las anteriores) para poder afirmar sobre lo que pasó
 * en el medio (por ejemplo: "en algún momento el ítem estuvo `pendiente`").
 * `esperaDefaultMs` es el timeout de `esperar` cuando no se pasa uno.
 */
export function ultimaVista(db: Db, listId: string, esperaDefaultMs = ESPERA_MS): Espia {
  const todas: Vista[] = [];
  type Espera = { pred: PredVista; que: string; resolver: (v: Vista) => void; rechazar: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
  const esperas = new Set<Espera>();
  const cumple = (pred: PredVista, v: Vista): boolean => { try { return pred(v); } catch { return false; } };
  let cortada = false;
  const off = db.suscribir(listId, v => {
    if (cortada) return;
    todas.push(v);
    for (const e of [...esperas]) if (cumple(e.pred, v)) { esperas.delete(e); clearTimeout(e.timer); e.resolver(v); }
  });
  return {
    todas,
    actual: () => todas.at(-1),
    activo: () => !cortada,
    esperar(pred, timeoutMs = esperaDefaultMs, que = 'la condición') {
      if (cortada) return Promise.reject(new Error(`Esperando ${que} en la lista ${listId}: el espía ya fue cortado (off) y no va a recibir más vistas`));
      const ya = todas.at(-1);
      if (ya && cumple(pred, ya)) return Promise.resolve(ya);
      return new Promise<Vista>((resolve, reject) => {
        const espera: Espera = {
          pred, que, resolver: resolve, rechazar: reject,
          timer: setTimeout(() => { esperas.delete(espera); reject(new Error(mensajeTimeout(listId, que, timeoutMs, todas))); }, timeoutMs),
        };
        esperas.add(espera);
      });
    },
    // idempotente: el afterEach de la suite corta todos los espías, incluso los que el test ya cortó
    off: () => {
      if (cortada) return;
      cortada = true;
      off();
      // ningún timer vivo después del test; una espera colgada se rechaza con un mensaje claro en vez de quedar para siempre
      for (const e of esperas) { clearTimeout(e.timer); e.rechazar(new Error(`Esperando ${e.que} en la lista ${listId}: el espía fue cortado (off) antes de que se cumpliera`)); }
      esperas.clear();
    },
  };
}

/** Suscribe, espera a que la Vista cumpla `pred` (o rechaza por timeout) y se desuscribe. */
export async function esperarVista(db: Db, listId: string, pred: PredVista, timeoutMs = ESPERA_MS, que?: string): Promise<Vista> {
  const espia = ultimaVista(db, listId, timeoutMs);
  try { return await espia.esperar(pred, timeoutMs, que); } finally { espia.off(); }
}

function mensajeTimeout(listId: string, que: string, timeoutMs: number, todas: Vista[]): string {
  const v = todas.at(-1);
  const resumen = !v
    ? 'no llegó NINGUNA vista'
    : [
      `existe=${v.existe}`, `lista=${v.lista ? JSON.stringify(v.lista.nombre) : 'null'}`,
      `items=[${v.items.map(i => `${i.id.slice(0, 6)}:${i.estado}${i.pendiente ? '*' : ''}`).join(', ')}]`,
      `miembros=[${v.miembros.map(m => `${m.nombre}(${m.color})`).join(', ')}]`,
      `sugerencias=${v.sugerencias.length}`,
      `fromCache=${v.fromCache}`, `hasPendingWrites=${v.hasPendingWrites}`, `online=${v.online}`, `ultimaSync=${v.ultimaSync}`,
    ].join(' · ');
  return `Esperando ${que} en la lista ${listId}: pasaron ${timeoutMs} ms y no se cumplió. Última vista (${todas.length} recibidas): ${resumen}`;
}

// ---------- helpers de lectura ----------
const item = (v: Vista, id: string): Item | undefined => v.items.find(i => i.id === id);
const miembro = (v: Vista, nombre: string): Miembro | undefined => v.miembros.find(m => m.nombre === nombre);
const sugerencia = (v: Vista, textoNorm: string): Sugerencia | undefined => v.sugerencias.find(s => s.textoNorm === textoNorm);
const ID_RE = /^[A-Za-z0-9]{20}$/;
const esMsONull = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x));
const idsOrdenados = (xs: { id: string }[]) => xs.map(x => x.id).sort();
const listIdInexistente = () => `noexiste${nuevoId(12)}`;
const sinPendientes: PredVista = v => !v.hasPendingWrites;

/**
 * Registra la suite de contrato bajo `describe(nombre)`.
 * `crear` se llama en cada test (beforeEach) y puede devolver la misma instancia o una nueva; `limpiar` corre al final.
 */
export function describeContratoDb(nombre: string, crear: () => Promise<ContratoCtx>, opts: ContratoOpts = {}): void {
  const esperaMs = opts.esperaMs ?? ESPERA_MS;
  describe(`contrato Db · ${nombre}`, () => {
    // el afterEach no toca `db`: si `crear()` tira en el beforeEach, igual limpia (todo lo demás arranca con un valor)
    let db: Db;
    let limpiar: (() => Promise<void>) | undefined;
    let errores: DbError[] = [];
    let offError: (() => void) | undefined;
    let espias: Espia[] = [];
    type EsperaError = { pred: (e: DbError) => boolean; resolver: (e: DbError) => void; timer: ReturnType<typeof setTimeout> };
    let esperasError = new Set<EsperaError>();

    /** espía registrado para cortarlo al final del test aunque el test falle a mitad */
    const espiar = (listId: string): Espia => { const e = ultimaVista(db, listId, esperaMs); espias.push(e); return e; };
    /** resuelve con el primer error (ya recibido o futuro) que cumpla `pred`; rechaza por timeout con lo recibido */
    function esperarError(pred: (e: DbError) => boolean, que: string): Promise<DbError> {
      const ya = errores.find(pred);
      if (ya) return Promise.resolve(ya);
      return new Promise<DbError>((resolve, reject) => {
        const w: EsperaError = {
          pred, resolver: resolve,
          timer: setTimeout(() => { esperasError.delete(w); reject(new Error(`Esperando ${que}: pasaron ${esperaMs} ms y no llegó ningún error que lo cumpla (recibidos: ${JSON.stringify(errores)})`)); }, esperaMs),
        };
        esperasError.add(w);
      });
    }
    /** saca (y devuelve) los errores recibidos hasta ahora: los tests que esperan uno lo consumen; el afterEach exige que no quede ninguno */
    const consumirErrores = (): DbError[] => errores.splice(0);
    /** crea una lista y espera a que la vista la traiga (con miembros y sugerencias) */
    async function listaLista(nombre = 'Casa', miembros = ['Mamá', 'Papá']): Promise<{ id: string; espia: Espia; v: Vista; yo: Yo }> {
      const id = await db.crearLista(nombre, miembros);
      const espia = espiar(id);
      const v = await espia.esperar(
        x => x.existe && x.lista !== null && x.miembros.length === miembros.filter(m => m.trim()).length && x.sugerencias.length > 0,
        esperaMs, 'la lista recién creada (existe, miembros y sugerencias)');
      const m0 = miembros.map(m => m.trim()).find(Boolean);
      const yoM = m0 ? miembro(v, m0) : undefined;
      const yo: Yo = yoM ? { memberId: yoM.id, nombre: yoM.nombre } : { memberId: null, nombre: null };
      return { id, espia, v, yo };
    }
    /** agrega y espera la confirmación (ítem presente y no pendiente) */
    async function agregarConfirmado(id: string, espia: Espia, texto: string, yo: Yo): Promise<Item> {
      const itemId = db.agregarItem(id, texto, yo);
      const v = await espia.esperar(x => !!item(x, itemId) && !item(x, itemId)!.pendiente, esperaMs, `el ítem ${JSON.stringify(texto)} confirmado`);
      return item(v, itemId)!;
    }

    beforeEach(async () => {
      limpiar = undefined; offError = undefined;
      errores = []; espias = []; esperasError = new Set();
      ({ db, limpiar } = await crear());
      offError = db.onError(e => {
        errores.push(e);
        for (const w of [...esperasError]) if (w.pred(e)) { esperasError.delete(w); clearTimeout(w.timer); w.resolver(e); }
      });
    });
    afterEach(async () => {
      try {
        // que el servidor termine de contestar TODO lo que este test escribió: recién ahí un rechazo tardío
        // habría llegado a onError (los espías cortados por el test ya no reciben nada: no se los espera)
        await Promise.all(espias.filter(e => e.activo()).map(e => e.esperar(sinPendientes, esperaMs, 'que no quede nada en vuelo (afterEach)')));
        // camino feliz: ninguna operación de estos tests emite error (los que esperan uno lo consumieron)
        expect(errores).toEqual([]);
      } finally {
        for (const e of espias) e.off();
        for (const w of esperasError) clearTimeout(w.timer);
        esperasError.clear();
        offError?.();
        await limpiar?.();
      }
    });

    // ---------- crearLista / suscribir ----------
    describe('crearLista', () => {
      it('devuelve un id de 20 chars y la vista la trae: existe, nombre recortado, miembros con colores distintos, semilla de sugerencias', async () => {
        const id = await db.crearLista('  Casa de la abuela ', ['Mamá', ' Papá ', '', 'Ana']);
        expect(id).toMatch(ID_RE);
        const v = await espiar(id).esperar(x => x.existe && x.lista !== null && x.miembros.length === 3 && x.sugerencias.length > 0, esperaMs, 'la lista creada');
        expect(v.lista).toMatchObject({ id, nombre: 'Casa de la abuela' });
        expect(esMsONull(v.lista!.creadaEn)).toBe(true);
        expect(v.items).toEqual([]);
        // miembros: nombres recortados, los vacíos se saltean, colores por orden de llegada y todos distintos
        const porNombre = Object.fromEntries(v.miembros.map(m => [m.nombre, m.color]));
        expect(porNombre).toEqual({ 'Mamá': 'p1', 'Papá': 'p2', 'Ana': 'p3' });
        expect(new Set(v.miembros.map(m => m.color)).size).toBe(3);
        for (const m of v.miembros) { expect(m.id).toMatch(ID_RE); expect(esMsONull(m.creadoEn)).toBe(true); }
        // sugerencias = semilla, veces 0, sin uso
        expect(v.sugerencias.map(s => s.textoNorm).sort()).toEqual(SEMILLA_SUGERENCIAS.map(normalizar).sort());
        expect(v.sugerencias.map(s => s.texto).sort()).toEqual([...SEMILLA_SUGERENCIAS].sort());
        expect(v.sugerencias.every(s => s.veces === 0 && s.ultimaVez === null)).toBe(true);
      });
      it('nombre vacío → "Casa"; sin miembros → miembros vacíos', async () => {
        const id = await db.crearLista('   ', []);
        const v = await espiar(id).esperar(x => x.existe && x.lista !== null, esperaMs, 'la lista creada');
        expect(v.lista!.nombre).toBe('Casa');
        expect(v.miembros).toEqual([]);
      });
    });

    describe('suscribir', () => {
      it('sobre una lista a la que no podés entrar NUNCA dice existe=true; cómo lo dice depende del mundo', async () => {
        // dos mundos legítimos (D22): el fake sabe que la lista no existe (existe=false); Firestore con reglas
        // privadas NIEGA la lectura sin decir por qué — "no existe" y "no es tuya" son indistinguibles desde
        // afuera, a propósito. El contrato exige lo que importa: jamás una vista con existe=true.
        const espia = espiar(listIdInexistente());
        const porVista = espia.esperar(x => !x.existe, esperaMs, 'existe=false').then(v => ({ v }));
        const porPermiso = esperarError(e => e.tipo === 'permiso' && e.operacion === 'suscribir', 'el rechazo de permisos').then(e => ({ e }));
        const r = await Promise.race([porVista, porPermiso]);
        // el que perdió la carrera puede terminar rechazado al cortar el espía: que no quede sin catch
        void porVista.catch(() => undefined);
        void porPermiso.catch(() => undefined);
        if ('v' in r) {
          expect(r.v.lista).toBeNull();
          expect(r.v.items).toEqual([]);
          expect(r.v.miembros).toEqual([]);
        }
        consumirErrores();                                     // el rechazo (si lo hubo) ES el resultado esperado
        expect(espia.todas.every(x => !x.existe)).toBe(true);  // ni un flash de "existe" en ningún mundo
        espia.off();                                           // sin vistas no hay "nada en vuelo" que esperar
      });
      it('desuscribirse deja de notificar (otro suscriptor sigue recibiendo)', async () => {
        const { id, yo } = await listaLista();
        // suscriptor crudo (sin filtro propio): cuenta cada llamada; si el Db siguiera llamándolo, se nota
        let llamadas = 0;
        let primera!: () => void;
        const llego = new Promise<void>(r => { primera = r; });
        const off = db.suscribir(id, () => { llamadas++; primera(); });
        await llego;
        const b = espiar(id);
        await b.esperar(x => x.existe, esperaMs, 'la primera vista en b');
        const antes = llamadas;
        off();
        const itemId = db.agregarItem(id, 'Fideos', yo);
        await b.esperar(x => !!item(x, itemId) && !item(x, itemId)!.pendiente, esperaMs, 'el ítem confirmado en b');
        // b vio el ítem (eco y confirmación): si el crudo siguiera suscripto, también lo habría visto
        expect(llamadas).toBe(antes);
      });
    });

    // ---------- agregarItem ----------
    describe('agregarItem', () => {
      it('devuelve el id ya; la vista lo trae pendiente y después confirmado, con texto limpio y firmado por yo', async () => {
        const { id, espia, yo } = await listaLista();
        const itemId = db.agregarItem(id, '  Fideos   moñito ', yo);
        expect(itemId).toMatch(ID_RE);
        // "confirmado" = el ítem ya no está pendiente Y la vista no tiene nada en vuelo (pueden llegar en dos vistas distintas)
        const v = await espia.esperar(x => !!item(x, itemId) && !item(x, itemId)!.pendiente && !x.hasPendingWrites, esperaMs, 'el ítem confirmado y nada pendiente');
        const it1 = item(v, itemId)!;
        expect(it1).toMatchObject({
          texto: 'Fideos moñito', textoNorm: 'fideos moñito', estado: 'pendiente', pendiente: false,
          agregadoPor: yo.memberId, agregadoPorNombre: yo.nombre,
          compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null,
        });
        expect(it1.agregadoEn).toEqual(expect.any(Number));
        expect(it1.actualizadoEn).toEqual(expect.any(Number));
        expect(v.hasPendingWrites).toBe(false);
        // en algún momento del medio estuvo pendiente (eco local antes de la confirmación); las fechas de ese eco
        // pueden ser null o una estimación, nunca otra cosa
        const antes = espia.todas.map(x => item(x, itemId)).filter((x): x is Item => !!x);
        expect(antes[0]!.pendiente).toBe(true);
        expect(antes[0]!.estado).toBe('pendiente');
        expect(esMsONull(antes[0]!.agregadoEn)).toBe(true);
        expect(espia.todas.some(x => x.hasPendingWrites)).toBe(true);
      });
      it('sin identidad firma como "alguien"', async () => {
        const { id, espia } = await listaLista();
        const it1 = await agregarConfirmado(id, espia, 'Pan', { memberId: null, nombre: null });
        expect(it1).toMatchObject({ agregadoPor: 'alguien', agregadoPorNombre: 'alguien' });
      });
      it('texto vacío → onError validacion con el itemId devuelto, y no aparece nada', async () => {
        const { id, espia, yo } = await listaLista();
        const idVacio = db.agregarItem(id, '   ', yo);
        expect(idVacio).toMatch(ID_RE);
        const e = await esperarError(x => x.operacion === 'agregarItem' && x.itemId === idVacio, 'el error de validación del texto vacío');
        expect(e).toMatchObject({ tipo: 'validacion', operacion: 'agregarItem', itemId: idVacio });
        expect(typeof e.mensaje).toBe('string');
        // una escritura válida después confirma que el vacío nunca entró (ni como eco)
        const pan = await agregarConfirmado(id, espia, 'Pan', yo);
        expect(espia.todas.every(x => !item(x, idVacio))).toBe(true);
        expect(idsOrdenados(espia.actual()!.items)).toEqual([pan.id]);
        // el único error de este test es ese
        expect(consumirErrores()).toEqual([e]);
      });
      it('registra el uso en sugerencias: veces sube y ultimaVez deja de ser null; repetir suma; la semilla también cuenta', async () => {
        const { id, espia, yo } = await listaLista();
        db.agregarItem(id, 'Fideos moñito', yo);
        let v = await espia.esperar(x => (sugerencia(x, 'fideos moñito')?.veces ?? 0) >= 1 && sugerencia(x, 'fideos moñito')!.ultimaVez !== null, esperaMs, 'la sugerencia "fideos moñito" con veces ≥ 1 y ultimaVez');
        expect(sugerencia(v, 'fideos moñito')).toMatchObject({ texto: 'Fideos moñito', veces: 1 });
        db.agregarItem(id, 'fideos MOÑITO', yo);
        v = await espia.esperar(x => (sugerencia(x, 'fideos moñito')?.veces ?? 0) >= 2, esperaMs, 'la sugerencia con veces ≥ 2');
        expect(sugerencia(v, 'fideos moñito')!.veces).toBe(2);
        // 'Leche' viene en la semilla con 0: pasa a 1 sin duplicar la entrada (ultimaVez puede llegar recién con la
        // confirmación del servidor: el eco local ya muestra veces=1 aunque el serverTimestamp siga sin resolver)
        db.agregarItem(id, 'Leche', yo);
        v = await espia.esperar(x => (sugerencia(x, 'leche')?.veces ?? 0) >= 1 && sugerencia(x, 'leche')!.ultimaVez !== null, esperaMs, 'la sugerencia "leche" con veces ≥ 1 y ultimaVez');
        expect(v.sugerencias.filter(s => s.textoNorm === 'leche')).toHaveLength(1);
        expect(sugerencia(v, 'leche')!.ultimaVez).toEqual(expect.any(Number));
      });
    });

    // ---------- marcarComprado ----------
    describe('marcarComprado', () => {
      it('ida: comprado con compradoPor/nombre y compradoEn; vuelta: pendiente con todo en null; agregadoEn no se toca', async () => {
        const { id, espia, v: v0 } = await listaLista();
        const papa = miembro(v0, 'Papá')!;
        const yo: Yo = { memberId: papa.id, nombre: papa.nombre };
        const it0 = await agregarConfirmado(id, espia, 'Leche', yo);
        db.marcarComprado(id, it0.id, true, yo);
        let v = await espia.esperar(x => item(x, it0.id)?.estado === 'comprado' && !item(x, it0.id)!.pendiente, esperaMs, 'el ítem comprado y confirmado');
        let it1 = item(v, it0.id)!;
        expect(it1).toMatchObject({ estado: 'comprado', compradoPor: papa.id, compradoPorNombre: 'Papá' });
        expect(it1.compradoEn).toEqual(expect.any(Number));
        expect(it1.agregadoEn).toBe(it0.agregadoEn);
        expect(it1.agregadoPor).toBe(it0.agregadoPor);
        db.marcarComprado(id, it0.id, false, yo);
        v = await espia.esperar(x => item(x, it0.id)?.estado === 'pendiente' && !item(x, it0.id)!.pendiente, esperaMs, 'el ítem destildado y confirmado');
        it1 = item(v, it0.id)!;
        expect(it1).toMatchObject({ estado: 'pendiente', compradoEn: null, compradoPor: null, compradoPorNombre: null });
        expect(it1.agregadoEn).toBe(it0.agregadoEn);
      });
      it('sin identidad firma "alguien"', async () => {
        const { id, espia, yo } = await listaLista();
        const it0 = await agregarConfirmado(id, espia, 'Leche', yo);
        db.marcarComprado(id, it0.id, true, { memberId: null, nombre: null });
        const v = await espia.esperar(x => item(x, it0.id)?.estado === 'comprado' && !item(x, it0.id)!.pendiente, esperaMs, 'el ítem comprado');
        expect(item(v, it0.id)).toMatchObject({ compradoPor: 'alguien', compradoPorNombre: 'alguien' });
      });
    });

    // ---------- editarItem ----------
    describe('editarItem', () => {
      it('cambia texto y textoNorm (limpiando espacios); el texto vacío se ignora', async () => {
        const { id, espia, yo } = await listaLista();
        const it0 = await agregarConfirmado(id, espia, 'Leche', yo);
        db.editarItem(id, it0.id, '  Leche   ENTERA ', yo);
        let v = await espia.esperar(x => item(x, it0.id)?.texto === 'Leche ENTERA' && !item(x, it0.id)!.pendiente, esperaMs, 'el ítem editado y confirmado');
        expect(item(v, it0.id)).toMatchObject({ texto: 'Leche ENTERA', textoNorm: 'leche entera', estado: 'pendiente' });
        expect(item(v, it0.id)!.actualizadoEn).toEqual(expect.any(Number));
        // vacío → nada; lo comprobamos con una edición posterior: en ninguna vista intermedia el texto quedó vacío
        db.editarItem(id, it0.id, '   ', yo);
        db.editarItem(id, it0.id, 'Leche descremada', yo);
        v = await espia.esperar(x => item(x, it0.id)?.texto === 'Leche descremada' && !item(x, it0.id)!.pendiente, esperaMs, 'la segunda edición confirmada');
        expect(espia.todas.every(x => (item(x, it0.id)?.texto ?? 'x') !== '')).toBe(true);
        expect(item(v, it0.id)!.textoNorm).toBe('leche descremada');
      });
    });

    // ---------- borrarItem / restaurarItem / exportar ----------
    describe('borrarItem / restaurarItem', () => {
      it('borrar lo saca de la vista (borrado lógico: exportar lo sigue trayendo como "borrado"); restaurar lo devuelve al estado previo', async () => {
        const { id, espia, yo } = await listaLista();
        const leche = await agregarConfirmado(id, espia, 'Leche', yo);
        const pan = await agregarConfirmado(id, espia, 'Pan', yo);
        db.marcarComprado(id, pan.id, true, yo);
        await espia.esperar(x => item(x, pan.id)?.estado === 'comprado' && !item(x, pan.id)!.pendiente, esperaMs, '"Pan" comprado');

        db.borrarItem(id, leche.id);
        db.borrarItem(id, pan.id);
        await espia.esperar(x => !item(x, leche.id) && !item(x, pan.id) && !x.hasPendingWrites, esperaMs, 'los dos ítems fuera de la vista y sin pendientes');
        const exp = await db.exportar(id) as { exportadoEn: string; lista: { id: string; nombre: string }; miembros: unknown[]; items: Item[]; sugerencias: unknown[] };
        expect(exp.lista).toMatchObject({ id, nombre: 'Casa' });
        expect(new Date(exp.exportadoEn).toISOString()).toBe(exp.exportadoEn);
        expect(exp.miembros).toHaveLength(2);
        expect(exp.sugerencias.length).toBeGreaterThan(0);
        expect(exp.items.find(i => i.id === leche.id)).toMatchObject({ estado: 'borrado', texto: 'Leche' });
        expect(exp.items.find(i => i.id === pan.id)).toMatchObject({ estado: 'borrado', texto: 'Pan' });
        expect(esMsONull(exp.items.find(i => i.id === leche.id)!.borradoEn)).toBe(true);

        db.restaurarItem(id, leche.id, 'pendiente', yo);
        db.restaurarItem(id, pan.id, 'comprado', yo);
        const v = await espia.esperar(x => !!item(x, leche.id) && !!item(x, pan.id) && !item(x, leche.id)!.pendiente && !item(x, pan.id)!.pendiente, esperaMs, 'los dos ítems restaurados y confirmados');
        expect(item(v, leche.id)).toMatchObject({ estado: 'pendiente', borradoEn: null, texto: 'Leche' });
        expect(item(v, pan.id)).toMatchObject({ estado: 'comprado', borradoEn: null, compradoPor: yo.memberId });
      });
    });

    // ---------- vaciarComprados ----------
    describe('vaciarComprados', () => {
      it('devuelve los ids de los comprados y los saca; deshacer los devuelve como comprados', async () => {
        const { id, espia, yo } = await listaLista();
        const leche = await agregarConfirmado(id, espia, 'Leche', yo);
        const pan = await agregarConfirmado(id, espia, 'Pan', yo);
        const huevos = await agregarConfirmado(id, espia, 'Huevos', yo);
        db.marcarComprado(id, pan.id, true, yo);
        db.marcarComprado(id, huevos.id, true, yo);
        await espia.esperar(x => x.items.filter(i => i.estado === 'comprado' && !i.pendiente).length === 2, esperaMs, 'dos comprados confirmados');

        const { ids, deshacer } = db.vaciarComprados(id);
        expect([...ids].sort()).toEqual([pan.id, huevos.id].sort());
        let v = await espia.esperar(x => x.items.length === 1 && !x.hasPendingWrites, esperaMs, 'solo queda el pendiente');
        expect(idsOrdenados(v.items)).toEqual([leche.id]);

        deshacer();
        v = await espia.esperar(x => x.items.filter(i => i.estado === 'comprado' && !i.pendiente).length === 2, esperaMs, 'los dos comprados de vuelta');
        expect(idsOrdenados(v.items.filter(i => i.estado === 'comprado'))).toEqual([pan.id, huevos.id].sort());
        expect(v.items.filter(i => i.estado === 'comprado').every(i => i.borradoEn === null)).toBe(true);
        expect(item(v, leche.id)!.estado).toBe('pendiente');
      });
      it('lo recién escrito manda: destildar y vaciar en el MISMO tick no vacía el destildado; tildar y vaciar en el mismo tick SÍ vacía el recién tildado', async () => {
        // es lo que hace useLista.confirmarVaciar: destilda lo que todavía se ve arriba y recién ahí vacía, sin soltar el hilo
        const { id, espia, yo } = await listaLista();
        const leche = await agregarConfirmado(id, espia, 'Leche', yo);
        const pan = await agregarConfirmado(id, espia, 'Pan', yo);
        const huevos = await agregarConfirmado(id, espia, 'Huevos', yo);
        db.marcarComprado(id, pan.id, true, yo);
        db.marcarComprado(id, huevos.id, true, yo);
        await espia.esperar(x => x.items.filter(i => i.estado === 'comprado' && !i.pendiente).length === 2 && !x.hasPendingWrites, esperaMs, 'dos comprados confirmados y nada en vuelo');

        // destildo Pan y vacío en el mismo tick: el último snapshot todavía lo trae comprado, pero lo que acabo de escribir manda
        db.marcarComprado(id, pan.id, false, yo);
        const r1 = db.vaciarComprados(id);
        expect(r1.ids).toEqual([huevos.id]);
        let v = await espia.esperar(x => !item(x, huevos.id) && item(x, pan.id)?.estado === 'pendiente' && !x.hasPendingWrites, esperaMs, '"Huevos" vaciado y "Pan" de vuelta a pendiente, todo confirmado');
        expect(idsOrdenados(v.items)).toEqual([leche.id, pan.id].sort());
        expect(item(v, pan.id)).toMatchObject({ estado: 'pendiente', compradoPor: null, borradoEn: null });

        // tildo Leche y vacío en el mismo tick: la recién tildada se va con el vaciado
        db.marcarComprado(id, leche.id, true, yo);
        const r2 = db.vaciarComprados(id);
        expect(r2.ids).toEqual([leche.id]);
        v = await espia.esperar(x => !item(x, leche.id) && !x.hasPendingWrites, esperaMs, '"Leche" vaciada y confirmada');
        expect(idsOrdenados(v.items)).toEqual([pan.id]);
        expect(item(v, pan.id)!.estado).toBe('pendiente');
      });
      it('sin comprados devuelve ids [] y un deshacer inofensivo', async () => {
        const { id, espia, yo } = await listaLista();
        await agregarConfirmado(id, espia, 'Leche', yo);
        const r = db.vaciarComprados(id);
        expect(r.ids).toEqual([]);
        expect(() => r.deshacer()).not.toThrow();
      });
    });

    // ---------- miembros ----------
    describe('elegirMiembro / renombrarMiembro', () => {
      it('por memberId devuelve ese miembro', async () => {
        const { id, v } = await listaLista();
        const papa = miembro(v, 'Papá')!;
        const m = await db.elegirMiembro(id, { memberId: papa.id });
        expect(m).toMatchObject({ id: papa.id, nombre: 'Papá', color: papa.color });
      });
      it('por nombre existente (sin tildes ni mayúsculas) devuelve el existente y no crea otro; nombre nuevo lo crea con el color siguiente', async () => {
        const { id, espia, v } = await listaLista();
        const mama = miembro(v, 'Mamá')!;
        const a = await db.elegirMiembro(id, { nombre: 'mamá' });
        const b = await db.elegirMiembro(id, { nombre: '  MAMA ' });
        expect(a.id).toBe(mama.id);
        expect(b.id).toBe(mama.id);
        const nuevo = await db.elegirMiembro(id, { nombre: '  Abuela   Rosa ' });
        expect(nuevo.nombre).toBe('Abuela Rosa');
        expect(nuevo.color).toBe('p3');
        expect(nuevo.id).toMatch(ID_RE);
        expect(esMsONull(nuevo.creadoEn)).toBe(true);
        const v1 = await espia.esperar(x => x.miembros.some(m => m.id === nuevo.id), esperaMs, 'la nueva miembro en la vista');
        // los "mamá" no crearon a nadie: siguen siendo Mamá, Papá y la nueva
        expect(v1.miembros.map(m => m.nombre).sort()).toEqual(['Abuela Rosa', 'Mamá', 'Papá']);
        expect(v1.miembros.find(m => m.id === nuevo.id)).toMatchObject({ nombre: 'Abuela Rosa', color: 'p3' });
        // y ahora "abuela rosa" la encuentra a ella
        const otraVez = await db.elegirMiembro(id, { nombre: 'ABUELA rosa' });
        expect(otraVez.id).toBe(nuevo.id);
      });
      it('dos veces seguidas el mismo nombre nuevo (sin esperar al servidor) devuelve la misma persona', async () => {
        const { id, espia } = await listaLista();
        const a = await db.elegirMiembro(id, { nombre: 'Abuela Rosa' });
        const b = await db.elegirMiembro(id, { nombre: '  abuela   rosa ' });
        expect(b.id).toBe(a.id);
        const v = await espia.esperar(x => x.miembros.some(m => m.id === a.id), esperaMs, 'la nueva en la vista');
        expect(v.miembros.filter(m => m.nombre.toLowerCase().startsWith('abuela'))).toHaveLength(1);
      });
      it('el quinto vuelve a p1 (el color menos usado)', async () => {
        const { id, espia } = await listaLista('Casa', ['A', 'B', 'C', 'D']);
        const m = await db.elegirMiembro(id, { nombre: 'E' });
        expect(m.color).toBe('p1');
        // lo vemos llegar a la vista (así el afterEach espera a que el servidor lo acepte)
        const v = await espia.esperar(x => x.miembros.some(x => x.id === m.id), esperaMs, 'el quinto miembro en la vista');
        expect(v.miembros.find(x => x.id === m.id)).toMatchObject({ nombre: 'E', color: 'p1' });
      });
      it('en una lista inexistente rechaza', async () => {
        await expect(db.elegirMiembro(listIdInexistente(), { nombre: 'Alguien' })).rejects.toThrow();
      });
      it('renombrarMiembro cambia el nombre (recortado); vacío se ignora', async () => {
        const { id, espia, v } = await listaLista();
        const mama = miembro(v, 'Mamá')!;
        db.renombrarMiembro(id, mama.id, '  Mami ');
        await espia.esperar(x => x.miembros.find(m => m.id === mama.id)?.nombre === 'Mami', esperaMs, 'el nombre "Mami"');
        db.renombrarMiembro(id, mama.id, '   ');
        db.renombrarMiembro(id, mama.id, 'Mamá');
        const v1 = await espia.esperar(x => x.miembros.find(m => m.id === mama.id)?.nombre === 'Mamá', esperaMs, 'el nombre de vuelta a "Mamá"');
        expect(espia.todas.every(x => (x.miembros.find(m => m.id === mama.id)?.nombre ?? 'x') !== '')).toBe(true);
        expect(v1.miembros.find(m => m.id === mama.id)!.color).toBe(mama.color);
        expect(v1.miembros).toHaveLength(2);
      });
    });

    // ---------- última mano (D19) ----------
    describe('actualizadoPor / actualizadoPorNombre', () => {
      it('cada mutación deja la firma de quién la hizo: agregar, tildar, destildar y editar', async () => {
        const { id, espia, v, yo } = await listaLista();
        const otra = miembro(v, 'Papá')!;
        const yoOtro: Yo = { memberId: otra.id, nombre: otra.nombre };

        const it = await agregarConfirmado(id, espia, 'Leche', yo);
        expect(it.actualizadoPor).toBe(yo.memberId);
        expect(it.actualizadoPorNombre).toBe(yo.nombre);

        // la tilda OTRO: la firma pasa a ser suya
        db.marcarComprado(id, it.id, true, yoOtro);
        const v1 = await espia.esperar(x => item(x, it.id)?.actualizadoPor === otra.id && !item(x, it.id)!.pendiente, esperaMs, 'la firma del que tildó');
        expect(item(v1, it.id)).toMatchObject({ estado: 'comprado', actualizadoPorNombre: otra.nombre });

        // y la destilda el primero: vuelve a ser suya (antes la fila mostraba siempre al que la anotó)
        db.marcarComprado(id, it.id, false, yo);
        await espia.esperar(x => item(x, it.id)?.actualizadoPor === yo.memberId && item(x, it.id)?.estado === 'pendiente', esperaMs, 'la firma del que destildó');

        db.editarItem(id, it.id, 'Leche entera', yoOtro);
        const v3 = await espia.esperar(x => item(x, it.id)?.texto === 'Leche entera' && !item(x, it.id)!.pendiente, esperaMs, 'el texto editado');
        expect(item(v3, it.id)).toMatchObject({ actualizadoPor: otra.id, actualizadoPorNombre: otra.nombre });
        // quien lo anotó no cambia nunca
        expect(item(v3, it.id)!.agregadoPor).toBe(yo.memberId);
      });
    });

    // ---------- reclamar lo anónimo (D20) ----------
    describe('reclamarAnonimos', () => {
      it('lo anotado sin nombre pasa a ser tuyo cuando decís quién sos, y no toca lo de los demás', async () => {
        const { id, espia, v } = await listaLista();
        const papa = miembro(v, 'Papá')!;
        const anonimo: Yo = { memberId: null, nombre: null };

        const mio = await agregarConfirmado(id, espia, 'Leche', anonimo);
        expect(mio.agregadoPorNombre).toBe('alguien');
        const ajeno = await agregarConfirmado(id, espia, 'Pan', { memberId: papa.id, nombre: papa.nombre });

        db.reclamarAnonimos(id, [mio.id, ajeno.id], { memberId: papa.id, nombre: 'Papá' });
        const v1 = await espia.esperar(x => item(x, mio.id)?.agregadoPor === papa.id && !item(x, mio.id)!.pendiente, esperaMs, 'el ítem reclamado');
        expect(item(v1, mio.id)).toMatchObject({ agregadoPorNombre: 'Papá', actualizadoPor: papa.id });
        // el de Papá ya era suyo y no cambió; nada de lo ajeno se toca
        expect(item(v1, ajeno.id)).toMatchObject({ agregadoPor: papa.id, agregadoPorNombre: papa.nombre });
      });

      it('sin identidad, o con la lista sin ítems anónimos, no hace nada', async () => {
        const { id, espia, yo } = await listaLista();
        const it = await agregarConfirmado(id, espia, 'Yerba', yo);
        db.reclamarAnonimos(id, [it.id], { memberId: null, nombre: null });
        db.reclamarAnonimos(id, [it.id], yo);
        await espia.esperar(sinPendientes, esperaMs, 'que se asiente');
        expect(item(espia.actual()!, it.id)).toMatchObject({ agregadoPor: yo.memberId, agregadoPorNombre: yo.nombre });
      });
    });

    // ---------- súper (D13–D15) ----------
    describe('crearMercado / ponerMercado / renombrarMercado', () => {
      it('una lista nueva no tiene ningún súper: sin eso, la lista se ve igual que antes', async () => {
        const { v } = await listaLista();
        expect(v.mercados).toEqual([]);
      });

      it('crearMercado lo devuelve con id de 20 chars y la vista lo trae', async () => {
        const { id, espia } = await listaLista();
        const m = await db.crearMercado(id, '  Mercadona ');
        expect(m.nombre).toBe('Mercadona');
        expect(m.id).toMatch(ID_RE);
        expect(esMsONull(m.creadoEn)).toBe(true);
        const v = await espia.esperar(x => x.mercados.some(x2 => x2.id === m.id), esperaMs, 'el súper en la vista');
        expect(v.mercados.map(x => x.nombre)).toEqual(['Mercadona']);
      });

      it('el mismo nombre (sin tildes ni mayúsculas) devuelve el que ya está, no crea otro — aunque se pida dos veces seguidas', async () => {
        const { id, espia } = await listaLista();
        // sin esperar a que el primero vuelva del servidor: es donde se duplicaba
        const a = await db.crearMercado(id, 'La Verdulería');
        const b = await db.crearMercado(id, '  la verduleria ');
        expect(b.id).toBe(a.id);
        const v = await espia.esperar(x => x.mercados.length > 0, esperaMs, 'el súper en la vista');
        expect(v.mercados).toHaveLength(1);
        // y una vez que llegó por snapshot, sigue siendo el mismo
        const c = await db.crearMercado(id, 'LA VERDULERIA');
        expect(c.id).toBe(a.id);
      });

      it('nombre vacío rechaza; lista inexistente rechaza', async () => {
        const { id } = await listaLista();
        await expect(db.crearMercado(id, '   ')).rejects.toThrow();
        await expect(db.crearMercado(listIdInexistente(), 'Mercadona')).rejects.toThrow();
      });

      it('ponerMercado ubica el ítem y null lo devuelve a "en cualquiera"', async () => {
        const { id, espia, yo } = await listaLista();
        const m = await db.crearMercado(id, 'Mercadona');
        const it = await agregarConfirmado(id, espia, 'Leche', yo);
        expect(it.mercado ?? null).toBeNull();
        db.ponerMercado(id, it.id, m.id, yo);
        await espia.esperar(x => item(x, it.id)?.mercado === m.id, esperaMs, 'el ítem en Mercadona');
        db.ponerMercado(id, it.id, null, yo);
        await espia.esperar(x => (item(x, it.id)?.mercado ?? null) === null, esperaMs, 'el ítem sin súper');
      });

      it('el súper se aprende por producto: el próximo ítem con ese texto nace ubicado (D15)', async () => {
        const { id, espia, yo } = await listaLista();
        const m = await db.crearMercado(id, 'Mercadona');
        const primero = await agregarConfirmado(id, espia, 'Yerba', yo);
        db.ponerMercado(id, primero.id, m.id, yo);
        await espia.esperar(x => sugerencia(x, 'yerba')?.mercado === m.id, esperaMs, 'la yerba aprendida en Mercadona');
        db.borrarItem(id, primero.id);
        const otro = await agregarConfirmado(id, espia, 'yerba', yo);
        expect(otro.mercado).toBe(m.id);
      });

      it('el súper viaja con el ítem al tildarlo: los comprados se agrupan igual', async () => {
        const { id, espia, yo } = await listaLista();
        const m = await db.crearMercado(id, 'Carrefour');
        const it = await agregarConfirmado(id, espia, 'Detergente', yo);
        db.ponerMercado(id, it.id, m.id, yo);
        await espia.esperar(x => item(x, it.id)?.mercado === m.id, esperaMs, 'el ítem ubicado');
        db.marcarComprado(id, it.id, true, yo);
        const v = await espia.esperar(x => item(x, it.id)?.estado === 'comprado', esperaMs, 'el ítem comprado');
        expect(item(v, it.id)!.mercado).toBe(m.id);
      });

      it('borrarMercado lo saca de la vista y sus ítems quedan "en cualquiera"; deshacer los devuelve', async () => {
        const { id, espia, yo } = await listaLista();
        const m = await db.crearMercado(id, 'Tu prima');
        const it = await agregarConfirmado(id, espia, 'Pilas', yo);
        db.ponerMercado(id, it.id, m.id, yo);
        await espia.esperar(x => item(x, it.id)?.mercado === m.id, esperaMs, 'el ítem ubicado');

        const { deshacer } = db.borrarMercado(id, m.id);
        const v = await espia.esperar(x => !x.mercados.some(x2 => x2.id === m.id), esperaMs, 'el súper fuera de la vista');
        // el ítem conserva el id (por eso deshacer lo revive entero); quien lo lee lo trata como sin súper
        expect(item(v, it.id)!.mercado).toBe(m.id);

        deshacer();
        const v2 = await espia.esperar(x => x.mercados.some(x2 => x2.id === m.id), esperaMs, 'el súper de vuelta');
        expect(v2.mercados.find(x => x.id === m.id)!.nombre).toBe('Tu prima');
        expect(item(v2, it.id)!.mercado).toBe(m.id);
      });

      /** Espera a que una consulta asíncrona cumpla algo. Los accesos no viajan en la Vista: se consultan aparte. */
      const esperarA = async (cumple: () => Promise<boolean>, ms: number, que: string): Promise<void> => {
        const hasta = Date.now() + ms;
        for (;;) {
          if (await cumple()) return;
          if (Date.now() > hasta) throw new Error('Esperando ' + que + ': pasaron ' + ms + ' ms');
          await new Promise(r => setTimeout(r, 25));
        }
      };

      /** Después de salir no sos miembro: en Firestore enumerar las llaves ya no se puede. El fake no modela
       *  permisos, así que el contrato acepta las dos formas de "tu llave ya no está". */
      const sinMiLlave = async (id: string): Promise<boolean> => {
        try { return !(await db.listarAccesos(id)).some(a => a.uid === db.miUid()); } catch { return true; }
      };
      /** La llave del creador viaja en el MISMO lote que la lista, y ese lote no se espera (la lista abre sin
       *  señal). Así que hay que esperarla como a cualquier escritura, no leerla de una. */
      const conMiLlave = async (id: string): Promise<boolean> => {
        try { return (await db.listarAccesos(id)).some(a => a.uid === db.miUid()); } catch { return false; }
      };

      it('la lista nace con dueño y con la llave del creador (D22)', async () => {
        const { id, espia } = await listaLista();
        const v = await espia.esperar(x => x.lista !== null, esperaMs, 'la lista');
        expect(v.lista!.duenio).toBe(db.miUid());
        await esperarA(() => conMiLlave(id), esperaMs, 'la llave del creador');
        expect((await db.listarAccesos(id)).map(a => a.uid)).toEqual([db.miUid()]);
        // D26: `entroEn` dejó de ser decoración («Entró hace 2 días»). Sin cuenta, es lo ÚNICO que separa dos
        // llaves de la misma persona, y de él cuelgan tres superficies (la fila, el título de la pregunta
        // destructiva y el nombre accesible del botón que la abre: src/ui/sheets/Accesos.tsx). Una implementación
        // que deje de leerlo las degrada a las tres, en silencio, a la forma ambigua de D22. Se ESPERA, no se lee
        // de una: en el real es un serverTimestamp y hasta que el servidor lo resuelve `ms()` da null — la
        // divergencia sancionada en decisiones.md («timestamps null hasta que el servidor los resuelve… la suite
        // lo contempla»). Lo que el contrato exige es que termine siendo un número en los dos mundos.
        await esperarA(
          async () => typeof (await db.listarAccesos(id)).find(a => a.uid === db.miUid())?.entroEn === 'number',
          esperaMs,
          'la fecha de entrada de mi llave',
        );
      });

      it('entrar es idempotente y anota a quién decimos ser', async () => {
        const { id, espia } = await listaLista();
        await espia.esperar(x => x.lista !== null, esperaMs, 'la lista');
        expect(await db.entrar(id)).toBe(true);
        expect(await db.entrar(id)).toBe(true);
        await esperarA(() => conMiLlave(id), esperaMs, 'mi llave');
        expect((await db.listarAccesos(id)).length).toBe(1);      // no duplica la llave

        await db.entrar(id, { memberId: 'm-mama' });
        await esperarA(async () => (await db.listarAccesos(id))[0]?.memberId === 'm-mama', esperaMs, 'la persona anotada en la llave');
        // y cambiar de persona la actualiza, no agrega otra
        await db.entrar(id, { memberId: 'm-papa' });
        await esperarA(async () => (await db.listarAccesos(id))[0]?.memberId === 'm-papa', esperaMs, 'la persona nueva');
        expect((await db.listarAccesos(id)).length).toBe(1);
      });

      it('invitar crea una invitación viva de 7 días; revocarla la mata', async () => {
        const { id, espia } = await listaLista();
        await espia.esperar(x => x.lista !== null, esperaMs, 'la lista');
        const codigo = await db.invitar(id);
        expect(codigo.length).toBeGreaterThanOrEqual(20);

        await esperarA(async () => (await db.listarInvitaciones(id)).some(i => i.codigo === codigo), esperaMs, 'la invitación');
        const inv = (await db.listarInvitaciones(id)).find(i => i.codigo === codigo)!;
        expect(inv.creadaPor).toBe(db.miUid());
        expect(inv.revocada).toBe(false);
        expect(inv.venceEn).not.toBeNull();

        await db.revocarInvitacion(id, codigo);
        await esperarA(async () => (await db.listarInvitaciones(id)).find(i => i.codigo === codigo)?.revocada === true, esperaMs, 'la invitación revocada');
      });

      it('expulsar saca la llave Y revoca lo que esa persona invitó (si no, vuelve a entrar)', async () => {
        const { id, espia } = await listaLista();
        await espia.esperar(x => x.lista !== null, esperaMs, 'la lista');
        const mio = db.miUid()!;
        const codigo = await db.invitar(id);
        await esperarA(async () => (await db.listarInvitaciones(id)).some(i => i.codigo === codigo), esperaMs, 'la invitación');

        await db.expulsar(id, mio);
        await esperarA(() => sinMiLlave(id), esperaMs, 'la llave fuera');
        // lo que importa: la puerta que había abierto queda cerrada en la misma operación
        const invs = await db.listarInvitaciones(id);
        expect(invs.find(i => i.codigo === codigo)!.revocada).toBe(true);
      });

      it('salir se lleva la propia llave y nada más', async () => {
        const { id, espia } = await listaLista();
        await espia.esperar(x => x.lista !== null, esperaMs, 'la lista');
        await esperarA(() => conMiLlave(id), esperaMs, 'mi llave');
        await db.salir(id);
        await esperarA(() => sinMiLlave(id), esperaMs, 'sin mi llave');
      });

      it('misListas trae las listas donde este dispositivo tiene llave, con su nombre', async () => {
        const { id, espia } = await listaLista('Casa');
        await espia.esperar(x => x.lista !== null, esperaMs, 'la primera lista');
        const id2 = await db.crearLista('Trabajo', []);
        const espia2 = espiar(id2);
        await espia2.esperar(x => x.lista !== null, esperaMs, 'la segunda lista');
        await esperarA(async () => (await db.misListas()).length === 2, esperaMs, 'las dos listas en el índice');
        const filas = await db.misListas();
        expect(filas.map(f => [f.id, f.nombre]).sort()).toEqual([[id, 'Casa'], [id2, 'Trabajo']].sort());
      });

      it('salir de una lista la saca del índice', async () => {
        const { id, espia } = await listaLista();
        await espia.esperar(x => x.lista !== null, esperaMs, 'la lista');
        await esperarA(async () => (await db.misListas()).some(f => f.id === id), esperaMs, 'la lista en el índice');
        espia.off();                                   // sin llave la suscripción va a rebotar: no la esperamos
        await db.salir(id);
        await esperarA(async () => !(await db.misListas()).some(f => f.id === id), esperaMs, 'la lista fuera del índice');
        consumirErrores();                             // el rechazo tardío de la suscripción cortada, si llegó
      });

      it('renombrarLista cambia el nombre para todos; vacío se ignora', async () => {
        const { id, espia } = await listaLista('Casa');
        await espia.esperar(x => x.lista !== null, esperaMs, 'la lista');
        db.renombrarLista(id, '  Casa   nueva ');
        const v = await espia.esperar(x => x.lista?.nombre === 'Casa nueva', esperaMs, 'el nombre nuevo');
        expect(v.lista!.nombre).toBe('Casa nueva');
        db.renombrarLista(id, '   ');
        await new Promise(r => setTimeout(r, 50));
        expect(espia.actual()!.lista!.nombre).toBe('Casa nueva');   // el vacío no llegó a ningún lado
      });

      it('borrarLista desarma todo — CON mercados e invitaciones adentro, que fue lo que rompió en producción', async () => {
        const { id, espia, yo } = await listaLista();
        await espia.esperar(x => x.lista !== null, esperaMs, 'la lista');
        await esperarA(() => conMiLlave(id), esperaMs, 'mi llave');
        // la lista de prueba original estaba VACÍA y el hueco pasó de largo: la regla de mercados mira la llave
        // con existsAfter, y borrarla en el mismo lote la apagaba. Ahora el desarme se prueba con carga real.
        await db.crearMercado(id, 'Mercadona');
        db.agregarItem(id, 'Pan', yo);
        await db.invitar(id);
        await espia.esperar(x => x.mercados.length === 1 && x.items.length === 1 && !x.hasPendingWrites, esperaMs, 'la carga escrita');
        espia.off();                       // la suscripción va a rebotar cuando la lista muera: no se la espera
        await db.borrarLista(id);
        await esperarA(async () => !(await db.misListas()).some(f => f.id === id), esperaMs, 'la lista fuera del índice');
        consumirErrores();                 // el rechazo tardío del listener cortado, si llegó
      });

      it('reclamarLista pone el dueño una sola vez', async () => {
        const { id, espia } = await listaLista();
        const v = await espia.esperar(x => x.lista !== null, esperaMs, 'la lista');
        const duenioOriginal = v.lista!.duenio;
        expect(duenioOriginal).toBe(db.miUid());
        // ya tiene dueño: reclamarla de nuevo no lo cambia (y no explota)
        await db.reclamarLista(id).catch(() => undefined);
        const v2 = await espia.esperar(x => x.lista !== null, esperaMs, 'la lista otra vez');
        expect(v2.lista!.duenio).toBe(duenioOriginal);
      });

      it('miCuenta arranca anónima: sin guardar nada, el acceso vive solo en este dispositivo (D23)', async () => {
        // El resto del viaje (guardar, choque, entrar) redirige a Google: se prueba en el fake y a mano, no acá.
        // Contra el Db real esto ejercita el default (sin las funciones de cuenta enchufadas): lo que fija es la
        // FORMA del contrato — sin cuenta, todo Db responde anónima, no explota ni devuelve algo a medias.
        expect(await db.miCuenta()).toEqual({ estado: 'anonima' });
      });

      it('borrarSugerencia la olvida sin tocar los ítems; deshacer la repone con sus veces', async () => {
        const { id, espia, yo } = await listaLista();
        // anotarlo dos veces deja una sugerencia con veces > 0: el deshacer tiene que devolver eso, no una entrada nueva
        const it = await agregarConfirmado(id, espia, 'Hola', yo);
        db.borrarItem(id, it.id);
        const it2 = await agregarConfirmado(id, espia, 'Hola', yo);
        const norm = 'hola';
        const v0 = await espia.esperar(x => (x.sugerencias.find(s2 => s2.textoNorm === norm)?.veces ?? 0) >= 2, esperaMs, 'la sugerencia aprendida');
        const veces = v0.sugerencias.find(s2 => s2.textoNorm === norm)!.veces;

        const { deshacer } = db.borrarSugerencia(id, norm);
        const v = await espia.esperar(x => !x.sugerencias.some(s2 => s2.textoNorm === norm), esperaMs, 'la sugerencia fuera');
        // el ítem que la originó no se toca: se olvida el producto, no la compra
        expect(item(v, it2.id)!.texto).toBe('Hola');

        deshacer();
        const v2 = await espia.esperar(x => x.sugerencias.some(s2 => s2.textoNorm === norm), esperaMs, 'la sugerencia de vuelta');
        expect(v2.sugerencias.find(s2 => s2.textoNorm === norm)!.veces).toBe(veces);
      });

      it('borrarSugerencia de algo que no está no rompe ni deja basura', async () => {
        const { id, espia } = await listaLista();
        // esperar la SEMILLA, no solo la lista: el doc de la lista llega de la caché antes que las sugerencias,
        // y contar ahí daba 0 y después esperaba para siempre a que volvieran a ser 0
        const antes = (await espia.esperar(x => x.sugerencias.length > 0, esperaMs, 'las sugerencias sembradas')).sugerencias.length;
        const { deshacer } = db.borrarSugerencia(id, 'no-existe-esto');
        deshacer();
        const v = await espia.esperar(x => x.sugerencias.length === antes, esperaMs, 'las sugerencias intactas');
        expect(v.sugerencias.some(s2 => s2.textoNorm === 'no-existe-esto')).toBe(false);
      });

      it('renombrarMercado cambia el nombre y los ítems siguen apuntando ahí; vacío se ignora', async () => {
        const { id, espia, yo } = await listaLista();
        const m = await db.crearMercado(id, 'Verdu');
        const it = await agregarConfirmado(id, espia, 'Pan', yo);
        db.ponerMercado(id, it.id, m.id, yo);
        db.renombrarMercado(id, m.id, '  La Verdulería ');
        const v = await espia.esperar(x => x.mercados.find(x2 => x2.id === m.id)?.nombre === 'La Verdulería', esperaMs, 'el nombre nuevo');
        expect(item(v, it.id)!.mercado).toBe(m.id);
        db.renombrarMercado(id, m.id, '   ');
        await espia.esperar(sinPendientes, esperaMs, 'que se asiente');
        expect(espia.actual()!.mercados.find(x => x.id === m.id)!.nombre).toBe('La Verdulería');
      });
    });

    // ---------- errores ----------
    describe('onError', () => {
      it('no se dispara en el camino feliz (una secuencia completa)', async () => {
        const { id, espia, yo } = await listaLista();
        const a = await agregarConfirmado(id, espia, 'Leche', yo);
        db.marcarComprado(id, a.id, true, yo);
        db.editarItem(id, a.id, 'Leche entera', yo);
        await espia.esperar(x => item(x, a.id)?.texto === 'Leche entera' && item(x, a.id)?.estado === 'comprado' && !item(x, a.id)!.pendiente, esperaMs, 'comprada y editada');
        const { ids } = db.vaciarComprados(id);
        expect(ids).toEqual([a.id]);
        await espia.esperar(x => x.items.length === 0 && !x.hasPendingWrites, esperaMs, 'la lista vacía');
        db.restaurarItem(id, a.id, 'pendiente', yo);
        await espia.esperar(x => item(x, a.id)?.estado === 'pendiente' && !item(x, a.id)!.pendiente && !x.hasPendingWrites, esperaMs, 'restaurado y nada en vuelo');
        expect(errores).toEqual([]);
      });
      it('su unsubscribe corta: el callback cortado no recibe el error que sí recibe otro registrado a la vez', async () => {
        const { id, yo } = await listaLista();
        // dos callbacks crudos, uno se corta antes del error
        const cortado: DbError[] = [];
        const vivo: DbError[] = [];
        const offCortado = db.onError(e => cortado.push(e));
        const offVivo = db.onError(e => vivo.push(e));
        try {
          offCortado();
          const idVacio = db.agregarItem(id, '   ', yo);
          const e = await esperarError(x => x.itemId === idVacio, 'el error de validación del texto vacío');
          // el vivo lo vio: si el cortado siguiera registrado, también lo habría visto
          expect(vivo).toEqual([e]);
          expect(cortado).toEqual([]);
          expect(consumirErrores()).toEqual([e]);
        } finally {
          offVivo();
        }
      });
    });
  });
}
