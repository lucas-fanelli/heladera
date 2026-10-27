/**
 * "Faltan N": lo primero que se lee. Solo el número rueda (Rodillo, 6 px en la dirección semántica), y lo hace
 * COUNTER_DELAY después del movimiento que lo causó: confirma, no anticipa. "Faltan" no se mueve.
 * Con filtro: "· N coinciden". A cero: "No falta nada". `faltan` ya viene derivado por grupo visual.
 */
import { AnimatePresence, motion } from 'motion/react';
import type { ContadorProps } from '@/ui/contratos';
import { textos } from '@/ui/textos';
import { COUNTER_DELAY, dur } from '@/motion/tokens';
import { Rodillo } from './Rodillo';
import s from './Contador.module.css';

/** Parte el rótulo en [antes, número, después] para que solo el número se anime. */
function partir(n: number): { antes: string; numero: number | null; despues: string } {
  const label = textos.contador.faltan(n);
  if (n === 0) return { antes: label, numero: null, despues: '' };
  const idx = label.indexOf(String(n));
  if (idx < 0) return { antes: label, numero: null, despues: '' };
  return { antes: label.slice(0, idx), numero: n, despues: label.slice(idx + String(n).length) };
}

export function Contador({ faltan, coincidencias, filtroActivo }: ContadorProps) {
  const { antes, numero, despues } = partir(faltan);
  const coinciden = filtroActivo ? (coincidencias === 0 ? textos.contador.ninguna : textos.contador.coinciden(coincidencias)) : null;
  const aria = faltan === 0 ? textos.contador.faltan(0) : textos.contador.aria(faltan);

  return (
    <div className={s.contador}>
      <h2 className={s.titulo}>
        <span className={s.palabra}>{antes}</span>
        {numero !== null ? <Rodillo valor={numero} delay={COUNTER_DELAY()} /> : null}
        {despues ? <span className={s.palabra}>{despues}</span> : null}
        <AnimatePresence initial={false}>
          {coinciden ? (
            <motion.span
              key="coinciden"
              className={s.coinciden}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.fast }}
            >
              {coinciden}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </h2>
      <p className="sr-only" role="status" aria-live="polite">
        {aria}{coinciden ? ` ${coinciden}` : ''}
      </p>
    </div>
  );
}
