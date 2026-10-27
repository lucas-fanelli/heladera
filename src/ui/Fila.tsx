/**
 * Una fila de la lista: [casilla | texto + meta | cola]. La fila entera tilda (checkbox real dentro de un <label>).
 *  - Feedback en el lugar (≤ 80 ms): tint + scale del FONDO al presionar (::before), casilla que se llena, tachado que se dibuja.
 *  - Los 700/250 ms de espera NO viven acá (useLista): la fila solo pinta `tachado` / `enEspera`.
 *  - Long-press (≥ LONG_PRESS_MS) LEVANTA la fila para moverla de súper (D18; Editar vive en el chevron, que se ve);
 *    mover el dedo > MOVE_CANCEL_PX cancela tap y long-press, así el scroll sigue intacto.
 *  - Motion: motion.li layout="position" con key estable (la pone la Lista); entra con opacity + y; sale con la variante
 *    'salir', que lee el `custom` de la AnimatePresence ({ motivo, cantidad, enBolsillo }): al vaciar, stagger por
 *    índice; con más de CAP_SIMULTANEO filas, salida solo con opacity.
 *  - Bolsillo (ver ui/bolsillo.ts): si el ítem quedó comprado y oculto, la fila no se funde: se despega y vuela hasta el
 *    rótulo "Comprados (N)" (x/y/scale medidos en el momento, opacity recién al final). Al revés, una fila que llega
 *    desde el bolsillo (abrir Comprados, deshacer) arranca en el rótulo (se mide en useLayoutEffect, antes del primer
 *    pintado) y se acomoda con spring. Con reduced motion no hay vuelo: queda el fundido.
 *  - Foco: si la fila que tiene el foco se desmonta (tildar con Comprados cerrado, vaciar, borrar), el foco pasa a la
 *    casilla de la vecina (siguiente, si no anterior) o al <main>. Nunca al input (abriría el teclado).
 *  - Rendimiento (teléfono): React.memo + FilaVM con identidad estable (useLista) → un re-render de la pantalla no
 *    re-renderiza las filas que no cambiaron; `layoutDependency` (la firma de la lista, se la pasa la Lista) → Motion
 *    solo mide/re-proyecta cuando cambia QUÉ filas hay y en qué orden, no en cada render (si no, un setState en pleno
 *    vuelo resetea transforms y re-mide todas); `useWillChange` → capa de compositor solo mientras animan transforms.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type Ref } from 'react';
import { motion, useIsPresent, useMotionValue, usePresenceData, useReducedMotion, useWillChange, type Transition, type Variants } from 'motion/react';
import type { FilaProps } from '@/ui/contratos';
import type { Item } from '@/db/types';
import { fechaYHora, haceCuanto, nombreDe, segmentosResaltados, ultimaMano } from '@/domain';
import { CAP_SIMULTANEO, HAPTIC_MS, LONG_PRESS_MS, MOVE_CANCEL_PX } from '@/domain/timing';
import { textos } from '@/ui/textos';
import { dist, dur, ease, ENTER_DELAY, opacity, rowTransition, scl, spring, staggerExit, vuelo } from '@/motion/tokens';
import { vueloEntre } from '@/motion/vuelo';
import { modoSalida } from './bolsillo';
import { noRobarFoco, reubicarFoco } from './foco';
import s from './Fila.module.css';

/** Lo que la Lista pasa como `custom` a la AnimatePresence: por qué salen filas, cuántas hay en pantalla y cuáles van al bolsillo. */
export interface SalidaFilas {
  motivo: 'normal' | 'vaciar';
  cantidad: number;
  /** el ítem quedó comprado y oculto (Comprados cerrado, sin filtro): la fila vuela al rótulo en vez de fundirse */
  enBolsillo: (itemId: string) => boolean;
}

const SALIDA_DEFAULT: SalidaFilas = { motivo: 'normal', cantidad: 0, enBolsillo: () => false };

/** Selector del contenedor que recibe el foco cuando no queda ninguna fila vecina (PantallaLista le pone tabIndex=-1). */
const SELECTOR_MAIN = 'main';
/** El control de la fila vecina que se enfoca: la casilla, nunca el input de abajo (abriría el teclado). */
const SELECTOR_CASILLA = 'input[type="checkbox"]';

export interface FilaExtraProps {
  /** posición dentro de su grupo (para el stagger de salida al vaciar) */
  indice?: number;
  /** la fila aparece saliendo del bolsillo (abrir Comprados, deshacer): arranca sobre el rótulo y se acomoda */
  entrada?: 'bolsillo';
  /** orden en el stagger de entrada desde el bolsillo (0 = primera; la más lejana al rótulo va primero) */
  ordenEntrada?: number;
  /** orden en el stagger de salida al bolsillo (0 = primera; la más cercana al rótulo va primera) */
  ordenSalida?: number;
  /** el rótulo "Comprados (N)" (se lee en el momento del vuelo; nunca se guarda su posición) */
  destino?: () => Element | null;
  /** cuándo Motion debe volver a medir el layout de la fila: cambia cuando cambia la lista (qué filas hay, en qué orden) */
  layoutDependency?: unknown;
  /** en qué sección se está pintando (id del súper o 'sin-mercado'): el arrastre lee esto del DOM para saber dónde soltás */
  seccion?: string;
  /** la pulsación larga la levanta para moverla de súper. Sin esto, mantener apretado no hace nada. */
  onArrastrar?: (item: Item, e: PointerEvent) => void;
  /** esta fila es la que se está arrastrando (queda como hueco mientras la sombra viaja) */
  arrastrando?: boolean;
  ref?: Ref<HTMLLIElement>;
}

export const Fila = memo(function Fila({ fila, consulta, yo, miembros, ahora, indice = 0, entrada, ordenEntrada = 0, ordenSalida = 0, destino, layoutDependency, seccion, onArrastrar, arrastrando, onToggle, onEditar, onVolverAAnotar, ref }: FilaProps & FilaExtraProps) {
  const { item, grupo, tachado, enEspera, protagonista, resaltada } = fila;
  const comprado = grupo === 'comprado';
  const reducido = useReducedMotion();
  const willChange = useWillChange();

  // ---- foco: la fila que se va no deja el foco en el <body> ----
  const li = useRef<HTMLLIElement | null>(null);
  const setLi = useCallback((el: HTMLLIElement | null) => {
    li.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLLIElement | null }).current = el;
  }, [ref]);
  useLayoutEffect(() => () => reubicarFoco(li.current, SELECTOR_CASILLA, () => document.querySelector<HTMLElement>(SELECTOR_MAIN)), []);

  // ---- vuelo desde el bolsillo ----
  // x/y/scale viven en MotionValues (style): las variantes los animan igual, y acá podemos moverlos antes del primer
  // pintado sin animación imperativa. `initial` los inicializa (Motion los setea al construir el elemento).
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const desdeBolsillo = entrada === 'bolsillo' && !reducido;
  const [volando, setVolando] = useState(desdeBolsillo);
  useLayoutEffect(() => {
    if (!desdeBolsillo) return;
    const v = vueloEntre(li.current, destino?.());
    if (!v) { setVolando(false); return; }               // sin destino medible: entra como cualquier fila
    x.jump(v.x); y.jump(v.y); scale.jump(vuelo.escala);   // Motion anima desde acá hasta `animate` al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);
  const onAnimationComplete = useCallback(() => setVolando(false), []);

  // ---- salida: durante la salida (presencia), qué modo lleva la fila (para el z-index del vuelo) ----
  // Se congela en el primer render en que la fila deja de estar presente: Motion tampoco re-resuelve la variante de
  // salida, y el custom vivo puede cambiar mientras vuela (empezar a escribir apaga los vuelos) sin que eso la afecte.
  const presente = useIsPresent();
  const salidaCustom = usePresenceData() as SalidaFilas | undefined;
  const modoRef = useRef<ReturnType<typeof modoSalida> | undefined>(undefined);
  if (presente) modoRef.current = undefined;
  else if (modoRef.current === undefined) modoRef.current = modoSalida(item.id, salidaCustom, !!reducido);
  const modo = modoRef.current;

  // ---- gesto: tap vs scroll vs long-press ----
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const tragarClick = useRef(false);            // el próximo click no tilda (hubo scroll o long-press)
  const timerLong = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limpiarLong = () => { if (timerLong.current) { clearTimeout(timerLong.current); timerLong.current = null; } };
  useEffect(() => limpiarLong, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    inicio.current = { x: e.clientX, y: e.clientY };
    tragarClick.current = false;
    limpiarLong();
    if (!onArrastrar) return;
    // la pulsación larga LEVANTA la fila para moverla de súper (D18). Editar vive en el chevron, que se ve.
    const nativo = e.nativeEvent;
    timerLong.current = setTimeout(() => {
      timerLong.current = null;
      tragarClick.current = true;
      onArrastrar(item, nativo);
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!inicio.current) return;
    if (Math.abs(e.clientX - inicio.current.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - inicio.current.y) > MOVE_CANCEL_PX) {
      tragarClick.current = true;
      limpiarLong();
    }
  };
  const onPointerEnd = () => { inicio.current = null; limpiarLong(); };
  // el navegador tomó el gesto (scroll): no va a llegar ningún click, no dejamos nada trabado
  const onPointerCancel = () => { onPointerEnd(); tragarClick.current = false; };
  const onClickLabel = (e: ReactMouseEvent) => {
    if (tragarClick.current) { e.preventDefault(); tragarClick.current = false; }
  };
  const onContextMenu = (e: ReactMouseEvent) => {
    // en touch, la pulsación larga es nuestra (levantar la fila); el menú contextual del navegador la pisaría
    if (timerLong.current || tragarClick.current) e.preventDefault();
  };
  const onChange = useCallback(() => {
    if (tragarClick.current) return;
    if (!tachado && typeof navigator !== 'undefined' && 'vibrate' in navigator) { try { navigator.vibrate(HAPTIC_MS); } catch { /* sin háptica */ } }
    onToggle(item.id);
  }, [onToggle, item.id, tachado]);

  // ---- textos ----
  const segmentos = consulta ? segmentosResaltados(consulta, item.texto) : [[item.texto, false] as [string, boolean]];
  // el nombre y la fecha son los de la ÚLTIMA mano (D19), no los del que lo anotó
  const mano = ultimaMano(item);
  const quien = nombreDe(mano.por, mano.nombre, miembros, yo, textos.meta);
  const meta = comprado ? textos.meta.comprado(quien, fechaYHora(mano.en, ahora)) : textos.meta.agregado(quien, haceCuanto(mano.en, ahora));

  // la fila nueva llega apenas después del coro (ENTER_DELAY): es lo último que se mueve
  const base = rowTransition(protagonista);
  let transition: Transition = base;
  if (desdeBolsillo) {
    // desde el bolsillo: se acomoda con spring (x/y/scale) y se hace visible enseguida; stagger por orden
    const delay = vuelo.stagger(ordenEntrada);
    const asentar: Transition = { ...spring.settle, delay };
    transition = { ...base, opacity: { duration: dur.fast, delay }, x: asentar, y: asentar, scale: asentar };
  } else if (resaltada) {
    transition = { ...base, opacity: { duration: dur.fast, delay: ENTER_DELAY() }, y: { duration: dur.fast, delay: ENTER_DELAY() } };
  }

  // salida: la AnimatePresence de la Lista manda { motivo, cantidad, enBolsillo } como custom; los órdenes vienen por props
  const variants: Variants = {
    salir: (custom?: SalidaFilas) => {
      const { motivo, cantidad } = custom ?? SALIDA_DEFAULT;
      const muchas = cantidad > CAP_SIMULTANEO;
      if (!muchas && modoSalida(item.id, custom, !!reducido) === 'bolsillo') {
        // succión: se despega (anticipación), acelera hasta el centro del rótulo y se desvanece recién al final
        const v = vueloEntre(li.current, destino?.());
        if (v) {
          const delay = vuelo.stagger(ordenSalida);
          const ir: Transition = { duration: vuelo.dur, ease: vuelo.ease, delay };
          return {
            x: v.x, y: v.y, scale: vuelo.escala, opacity: 0,
            transition: {
              x: ir, y: ir,
              scale: { duration: vuelo.dur, ease: ease.in, delay },
              opacity: { duration: vuelo.dur * (1 - vuelo.desvanecerDesde), delay: delay + vuelo.dur * vuelo.desvanecerDesde, ease: ease.linear },
            },
          };
        }
      }
      return {
        opacity: 0,
        ...(muchas ? {} : { y: dist.exit, scale: scl.exit }),
        transition: { duration: dur.fast, delay: motivo === 'vaciar' ? staggerExit(indice) : 0 },
      };
    },
  };

  return (
    <motion.li
      ref={setLi}
      className={s.fila}
      data-id={item.id}
      data-grupo={grupo}
      data-state={enEspera ? 'hold' : undefined}
      data-resaltada={resaltada ? 'true' : undefined}
      data-entrada={volando ? 'bolsillo' : undefined}
      data-salida={modo}
      data-seccion={seccion}
      data-arrastrando={arrastrando ? 'true' : undefined}
      layout="position"
      layoutDependency={layoutDependency}
      style={{ x, y, scale, willChange }}
      initial={{ opacity: 0, x: 0, y: dist.enter, scale: 1 }}   /* x: 0 explícito: si vuelve tras un vuelo terminado, Motion la repone al initial */
      /* el opacity lo maneja Motion (inline gana sobre el CSS): la fila levantada queda como hueco mientras viaja la sombra */
      animate={{ opacity: arrastrando ? opacity.hueco : comprado ? opacity.dim : 1, x: 0, y: 0, scale: 1 }}   /* scale: 1 explícito: si vuelve antes de terminar de salir, no queda en scl.exit */
      variants={variants}
      exit="salir"
      transition={transition}
      onAnimationComplete={onAnimationComplete}
    >
      <label
        className={s.label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerEnd}
        onClick={onClickLabel}
        onContextMenu={onContextMenu}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={tachado}
          onChange={onChange}
          aria-label={tachado ? textos.lista.destildar(item.texto) : textos.lista.tildar(item.texto)}
        />
        <span className={s.casilla} aria-hidden="true">
          <svg className={s.tilde} viewBox="0 0 24 24" focusable="false">
            <motion.path
              d="M6 12.5l4 4L18 8"
              fill="none"
              stroke="var(--on-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: tachado ? 1 : 0, opacity: tachado ? 1 : 0 }}
              transition={{ duration: dur.base }}
            />
          </svg>
        </span>
        <span className={s.cuerpo}>
          <span className={s.texto} data-tachado={tachado ? 'true' : 'false'}>
            {segmentos.map(([t, hit], i) => (hit ? <mark key={i} className={s.mark}>{t}</mark> : <span key={i}>{t}</span>))}
          </span>
          <span className={s.meta}>
            {item.pendiente ? <span className={s.sync} role="img" aria-label={textos.lista.pendienteSync} /> : null}
            <span className={s.metaTexto}>{meta}</span>
          </span>
        </span>
      </label>
      <span className={s.cola}>
        {onVolverAAnotar ? (
          <motion.button
            type="button"
            className={s.volver}
            onPointerDown={noRobarFoco}   /* bajo filtro: se sigue escribiendo, el teclado no se cierra */
            onClick={() => onVolverAAnotar(item.id)}
            whileTap={{ scale: scl.press }}
            transition={spring.snappy}
          >
            {textos.lista.volverAAnotar}
          </motion.button>
        ) : (
          <motion.button
            type="button"
            className={s.editar}
            aria-label={textos.lista.editar(item.texto)}
            onClick={() => onEditar(item)}
            whileTap={{ scale: scl.press }}
            transition={spring.snappy}
          >
            <svg className={s.chevron} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        )}
      </span>
    </motion.li>
  );
});
