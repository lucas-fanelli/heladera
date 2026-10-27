/**
 * Chip tocable (sugerencias, personas en "¿Quién sos?"). Un botón real, ≥ 44 px de alto tocable.
 * No toma el foco con el puntero (ui/foco.ts): tocar una sugerencia agrega y el teclado sigue abierto.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { scl, spring } from '@/motion/tokens';
import { LONG_PRESS_MS } from '@/domain/timing';
import { noRobarFoco } from './foco';
import s from './Chip.module.css';

export interface ChipProps {
  children: ReactNode;
  onClick: () => void;
  seleccionado?: boolean;
  /** nombre accesible si el contenido visible no alcanza */
  ariaLabel?: string;
  /** ícono/decoración a la izquierda (aria-hidden) */
  icono?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** para chips dentro de <ul>: se envuelve solo; default 'button' */
  type?: 'button' | 'submit';
  /**
   * Mantener apretado (o clic derecho, o Supr/Borrar con el foco encima: el gesto tiene que existir también sin
   * dedo). El click que suelta la pulsación larga NO dispara `onClick`.
   */
  onMantener?: () => void;
}

export function Chip({ children, onClick, seleccionado = false, ariaLabel, icono, disabled, className, type = 'button', onMantener }: ChipProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disparado = useRef(false);
  const cancelar = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  useEffect(() => cancelar, [cancelar]);

  const alApretar = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    noRobarFoco(e);
    if (!onMantener) return;
    disparado.current = false;
    cancelar();
    timer.current = setTimeout(() => { timer.current = null; disparado.current = true; onMantener(); }, LONG_PRESS_MS);
  }, [onMantener, cancelar]);

  const alTocar = useCallback(() => {
    cancelar();
    // el click de cierre de una pulsación larga no cuenta como toque
    if (disparado.current) { disparado.current = false; return; }
    onClick();
  }, [cancelar, onClick]);

  return (
    <motion.button
      type={type}
      className={[s.chip, className].filter(Boolean).join(' ')}
      aria-pressed={seleccionado ? true : undefined}
      aria-label={ariaLabel}
      data-seleccionado={seleccionado ? 'true' : undefined}
      disabled={disabled}
      onPointerDown={alApretar}
      onPointerUp={cancelar}
      onPointerLeave={cancelar}
      onPointerCancel={cancelar}
      onContextMenu={onMantener ? (e => { e.preventDefault(); disparado.current = true; onMantener(); }) : undefined}
      onKeyDown={onMantener ? (e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onMantener(); } }) : undefined}
      onClick={alTocar}
      whileTap={{ scale: scl.chip }}
      transition={spring.snappy}
    >
      {icono ? <span className={s.icono} aria-hidden="true">{icono}</span> : null}
      <span className={s.texto}>{children}</span>
    </motion.button>
  );
}
