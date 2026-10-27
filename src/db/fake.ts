/**
 * Db falso en memoria. Implementa la misma interfaz `Db` que Firestore y reproduce lo que importa
 * de su comportamiento:
 *  - las mutaciones se aplican de inmediato a la "caché" y quedan `pendiente` hasta que "el servidor" confirma
 *    (con red: en el próximo tick; sin red: al volver);
 *  - `setOnline(false)` simula sin señal (fromCache, pendientes que se acumulan);
 *  - `remoto.*` simula a otro familiar escribiendo desde otro teléfono;
 *  - `latencia` opcional para ver la confirmación llegar.
 * Sirve para tests de componentes, para Playwright local y para el modo demo (artifact).
 */
import { ANONIMO, type Acceso, type Cuenta, type Invitacion, type ListaResumen, type ColorPersona, type Db, type DbError, type Item, type Lista, type Mercado, type Miembro, type Sugerencia, type Vista, type Yo } from './types';
import { normalizar } from '@/domain/normalizar';
import { nuevoId, nuevoIdLista } from '@/domain/ids';
import { SEMILLA_SUGERENCIAS, aprenderMercado, mercadoAprendido, registrarUso } from '@/domain/sugerencias';
import { VENCIMIENTO_INVITACION_MS, nuevoCodigo } from '@/domain/acceso';
import { mercadoLlamado } from '@/domain/mercados';
import { buscarPorNombre, siguienteColor } from '@/domain/miembros';

export interface FakeDbOpts {
  /** 'demo' → una lista con ítems de ejemplo; 'vacio' → nada; o un estado inicial explícito */
  semilla?: 'demo' | 'vacio' | EstadoInicial;
  /** ms hasta que "el servidor" confirma una escritura (0 = próximo tick) */
  latencia?: number;
  /** reloj inyectable (tests) */
  ahora?: () => number;
  /** id fijo de la lista de demo (para que el link no cambie entre recargas) */
  demoListId?: string;
  /** el uid de este "teléfono". Default: uno fijo, así los tests son deterministas. */
  uid?: string;
  /** estado inicial de la cuenta (D23). Default: anónima. */
  cuenta?: Cuenta;
}
export interface EstadoInicial { listas: Record<string, EstadoLista> }
export interface EstadoLista { lista: Lista; items: Item[]; miembros: Miembro[]; mercados: Mercado[]; sugerencias: Sugerencia[]; accesos?: Acceso[]; invitaciones?: Invitacion[] }

export interface FakeDb extends Db {
  /** Controles de test/demo */
  setOnline(v: boolean): void;
  estaOnline(): boolean;
  /** Estado crudo (para aserciones) */
  estado(listId: string): EstadoLista | undefined;
  /** Simular a otro familiar */
  remoto: {
    agregar(listId: string, texto: string, quien: { memberId: string; nombre: string }): string;
    marcarComprado(listId: string, itemId: string, comprado: boolean, quien: { memberId: string; nombre: string }): void;
    borrar(listId: string, itemId: string): void;
    editar(listId: string, itemId: string, texto: string): void;
  };
  /** Forzar un error en la próxima operación (para probar toasts de error) */
  fallarProxima(e: Partial<DbError>): void;
  /** Ids conocidos (demo) */
  listaDemoId(): string | null;
}

type Sub = { listId: string; cb: (v: Vista) => void };

/** el email de la cuenta guardada en el fake: genérico a propósito, el nombre de nadie viaja en el producto */
const EMAIL_FAKE = 'cuenta@ejemplo.com';

export function crearDbFake(opts: FakeDbOpts = {}): FakeDb {
  const ahora = opts.ahora ?? (() => Date.now());
  const uidPropio = opts.uid ?? 'uid-fake';
  let cuenta: Cuenta = opts.cuenta ?? { estado: 'anonima' };
  const latencia = opts.latencia ?? 0;
  const listas = new Map<string, EstadoLista>();
  const subs = new Set<Sub>();
  const errCbs = new Set<(e: DbError) => void>();
  let online = true;
  let ultimaSync: Map<string, number | null> = new Map();
  let fallo: Partial<DbError> | null = null;
  let demoId: string | null = null;
  /** ids con escrituras locales sin confirmar, por lista */
  const pendientes = new Map<string, Set<string>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  // ---------- semilla ----------
  if (opts.semilla && typeof opts.semilla === 'object') {
    for (const [id, e] of Object.entries(opts.semilla.listas)) listas.set(id, clonar(e));
  } else if (opts.semilla === 'demo') {
    demoId = sembrarDemo();
  }

  function sembrarDemo(): string {
    const id = opts.demoListId ?? 'demoCasaAna00000000001';
    const t = ahora();
    const miembros: Miembro[] = [
      { id: 'm-ana', nombre: 'Ana', color: 'p1', creadoEn: t - 30 * 864e5 },
      { id: 'm-mama', nombre: 'Mamá', color: 'p2', creadoEn: t - 30 * 864e5 },
      { id: 'm-papa', nombre: 'Papá', color: 'p3', creadoEn: t - 30 * 864e5 },
    ];
    const mk = (texto: string, quien: Miembro, hace: number, extra: Partial<Item> = {}): Item => ({
      id: nuevoId(), texto, textoNorm: normalizar(texto), estado: 'pendiente',
      agregadoEn: t - hace, agregadoPor: quien.id, agregadoPorNombre: quien.nombre,
      compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null, actualizadoEn: t - hace, pendiente: false, ...extra,
    });
    // dos súper y algunas cosas ubicadas: así la demo muestra las secciones (y las que no tienen, arriba y sin título)
    const mercados: Mercado[] = [
      { id: 'x-merca', nombre: 'Mercadona', creadoEn: t - 20 * 864e5 },
      { id: 'x-verdu', nombre: 'La Verdulería', creadoEn: t - 10 * 864e5 },
    ];
    const items: Item[] = [
      mk('Leche', miembros[2]!, 2 * 36e5, { mercado: 'x-merca' }),
      mk('Yerba (la de siempre)', miembros[0]!, 26 * 36e5, { mercado: 'x-verdu' }),
      mk('Papel de cocina', miembros[1]!, 3 * 864e5),
      mk('Cerveza', miembros[2]!, 20e3),
      mk('Yogur de frutilla', miembros[2]!, 25 * 36e5, { mercado: 'x-merca' }),
      mk('Helado de dulce de leche', miembros[0]!, 5e3),
      mk('Pan', miembros[1]!, 5 * 36e5, { estado: 'comprado', compradoEn: t - 60e3, compradoPor: 'm-mama', compradoPorNombre: 'Mamá' }),
      mk('Huevos', miembros[1]!, 5 * 36e5, { estado: 'comprado', compradoEn: t - 120e3, compradoPor: 'm-mama', compradoPorNombre: 'Mamá' }),
      mk('Yogur natural', miembros[1]!, 2 * 864e5, { estado: 'comprado', compradoEn: t - 864e5, compradoPor: 'm-mama', compradoPorNombre: 'Mamá' }),
    ];
    let sug = semilla(t);
    for (const s of ['Leche', 'Yerba', 'Pan', 'Huevos', 'Yogur', 'Yogur griego', 'Yogur bebible', 'Dulce de leche', 'Cerveza']) sug = registrarUso(sug, s, t - 5 * 864e5);
    for (const s of ['Leche', 'Yerba', 'Pan']) sug = registrarUso(sug, s, t - 2 * 864e5);
    sug = aprenderMercado(sug, 'Leche', 'x-merca');
    sug = aprenderMercado(sug, 'Yerba', 'x-verdu');
    listas.set(id, { lista: { id, nombre: 'Casa', creadaEn: t - 30 * 864e5 }, items, miembros, mercados, sugerencias: sug });
    ultimaSync.set(id, t);
    return id;
  }

  function semilla(t: number): Sugerencia[] {
    return SEMILLA_SUGERENCIAS.map(texto => ({ texto, textoNorm: normalizar(texto), veces: 0, ultimaVez: null as number | null }));
    void t;
  }

  // ---------- helpers ----------
  function get(listId: string): EstadoLista | undefined { return listas.get(listId); }
  function pend(listId: string): Set<string> { let s = pendientes.get(listId); if (!s) { s = new Set(); pendientes.set(listId, s); } return s; }
  function vista(listId: string): Vista {
    const e = listas.get(listId);
    const p = pend(listId);
    if (!e) return { lista: null, existe: false, items: [], miembros: [], mercados: [], sugerencias: [], fromCache: !online, hasPendingWrites: false, online, ultimaSync: null };
    return {
      lista: e.lista,
      existe: true,
      items: e.items.filter(i => i.estado !== 'borrado').map(i => ({ ...i, pendiente: p.has(i.id) })),
      miembros: e.miembros.map(m => ({ ...m })),
      mercados: e.mercados.map(m => ({ ...m })),
      sugerencias: e.sugerencias.map(s => ({ ...s })),
      fromCache: !online,
      hasPendingWrites: p.size > 0,
      online,
      ultimaSync: ultimaSync.get(listId) ?? null,
    };
  }
  function notificar(listId: string): void { const v = vista(listId); for (const s of subs) if (s.listId === listId) s.cb(v); }
  function emitirError(e: DbError): void { for (const cb of errCbs) cb(e); }
  function programar(fn: () => void, ms: number): void {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  }
  /** Marca ids como pendientes y, si hay red, los confirma "cuando el servidor responde". */
  function escribir(listId: string, ids: string[], mutar: () => void, operacion: string): void {
    if (fallo) { const f = fallo; fallo = null; emitirError({ tipo: 'validacion', operacion, mensaje: 'falló', ...f }); return; }
    mutar();
    const p = pend(listId);
    const e = listas.get(listId);
    for (const id of ids) {
      p.add(id);
      // el crudo (estado()/exportar) también refleja "pendiente": antes quedaba fijo en lo que traía el ítem al crearse
      const it = e?.items.find(i => i.id === id); if (it) it.pendiente = true;
    }
    notificar(listId);
    if (online) confirmar(listId, ids);
  }
  function confirmar(listId: string, ids: string[]): void {
    programar(() => {
      const e = listas.get(listId); if (!e) return;
      const t = ahora();
      const p = pend(listId);
      for (const id of ids) {
        p.delete(id);
        const it = e.items.find(i => i.id === id);
        if (it) {
          it.pendiente = false;
          // "serverTimestamp resuelto": rellenamos nulls
          if (it.agregadoEn === null) it.agregadoEn = t;
          if (it.actualizadoEn === null) it.actualizadoEn = t;
          if (it.estado === 'comprado' && it.compradoEn === null) it.compradoEn = t;
          if (it.estado === 'borrado' && it.borradoEn === null) it.borradoEn = t;
        }
      }
      ultimaSync.set(listId, t);
      notificar(listId);
    }, latencia);
  }
  function findItem(listId: string, itemId: string): Item | undefined { return listas.get(listId)?.items.find(i => i.id === itemId); }
  /** deja la firma de quién tocó el ítem (D19); la fecha la resuelve "el servidor" al confirmar */
  function firmar(it: Item, yo: Yo): void {
    it.actualizadoEn = null;
    it.actualizadoPor = yo.memberId ?? 'alguien';
    it.actualizadoPorNombre = yo.nombre ?? 'alguien';
  }

  // ---------- Db ----------
  const db: FakeDb = {
    async crearLista(nombre, nombresMiembros) {
      const id = nuevoIdLista();
      const t = ahora();
      const miembros: Miembro[] = [];
      for (const n of nombresMiembros) {
        const limpio = n.trim(); if (!limpio) continue;
        miembros.push({ id: nuevoId(), nombre: limpio, color: siguienteColor(miembros), creadoEn: t });
      }
      // sin súper: hasta que alguien cree el primero, la lista se ve exactamente como antes (D14)
      // nace con dueño y con la llave del creador (D22), igual que en Firestore
      listas.set(id, {
        lista: { id, nombre: nombre.trim() || 'Casa', creadaEn: t, duenio: uidPropio },
        items: [], miembros, mercados: [], sugerencias: semilla(t),
        accesos: [{ uid: uidPropio, memberId: null, entroEn: t }], invitaciones: [],
      });
      ultimaSync.set(id, online ? t : null);
      notificar(id);
      return id;
    },

    suscribir(listId, cb) {
      const s: Sub = { listId, cb };
      subs.add(s);
      // como Firestore: primero la caché, de inmediato
      queueMicrotask(() => { if (subs.has(s)) cb(vista(listId)); });
      return () => { subs.delete(s); };
    },

    async elegirMiembro(listId, o) {
      const e = get(listId); if (!e) throw new Error('lista inexistente');
      if (o.memberId) { const m = e.miembros.find(x => x.id === o.memberId); if (m) return { ...m }; }
      const nombre = (o.nombre ?? '').replace(/\s+/g, ' ').trim();
      if (!nombre) throw new Error('nombre vacío');
      const existente = buscarPorNombre(e.miembros, nombre);
      if (existente) return { ...existente };
      const m: Miembro = { id: nuevoId(), nombre, color: siguienteColor(e.miembros), creadoEn: online ? ahora() : null };
      escribir(listId, [], () => { e.miembros.push(m); }, 'elegirMiembro');
      return { ...m };
    },

    renombrarMiembro(listId, memberId, nombre) {
      const e = get(listId); if (!e) return;
      const m = e.miembros.find(x => x.id === memberId); if (!m) return;
      escribir(listId, [], () => { m.nombre = nombre.trim() || m.nombre; }, 'renombrarMiembro');
    },

    miUid: () => uidPropio,

    // ---------- la cuenta (D23) ----------
    // El espejo de lo observable: guardar deja la cuenta guardada (mismo uid, nada que migrar). Lo que acá no
    // se simula es el viaje: en el Db real las dos operaciones redirigen a Google, y entrar con una cuenta
    // cambia la identidad y termina en una recarga de la app (eso se prueba a mano, no en node).
    async miCuenta() { return { ...cuenta }; },
    async guardarCuenta() { cuenta = { estado: 'guardada', email: EMAIL_FAKE }; },
    // en el canje de un choque se entra con ESA cuenta: el email que se vio en el aviso es el que queda
    async entrarConCuenta() { cuenta = { estado: 'guardada', email: cuenta.estado === 'choque' ? cuenta.email : EMAIL_FAKE }; },

    async entrar(listId, o = {}) {
      const e = get(listId); if (!e) return false;
      const accesos = (e.accesos ??= []);
      const ya = accesos.find(a => a.uid === uidPropio);
      if (ya) {
        if (o.memberId != null && ya.memberId !== o.memberId) escribir(listId, [], () => { ya.memberId = o.memberId ?? null; }, 'entrar');
        return true;
      }
      // sin llave, acá la única puerta es una invitación viva PARA ESTA lista. OJO: eso vale para todos MENOS
      // el dueño, y ahí el fake es más estricto que el real — el `allow create` de `acceso/{uid}` tiene una
      // segunda rama (`getAfter(listaRef(listId)).data.get('duenio','') == request.auth.uid`) que no está
      // acotada al lote del alta, así que al dueño que se fue las reglas SÍ le devuelven la llave sin código
      // (lo fija `reglas.emu.test.ts`). La divergencia viene de D22 y se deja como está a propósito: emparejarla
      // —o acotar la rama de las reglas al lote— es cambio de contrato, con su decisión y su vuelta de circuito.
      const inv = (e.invitaciones ?? []).find(i => i.codigo === o.codigo);
      if (!inv || inv.revocada || (inv.venceEn ?? 0) <= ahora()) return false;
      escribir(listId, [], () => { accesos.push({ uid: uidPropio, memberId: o.memberId ?? null, entroEn: ahora() }); }, 'entrar');
      return true;
    },

    async invitar(listId) {
      const e = get(listId); if (!e) throw new Error('lista inexistente');
      const codigo = nuevoCodigo();
      const inv: Invitacion = { codigo, creadaPor: uidPropio, creadaEn: ahora(), venceEn: ahora() + VENCIMIENTO_INVITACION_MS, revocada: false };
      escribir(listId, [], () => { (e.invitaciones ??= []).push(inv); }, 'invitar');
      return codigo;
    },

    async listarInvitaciones(listId) {
      return (get(listId)?.invitaciones ?? []).map(i => ({ ...i }));
    },

    async revocarInvitacion(listId, codigo) {
      const e = get(listId); if (!e) return;
      const inv = (e.invitaciones ?? []).find(i => i.codigo === codigo); if (!inv) return;
      escribir(listId, [], () => { inv.revocada = true; }, 'revocarInvitacion');
    },

    async listarAccesos(listId) {
      return (get(listId)?.accesos ?? []).map(a => ({ ...a }));
    },

    async expulsar(listId, uid) {
      const e = get(listId); if (!e) return;
      escribir(listId, [], () => {
        e.accesos = (e.accesos ?? []).filter(a => a.uid !== uid);
        // sin esto vuelve a entrar con su propio código: las dos cosas van juntas o no sirve
        for (const i of e.invitaciones ?? []) if (i.creadaPor === uid) i.revocada = true;
      }, 'expulsar');
    },

    async salir(listId) {
      const e = get(listId); if (!e) return;
      escribir(listId, [], () => { e.accesos = (e.accesos ?? []).filter(a => a.uid !== uidPropio); }, 'salir');
    },

    async borrarLista(listId) {
      const e = get(listId); if (!e) return;
      listas.delete(listId);
      notificar(listId);               // los suscriptores ven existe: false, igual que una lista que nunca existió
    },

    async reclamarLista(listId) {
      const e = get(listId); if (!e) return;
      if (e.lista.duenio) return;                       // una sola vez, como en las reglas
      escribir(listId, [], () => { e.lista.duenio = uidPropio; }, 'reclamarLista');
    },

    async misListas() {
      const out: ListaResumen[] = [];
      for (const [id, e] of listas) if ((e.accesos ?? []).some(a => a.uid === uidPropio)) out.push({ id, nombre: e.lista.nombre });
      return out;
    },

    renombrarLista(listId, nombre) {
      const e = get(listId); if (!e) return;
      const limpio = nombre.replace(/\s+/g, ' ').trim();
      if (!limpio) return;
      escribir(listId, [], () => { e.lista.nombre = limpio; }, 'renombrarLista');
    },

    async crearMercado(listId, nombre) {
      const e = get(listId); if (!e) throw new Error('lista inexistente');
      const limpio = nombre.replace(/\s+/g, ' ').trim();
      if (!limpio) throw new Error('nombre vacío');
      const existente = mercadoLlamado(limpio, e.mercados);
      if (existente) return { ...existente };
      const m: Mercado = { id: nuevoId(), nombre: limpio, creadoEn: online ? ahora() : null };
      escribir(listId, [], () => { e.mercados.push(m); }, 'crearMercado');
      return { ...m };
    },

    renombrarMercado(listId, mercadoId, nombre) {
      const e = get(listId); if (!e) return;
      const m = e.mercados.find(x => x.id === mercadoId); if (!m) return;
      escribir(listId, [], () => { m.nombre = nombre.replace(/\s+/g, ' ').trim() || m.nombre; }, 'renombrarMercado');
    },

    borrarMercado(listId, mercadoId) {
      const e = get(listId); if (!e) return { deshacer: () => {} };
      const i = e.mercados.findIndex(m => m.id === mercadoId);
      if (i < 0) return { deshacer: () => {} };
      const borrado = { ...e.mercados[i]! };
      escribir(listId, [], () => { e.mercados.splice(i, 1); }, 'borrarMercado');
      // revive con el mismo id: los ítems nunca perdieron su `mercado`, así que vuelven solos a su sección
      return { deshacer: () => escribir(listId, [], () => { if (!e.mercados.some(m => m.id === mercadoId)) e.mercados.push(borrado); }, 'deshacerBorrarMercado') };
    },

    borrarSugerencia(listId, textoNorm) {
      const e = get(listId); if (!e) return { deshacer: () => {} };
      const i = e.sugerencias.findIndex(s => s.textoNorm === textoNorm);
      if (i < 0) return { deshacer: () => {} };
      const borrada = { ...e.sugerencias[i]! };
      escribir(listId, [], () => { e.sugerencias.splice(i, 1); }, 'borrarSugerencia');
      // vuelve con sus veces y su súper: si el deshacer perdiera eso, el producto quedaría "nuevo" y bajaría de orden
      return { deshacer: () => escribir(listId, [], () => { if (!e.sugerencias.some(s => s.textoNorm === textoNorm)) e.sugerencias.push(borrada); }, 'deshacerBorrarSugerencia') };
    },

    ponerMercado(listId, itemId, mercadoId, yo) {
      const e = get(listId); if (!e) return;
      const it = e.items.find(i => i.id === itemId); if (!it) return;
      // un id colgado (súper que se fue) se guarda igual: la vista lo lee como sin súper (mercadoIdDe). Validarlo acá
      // haría que el fake fuera más estricto que las reglas, y el fake no puede mentir sobre el real.
      const id = mercadoId ?? null;
      escribir(listId, [itemId], () => {
        it.mercado = id;
        firmar(it, yo);
        // aprendemos dónde se compra ESTE producto, no solo dónde va este ítem (D15)
        e.sugerencias = aprenderMercado(e.sugerencias, it.texto, id);
      }, 'ponerMercado');
    },

    agregarItem(listId, texto, yo) {
      const id = nuevoId();
      const e = get(listId);
      if (!e) { emitirError({ tipo: 'validacion', operacion: 'agregarItem', mensaje: 'lista inexistente' }); return id; }
      const limpio = texto.replace(/\s+/g, ' ').trim();
      // texto vacío: las reglas del servidor lo rechazan; acá tampoco se agrega (mismo error que firestore.ts)
      if (!limpio) { emitirError({ tipo: 'validacion', operacion: 'agregarItem', itemId: id, mensaje: 'texto vacío' }); return id; }
      const nombre = yo.nombre ?? 'alguien';
      // nace ubicado si alguien ya dijo dónde se compra este producto (D15): el súper no se pregunta al anotar
      const aprendido = mercadoAprendido(e.sugerencias, limpio);
      const item: Item = {
        id, texto: limpio, textoNorm: normalizar(limpio), estado: 'pendiente',
        agregadoEn: null, agregadoPor: yo.memberId ?? 'alguien', agregadoPorNombre: nombre,
        compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null, actualizadoEn: null,
        actualizadoPor: yo.memberId ?? 'alguien', actualizadoPorNombre: nombre,
        mercado: e.mercados.some(m => m.id === aprendido) ? aprendido : null, pendiente: true,
      };
      escribir(listId, [id], () => { e.items.push(item); e.sugerencias = registrarUso(e.sugerencias, limpio, ahora()); }, 'agregarItem');
      return id;
    },

    marcarComprado(listId, itemId, comprado, yo) {
      const it = findItem(listId, itemId); if (!it) return;
      escribir(listId, [itemId], () => {
        it.estado = comprado ? 'comprado' : 'pendiente';
        it.compradoEn = null;                        // tildado: serverTimestamp pendiente (se resuelve al confirmar); destildado: sin fecha
        it.compradoPor = comprado ? (yo.memberId ?? 'alguien') : null;
        it.compradoPorNombre = comprado ? (yo.nombre ?? 'alguien') : null;
        firmar(it, yo);
      }, 'marcarComprado');
    },

    editarItem(listId, itemId, texto, yo) {
      const it = findItem(listId, itemId); if (!it) return;
      const limpio = texto.replace(/\s+/g, ' ').trim(); if (!limpio) return;
      escribir(listId, [itemId], () => { it.texto = limpio; it.textoNorm = normalizar(limpio); firmar(it, yo); }, 'editarItem');
    },

    borrarItem(listId, itemId) {
      const it = findItem(listId, itemId); if (!it) return;
      escribir(listId, [itemId], () => { it.estado = 'borrado'; it.borradoEn = null; it.actualizadoEn = null; }, 'borrarItem');
    },

    restaurarItem(listId, itemId, estadoPrevio, yo) {
      const it = findItem(listId, itemId); if (!it) return;
      escribir(listId, [itemId], () => { it.estado = estadoPrevio; it.borradoEn = null; firmar(it, yo); }, 'restaurarItem');
    },

    vaciarComprados(listId) {
      const e = get(listId); if (!e) return { ids: [], deshacer: () => {} };
      const ids = e.items.filter(i => i.estado === 'comprado').map(i => i.id);
      if (ids.length === 0) return { ids, deshacer: () => {} };
      escribir(listId, ids, () => { for (const it of e.items) if (ids.includes(it.id)) { it.estado = 'borrado'; it.borradoEn = null; it.actualizadoEn = null; } }, 'vaciarComprados');
      return {
        ids,
        deshacer: () => escribir(listId, ids, () => { for (const it of e.items) if (ids.includes(it.id) && it.estado === 'borrado') { it.estado = 'comprado'; it.borradoEn = null; it.actualizadoEn = null; } }, 'deshacerVaciar'),
      };
    },

    reclamarAnonimos(listId, itemIds, yo) {
      const e = get(listId); if (!e || itemIds.length === 0) return;
      const memberId = yo.memberId; const nombre = yo.nombre;
      if (!memberId || !nombre) return;
      const tocados = e.items.filter(i => itemIds.includes(i.id) && (i.agregadoPor === ANONIMO || i.compradoPor === ANONIMO || i.actualizadoPor === ANONIMO));
      if (tocados.length === 0) return;
      escribir(listId, tocados.map(i => i.id), () => {
        for (const it of tocados) {
          if (it.agregadoPor === ANONIMO) { it.agregadoPor = memberId; it.agregadoPorNombre = nombre; }
          if (it.compradoPor === ANONIMO) { it.compradoPor = memberId; it.compradoPorNombre = nombre; }
          if (it.actualizadoPor === ANONIMO) { it.actualizadoPor = memberId; it.actualizadoPorNombre = nombre; }
        }
      }, 'reclamarAnonimos');
    },

    async exportar(listId) {
      const e = get(listId); if (!e) return null;
      return { exportadoEn: new Date(ahora()).toISOString(), lista: e.lista, miembros: e.miembros, mercados: e.mercados, items: e.items, sugerencias: e.sugerencias };
    },

    onError(cb) { errCbs.add(cb); return () => { errCbs.delete(cb); }; },

    // ---------- controles ----------
    setOnline(v) {
      if (online === v) return;
      online = v;
      for (const listId of listas.keys()) {
        if (v) { const ids = [...pend(listId)]; if (ids.length) confirmar(listId, ids); else { ultimaSync.set(listId, ahora()); } }
        notificar(listId);
      }
    },
    estaOnline() { return online; },
    estado(listId) { const e = listas.get(listId); return e ? clonar(e) : undefined; },
    remoto: {
      agregar(listId, texto, quien) {
        const e = get(listId); if (!e) throw new Error('lista inexistente');
        const id = nuevoId(); const t = ahora();
        const limpio = texto.trim();
        const aprendido = mercadoAprendido(e.sugerencias, limpio);
        e.items.push({ id, texto: limpio, textoNorm: normalizar(limpio), estado: 'pendiente', agregadoEn: t, agregadoPor: quien.memberId, agregadoPorNombre: quien.nombre, compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null, actualizadoEn: t, actualizadoPor: quien.memberId, actualizadoPorNombre: quien.nombre, mercado: e.mercados.some(m => m.id === aprendido) ? aprendido : null, pendiente: false });
        e.sugerencias = registrarUso(e.sugerencias, limpio, t);
        if (online) { ultimaSync.set(listId, t); notificar(listId); }
        return id;
      },
      marcarComprado(listId, itemId, comprado, quien) {
        const it = findItem(listId, itemId); if (!it) return; const t = ahora();
        it.estado = comprado ? 'comprado' : 'pendiente'; it.compradoEn = comprado ? t : null; it.compradoPor = comprado ? quien.memberId : null; it.compradoPorNombre = comprado ? quien.nombre : null;
        it.actualizadoEn = t; it.actualizadoPor = quien.memberId; it.actualizadoPorNombre = quien.nombre;
        if (online) { ultimaSync.set(listId, t); notificar(listId); }
      },
      borrar(listId, itemId) {
        const it = findItem(listId, itemId); if (!it) return; const t = ahora();
        it.estado = 'borrado'; it.borradoEn = t; it.actualizadoEn = t;
        if (online) { ultimaSync.set(listId, t); notificar(listId); }
      },
      editar(listId, itemId, texto) {
        const it = findItem(listId, itemId); if (!it) return; const t = ahora();
        it.texto = texto.trim(); it.textoNorm = normalizar(texto); it.actualizadoEn = t;
        // el "otro familiar" que edita queda como última mano si sabemos quién es (el remoto de tests no lo pasa)
        if (online) { ultimaSync.set(listId, t); notificar(listId); }
      },
    },
    fallarProxima(e) { fallo = e; },
    listaDemoId() { return demoId; },
  };
  return db;
}

function clonar(e: EstadoLista): EstadoLista {
  return {
    lista: { ...e.lista },
    items: e.items.map(i => ({ ...i })),
    miembros: e.miembros.map(m => ({ ...m })),
    mercados: (e.mercados ?? []).map(m => ({ ...m })),
    sugerencias: e.sugerencias.map(s => ({ ...s })),
  };
}

export type { ColorPersona };
