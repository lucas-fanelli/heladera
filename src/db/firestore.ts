/**
 * Db real: Firestore detrás de la MISMA interfaz `Db` que el falso (fake.ts). La UI no sabe cuál tiene detrás.
 *
 * Qué reproduce y qué delega en el SDK:
 *  - Las mutaciones no esperan la red: disparan la escritura y vuelven. Firestore aplica el eco local a la caché
 *    y los listeners lo entregan con `hasPendingWrites`; los rechazos del servidor van a `onError`.
 *  - Toda operación espera `listo` (auth anónima) antes de tocar Firestore: sin eso el eco local lo rechazaría
 *    el servidor por falta de auth y la UI vería aparecer y desaparecer el ítem.
 *  - Los ids se generan en el cliente (agregar es "escribir el doc con ESTE id": reintentar nunca duplica).
 *  - Timestamps: `serverTimestamp()` al escribir. Los ÍTEMS se leen con `data({ serverTimestamps: 'estimate' })`:
 *    mientras la escritura está pendiente el SDK entrega una estimación local (el diseño §6: "la UI la tolera"), así
 *    dos ítems agregados sin señal se ordenan por esa estimación y NO saltan de lugar cuando el servidor confirma.
 *    La señal de "sin confirmar" es `pendiente` (hasPendingWrites), no el null (dedupe.ts ya exige `!pendiente`).
 *    Lista, miembros y sugerencias se leen con el default ('none'): sus fechas no ordenan nada visible y el null
 *    hasta la confirmación es lo que el fake y los tests esperan (igual que antes).
 *  - Borrado siempre lógico (`estado: 'borrado'`), nunca `deleteDoc`. Las reglas lo prohíben además.
 *  - Sugerencias: un doc `meta/sugerencias` con un mapa `entradas` cuya clave es el textoNorm. El uso se anota con
 *    `setDoc(..., { merge: true })` en una escritura APARTE y silenciosa del ítem: si el doc falta o llegó al tope
 *    de las reglas, el ítem igual se agrega. En set() las claves del objeto son literales ("coca 1.5 l" queda como
 *    UNA clave: los puntos solo anidan en update()).
 *  - `suscribir` compone UNA Vista a partir de cuatro listeners (doc lista, ítems activos, miembros, sugerencias)
 *    y llama al callback en cada cambio de cualquiera, incluidos los de metadatos (fromCache / hasPendingWrites).
 *    Si `listo` no resuelve (primera apertura sin señal), a los ESPERA_PRIMERA_MS entrega una Vista provisional
 *    (sin lista, fromCache) para que la pantalla no quede muda; los snapshots reales la reemplazan.
 *
 * Funciona en el navegador (caché persistente, online/offline del window) y en node (tests contra el emulador:
 * sin window ni navigator.onLine → online = true, sin listeners de red).
 */
import {
  FieldPath, Timestamp, collection, collectionGroup, deleteDoc, deleteField, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer, increment, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type DocumentData, type DocumentSnapshot, type Firestore, type QuerySnapshot, type SnapshotListenOptions, type SnapshotOptions,
} from 'firebase/firestore';
import type { Acceso, ColorPersona, Cuenta, Db, DbError, DbErrorTipo, Estado, Invitacion, Item, Lista, ListaResumen, Mercado, Miembro, Sugerencia, Vista, Yo } from './types';
import { normalizar } from '@/domain/normalizar';
import { nuevoId, nuevoIdLista } from '@/domain/ids';
import { VENCIMIENTO_INVITACION_MS, nuevoCodigo } from '@/domain/acceso';
import { SEMILLA_SUGERENCIAS, mercadoAprendido } from '@/domain/sugerencias';
import { mercadoLlamado, ordenarMercados } from '@/domain/mercados';
import { buscarPorNombre, COLORES_PERSONA, siguienteColor } from '@/domain/miembros';

export interface FirestoreDbOpts {
  /** instancia ya inicializada (prod, emulador o rules-unit-testing) */
  db: Firestore;
  /** auth lista (hay usuario): recién ahí se toca Firestore. Default: ya. */
  listo?: Promise<void>;
  /** reloj inyectable (tests). Default: Date.now */
  ahora?: () => number;
  /** ¿hay señal? Default: navigator.onLine si existe; si no, true */
  estaOnline?: () => boolean;
  /** avisar cuando cambia la señal. Default: eventos online/offline del window; en node, nada */
  suscribirOnline?: (cb: () => void) => () => void;
  /** semilla de sugerencias al crear una lista. Default: SEMILLA_SUGERENCIAS */
  semilla?: string[];
  /** el uid de Firebase de este teléfono. Lo pone `firebase.ts`: acá no se importa el SDK de auth. */
  miUid?: () => string | null;
  /**
   * La cuenta permanente (D23). También las pone `firebase.ts` (viven donde vive el SDK de auth); sin ellas
   * (tests de contrato en node, donde una redirección no existe) la cuenta es anónima para siempre.
   */
  miCuenta?: () => Promise<Cuenta>;
  guardarCuenta?: () => Promise<void>;
  entrarConCuenta?: () => Promise<void>;
}

/** versión del esquema de documentos (campo `esquema` del doc lista). 2 = los ítems traen `mercado` (D13). */
const ESQUEMA = 2;
/** nombre de lista cuando llega vacío (mismo default que el fake) */
const NOMBRE_LISTA_DEFAULT = 'Casa';
/** memberId / nombre de quien no eligió quién es (mismo sentinel que el fake) */
const ALGUIEN = 'alguien';
/** tope de operaciones por WriteBatch (límite de Firestore) */
const LOTE_MAX = 500;
/**
 * Cuánto aguantamos antes de la primera Vista: con caché vacía y señal, esperando al servidor (evita el flash de
 * "sin señal y sin caché" en una apertura normal); con la auth sin resolver, antes de dar la Vista provisional.
 */
const ESPERA_PRIMERA_MS = 1500;
/** reintentos de la suscripción tras permission-denied: la llave puede estar en vuelo (ver suscribir) */
const REINTENTO_PERMISO = { base: 500, total: 3 } as const;
const ESTADOS_ACTIVOS: Estado[] = ['pendiente', 'comprado'];
const OPCIONES: SnapshotListenOptions = { includeMetadataChanges: true };
/** cómo leemos los ÍTEMS: los serverTimestamp sin resolver salen como estimación local, no como null (ver arriba) */
const LECTURA_ITEMS: SnapshotOptions = { serverTimestamps: 'estimate' };

type Datos = Record<string, unknown>;

/** La firma que deja CADA mutación sobre un ítem (D19): cuándo y quién. La fila muestra esto. */
function firma(yo: Yo): Datos {
  return { actualizadoEn: serverTimestamp(), actualizadoPor: yo.memberId ?? ALGUIEN, actualizadoPorNombre: yo.nombre ?? ALGUIEN };
}

/** Un cambio de estado nuestro que todavía no confirmó el servidor: manda sobre el último snapshot (ver vaciarComprados). */
interface Eco { estado: Estado; enVuelo: number }

/** Lo que el Db recuerda de cada lista, compartido entre suscripciones y mutaciones. */
interface EstadoLista {
  /** suscripciones activas */
  refs: number;
  /** escrituras nuestras (de esta sesión) sin acuse del servidor */
  enVuelo: number;
  /** estado que le pusimos a cada ítem y sigue en vuelo */
  eco: Map<string, Eco>;
  /** la última Vista compuesta por `suscribir` (null si nadie está suscripto) */
  ultimo: Vista | null;
  /** última vez que llegó algo del servidor */
  ultimaSync: number | null;
  /**
   * Miembros y súper que creamos en esta sesión y que el snapshot todavía no trajo, por nombre normalizado.
   * Sin esto, "creá o devolveme el que ya existe" duplica si lo piden dos veces seguidas: la escritura sale sin
   * esperar (así tiene que ser) y la segunda consulta mira un snapshot que todavía no la refleja.
   */
  miembrosNuevos: Map<string, Miembro>;
  mercadosNuevos: Map<string, Mercado>;
  /** re-emisores de las suscripciones (para volver a pintar cuando se confirma una escritura) */
  emisores: Set<() => void>;
}

/** Extras de una escritura: qué estado le pusimos a qué ítems (eco) y si sus errores se callan (no van a onError). */
interface OpcionesEscritura {
  eco?: { ids: string[]; estado: Estado };
  /** la escritura es accesoria (p. ej. el uso en sugerencias): si falla, console.warn como mucho */
  silenciosa?: boolean;
}

export function crearDbFirestore(opts: FirestoreDbOpts): Db {
  const { db } = opts;
  const listo = opts.listo ?? Promise.resolve();
  const ahora = opts.ahora ?? (() => Date.now());
  const estaOnline = opts.estaOnline ?? estaOnlineNavegador;
  const suscribirOnline = opts.suscribirOnline ?? suscribirOnlineNavegador;
  const semilla = opts.semilla ?? SEMILLA_SUGERENCIAS;
  const miUid = opts.miUid ?? (() => null);
  const errCbs = new Set<(e: DbError) => void>();
  const estados = new Map<string, EstadoLista>();

  // ---------- paths ----------
  const refLista = (listId: string) => doc(db, 'listas', listId);
  const refItem = (listId: string, itemId: string) => doc(db, 'listas', listId, 'items', itemId);
  const refMiembro = (listId: string, memberId: string) => doc(db, 'listas', listId, 'miembros', memberId);
  const refMercado = (listId: string, mercadoId: string) => doc(db, 'listas', listId, 'mercados', mercadoId);
  const refSugerencias = (listId: string) => doc(db, 'listas', listId, 'meta', 'sugerencias');
  const colItems = (listId: string) => collection(db, 'listas', listId, 'items');
  const colMiembros = (listId: string) => collection(db, 'listas', listId, 'miembros');
  const colMercados = (listId: string) => collection(db, 'listas', listId, 'mercados');
  const refAcceso = (listId: string, uid: string) => doc(db, 'listas', listId, 'acceso', uid);
  const colAcceso = (listId: string) => collection(db, 'listas', listId, 'acceso');
  const refInvitacion = (listId: string, codigo: string) => doc(db, 'listas', listId, 'invitaciones', codigo);
  const colInvitaciones = (listId: string) => collection(db, 'listas', listId, 'invitaciones');
  /** los ítems que se ven: pendientes y comprados (los borrados no se leen) */
  const queryActivos = (listId: string) => query(colItems(listId), where('estado', 'in', ESTADOS_ACTIVOS));

  // ---------- helpers ----------
  function estado(listId: string): EstadoLista {
    let e = estados.get(listId);
    if (!e) { e = { refs: 0, enVuelo: 0, eco: new Map(), ultimo: null, ultimaSync: null, miembrosNuevos: new Map(), mercadosNuevos: new Map(), emisores: new Set() }; estados.set(listId, e); }
    return e;
  }
  /** Busca por nombre entre lo que trae el snapshot y lo que creamos recién (y olvida lo que ya llegó). */
  function reciente<T extends { id: string }>(nuevos: Map<string, T>, enVista: T[], nombreNorm: string): T | undefined {
    for (const [k, x] of nuevos) if (enVista.some(y => y.id === x.id)) nuevos.delete(k);
    return nuevos.get(nombreNorm);
  }
  function emitirError(e: DbError): void { for (const cb of [...errCbs]) cb(e); }
  /**
   * Dispara una escritura sin esperarla: espera `listo`, ejecuta, y si el servidor la rechaza avisa por onError
   * (o por consola si es `silenciosa`). Cuenta la escritura como "en vuelo" (para hasPendingWrites) y, si cambia el
   * estado de ítems, lo anota en `eco` para que vaciarComprados vea lo que acabamos de hacer aunque el snapshot
   * todavía no lo refleje.
   */
  function escribir(listId: string, operacion: string, itemId: string | undefined, op: () => Promise<unknown>, extra: OpcionesEscritura = {}): void {
    const { eco, silenciosa } = extra;
    const l = estado(listId);
    l.enVuelo++;
    if (eco) for (const id of eco.ids) l.eco.set(id, { estado: eco.estado, enVuelo: (l.eco.get(id)?.enVuelo ?? 0) + 1 });
    const terminar = (): void => {
      l.enVuelo--;
      if (eco) for (const id of eco.ids) { const x = l.eco.get(id); if (x && --x.enVuelo <= 0) l.eco.delete(id); }
      for (const emitir of [...l.emisores]) emitir();
    };
    const fallo = (err: unknown): void => {
      const e = mapearError(err, operacion, itemId);
      if (silenciosa) console.warn(`[db] ${operacion} (accesoria) falló: ${e.tipo} · ${e.mensaje}`);
      else emitirError(e);
      terminar();
    };
    listo.then(op).then(terminar, fallo);
  }
  function semillaEntradas(): Datos {
    const entradas: Datos = {};
    for (const texto of semilla) { const norm = normalizar(texto); if (norm) entradas[norm] = { texto, veces: 0, ultimaVez: null }; }
    return entradas;
  }
  /**
   * Anota un uso en meta/sugerencias, aparte del ítem y en silencio: `setDoc` con merge crea el doc si falta y en set()
   * la clave (textoNorm, puede tener puntos) es literal; `increment` arranca de 0 si la entrada no existía.
   * Si las reglas lo rechazan (tope de entradas), el ítem ya está agregado y al usuario no le cambia nada.
   */
  function anotarUso(listId: string, texto: string, norm: string): void {
    const datos = { entradas: { [norm]: { texto, veces: increment(1), ultimaVez: serverTimestamp() } } };
    escribir(listId, 'anotarUso', undefined, () => setDoc(refSugerencias(listId), datos, { merge: true }), { silenciosa: true });
  }
  async function leerMiembro(listId: string, memberId: string): Promise<Miembro | undefined> {
    try { const s = await getDoc(refMiembro(listId, memberId)); return s.exists() ? aMiembro(s.id, s.data()) : undefined; } catch { return undefined; }
  }

  // ---------- Db ----------
  const dbApi: Db = {
    async crearLista(nombre, nombresMiembros) {
      const id = nuevoIdLista();
      const nombreLista = nombre.trim() || NOMBRE_LISTA_DEFAULT;
      const miembros: Miembro[] = [];
      for (const n of nombresMiembros) {
        const limpio = n.trim(); if (!limpio) continue;
        miembros.push({ id: nuevoId(), nombre: limpio, color: siguienteColor(miembros), creadoEn: null });
      }
      // no se espera el commit: sin señal igual queda en la caché y la lista abre; el id se devuelve ya
      // una lista nace con dueño y con la llave del creador, en el mismo lote (D22): si no, cuando se cierre la
      // ventana de migración el que crea una lista quedaría afuera de su propia lista.
      const uid = miUid();
      escribir(id, 'crearLista', undefined, () => {
        const b = writeBatch(db);
        b.set(refLista(id), { nombre: nombreLista, creadaEn: serverTimestamp(), esquema: ESQUEMA, ...(uid ? { duenio: uid } : {}) });
        for (const m of miembros) b.set(refMiembro(id, m.id), { nombre: m.nombre, color: m.color, creadoEn: serverTimestamp() });
        b.set(refSugerencias(id), { entradas: semillaEntradas() });
        if (uid) b.set(refAcceso(id, uid), { uid, memberId: null, entroEn: serverTimestamp() });
        return b.commit();
      });
      return id;
    },

    suscribir(listId, cb) {
      const l = estado(listId);
      l.refs++;
      let activo = true;
      let emitido = false;                 // ya le dimos al menos una Vista REAL (compuesta de snapshots)
      let provisional = false;             // lo último que le dimos es la Vista provisional (auth sin resolver)
      let autenticado = false;             // `listo` resolvió: los listeners están (o van a estar) enganchados
      let esperando = false;               // aguantando la primera Vista (caché vacía con señal)
      let timerEspera: ReturnType<typeof setTimeout> | null = null;
      let timerListo: ReturnType<typeof setTimeout> | null = null;
      let servidorVioLista = false;        // llegó un snapshot del doc lista que NO era de caché
      const offs: Array<() => void> = [];
      const crudo: { lista?: DocumentSnapshot; items?: QuerySnapshot; miembros?: QuerySnapshot; mercados?: QuerySnapshot; sugerencias?: DocumentSnapshot } = {};
      const completo = () => !!(crudo.lista && crudo.items && crudo.miembros && crudo.mercados && crudo.sugerencias);

      const componer = (): Vista => {
        const sl = crudo.lista!, si = crudo.items!, sm = crudo.miembros!, sx = crudo.mercados!, ss = crudo.sugerencias!;
        const items = si.docs.map(d => aItem(d.id, d.data(LECTURA_ITEMS), d.metadata.hasPendingWrites));
        return {
          lista: sl.exists() ? aLista(sl.id, sl.data()) : null,
          // no decimos "no existe" por una caché vacía: solo cuando el servidor lo dijo
          existe: sl.exists() || !servidorVioLista,
          items,
          miembros: sm.docs.map(d => aMiembro(d.id, d.data())).sort(cmpMiembro),
          mercados: ordenarMercados(sx.docs.map(d => aMercado(d.id, d.data()))),
          sugerencias: aSugerencias(ss.data()),
          // "lo que ves es la copia local": manda el snapshot de ítems (los otros tres se ponen al día en otro
          // momento y harían parpadear la pastilla aunque la lista ya esté sincronizada)
          fromCache: si.metadata.fromCache,
          hasPendingWrites: si.metadata.hasPendingWrites || items.some(i => i.pendiente) || l.enVuelo > 0,
          online: estaOnline(),
          ultimaSync: l.ultimaSync,
        };
      };
      /**
       * La Vista de "todavía no pudimos ni entrar" (auth sin resolver: primera apertura sin señal): sin lista pero
       * `existe` (nadie dijo que no), de caché, con lo que tengamos en vuelo. La UI la lee como "sin señal y sin caché".
       */
      const componerProvisional = (): Vista => ({
        lista: null, existe: true, items: [], miembros: [], mercados: [], sugerencias: [],
        fromCache: true, hasPendingWrites: l.enVuelo > 0, online: estaOnline(), ultimaSync: null,
      });
      const soltarEspera = (): void => { esperando = false; if (timerEspera) { clearTimeout(timerEspera); timerEspera = null; } };
      const emitir = (): void => {
        if (!activo || esperando || !completo()) return;
        const v = componer();
        l.ultimo = v;
        emitido = true;
        provisional = false;
        cb(v);
      };
      const emitirProvisional = (): void => {
        if (!activo || emitido) return;
        const v = componerProvisional();
        l.ultimo = v;
        provisional = true;
        cb(v);
      };
      /** llegó un snapshot (ya guardado en `crudo`) */
      const procesar = (fromCache: boolean, esLista: boolean): void => {
        if (!activo) return;
        if (!fromCache) { l.ultimaSync = ahora(); if (esLista) servidorVioLista = true; }
        if (!completo()) return;
        l.ultimo = componer();             // aunque todavía no se emita, las mutaciones ya pueden mirarlo
        if (!emitido) {
          const sl = crudo.lista!;
          const cacheSinLista = sl.metadata.fromCache && !sl.exists() && !servidorVioLista;
          if (cacheSinLista && estaOnline()) {
            // hay señal y la caché no tiene la lista: esperamos al servidor (o un ratito) antes de decir nada
            if (!esperando) { esperando = true; timerEspera = setTimeout(() => { timerEspera = null; esperando = false; emitir(); }, ESPERA_PRIMERA_MS); }
            return;
          }
          soltarEspera();
        }
        emitir();
      };
      /**
       * Un rechazo de permisos NO es la última palabra: la llave puede estar todavía en vuelo — crearLista la
       * escribe en el MISMO lote que la lista (y no espera el commit, para abrir sin señal), y el canje de una
       * invitación es una escritura que recién sale. Firestore mata el listener con permission-denied sin
       * reintentar, así que reintentamos nosotros con espera creciente; recién agotados los intentos se emite el
       * error y la pantalla muestra "pedí que te inviten". Un snapshot real resetea el contador.
       */
      let intentosPermiso = 0;
      let timerReintento: ReturnType<typeof setTimeout> | null = null;
      let permisoEmitido = false;           // los 5 listeners fallan juntos: un solo aviso alcanza
      const desenganchar = (): void => { for (const off of offs) off(); offs.length = 0; };
      const fallo = (err: unknown): void => {
        if (!activo) return;
        const e = mapearError(err, 'suscribir');
        if (e.tipo === 'permiso' && intentosPermiso < REINTENTO_PERMISO.total) {
          if (timerReintento) return;       // ya hay un reintento programado
          const espera = REINTENTO_PERMISO.base * 2 ** intentosPermiso;
          intentosPermiso++;
          desenganchar();
          timerReintento = setTimeout(() => { timerReintento = null; if (activo) enganchar(); }, espera);
          return;
        }
        if (e.tipo === 'permiso') { if (permisoEmitido) return; permisoEmitido = true; }
        emitirError(e);
      };

      // señal: re-emitir con online actualizado; si estábamos aguantando y se fue la señal, emitir ya
      const offOnline = suscribirOnline(() => {
        if (!activo) return;
        if (esperando) { if (!estaOnline()) { soltarEspera(); emitir(); } return; }
        if (emitido) emitir();
        else if (provisional) emitirProvisional();
      });
      const emisor = (): void => { if (emitido) emitir(); else if (provisional) emitirProvisional(); };
      l.emisores.add(emisor);

      // si la auth no resuelve a tiempo (primera apertura sin señal), la Vista provisional: la pantalla no queda muda
      timerListo = setTimeout(() => { timerListo = null; if (!autenticado) emitirProvisional(); }, ESPERA_PRIMERA_MS);

      const enganchar = (): void => {
        if (!activo) return;
        offs.push(
          onSnapshot(refLista(listId), OPCIONES, s => { intentosPermiso = 0; crudo.lista = s; procesar(s.metadata.fromCache, true); }, fallo),
          onSnapshot(queryActivos(listId), OPCIONES, s => { crudo.items = s; procesar(s.metadata.fromCache, false); }, fallo),
          onSnapshot(colMiembros(listId), OPCIONES, s => { crudo.miembros = s; procesar(s.metadata.fromCache, false); }, fallo),
          onSnapshot(colMercados(listId), OPCIONES, s => { crudo.mercados = s; procesar(s.metadata.fromCache, false); }, fallo),
          onSnapshot(refSugerencias(listId), OPCIONES, s => { crudo.sugerencias = s; procesar(s.metadata.fromCache, false); }, fallo),
        );
      };

      // sin auth el onSnapshot falla con permission-denied: los listeners se enganchan recién con `listo`
      listo.then(() => {
        autenticado = true;
        if (timerListo) { clearTimeout(timerListo); timerListo = null; }
        enganchar();
      }, fallo);

      return () => {
        if (!activo) return;
        activo = false;
        desenganchar();
        offOnline();
        soltarEspera();
        if (timerReintento) { clearTimeout(timerReintento); timerReintento = null; }
        if (timerListo) { clearTimeout(timerListo); timerListo = null; }
        l.emisores.delete(emisor);
        l.refs--;
        if (l.refs === 0) l.ultimo = null;
      };
    },

    async elegirMiembro(listId, o) {
      await listo;
      const u = estados.get(listId)?.ultimo ?? null;
      // La lista tiene que estar BAJADA antes de buscar o crear a alguien: sobre una caché vacía (existe "optimista",
      // 0 miembros) crearíamos un duplicado de un miembro que sí está. Con suscripción, lo que sabemos; sin ella, un get
      // (que sin señal ni caché rechaza solo).
      if (u) {
        if (!u.existe) throw new Error('lista inexistente');
        if (u.lista === null) throw new Error('lista no disponible');
      } else if (!(await getDoc(refLista(listId))).exists()) {
        throw new Error('lista inexistente');
      }
      const miembros = u ? u.miembros : (await getDocs(colMiembros(listId))).docs.map(d => aMiembro(d.id, d.data()));
      if (o.memberId) {
        const m = miembros.find(x => x.id === o.memberId) ?? await leerMiembro(listId, o.memberId);
        if (m) return { ...m };
      }
      const nombre = (o.nombre ?? '').replace(/\s+/g, ' ').trim();
      if (!nombre) throw new Error('nombre vacío');
      const l = estado(listId);
      const existente = buscarPorNombre(miembros, nombre) ?? reciente(l.miembrosNuevos, miembros, normalizar(nombre));
      if (existente) return { ...existente };
      const nuevo: Miembro = { id: nuevoId(), nombre, color: siguienteColor(miembros), creadoEn: null };
      l.miembrosNuevos.set(normalizar(nombre), nuevo);
      escribir(listId, 'elegirMiembro', undefined, () => setDoc(refMiembro(listId, nuevo.id), { nombre, color: nuevo.color, creadoEn: serverTimestamp() }));
      return nuevo;
    },

    renombrarMiembro(listId, memberId, nombre) {
      const limpio = nombre.trim(); if (!limpio) return;
      escribir(listId, 'renombrarMiembro', undefined, () => updateDoc(refMiembro(listId, memberId), { nombre: limpio }));
    },

    miUid,

    // la cuenta (D23) vive en firebase.ts, con el SDK de auth; acá solo se enchufa
    miCuenta: opts.miCuenta ?? (async () => ({ estado: 'anonima' as const })),
    guardarCuenta: opts.guardarCuenta ?? (async () => { throw new Error('este Db no maneja cuentas (falta firebase.ts)'); }),
    entrarConCuenta: opts.entrarConCuenta ?? (async () => { throw new Error('este Db no maneja cuentas (falta firebase.ts)'); }),

    /**
     * Idempotente y barata: primero pregunta si ya tenemos la llave (leer LA PROPIA siempre se puede, justamente
     * para poder preguntarlo sin tenerla). Si ya está, a lo sumo le anota a quién decimos ser. Si no, la crea:
     * durante la ventana de migración entra sola; después, solo con un código vivo, y si no, devuelve false y la
     * pantalla muestra "pedile a alguien de casa que te invite" en vez de un error crudo.
     */
    async entrar(listId, opts = {}) {
      await listo;
      const uid = miUid();
      if (!uid) return false;
      const ref = refAcceso(listId, uid);
      try {
        const ya = await getDoc(ref);
        if (ya.exists()) {
          const previo = ya.data().memberId ?? null;
          if (opts.memberId != null && previo !== opts.memberId) await updateDoc(ref, { memberId: opts.memberId });
          return true;
        }
      } catch { /* sin señal y sin caché: probamos escribir igual, la cola lo resuelve después */ }
      const datos: Datos = { uid, memberId: opts.memberId ?? null, entroEn: serverTimestamp() };
      if (opts.codigo) datos.porCodigo = opts.codigo;
      try {
        await setDoc(ref, datos);
        return true;
      } catch (e) {
        emitirError(mapearError(e, 'entrar'));
        return false;
      }
    },

    async invitar(listId) {
      await listo;
      const uid = miUid();
      if (!uid) throw new Error('sin usuario');
      const codigo = nuevoCodigo();
      // el vencimiento lo pone el cliente pero las reglas lo acotan: nadie se fabrica una invitación eterna
      await setDoc(refInvitacion(listId, codigo), {
        creadaPor: uid,
        creadaEn: serverTimestamp(),
        venceEn: Timestamp.fromMillis(ahora() + VENCIMIENTO_INVITACION_MS),
        revocada: false,
      });
      return codigo;
    },

    async listarInvitaciones(listId) {
      await listo;
      const s = await getDocs(colInvitaciones(listId));
      return s.docs.map(d => aInvitacion(d.id, d.data()));
    },

    async revocarInvitacion(listId, codigo) {
      await listo;
      await updateDoc(refInvitacion(listId, codigo), { revocada: true });
    },

    async listarAccesos(listId) {
      await listo;
      const s = await getDocs(colAcceso(listId));
      return s.docs.map(d => aAcceso(d.id, d.data()));
    },

    /** Las dos cosas van juntas o no sirve: sin revocar sus invitaciones, el expulsado vuelve con su propio código. */
    async expulsar(listId, uid) {
      await listo;
      const suyas = await getDocs(query(colInvitaciones(listId), where('creadaPor', '==', uid)));
      const b = writeBatch(db);
      b.delete(refAcceso(listId, uid));
      for (const d of suyas.docs) if (d.data().revocada !== true) b.update(d.ref, { revocada: true });
      await b.commit();
    },

    async salir(listId) {
      await listo;
      const uid = miUid();
      if (!uid) return;
      await deleteDoc(refAcceso(listId, uid));
    },

    async borrarLista(listId) {
      await listo;
      const borrar = async (refs: Array<ReturnType<typeof doc>>): Promise<void> => {
        for (let i = 0; i < refs.length; i += LOTE_MAX) {
          const b = writeBatch(db);
          for (const r of refs.slice(i, i + LOTE_MAX)) b.delete(r);
          await b.commit();
        }
      };
      // El ORDEN es la mitad de la corrección (y lo que rompió en producción la primera vez):
      //  1. el contenido — la regla de mercados pregunta por la llave con existsAfter, así que la llave
      //     TIENE que seguir existiendo (y fuera del lote) mientras esto se borra;
      //  2. las llaves (acceso), ya sin contenido que las necesite;
      //  3. el doc de la lista, al final y solo: se autoriza por su propio resource.data.duenio.
      const contenido = [refSugerencias(listId)];
      for (const col of [colItems(listId), colMiembros(listId), colMercados(listId), colInvitaciones(listId)]) {
        const s = await getDocs(col);
        contenido.push(...s.docs.map(d => d.ref));
      }
      await borrar(contenido);
      const llaves = (await getDocs(colAcceso(listId))).docs.map(d => d.ref);
      await borrar(llaves);
      await deleteDoc(refLista(listId));
    },

    async reclamarLista(listId) {
      await listo;
      const uid = miUid();
      if (!uid) throw new Error('sin usuario');
      await updateDoc(refLista(listId), { duenio: uid });
    },

    async misListas() {
      await listo;
      const uid = miUid();
      if (!uid) return [];
      // las llaves propias, estén donde estén; el nombre sale del doc de cada lista (somos miembros: se puede)
      // del SERVIDOR a propósito: sin señal rechaza (y quien llama cae al recuerdo local), pero cuando responde
      // es la verdad — una lista borrada o de la que te echaron no puede quedar zombie en el índice
      const llaves = await getDocsFromServer(query(collectionGroup(db, 'acceso'), where('uid', '==', uid)));
      const filas = await Promise.all(llaves.docs.map(async (d): Promise<ListaResumen | null> => {
        const listId = d.ref.parent.parent?.id;
        if (!listId) return null;
        try {
          const l = await getDoc(refLista(listId));
          return { id: listId, nombre: l.exists() ? texto(l.data().nombre) || NOMBRE_LISTA_DEFAULT : NOMBRE_LISTA_DEFAULT };
        } catch {
          // una llave colgada (la lista se borró como admin): no es una fila que sirva
          return null;
        }
      }));
      return filas.filter((f): f is ListaResumen => f !== null);
    },

    renombrarLista(listId, nombre) {
      const limpio = nombre.replace(/\s+/g, ' ').trim();
      if (!limpio) return;
      escribir(listId, 'renombrarLista', undefined, () => updateDoc(refLista(listId), { nombre: limpio }));
    },

    async crearMercado(listId, nombre) {
      await listo;
      const limpio = nombre.replace(/\s+/g, ' ').trim();
      if (!limpio) throw new Error('nombre vacío');
      // mismo cuidado que elegirMiembro: sobre una caché vacía crearíamos un duplicado de un súper que sí está
      const u = estados.get(listId)?.ultimo ?? null;
      if (u) {
        if (!u.existe) throw new Error('lista inexistente');
        if (u.lista === null) throw new Error('lista no disponible');
      } else if (!(await getDoc(refLista(listId))).exists()) {
        throw new Error('lista inexistente');
      }
      const mercados = u ? u.mercados : (await getDocs(colMercados(listId))).docs.map(d => aMercado(d.id, d.data()));
      const l = estado(listId);
      const existente = mercadoLlamado(limpio, mercados) ?? reciente(l.mercadosNuevos, mercados, normalizar(limpio));
      if (existente) return { ...existente };
      const nuevo: Mercado = { id: nuevoId(), nombre: limpio, creadoEn: null };
      l.mercadosNuevos.set(normalizar(limpio), nuevo);
      escribir(listId, 'crearMercado', undefined, () => setDoc(refMercado(listId, nuevo.id), { nombre: limpio, creadoEn: serverTimestamp() }));
      return nuevo;
    },

    renombrarMercado(listId, mercadoId, nombre) {
      const limpio = nombre.replace(/\s+/g, ' ').trim(); if (!limpio) return;
      escribir(listId, 'renombrarMercado', undefined, () => updateDoc(refMercado(listId, mercadoId), { nombre: limpio }));
    },

    borrarMercado(listId, mercadoId) {
      // el nombre se toma del último snapshot ANTES de borrar: es lo que necesita el deshacer para revivirlo igual
      const previo = estados.get(listId)?.ultimo?.mercados.find(m => m.id === mercadoId);
      escribir(listId, 'borrarMercado', undefined, () => deleteDoc(refMercado(listId, mercadoId)));
      return {
        deshacer: () => {
          if (!previo) return;
          escribir(listId, 'deshacerBorrarMercado', undefined, () => setDoc(refMercado(listId, mercadoId), { nombre: previo.nombre, creadoEn: serverTimestamp() }));
        },
      };
    },

    borrarSugerencia(listId, textoNorm) {
      // la entrada previa sale del último snapshot ANTES de borrar: es lo único que puede reponer el deshacer
      const previa = estados.get(listId)?.ultimo?.sugerencias.find(s => s.textoNorm === textoNorm);
      escribir(listId, 'borrarSugerencia', undefined, () => updateDoc(refSugerencias(listId), new FieldPath('entradas', textoNorm), deleteField()));
      return {
        deshacer: () => {
          if (!previa) return;
          // se repone con merge para no pisar lo que otro haya aprendido mientras tanto
          const datos = { entradas: { [textoNorm]: { texto: previa.texto, veces: previa.veces, ultimaVez: previa.ultimaVez, ...(previa.mercado !== undefined ? { mercado: previa.mercado } : {}) } } };
          escribir(listId, 'deshacerBorrarSugerencia', undefined, () => setDoc(refSugerencias(listId), datos, { merge: true }));
        },
      };
    },

    ponerMercado(listId, itemId, mercadoId, yo) {
      const id = mercadoId ?? null;
      escribir(listId, 'ponerMercado', itemId, () => updateDoc(refItem(listId, itemId), { mercado: id, ...firma(yo) }));
      // y lo aprendemos para el producto, aparte y en silencio (como el uso): si falla, el ítem igual quedó ubicado
      const it = estados.get(listId)?.ultimo?.items.find(i => i.id === itemId);
      const norm = it ? it.textoNorm || normalizar(it.texto) : '';
      if (norm) {
        const datos = { entradas: { [norm]: { mercado: id } } };
        escribir(listId, 'aprenderMercado', undefined, () => setDoc(refSugerencias(listId), datos, { merge: true }), { silenciosa: true });
      }
    },

    agregarItem(listId, texto, yo) {
      const id = nuevoId();
      const limpio = texto.replace(/\s+/g, ' ').trim();
      if (!limpio) { emitirError({ tipo: 'validacion', operacion: 'agregarItem', itemId: id, mensaje: 'texto vacío' }); return id; }
      const norm = normalizar(limpio);
      // nace ubicado si alguien ya dijo dónde se compra este producto (D15); si ese súper ya no está, sin súper
      const u = estados.get(listId)?.ultimo;
      const aprendido = u ? mercadoAprendido(u.sugerencias, limpio) : null;
      const mercado = aprendido !== null && (u?.mercados ?? []).some(m => m.id === aprendido) ? aprendido : null;
      const item: Datos = {
        texto: limpio, textoNorm: norm, estado: 'pendiente',
        agregadoEn: serverTimestamp(), agregadoPor: yo.memberId ?? ALGUIEN, agregadoPorNombre: yo.nombre ?? ALGUIEN,
        compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null, ...firma(yo),
        mercado,
      };
      // el ítem primero y solo; el uso en sugerencias va aparte (si eso falla, el ítem no se pierde)
      escribir(listId, 'agregarItem', id, () => setDoc(refItem(listId, id), item));
      if (norm) anotarUso(listId, limpio, norm);
      return id;
    },

    marcarComprado(listId, itemId, comprado, yo) {
      const datos: Datos = comprado
        ? { estado: 'comprado', compradoEn: serverTimestamp(), compradoPor: yo.memberId ?? ALGUIEN, compradoPorNombre: yo.nombre ?? ALGUIEN, ...firma(yo) }
        : { estado: 'pendiente', compradoEn: null, compradoPor: null, compradoPorNombre: null, ...firma(yo) };
      escribir(listId, 'marcarComprado', itemId, () => updateDoc(refItem(listId, itemId), datos), { eco: { ids: [itemId], estado: comprado ? 'comprado' : 'pendiente' } });
    },

    editarItem(listId, itemId, texto, yo) {
      const limpio = texto.replace(/\s+/g, ' ').trim(); if (!limpio) return;
      const datos: Datos = { texto: limpio, textoNorm: normalizar(limpio), ...firma(yo) };
      escribir(listId, 'editarItem', itemId, () => updateDoc(refItem(listId, itemId), datos));
    },

    borrarItem(listId, itemId) {
      const datos: Datos = { estado: 'borrado', borradoEn: serverTimestamp(), actualizadoEn: serverTimestamp() };
      escribir(listId, 'borrarItem', itemId, () => updateDoc(refItem(listId, itemId), datos), { eco: { ids: [itemId], estado: 'borrado' } });
    },

    restaurarItem(listId, itemId, estadoPrevio, yo) {
      const datos: Datos = { estado: estadoPrevio, borradoEn: null, ...firma(yo) };
      escribir(listId, 'restaurarItem', itemId, () => updateDoc(refItem(listId, itemId), datos), { eco: { ids: [itemId], estado: estadoPrevio } });
    },

    vaciarComprados(listId) {
      // la interfaz es sincrónica: los comprados salen del último snapshot (la app siempre está suscripta),
      // corregido por lo que acabamos de escribir y todavía no volvió (eco)
      const l = estados.get(listId);
      const u = l?.ultimo;
      if (!l || !u) return { ids: [], deshacer: () => {} };
      const ids = u.items.filter(i => (l.eco.get(i.id)?.estado ?? i.estado) === 'comprado').map(i => i.id);
      if (ids.length === 0) return { ids, deshacer: () => {} };
      const enLote = (operacion: string, estadoNuevo: Estado, datos: () => Datos): void => {
        for (const grupo of enLotes(ids, LOTE_MAX)) {
          escribir(listId, operacion, undefined, () => {
            const b = writeBatch(db);
            for (const id of grupo) b.update(refItem(listId, id), datos());
            return b.commit();
          }, { eco: { ids: grupo, estado: estadoNuevo } });
        }
      };
      enLote('vaciarComprados', 'borrado', () => ({ estado: 'borrado', borradoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }));
      return {
        ids,
        deshacer: () => enLote('deshacerVaciar', 'comprado', () => ({ estado: 'comprado', borradoEn: null, actualizadoEn: serverTimestamp() })),
      };
    },

    reclamarAnonimos(listId, itemIds, yo) {
      const memberId = yo.memberId, nombre = yo.nombre;
      if (!memberId || !nombre || itemIds.length === 0) return;
      const u = estados.get(listId)?.ultimo;
      if (!u) return;
      // solo los campos que siguen diciendo "alguien": nunca le sacamos la autoría a nadie (las reglas también lo exigen)
      const cambios = new Map<string, Datos>();
      for (const id of itemIds) {
        const it = u.items.find(i => i.id === id);
        if (!it) continue;
        const d: Datos = {};
        if (it.agregadoPor === ALGUIEN) { d.agregadoPor = memberId; d.agregadoPorNombre = nombre; }
        if (it.compradoPor === ALGUIEN) { d.compradoPor = memberId; d.compradoPorNombre = nombre; }
        if (it.actualizadoPor === ALGUIEN) { d.actualizadoPor = memberId; d.actualizadoPorNombre = nombre; }
        if (Object.keys(d).length > 0) cambios.set(id, d);
      }
      if (cambios.size === 0) return;
      for (const grupo of enLotes([...cambios.keys()], LOTE_MAX)) {
        escribir(listId, 'reclamarAnonimos', undefined, () => {
          const b = writeBatch(db);
          for (const id of grupo) b.update(refItem(listId, id), cambios.get(id)!);
          return b.commit();
        });
      }
    },

    async exportar(listId) {
      await listo;
      try {
        // del SERVIDOR, no de la caché: un export parcial (sin lo que no bajó, sin los borrados) sería un JSON que
        // miente en silencio. Sin señal rechazan con 'unavailable' → onError 'red' + throw (la UI ya lo atrapa).
        const [lista, miembros, mercados, items, sugerencias] = await Promise.all([
          getDocFromServer(refLista(listId)), getDocsFromServer(colMiembros(listId)), getDocsFromServer(colMercados(listId)),
          getDocsFromServer(colItems(listId)), getDocFromServer(refSugerencias(listId)),
        ]);
        if (!lista.exists()) return null;
        return {
          exportadoEn: new Date(ahora()).toISOString(),
          lista: aLista(lista.id, lista.data()),
          miembros: miembros.docs.map(d => aMiembro(d.id, d.data())),
          mercados: ordenarMercados(mercados.docs.map(d => aMercado(d.id, d.data()))),
          // TODOS los ítems, borrados incluidos (la vista no los trae; el export sí)
          items: items.docs.map(d => aItem(d.id, d.data(LECTURA_ITEMS), d.metadata.hasPendingWrites)),
          sugerencias: aSugerencias(sugerencias.data()),
        };
      } catch (err) {
        emitirError(mapearError(err, 'exportar'));
        throw err;
      }
    },

    onError(cb) { errCbs.add(cb); return () => { errCbs.delete(cb); }; },
  };
  return dbApi;
}

// ---------- errores ----------
/** Código de un FirebaseError ('permission-denied', 'auth/network-request-failed' → 'network-request-failed'), o ''. */
function codigoDe(err: unknown): string {
  const c = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  if (typeof c !== 'string') return '';
  const barra = c.lastIndexOf('/');
  return barra >= 0 ? c.slice(barra + 1) : c;
}
/** FirebaseError → DbError. Lo que no reconocemos es 'desconocido' (la UI igual muestra un toast genérico). */
export function mapearError(err: unknown, operacion: string, itemId?: string): DbError {
  const c = codigoDe(err);
  let tipo: DbErrorTipo = 'desconocido';
  if (c === 'permission-denied' || c === 'unauthenticated') tipo = 'permiso';
  else if (c === 'unavailable' || c === 'deadline-exceeded' || c === 'cancelled') tipo = 'red';
  else if (c === 'invalid-argument' || c === 'failed-precondition' || c === 'not-found') tipo = 'validacion';
  const mensaje = err instanceof Error ? err.message : String(err);
  return itemId ? { tipo, operacion, itemId, mensaje } : { tipo, operacion, mensaje };
}

// ---------- entorno ----------
function estaOnlineNavegador(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
}
function suscribirOnlineNavegador(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
}

// ---------- DocumentData → tipos de la Vista (con defaults: un doc raro nunca tira abajo la UI) ----------
function esObjeto(v: unknown): v is Datos { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function texto(v: unknown): string { return typeof v === 'string' ? v : ''; }
function textoONull(v: unknown): string | null { return typeof v === 'string' ? v : null; }
function numero(v: unknown): number { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
/** Timestamp de Firestore → epoch ms (un serverTimestamp pendiente es null, o una estimación si se leyó con LECTURA_ITEMS); cualquier otra cosa → null. */
function ms(v: unknown): number | null {
  if (typeof v === 'object' && v !== null && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis(): number }).toMillis();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}
function esEstado(v: unknown): v is Estado { return v === 'pendiente' || v === 'comprado' || v === 'borrado'; }
function esColor(v: unknown): v is ColorPersona { return typeof v === 'string' && (COLORES_PERSONA as string[]).includes(v); }

function aAcceso(uid: string, d: DocumentData): Acceso {
  // las llaves viejas pueden traer todavía un campo `etiqueta` (D26 lo sacó): se ignora al leer, no se migra
  return { uid: typeof d.uid === 'string' ? d.uid : uid, memberId: typeof d.memberId === 'string' ? d.memberId : null, entroEn: ms(d.entroEn) };
}
function aInvitacion(codigo: string, d: DocumentData): Invitacion {
  return { codigo, creadaPor: texto(d.creadaPor), creadaEn: ms(d.creadaEn), venceEn: ms(d.venceEn), revocada: d.revocada === true };
}
function aLista(id: string, d: DocumentData): Lista {
  return { id, nombre: texto(d.nombre) || NOMBRE_LISTA_DEFAULT, creadaEn: ms(d.creadaEn), duenio: typeof d.duenio === 'string' ? d.duenio : null };
}
/** Orden estable de los miembros (los chips de "¿Quién sos?"): por alta y, a igual momento (el batch de crearLista), por
 *  color (se asignan en orden de llegada: p1, p2, p3…), después por nombre. Firestore los devuelve por id, que es azar. */
function cmpMiembro(a: Miembro, b: Miembro): number {
  const ta = a.creadoEn ?? Number.MAX_SAFE_INTEGER, tb = b.creadoEn ?? Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta - tb;
  const ca = COLORES_PERSONA.indexOf(a.color), cb = COLORES_PERSONA.indexOf(b.color);
  if (ca !== cb) return ca - cb;
  return a.nombre.localeCompare(b.nombre, 'es');
}
function aMiembro(id: string, d: DocumentData): Miembro {
  return { id, nombre: texto(d.nombre), color: esColor(d.color) ? d.color : 'p1', creadoEn: ms(d.creadoEn) };
}
function aMercado(id: string, d: DocumentData): Mercado {
  return { id, nombre: texto(d.nombre), creadoEn: ms(d.creadoEn) };
}
function aItem(id: string, d: DocumentData, pendiente: boolean): Item {
  const t = texto(d.texto);
  return {
    id, texto: t, textoNorm: texto(d.textoNorm) || normalizar(t), estado: esEstado(d.estado) ? d.estado : 'pendiente',
    agregadoEn: ms(d.agregadoEn), agregadoPor: texto(d.agregadoPor) || ALGUIEN, agregadoPorNombre: texto(d.agregadoPorNombre) || ALGUIEN,
    compradoEn: ms(d.compradoEn), compradoPor: textoONull(d.compradoPor), compradoPorNombre: textoONull(d.compradoPorNombre),
    borradoEn: ms(d.borradoEn), actualizadoEn: ms(d.actualizadoEn),
    actualizadoPor: textoONull(d.actualizadoPor), actualizadoPorNombre: textoONull(d.actualizadoPorNombre),
    // los ítems anteriores a D13 no traen el campo: sin súper ("en cualquiera")
    mercado: textoONull(d.mercado), pendiente,
  };
}
/** `entradas: { [textoNorm]: { texto, veces, ultimaVez, mercado } }` → Sugerencia[] (la clave ES el textoNorm). */
function aSugerencias(d: DocumentData | undefined): Sugerencia[] {
  const entradas: unknown = d?.entradas;
  if (!esObjeto(entradas)) return [];
  return Object.entries(entradas).map(([textoNorm, e]) => {
    const x: Datos = esObjeto(e) ? e : {};
    return { texto: texto(x.texto) || textoNorm, textoNorm, veces: numero(x.veces), ultimaVez: ms(x.ultimaVez), mercado: textoONull(x.mercado) };
  });
}

function enLotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
