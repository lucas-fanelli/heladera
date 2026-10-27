/**
 * Estado y acciones de la pantalla de la lista. Es el único lugar donde la UI toca el `Db`.
 * Los componentes reciben de acá TODO lo que pintan y las funciones que llaman.
 *
 * Reglas del diseño que viven acá:
 *  - Tildar escribe en el Db YA (offline-safe) pero la fila se queda HOLD_MS tachada en su lugar
 *    antes de "bajar" a Comprados (Fase A / Fase B de §9). Destildar: UNHOLD_MS.
 *    Con "Reducir movimiento" no hay espera: la fila cambia de grupo al instante (toggle normal).
 *  - La espera es autoritativa sobre el grupo visual: 'aComprado' pinta la fila ARRIBA tachada aunque el
 *    snapshot ya la traiga comprada (o un remoto la haya vuelto a pendiente); 'aPendiente' la pinta ABAJO
 *    destachada. Los contadores ("Faltan N", "Vaciar N") también van por grupo visual.
 *  - Enter / chip: agregar / "Ya está" (resalta el existente) / "Volver a anotar" (destilda, sin auto-scroll).
 *    El input se vacía y conserva el foco (eso lo hace el componente).
 *  - Borrar y vaciar son optimistas con Deshacer (toast).
 *  - Deduplicación determinista de ítems iguales confirmados (§5).
 *  - Identidad por memberId en localStorage; sheet "¿Quién sos?" al abrir, descartable ("alguien").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Db, Item, Mercado, Miembro, Vista, Yo } from '@/db/types';
import { accionPara, duplicadosParaBorrar, estadoConexion, estadoVacio, filtrar, pendientesDeSync, type Accion, type EstadoConexion, type EstadoVacio, type Filtrado } from '@/domain';
import { timing } from '@/domain/timing';
import { textos } from '@/ui/textos';
import { anotarAnonimo, fueDescartado, guardarUltimaLista, guardarYo, leerAnonimos, leerYo, limpiarAnonimos, limpiarDescartado, marcarDescartado, YO_ANONIMO } from '@/identidad/yo';
import { codigoDeLaUrl } from '@/domain/acceso';
import { limpiarCodigo } from './router';
import { useToasts, type Toast } from './useToasts';

export type Espera = 'aComprado' | 'aPendiente';

/** identidad estable para "todavía no hay súper" (si no, cada render dispara los useMemo que dependen de la lista) */
const SIN_MERCADOS: Mercado[] = [];

/** Fila tal como se pinta: el ítem + en qué grupo va (durante la espera no coincide con su estado real). */
export interface FilaVM {
  item: Item;
  grupo: 'pendiente' | 'comprado';
  /** tachado visible (Fase A del tildado) */
  tachado: boolean;
  /** está en la espera de HOLD/UNHOLD */
  enEspera: boolean;
  /** la fila que acaba de cambiar de grupo (viaja con spring.settle) */
  protagonista: boolean;
  /** resaltada por "Ya está" o por ser nueva */
  resaltada: boolean;
}

export interface EstadoLista {
  listId: string;
  vista: Vista | null;
  cargado: boolean;
  /** identidad */
  yo: Yo;
  /** ya gateado: solo true si la lista ya bajó (hay `vista.lista`), no sobre "no existe" ni sobre una vista provisional sin la lista */
  quienSosAbierto: boolean;
  abrirQuienSos: () => void;
  cerrarQuienSos: () => void;
  elegirYo: (opts: { memberId?: string; nombre?: string }) => Promise<Miembro | null>;
  renombrarme: (nombre: string) => void;
  /** input */
  consulta: string;
  setConsulta: (v: string) => void;
  filtrado: Filtrado;
  accion: Accion;
  enviar: () => void;
  /** filas ya derivadas (con esperas, resaltes) */
  pendientes: FilaVM[];
  comprados: FilaVM[];
  ocultos: number;
  vacio: EstadoVacio;
  /** "Faltan N": pendientes por grupo VISUAL (incluye los que esperan para bajar, excluye los que esperan para subir) */
  faltan: number;
  /** los súper de la casa (D14); vacío mientras nadie cree ninguno */
  mercados: Mercado[];
  /** el súper que se está buscando por nombre (D17): su sección va primera */
  mercadoPrimero: string | null;
  /** acciones sobre ítems */
  toggle: (itemId: string) => void;
  editar: (itemId: string, texto: string) => void;
  /** dónde se compra (null = en cualquiera); el Db además lo aprende para el producto */
  ponerMercado: (itemId: string, mercadoId: string | null) => void;
  /** crea (o reusa) un súper y devuelve su id; null si no se pudo */
  crearMercado: (nombre: string) => Promise<string | null>;
  /** borra un súper (con toast + Deshacer, que lo revive con el mismo id) */
  borrarMercado: (mercadoId: string) => void;
  /** olvida un producto aprendido; el toast lo puede deshacer */
  borrarSugerencia: (textoNorm: string, texto: string) => void;
  /** crea una invitación de 7 días y devuelve el código (null si falló) */
  invitar: () => Promise<string | null>;
  /** saca el acceso de un teléfono Y anula lo que esa persona invitó. `quien` es `null` si esa llave todavía
   *  no dijo quién es: el aviso se nombra por lo que es, no con el rótulo que muestra la fila */
  expulsar: (uid: string, quien: string | null) => Promise<void>;
  revocarInvitacion: (codigo: string) => Promise<void>;
  /** este teléfono se va de la lista */
  salir: () => Promise<void>;
  /** las reglas nos rechazaron: no somos de esta lista */
  sinPermiso: boolean;
  borrar: (itemId: string) => void;
  /** misma semántica que Enter con ese texto: agregar / "Ya está" / "Volver a anotar" (chips) */
  agregarTexto: (texto: string) => void;
  /** vaciar comprados (cantidad por grupo visual) */
  vaciar: { confirmando: boolean; pedir: () => void; confirmar: () => void; cancelar: () => void; cantidad: number };
  /** conexión */
  conexion: EstadoConexion;
  pendientesSync: number;
  ultimaSync: number | null;
  /** toasts */
  toast: Toast | null;
  cerrarToast: () => void;
  pausarToast: () => void;
  reanudarToast: () => void;
  mostrarToast: (t: Omit<Toast, 'id'>) => void;
  /** id de la fila a la que hay que scrollear (después de "Ya está" o de agregar) */
  scrollA: string | null;
}

/** En qué grupo se VE un ítem: la espera manda; si no hay, su estado real. */
function grupoVisual(it: Item, e: Espera | undefined): 'pendiente' | 'comprado' {
  if (e === 'aComprado') return 'pendiente';
  if (e === 'aPendiente') return 'comprado';
  return it.estado === 'comprado' ? 'comprado' : 'pendiente';
}

export function useLista(db: Db, listId: string): EstadoLista {
  const [vista, setVista] = useState<Vista | null>(null);
  const [cargado, setCargado] = useState(false);
  const [yo, setYo] = useState<Yo>(() => leerYo(listId));
  const [quienSosPedido, setQuienSosPedido] = useState<boolean>(() => leerYo(listId).memberId === null && !fueDescartado(listId));
  const [consulta, setConsultaRaw] = useState('');
  const [espera, setEspera] = useState<Map<string, Espera>>(new Map());
  const [protagonista, setProtagonista] = useState<string | null>(null);
  const [resaltado, setResaltado] = useState<string | null>(null);
  const [scrollA, setScrollA] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  /** las reglas rechazaron la suscripción: no somos de esta lista (D22). No es un error para toast, es una pantalla. */
  const [sinPermiso, setSinPermiso] = useState(false);
  const { toast, mostrar, cerrar, pausar, reanudar } = useToasts();
  // "Reducir movimiento": sin Fase A; la fila cambia de grupo al instante
  const reducido = useReducedMotion() === true;

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const timerConfirm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerResalte = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerProta = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yaRepregunte = useRef(false);
  const dedupeHechos = useRef(new Set<string>());
  const vistaPrev = useRef<Vista | null>(null);
  const yoRef = useRef(yo); yoRef.current = yo;
  const reducidoRef = useRef(reducido); reducidoRef.current = reducido;

  /**
   * LA LLAVE (D22 · Etapa 1). Al abrir, este teléfono se asegura de tener acceso a la lista:
   *  - si ya lo tiene, no escribe nada (y a lo sumo le anota a quién decimos ser);
   *  - si viene con un código en el fragmento del link (#i=…), lo canjea;
   *  - durante la ventana de migración entra solo, y de paso deja registrado qué uid es qué persona — que es el
   *    dato que hoy no existe en ningún lado y que hace falta para repartir los accesos.
   * Va aparte de la suscripción y no la bloquea: mientras la ventana esté abierta leer no depende de esto, y
   * cuando se cierre, el que no entre va a ver el estado vacío de "no existe / sin permiso", no una pantalla muda.
   */
  useEffect(() => {
    let vivo = true;
    const codigo = codigoDeLaUrl();
    void db.entrar(listId, { codigo, memberId: leerYo(listId).memberId }).then(() => {
      if (vivo && codigo) limpiarCodigo();      // que no quede en la barra ni se re-comparta por accidente
    });
    return () => { vivo = false; };
  }, [db, listId]);

  // ---------- suscripción ----------
  useEffect(() => {
    setVista(null); setCargado(false);
    const off = db.suscribir(listId, v => {
      setVista(v);
      setCargado(true);
      if (v.lista) guardarUltimaLista(v.lista.id, v.lista.nombre);
    });
    return off;
  }, [db, listId]);

  // errores del Db → toast: "No se pudo guardar «texto»" si el ítem está a la vista; si no (o sin itemId: el ítem
  // nunca llegó a existir, p. ej. validación al agregar), el mensaje del tipo
  useEffect(() => db.onError(e => {
    // "no tenés permiso para LEER esta lista" no es un toast: es la pantalla entera. Un toast encima de una lista
    // vacía no le dice a nadie qué hacer; el estado vacío sí ("pedile a alguien de casa que te invite").
    if (e.tipo === 'permiso' && (e.operacion === 'suscribir' || e.operacion === 'entrar')) { setSinPermiso(true); return; }
    const it = e.itemId ? vistaPrev.current?.items.find(i => i.id === e.itemId) : undefined;
    const texto = it ? textos.toasts.noSePudo(it.texto) : textos.errores[e.tipo] ?? textos.errores.desconocido;
    mostrar({ texto });
  }), [db, mostrar]);

  // ---------- esperas (Fase A) ----------
  const ponerEspera = useCallback((id: string, tipo: Espera, ms: number) => {
    const t = timers.current.get(id); if (t) clearTimeout(t);
    setEspera(m => new Map(m).set(id, tipo));
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      setEspera(m => { const n = new Map(m); n.delete(id); return n; });
      // la fila que se mueve es la protagonista por un ratito (spring.settle)
      setProtagonista(id);
      if (timerProta.current) clearTimeout(timerProta.current);
      timerProta.current = setTimeout(() => setProtagonista(null), timing().PROTAGONISTA_MS);
    }, ms));
  }, []);
  /** como ponerEspera, pero con "Reducir movimiento" no hace nada (la fila cambia de grupo ya) */
  const esperar = useCallback((id: string, tipo: Espera, ms: number) => {
    if (reducidoRef.current) return;
    ponerEspera(id, tipo, ms);
  }, [ponerEspera]);
  const cancelarEspera = useCallback((id: string) => {
    const t = timers.current.get(id); if (t) { clearTimeout(t); timers.current.delete(id); }
    setEspera(m => { if (!m.has(id)) return m; const n = new Map(m); n.delete(id); return n; });
  }, []);
  useEffect(() => () => {
    for (const t of timers.current.values()) clearTimeout(t);
    if (timerProta.current) clearTimeout(timerProta.current);
    if (timerResalte.current) clearTimeout(timerResalte.current);
  }, []);

  // ---------- ticks remotos (Fase A también para lo que compra otro) + dedupe ----------
  useEffect(() => {
    if (!vista) return;
    const prev = vistaPrev.current;
    vistaPrev.current = vista;
    if (prev) {
      for (const it of vista.items) {
        const p = prev.items.find(x => x.id === it.id);
        if (p && p.estado === 'pendiente' && it.estado === 'comprado' && !it.pendiente && !timers.current.has(it.id) && it.compradoPor !== yoRef.current.memberId) {
          esperar(it.id, 'aComprado', timing().HOLD_MS);
        }
      }
    }
    // deduplicación determinista: solo entre confirmados
    const dups = duplicadosParaBorrar(vista.items);
    for (const d of dups) {
      if (dedupeHechos.current.has(d.perdedor.id)) continue;
      dedupeHechos.current.add(d.perdedor.id);
      db.borrarItem(listId, d.perdedor.id);
      // el que se queda hereda el súper del que se va, si él no tenía (D13: el dato no se tira)
      if (d.heredaMercado !== null) db.ponerMercado(listId, d.ganador.id, d.heredaMercado, yoRef.current);
      const quien = d.perdedor.agregadoPor === yoRef.current.memberId ? textos.meta.vos : (vista.miembros.find(m => m.id === d.perdedor.agregadoPor)?.nombre ?? d.perdedor.agregadoPorNombre ?? textos.meta.alguien);
      mostrar({ texto: textos.toasts.junte(quien, d.ganador.texto) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

  // ---------- identidad ----------
  const abrirQuienSos = useCallback(() => setQuienSosPedido(true), []);
  const cerrarQuienSos = useCallback(() => { setQuienSosPedido(false); if (!yoRef.current.memberId) marcarDescartado(listId); }, [listId]);
  const elegirYo = useCallback(async (opts: { memberId?: string; nombre?: string }) => {
    try {
      const m = await db.elegirMiembro(listId, opts);
      const nuevo: Yo = { memberId: m.id, nombre: m.nombre };
      // lo que tocaste antes de tener nombre pasa a ser tuyo (D20): si no, quedaba "alguien" para siempre
      const anonimos = leerAnonimos(listId);
      if (anonimos.length > 0) { db.reclamarAnonimos(listId, anonimos, nuevo); limpiarAnonimos(listId); }
      setYo(nuevo); guardarYo(listId, nuevo); limpiarDescartado(listId);
      // la llave también aprende a quién decimos ser: durante la migración (D22) ESTE es el único momento en que
      // se ata un uid a una persona, y es el dato que el servidor no tiene de ninguna otra forma
      void db.entrar(listId, { memberId: m.id });
      setQuienSosPedido(false);
      return m;
    } catch {
      // el Db rechaza (datos inválidos, lista inexistente o todavía no disponible): no cambiamos de identidad,
      // el sheet queda abierto (no tocamos quienSosPedido) y avisamos con un toast
      mostrar({ texto: textos.errores.desconocido });
      return null;
    }
  }, [db, listId, mostrar]);
  const renombrarme = useCallback((nombre: string) => {
    if (!yoRef.current.memberId) return;
    db.renombrarMiembro(listId, yoRef.current.memberId, nombre);
    const nuevo: Yo = { memberId: yoRef.current.memberId, nombre };
    setYo(nuevo); guardarYo(listId, nuevo);
  }, [db, listId]);
  /**
   * Después de la primera acción sin identidad, volvemos a preguntar una vez. Y anotamos qué tocamos mientras
   * éramos "alguien": si después decís tu nombre, esas firmas pasan a ser tuyas (D20).
   */
  const repreguntarSiHaceFalta = useCallback((itemId?: string) => {
    if (yoRef.current.memberId) return;
    if (itemId) anotarAnonimo(listId, itemId);
    if (yaRepregunte.current) return;
    yaRepregunte.current = true;
    setQuienSosPedido(true);
  }, [listId]);
  // el sheet solo se abre sobre una lista que ya bajó: sobre "no existe" no hay a quién elegir, y sobre una vista
  // provisional (`existe` optimista con `lista` null, sin miembros todavía) elegir crearía un duplicado de alguien que
  // está en el servidor pero no acá. Cuando el Db manda la lista, `quienSosPedido` sigue en pie y el sheet se abre solo.
  const quienSosAbierto = quienSosPedido && vista?.lista != null;

  // ---------- resalte / scroll ----------
  const resaltar = useCallback((id: string, opts?: { scroll?: boolean }) => {
    const scroll = opts?.scroll ?? true;
    setResaltado(id); setScrollA(scroll ? id : null);
    if (timerResalte.current) clearTimeout(timerResalte.current);
    timerResalte.current = setTimeout(() => { setResaltado(null); setScrollA(null); }, timing().HIGHLIGHT_MS);
  }, []);

  // ---------- input ----------
  const setConsulta = useCallback((v: string) => setConsultaRaw(v.length > textos.limites.textoMax ? v.slice(0, textos.limites.textoMax) : v), []);
  const items = vista?.items ?? [];
  const mercados = vista?.mercados ?? SIN_MERCADOS;
  const mercadosRef = useRef(mercados); mercadosRef.current = mercados;   // identidad estable para las acciones
  // el buscador también coincide por nombre de súper (D17): filtrar() lo resuelve y nos dice cuál matcheó
  const filtrado = useMemo(() => filtrar(items, consulta, mercados), [items, consulta, mercados]);
  const accion = useMemo(() => accionPara(consulta, items), [consulta, items]);

  /** Ejecuta una acción de Enter/chip. Es la única vía para agregar por texto (así un chip sobre un comprado destilda en vez de duplicar). */
  const ejecutar = useCallback((a: Accion) => {
    if (a.tipo === 'nada') return;
    if (a.tipo === 'agregar') {
      const id = db.agregarItem(listId, a.texto, yoRef.current);
      resaltar(id);
      repreguntarSiHaceFalta(id);
      return;
    }
    if (a.tipo === 'yaEsta') { resaltar(a.item.id); return; }
    // 'volver': destilda; sin auto-scroll (diseño: "Destildar: sin auto-scroll")
    db.marcarComprado(listId, a.item.id, false, yoRef.current);
    esperar(a.item.id, 'aPendiente', timing().UNHOLD_MS);
    mostrar({ texto: textos.toasts.volvi(a.item.texto) });
    resaltar(a.item.id, { scroll: false });
    repreguntarSiHaceFalta(a.item.id);
  }, [db, listId, resaltar, repreguntarSiHaceFalta, esperar, mostrar]);

  /** Un chip es un Enter con otro texto: agrega/vuelve y el input queda limpio (lo escrito era la búsqueda, no el ítem); "Ya está" no lo vacía. */
  const agregarTexto = useCallback((texto: string) => {
    const a = accionPara(texto, items);
    ejecutar(a);
    if (a.tipo !== 'nada' && a.tipo !== 'yaEsta') setConsultaRaw('');
  }, [ejecutar, items]);

  const enviar = useCallback(() => {
    if (accion.tipo === 'nada') return;
    ejecutar(accion);
    if (accion.tipo !== 'yaEsta') setConsultaRaw('');   // "Ya está" no vacía el input
  }, [accion, ejecutar]);

  // ---------- acciones sobre ítems ----------
  const toggleImpl = useCallback((itemId: string) => {
    const it = items.find(i => i.id === itemId); if (!it) return;
    const enEspera = espera.get(itemId);
    if (enEspera === 'aComprado') {
      // destocar antes de que baje: revertimos en el lugar
      cancelarEspera(itemId);
      db.marcarComprado(listId, itemId, false, yoRef.current);
      return;
    }
    if (enEspera === 'aPendiente') {
      cancelarEspera(itemId);
      db.marcarComprado(listId, itemId, true, yoRef.current);
      return;
    }
    if (it.estado === 'pendiente') {
      db.marcarComprado(listId, itemId, true, yoRef.current);   // la escritura sale YA
      esperar(itemId, 'aComprado', timing().HOLD_MS);           // la fila espera antes de bajar
    } else {
      db.marcarComprado(listId, itemId, false, yoRef.current);
      esperar(itemId, 'aPendiente', timing().UNHOLD_MS);
    }
    repreguntarSiHaceFalta(itemId);
  }, [items, espera, cancelarEspera, db, listId, esperar, repreguntarSiHaceFalta]);
  // identidad estable (React.memo(Fila)): la función que reciben las filas no cambia; adentro llama a la versión vigente
  const toggleRef = useRef(toggleImpl); toggleRef.current = toggleImpl;
  const toggle = useCallback((itemId: string) => toggleRef.current(itemId), []);

  const editar = useCallback((itemId: string, texto: string) => {
    const t = texto.trim(); if (!t) return;
    db.editarItem(listId, itemId, t, yoRef.current);
  }, [db, listId]);

  const ponerMercado = useCallback((itemId: string, mercadoId: string | null) => {
    db.ponerMercado(listId, itemId, mercadoId, yoRef.current);
  }, [db, listId]);

  const borrarMercado = useCallback((mercadoId: string) => {
    const m = mercadosRef.current.find(x => x.id === mercadoId); if (!m) return;
    const { deshacer } = db.borrarMercado(listId, mercadoId);
    mostrar({ texto: textos.toasts.borradoMercado(m.nombre), accion: { etiqueta: textos.toasts.deshacer, onClick: () => { deshacer(); cerrar(); } } });
  }, [db, listId, mostrar, cerrar]);

  const borrarSugerencia = useCallback((textoNorm: string, texto: string) => {
    const { deshacer } = db.borrarSugerencia(listId, textoNorm);
    mostrar({ texto: textos.toasts.olvidadaSugerencia(texto), accion: { etiqueta: textos.toasts.deshacer, onClick: () => { deshacer(); cerrar(); } } });
  }, [db, listId, mostrar, cerrar]);

  // ---------- quién entra (D22) ----------
  const invitar = useCallback(async (): Promise<string | null> => {
    try {
      return await db.invitar(listId);
    } catch {
      mostrar({ texto: textos.toasts.noSePudoInvitar });
      return null;
    }
  }, [db, listId, mostrar]);

  const expulsar = useCallback(async (uid: string, quien: string | null) => {
    try {
      await db.expulsar(listId, uid);
      mostrar({ texto: textos.toasts.expulsado(quien) });
    } catch {
      mostrar({ texto: textos.errores.desconocido });
    }
  }, [db, listId, mostrar]);

  const revocarInvitacion = useCallback(async (codigo: string) => {
    try {
      await db.revocarInvitacion(listId, codigo);
      mostrar({ texto: textos.toasts.invitacionRevocada });
    } catch {
      mostrar({ texto: textos.errores.desconocido });
    }
  }, [db, listId, mostrar]);

  const salir = useCallback(async () => {
    try {
      await db.salir(listId);
      mostrar({ texto: textos.toasts.saliste });
    } catch {
      mostrar({ texto: textos.errores.desconocido });
    }
  }, [db, listId, mostrar]);

  const crearMercado = useCallback(async (nombre: string) => {
    try {
      const m = await db.crearMercado(listId, nombre);
      return m.id;
    } catch {
      mostrar({ texto: textos.errores.desconocido });
      return null;
    }
  }, [db, listId, mostrar]);

  const borrar = useCallback((itemId: string) => {
    const it = items.find(i => i.id === itemId); if (!it) return;
    const previo: 'pendiente' | 'comprado' = it.estado === 'comprado' ? 'comprado' : 'pendiente';
    cancelarEspera(itemId);
    db.borrarItem(listId, itemId);
    mostrar({ texto: textos.toasts.borrado(it.texto), accion: { etiqueta: textos.toasts.deshacer, onClick: () => { db.restaurarItem(listId, itemId, previo, yoRef.current); cerrar(); } } });
  }, [items, cancelarEspera, db, listId, mostrar, cerrar]);

  // ---------- contadores por grupo visual ----------
  const { faltan, cantidadComprados } = useMemo(() => {
    let f = 0, c = 0;
    for (const it of items) { if (grupoVisual(it, espera.get(it.id)) === 'pendiente') f++; else c++; }
    return { faltan: f, cantidadComprados: c };
  }, [items, espera]);

  // ---------- vaciar ----------
  const cancelarConfirm = useCallback(() => { setConfirmando(false); if (timerConfirm.current) { clearTimeout(timerConfirm.current); timerConfirm.current = null; } }, []);
  const pedirVaciar = useCallback(() => {
    if (cantidadComprados === 0) return;
    setConfirmando(true);
    if (timerConfirm.current) clearTimeout(timerConfirm.current);
    timerConfirm.current = setTimeout(() => setConfirmando(false), timing().CONFIRM_MS);
  }, [cantidadComprados]);
  const confirmarVaciar = useCallback(() => {
    cancelarConfirm();
    // Lo que está esperando para bajar ('aComprado') el usuario todavía lo ve ARRIBA: no se vacía.
    // db.vaciarComprados no acepta exclusiones, así que antes lo devolvemos a pendiente real (que es lo que se ve)
    // y cancelamos su espera; recién después vaciamos.
    for (const [id, tipo] of espera) {
      if (tipo !== 'aComprado') continue;
      cancelarEspera(id);
      db.marcarComprado(listId, id, false, yoRef.current);
    }
    const { ids, deshacer } = db.vaciarComprados(listId);
    for (const id of ids) cancelarEspera(id);
    if (ids.length === 0) return;
    mostrar({ texto: textos.toasts.vaciado(ids.length), accion: { etiqueta: textos.toasts.deshacer, onClick: () => { deshacer(); cerrar(); } }, duracion: timing().TOAST_VACIADO_MS });
  }, [cancelarConfirm, espera, db, listId, cancelarEspera, mostrar, cerrar]);
  useEffect(() => () => { if (timerConfirm.current) clearTimeout(timerConfirm.current); }, []);

  // ---------- filas derivadas ----------
  // Identidad estable: si nada de la fila cambió, se devuelve el MISMO objeto FilaVM que el render anterior, así
  // React.memo(Fila) no re-renderiza (ni Motion re-mide) las filas que no tienen nada nuevo cuando cambia otra cosa
  // (protagonista, resaltado, una espera ajena, el reloj).
  const vmCache = useRef(new Map<string, FilaVM>());
  const { pendientes, comprados } = useMemo(() => {
    const cache = new Map<string, FilaVM>();   // solo los ids de esta pasada: los borrados no quedan colgados
    const vm = (it: Item, grupo: 'pendiente' | 'comprado', tachado: boolean, enEspera: boolean): FilaVM => {
      const nuevo: FilaVM = { item: it, grupo, tachado, enEspera, protagonista: protagonista === it.id, resaltada: resaltado === it.id };
      const previo = vmCache.current.get(it.id);
      const igual = previo && previo.item === it && previo.grupo === grupo && previo.tachado === tachado && previo.enEspera === enEspera
        && previo.protagonista === nuevo.protagonista && previo.resaltada === nuevo.resaltada;
      const out = igual ? previo : nuevo;
      cache.set(it.id, out);
      return out;
    };
    const pend: FilaVM[] = [];
    const comp: FilaVM[] = [];
    // el filtrado ya decide qué se ve; acá la espera manda sobre el grupo (aunque el snapshot diga otra cosa)
    const repartir = (it: Item, grupoReal: 'pendiente' | 'comprado') => {
      const e = espera.get(it.id);
      if (e === 'aComprado') pend.push(vm(it, 'pendiente', true, true));          // sigue arriba, tachada
      else if (e === 'aPendiente') comp.push(vm(it, 'comprado', false, true));    // sigue abajo, destachada
      else if (grupoReal === 'pendiente') pend.push(vm(it, 'pendiente', false, false));
      else comp.push(vm(it, 'comprado', true, false));
    };
    for (const it of filtrado.pendientes) repartir(it, 'pendiente');
    for (const it of filtrado.comprados) repartir(it, 'comprado');
    // los que cambiaron de grupo visual conservan la key; reordenamos con los mismos criterios del dominio
    pend.sort((a, b) => cmpPend(a.item, b.item));
    comp.sort((a, b) => cmpComp(a.item, b.item));
    vmCache.current = cache;
    return { pendientes: pend, comprados: comp };
  }, [filtrado, espera, protagonista, resaltado]);

  const vacio = useMemo(
    () => (sinPermiso ? 'sinAcceso' : vista ? estadoVacio(vista, filtrado, cargado, sinPermiso) : 'ninguno'),
    [vista, filtrado, cargado, sinPermiso],
  );
  const conexion = useMemo<EstadoConexion>(() => vista ? estadoConexion(vista) : 'sync', [vista]);

  return {
    listId, vista, cargado,
    yo, quienSosAbierto, abrirQuienSos, cerrarQuienSos, elegirYo, renombrarme,
    consulta, setConsulta, filtrado, accion, enviar,
    pendientes, comprados, ocultos: filtrado.ocultos, vacio, faltan,
    mercados, mercadoPrimero: filtrado.mercados[0]?.id ?? null,
    toggle, editar, ponerMercado, crearMercado, borrarMercado, borrarSugerencia, borrar, agregarTexto,
    invitar, expulsar, revocarInvitacion, salir, sinPermiso,
    vaciar: { confirmando, pedir: pedirVaciar, confirmar: confirmarVaciar, cancelar: cancelarConfirm, cantidad: cantidadComprados },
    conexion, pendientesSync: pendientesDeSync(items), ultimaSync: vista?.ultimaSync ?? null,
    toast, cerrarToast: () => cerrar(), pausarToast: pausar, reanudarToast: reanudar, mostrarToast: mostrar,
    scrollA,
  };
}

/** mismos criterios que ordenarPendientes / ordenarComprados (para reordenar tras mezclar esperas) */
function cmpPend(a: Item, b: Item): number {
  const x = a.agregadoEn, y = b.agregadoEn;
  if (x !== y) { if (x === null) return 1; if (y === null) return -1; return x - y; }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function cmpComp(a: Item, b: Item): number {
  const x = a.compradoEn, y = b.compradoEn;
  if (x !== y) { if (x === null) return -1; if (y === null) return 1; return y - x; }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export { YO_ANONIMO };
