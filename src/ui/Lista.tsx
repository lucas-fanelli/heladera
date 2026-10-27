/**
 * La lista: UNA sola <ul> (position: relative) con AnimatePresence popLayout y keys estables.
 * Orden: pendientes → "(N pendientes ocultos por el filtro)" → cabecera "Ya lo compraron" (solo con filtro) → comprados.
 * El contenedor que scrollea es este (motion.div layoutScroll): el contador de arriba queda quieto como ancla.
 * Estados vacíos y chips de sugerencias viven adentro del área scrolleable, sin mover la barra de abajo.
 * La AnimatePresence recibe custom={{ motivo, cantidad, enBolsillo }}: 'vaciar' cuando los comprados visibles cayeron
 * a 0 y no fueron al bolsillo (las filas salen con stagger por índice); 'normal' el resto. cantidad = filas visibles
 * (cap de salidas con transform). enBolsillo(id): el ítem quedó comprado y oculto → la fila vuela al rótulo.
 * Bolsillo (ui/bolsillo.ts): comprados no pintados. Una fila que aparece y estaba en el bolsillo en el render anterior
 * entra desde el rótulo (abrir Comprados: la más lejana primero; deshacer/destildar remoto). Con filtro, sin vuelos.
 * Colchón (ui/colchon.ts): cuando se van filas, un div al final sostiene el alto que pierden (medido en el DOM previo,
 * durante el render, antes de que nada fuerce un layout con la lista ya achicada) y, cuando terminaron de salir
 * (onExitComplete), se achica en dur.settle: si estabas al fondo, la lista baja despacio en vez de saltar.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useReducedMotion, type AnimationPlaybackControls } from 'motion/react';
import type { ListaProps } from '@/ui/contratos';
import type { Item } from '@/db/types';
import type { FilaVM } from '@/app/useLista';
import { textos } from '@/ui/textos';
import { agruparPorMercado, hayQueAgrupar, KEY_SIN_MERCADO, type Seccion } from '@/domain/mercados';
import { GLOBITO, ladoDelGlobito } from './arrastre';
import { useArrastre } from './useArrastre';
import { CAP_SIMULTANEO } from '@/domain/timing';
import { dur, ease, ENTER_DELAY, spring } from '@/motion/tokens';
import { idsEnBolsillo } from './bolsillo';
import { alturaQueSeVa, hayEntradas } from './colchon';
import { noRobarFoco } from './foco';
import { Fila, type SalidaFilas } from './Fila';
import { EmptyState } from './EmptyState';
import { Chip } from './Chip';
import s from './Lista.module.css';

const KEY_OCULTOS = '__ocultos';
const KEY_CABECERA = '__ya-lo-compraron';

export function Lista(p: ListaProps) {
  const {
    pendientes, comprados, compradosAbierto, filtroActivo, consulta, ocultos, vacio, yo, miembros, ahora,
    mercados = [], mercadoPrimero = null,
    sugerencias, mostrarSugerencias, scrollA, bolsillo, vuelos = false, onToggle, onEditar, onSugerencia, onBorrarSugerencia, onVolverAAnotar, onReintentar, onMoverAMercado,
  } = p;
  const scroll = useRef<HTMLDivElement>(null);
  const reducido = useReducedMotion();
  const destino = useMemo(() => () => bolsillo?.current ?? null, [bolsillo]);

  // ---------- arrastrar una fila a otra sección (D18): la pulsación larga la levanta, se suelta sobre un súper ----------
  const { arrastrando, empezar } = useArrastre({ scroll, onSoltar: onMoverAMercado ?? (() => {}) });
  // sin súper creados no hay a dónde moverla: mantener apretado no hace nada
  const puedeArrastrar = !!onMoverAMercado && mercados.length > 0;
  const empezarArrastre = useCallback((item: Item, e: PointerEvent) => { empezar(item, e); }, [empezar]);
  /** la sección que va a recibir la fila (para marcar su título); undefined = el dedo está afuera de la lista */
  const destinoActual = arrastrando && arrastrando.destino !== undefined ? arrastrando.destino ?? KEY_SIN_MERCADO : undefined;
  const nombreDestino = !arrastrando || arrastrando.destino === undefined
    ? null
    : arrastrando.destino === null ? textos.lista.enCualquiera : mercados.find(m => m.id === arrastrando.destino)?.nombre ?? null;

  // scroll suave a la fila nueva / "Ya está", recién cuando terminó de entrar
  useEffect(() => {
    if (!scrollA) return;
    const ms = (ENTER_DELAY() + dur.fast) * 1000;
    const t = setTimeout(() => {
      const filas = scroll.current?.querySelectorAll<HTMLElement>('li[data-id]') ?? [];
      for (const el of filas) {
        if (el.dataset.id === scrollA) { el.scrollIntoView({ block: 'nearest', behavior: reducido ? 'auto' : 'smooth' }); break; }
      }
    }, ms);
    return () => clearTimeout(t);
  }, [scrollA, reducido]);

  // los chips viven abajo (cerca del input): cuando aparecen, que se vean sin tener que scrollear
  const chipsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mostrarSugerencias) return;
    const t = setTimeout(() => chipsRef.current?.scrollIntoView({ block: 'nearest', behavior: reducido ? 'auto' : 'smooth' }), dur.fast * 1000);
    return () => clearTimeout(t);
  }, [mostrarSugerencias, reducido]);

  const mostrarComprados = compradosAbierto && comprados.length > 0;
  const compradosVisibles = mostrarComprados ? comprados.length : 0;

  // bolsillo: qué comprados no se ven ahora y cuáles no se veían en el render anterior (`vuelos` lo decide PantallaLista)
  const enBolsilloAhora = useMemo(() => idsEnBolsillo(comprados, mostrarComprados), [comprados, mostrarComprados]);
  const enBolsilloAntes = useRef(enBolsilloAhora);
  useEffect(() => { enBolsilloAntes.current = enBolsilloAhora; }, [enBolsilloAhora]);
  // motivo de salida: si había comprados en pantalla y ahora no queda ninguno, es un "vaciar" (stagger); las filas
  // cuyo ítem quedó en el bolsillo (cerrar Comprados) no se vacían: vuelan (enBolsillo tiene prioridad en la Fila)
  const compradosPrevios = useRef(compradosVisibles);
  const motivo: SalidaFilas['motivo'] = compradosPrevios.current > 0 && compradosVisibles === 0 ? 'vaciar' : 'normal';
  // filas en juego para el cap de transforms: las que se ven Y las que están saliendo (al cerrar, las que salen ya no
  // están en `comprados` visibles); así abrir y cerrar con las mismas 45 filas se capean igual
  const cantidad = pendientes.length + Math.max(compradosVisibles, compradosPrevios.current);
  // con más de CAP_SIMULTANEO filas en pantalla no hay transforms (misma regla que la salida): entra como cualquiera
  const entradaDe = (id: string): 'bolsillo' | undefined =>
    vuelos && cantidad <= CAP_SIMULTANEO && enBolsilloAntes.current.has(id) ? 'bolsillo' : undefined;
  const salida = useMemo<SalidaFilas>(() => ({
    motivo, cantidad,
    enBolsillo: vuelos ? (id: string) => enBolsilloAhora.has(id) : () => false,
  }), [motivo, cantidad, vuelos, enBolsilloAhora]);
  useEffect(() => { compradosPrevios.current = compradosVisibles; }, [compradosVisibles]);

  // ---------- colchón: sostener el alto de las filas que se van, soltarlo despacio cuando terminaron de salir ----------
  const ul = useRef<HTMLUListElement>(null);
  const colchonEl = useRef<HTMLDivElement>(null);
  const colchonAnim = useRef<AnimationPlaybackControls | null>(null);
  const [colchon, setColchon] = useState(0);
  // ---------- secciones por súper (D16): NO son listas anidadas; un encabezado es un renglón más de esta misma lista,
  // así Motion sigue viendo un solo contexto de layout (mover un ítem de súper es una reubicación animada, y el título
  // se va con su último ítem). Sin súper creados hay una sola sección y no se pinta ningún título: la lista de siempre.
  const renglonesPend = useMemo(
    () => renglonesDe(agruparPorMercado(pendientes, f => f.item.mercado, mercados, mercadoPrimero), 'p'),
    [pendientes, mercados, mercadoPrimero],
  );
  const renglonesComp = useMemo(
    () => renglonesDe(agruparPorMercado(comprados, f => f.item.mercado, mercados, mercadoPrimero), 'c'),
    [comprados, mercados, mercadoPrimero],
  );

  // los <li> que este render va a pintar, en el mismo orden y con el mismo criterio que el JSX de abajo
  // (los encabezados también: el colchón tiene que sostener su alto cuando se va una sección entera)
  const idsAhora = useMemo(() => [
    ...renglonesPend.map(r => r.key),
    ...(filtroActivo && ocultos > 0 ? [KEY_OCULTOS] : []),
    ...(mostrarComprados && filtroActivo ? [KEY_CABECERA] : []),
    ...(mostrarComprados ? renglonesComp.map(r => r.key) : []),
  ], [renglonesPend, filtroActivo, ocultos, mostrarComprados, renglonesComp]);
  const firma = idsAhora.join('\n');
  // estado derivado (patrón "info del render anterior"): se recalcula en el mismo render, antes del commit
  const [pintado, setPintado] = useState({ firma, ids: idsAhora });
  const colchonRef = useRef(0);
  colchonRef.current = colchon;
  const soltarColchon = useCallback(() => {
    const el = colchonEl.current;
    if (!el || (colchonRef.current === 0 && !colchonAnim.current)) return;
    colchonAnim.current?.stop();
    if (reducido) { colchonAnim.current = null; setColchon(0); return; }
    // desde lo que mide AHORA, explícito: animate() cachea un MotionValue por elemento y, si la última vez terminó en 0,
    // "ya está en 0" y no animaría (el alto lo escribió React, no Motion)
    colchonAnim.current = animate(el, { height: [el.offsetHeight, 0] }, { duration: dur.settle, ease: ease.std, onComplete: () => { colchonAnim.current = null; setColchon(0); } });
  }, [reducido]);
  const soltarPendiente = useRef(false);
  if (pintado.firma !== firma) {
    const antes = new Set(pintado.ids);
    const ahora = new Set(idsAhora);
    let alto = 0;
    if (!reducido && pintado.ids.some(id => !ahora.has(id))) {
      // medimos en el DOM PREVIO (este commit todavía no ocurrió: las filas que se van siguen en flujo, nada se achicó)
      const medidas = new Map<string, number>();
      for (const li of ul.current?.querySelectorAll<HTMLElement>('li[data-id]') ?? []) if (li.dataset.id) medidas.set(li.dataset.id, li.offsetHeight);
      alto = alturaQueSeVa(pintado.ids, ahora, id => medidas.get(id) ?? 0);
      // solo si el scroll saltaría: hay más contenido que pantalla Y estamos tan abajo que el nuevo máximo queda por
      // encima de donde estamos. Si no (lista corta, arriba de todo, filtrando desde el principio), el colchón sería
      // puro costo: layout por frame durante dur.settle sin nada que ver.
      const sc = scroll.current;
      const saltaria = !!sc && sc.scrollHeight > sc.clientHeight && sc.scrollTop + sc.clientHeight > sc.scrollHeight - alto;
      if (sc && !saltaria) alto = 0;
    }
    setPintado({ firma, ids: idsAhora });
    if (alto > 0) {
      // si el colchón se estaba soltando, seguimos desde lo que mide ahora (DOM previo) más lo nuevo
      setColchon((colchonAnim.current ? (colchonEl.current?.offsetHeight ?? 0) : colchon) + alto);
    } else if (hayEntradas(antes, idsAhora) && colchon > 0) {
      soltarPendiente.current = true;   // entra algo: el hueco se llena solo, el colchón sobra (se suelta tras el commit)
    }
  }
  // un colchón nuevo (o agrandado) pisa la animación de soltar que estuviera corriendo: React ya escribió el alto
  useLayoutEffect(() => { if (colchon > 0) { colchonAnim.current?.stop(); colchonAnim.current = null; } }, [colchon]);
  useEffect(() => { if (soltarPendiente.current) { soltarPendiente.current = false; soltarColchon(); } });
  useEffect(() => () => colchonAnim.current?.stop(), []);

  const tituloSugerencias = filtroActivo ? textos.lista.otrasVeces : textos.lista.loDeSiempre;

  return (
    <motion.div ref={scroll} className={s.scroll} layoutScroll>
      <ul ref={ul} className={s.lista}>
        <AnimatePresence initial={false} mode="popLayout" custom={salida} onExitComplete={soltarColchon}>
          {renglonesPend.map(r => r.tipo === 'encabezado' ? (
            <EncabezadoSeccion key={r.key} id={r.key} seccion={r.seccion} nombre={r.nombre} cantidad={r.cantidad} firma={firma} destino={destinoActual === r.seccion} />
          ) : (
            <Fila
              key={r.key} fila={r.fila} indice={r.indice} consulta={consulta} yo={yo} miembros={miembros} ahora={ahora}
              entrada={entradaDe(r.key)} destino={destino} layoutDependency={firma}
              seccion={r.seccion} onArrastrar={puedeArrastrar ? empezarArrastre : undefined} arrastrando={arrastrando?.itemId === r.key}
              onToggle={onToggle} onEditar={onEditar}
            />
          ))}
          {filtroActivo && ocultos > 0 ? (
            <motion.li key={KEY_OCULTOS} data-id={KEY_OCULTOS} className={s.nota} layout="position" layoutDependency={firma} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ layout: spring.move, opacity: { duration: dur.fast } }}>
              {textos.lista.ocultosPorFiltro(ocultos)}
            </motion.li>
          ) : null}
          {mostrarComprados && filtroActivo ? (
            <motion.li key={KEY_CABECERA} data-id={KEY_CABECERA} className={s.cabecera} layout="position" layoutDependency={firma} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ layout: spring.move, opacity: { duration: dur.fast } }}>
              <h2 className={s.rotulo}>{textos.lista.yaLoCompraron}</h2>
            </motion.li>
          ) : null}
          {mostrarComprados
            ? renglonesComp.map(r => r.tipo === 'encabezado' ? (
              <EncabezadoSeccion key={r.key} id={r.key} seccion={r.seccion} nombre={r.nombre} cantidad={r.cantidad} firma={firma} destino={destinoActual === r.seccion} />
            ) : (
              <Fila
                key={r.key} fila={r.fila} indice={r.indice} consulta={consulta} yo={yo} miembros={miembros} ahora={ahora}
                /* al abrir, la más lejana al rótulo (arriba) sale primero; al cerrar, la más cercana (abajo) entra primero: sin cruces */
                entrada={entradaDe(r.key)} ordenEntrada={r.indice} ordenSalida={comprados.length - 1 - r.indice} destino={destino} layoutDependency={firma}
                seccion={r.seccion}
                onToggle={onToggle} onEditar={onEditar}
                onVolverAAnotar={filtroActivo ? onVolverAAnotar : undefined}
              />
            ))
            : null}
        </AnimatePresence>
      </ul>
      {/* colchón: sostiene el alto de las filas que están saliendo y se achica despacio cuando terminaron */}
      <div ref={colchonEl} className={s.colchon} style={{ height: colchon }} aria-hidden="true" data-testid="colchon" />

      {vacio !== 'ninguno' ? <EmptyState tipo={vacio} onReintentar={onReintentar} /> : null}

      <AnimatePresence initial={false}>
        {mostrarSugerencias ? (
          <motion.section
            key="sugerencias"
            ref={chipsRef}
            className={s.sugerencias}
            aria-label={tituloSugerencias}
            onPointerDown={noRobarFoco}   /* un toque errado entre chips tampoco cierra el teclado (el foco iría al <main>) */
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.fast }}
          >
            <h2 className={s.rotulo}>{tituloSugerencias}</h2>
            <ul className={s.chips}>
              <AnimatePresence initial={false}>
                {sugerencias.map(sug => (
                  <motion.li key={sug.textoNorm} className={s.chipItem} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.fast }}>
                    <Chip
                      onClick={() => onSugerencia(sug.texto)}
                      onMantener={() => onBorrarSugerencia(sug)}
                      ariaLabel={textos.input.agregarX(sug.texto)}
                      icono={<PlusIcon />}
                    >
                      {sug.texto}
                    </Chip>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {/* la sombra de la fila levantada: fuera del flujo (portal + fixed) para que siga al dedo sin pelear con el
          layout de la lista ni moverse cuando el auto-scroll corre el contenido */}
      {arrastrando && typeof document !== 'undefined'
        ? createPortal(
          <div
            className={s.sombra}
            data-lado={ladoDelGlobito(arrastrando.y)}
            /* el despegue del dedo vive acá (no en el CSS): así el lado y la distancia salen del mismo número */
            style={{ translate: `${arrastrando.x}px ${arrastrando.y + (ladoDelGlobito(arrastrando.y) === 'arriba' ? -GLOBITO.elevacion : GLOBITO.elevacion)}px` }}
            aria-hidden="true"
            data-testid="sombra-arrastre"
          >
            <span className={s.sombraTexto}>{arrastrando.texto}</span>
            {nombreDestino ? <span className={s.sombraDestino}>{nombreDestino}</span> : null}
          </div>,
          document.body,
        )
        : null}
    </motion.div>
  );
}

/** Un renglón de la lista: el título de un súper o una fila. Los dos viven en la misma <ul> (ver arriba). */
type Renglon =
  | { tipo: 'encabezado'; key: string; seccion: string; nombre: string; cantidad: number }
  | { tipo: 'fila'; key: string; seccion: string; fila: FilaVM; indice: number };

/**
 * Aplana las secciones a renglones. El título se pinta solo si hay más de un grupo (si todo lo que falta es del
 * mismo lado, un título no informa nada) y NUNCA sobre el grupo sin súper cuando va primero: eso es "la lista",
 * no una sección de descartes. Si se está buscando un súper, ese grupo va arriba y entonces el de "en cualquiera"
 * sí lleva título, porque ya no se lee solo (D16/D17).
 */
function renglonesDe(secciones: Array<Seccion<FilaVM>>, grupo: 'p' | 'c'): Renglon[] {
  const conTitulos = hayQueAgrupar(secciones);
  const out: Renglon[] = [];
  let i = 0;
  secciones.forEach((sec, idx) => {
    if (conTitulos && (sec.mercado !== null || idx > 0)) {
      // la key lleva el grupo: pendientes y comprados pueden tener el MISMO súper, y las dos listas viven en la misma
      // <ul> y en la misma AnimatePresence. Sin esto son dos hijos con la misma key: React se confunde y deja
      // encabezados huérfanos que no se van más (se veía tachando y destachando un rato).
      out.push({ tipo: 'encabezado', key: `enc-${grupo}-${sec.key}`, seccion: sec.key, nombre: sec.mercado?.nombre ?? textos.lista.enCualquiera, cantidad: sec.filas.length });
    }
    for (const fila of sec.filas) out.push({ tipo: 'fila', key: fila.item.id, seccion: sec.key, fila, indice: i++ });
  });
  return out;
}

function EncabezadoSeccion({ id, seccion, nombre, cantidad, firma, destino }: { id: string; seccion: string; nombre: string; cantidad: number; firma: string; destino?: boolean }) {
  return (
    <motion.li
      data-id={id}
      data-seccion={seccion}
      data-destino={destino ? 'true' : undefined}
      className={s.seccion}
      layout="position"
      layoutDependency={firma}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ layout: spring.move, opacity: { duration: dur.fast } }}
    >
      <h2 className={s.tituloSeccion}>{nombre}</h2>
      {/* la regla que cruza: el vacío del medio deja de ser vacío y pasa a decir "acá empieza otra cosa" */}
      <span className={s.regla} aria-hidden="true" />
      <span className={s.cuenta} aria-hidden="true">{cantidad}</span>
    </motion.li>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
