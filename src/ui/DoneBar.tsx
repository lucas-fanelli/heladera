/**
 * Cabecera fija "▸ Comprados (N) · Vaciar", justo arriba de la barra de agregar (zona del pulgar).
 * "Vaciar" es UN solo botón persistente: su rótulo hace crossfade a "¿Vaciar N? Sí" (altura fija); nunca un modal.
 * Como el botón es el mismo, el foco nunca se pierde: Escape, tap afuera y el timeout (CONFIRM_MS, desde useLista)
 * cancelan y el foco sigue en el botón. Con N = 0 no se ve (opacity 0, inert, aria-hidden) pero SIGUE montada: es el
 * destino de los vuelos y tiene que existir/medirse antes de que la primera fila despegue (la fila sale y la barra
 * aparece en el mismo commit; los refs de una hermana posterior todavía no están cuando Motion resuelve la salida).
 * Bolsillo: el rótulo "Comprados (N)" es el destino de las filas que vuelan al tildar (Comprados cerrado, sin filtro).
 * `llegadas` > 0 (lo decide PantallaLista con las mismas reglas que la Lista): el número rueda recién cuando la fila
 * aterriza (vuelo.dur) y el rótulo la "atrapa" (bump). Si no, rueda con COUNTER_DELAY como el contador de arriba.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react';
import type { DoneBarProps } from '@/ui/contratos';
import { textos } from '@/ui/textos';
import { COUNTER_DELAY, dur, ease, scl, spring, vuelo } from '@/motion/tokens';
import { Rodillo } from './Rodillo';
import s from './DoneBar.module.css';

/** Parte "Comprados (N)" en [antes, N, después] para que solo el número ruede. */
function partir(n: number): { antes: string; despues: string } {
  const label = textos.lista.compradosN(n);
  const idx = label.indexOf(String(n));
  if (idx < 0) return { antes: label, despues: '' };
  return { antes: label.slice(0, idx), despues: label.slice(idx + String(n).length) };
}

/** Cuánto espera el número para rodar: si hay filas llegando volando, hasta que aterricen; si no, lo de siempre. */
export function retardoRodillo(llegadas: number): number {
  return llegadas > 0 ? vuelo.dur : COUNTER_DELAY();
}

export function DoneBar({ cantidad, abierto, llegadas = 0, bolsilloRef, onToggleAbierto, confirmando, onPedirVaciar, onConfirmarVaciar, onCancelarVaciar }: DoneBarProps) {
  const vaciar = useRef<HTMLButtonElement>(null);
  const reducido = useReducedMotion();
  const visible = cantidad > 0;

  // tap/click afuera del botón → cancela; Escape → cancela (el foco se queda donde estaba)
  useEffect(() => {
    if (!confirmando) return;
    const onDown = (e: PointerEvent) => {
      if (vaciar.current && e.target instanceof Node && vaciar.current.contains(e.target)) return;
      onCancelarVaciar();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelarVaciar(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, [confirmando, onCancelarVaciar]);

  // aterrizaje: el rótulo atrapa la fila (bump) cuando llega; una vez por cambio de N con filas en vuelo.
  // El bump se programa para el aterrizaje (timer, no delay de Motion) y arranca desde el valor vigente (primer keyframe
  // null): si llega otra fila con el bump anterior a medio camino, sigue desde ahí en vez de saltar a 1 y quedarse clavado.
  const atrapar = useAnimationControls();
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (llegadas === 0 || reducido) return;
    const t = setTimeout(() => {
      timers.current.delete(t);
      void atrapar.start({ scale: [null, vuelo.atrapar, 1], transition: { duration: dur.base, ease: ease.out } });
    }, vuelo.dur * 1000);
    timers.current.add(t);
  }, [cantidad, llegadas, reducido, atrapar]);
  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);
  const setBolsillo = useCallback((el: HTMLSpanElement | null) => { if (bolsilloRef) bolsilloRef.current = el; }, [bolsilloRef]);

  const rotuloVaciar = confirmando ? textos.lista.vaciarConfirmar(cantidad) : textos.lista.vaciar;
  const { antes, despues } = partir(cantidad);

  return (
    <motion.div
      className={s.bar}
      data-visible={visible ? 'true' : 'false'}
      aria-hidden={!visible}
      inert={!visible}
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      /* si aparece porque llega la primera fila volando, aparece cuando aterriza (con el número ya rodando) */
      transition={{ duration: dur.fast, delay: visible && llegadas > 0 ? vuelo.dur : 0 }}
    >
      <motion.button
        type="button"
        className={s.toggle}
        aria-expanded={abierto}
        aria-label={textos.lista.compradosN(cantidad)}   /* el número visible rueda (dos <span> por un instante): el nombre accesible es uno solo */
        onClick={onToggleAbierto}
        whileTap={{ scale: scl.press }}
        transition={spring.snappy}
      >
        <svg className={s.flecha} data-abierto={abierto ? 'true' : 'false'} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* el rótulo es el "bolsillo": destino de los vuelos (ref) y lo que atrapa la fila (bump) */}
        <motion.span ref={setBolsillo} className={s.rotulo} animate={atrapar}>
          {antes}<Rodillo valor={cantidad} delay={retardoRodillo(llegadas)} />{despues}
        </motion.span>
      </motion.button>

      <motion.button
        ref={vaciar}
        type="button"
        className={s.vaciar}
        data-confirmando={confirmando ? 'true' : 'false'}
        aria-label={rotuloVaciar}
        onClick={confirmando ? onConfirmarVaciar : onPedirVaciar}
        whileTap={{ scale: scl.press }}
        transition={spring.snappy}
      >
        <span className={s.slot}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={rotuloVaciar}
              className={s.rotuloVaciar}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.fast }}
            >
              {rotuloVaciar}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.button>
    </motion.div>
  );
}
