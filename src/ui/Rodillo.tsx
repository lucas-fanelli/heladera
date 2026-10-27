/**
 * Un número que "rueda" cuando cambia (dist.roll en la dirección semántica): baja N → los dígitos suben (el nuevo
 * entra desde abajo); sube N → bajan. Solo el número se mueve; el texto alrededor queda quieto (lo arma quien lo usa).
 * `delay`: el contador confirma, no anticipa (COUNTER_DELAY), o espera a que la fila llegue volando (DoneBar).
 * El número que sale lee { dir, delay } del custom de la AnimatePresence (variante dinámica), así el viejo y el nuevo
 * ruedan juntos aunque el delay haya cambiado en este mismo render.
 * El valor anterior se guarda en un efecto (nada se muta durante el render); si N no cambió, se conserva la dirección.
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { dist, dur, ease } from '@/motion/tokens';
import s from './Rodillo.module.css';

type Dir = 1 | -1;
interface Giro { dir: Dir; delay: number }

const variantes = {
  initial: ({ dir }: Giro) => ({ opacity: 0, y: dir * dist.roll }),
  animate: ({ delay }: Giro) => ({ opacity: 1, y: 0, transition: { duration: dur.fast, ease: ease.out, delay } }),
  exit: ({ dir, delay }: Giro) => ({ opacity: 0, y: -dir * dist.roll, transition: { duration: dur.fast, ease: ease.out, delay } }),
};

export function Rodillo({ valor, delay, className }: { valor: number; delay: number; className?: string }) {
  const previo = useRef({ valor, dir: 1 as Dir });
  const dir: Dir = valor < previo.current.valor ? 1 : valor > previo.current.valor ? -1 : previo.current.dir;
  useEffect(() => { previo.current = { valor, dir }; }, [valor, dir]);
  const giro: Giro = { dir, delay };
  const numero = String(valor);
  return (
    <span className={[s.rodillo, className].filter(Boolean).join(' ')}>
      <AnimatePresence mode="popLayout" initial={false} custom={giro}>
        <motion.span
          key={numero}
          className={s.numero}
          custom={giro}
          variants={variantes}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {numero}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
