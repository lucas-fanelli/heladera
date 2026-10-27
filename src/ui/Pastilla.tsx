/**
 * Pastilla de estado del header: ● En vivo / ○ Sin conexión / ◐ Sincronizando…
 * Siempre punto + texto (nunca solo color). Anti-parpadeo: "Sincronizando…" solo se muestra si dura
 * más de SYNC_SHOW_MIN y, una vez mostrada, se queda al menos SYNC_HOLD_MIN.
 * Un role="status" (sr-only, siempre montado, fuera de la AnimatePresence) anuncia el estado a los lectores
 * de pantalla: el texto completo, y sin conexión también la explicación y los cambios sin sincronizar.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PastillaProps } from '@/ui/contratos';
import type { EstadoConexion } from '@/domain';
import { haceCuanto } from '@/domain';
import { timing } from '@/domain/timing';
import { textos } from '@/ui/textos';
import { dur, spring } from '@/motion/tokens';
import s from './Pastilla.module.css';

/** Estado que se pinta, con el anti-parpadeo aplicado. */
export function useEstadoMostrado(real: EstadoConexion): EstadoConexion {
  const [mostrado, setMostrado] = useState<EstadoConexion>(real === 'sync' ? 'live' : real);
  const mostradoRef = useRef(mostrado); mostradoRef.current = mostrado;
  const desde = useRef<number>(0);          // cuándo empezó a verse 'sync'

  useEffect(() => {
    const t = timing();
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (real === 'sync') {
      if (mostradoRef.current !== 'sync') {
        timer = setTimeout(() => { desde.current = Date.now(); setMostrado('sync'); }, t.SYNC_SHOW_MIN);
      }
    } else if (mostradoRef.current === 'sync') {
      const falta = Math.max(0, t.SYNC_HOLD_MIN - (Date.now() - desde.current));
      timer = setTimeout(() => setMostrado(real), falta);
    } else {
      setMostrado(real);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [real]);

  return mostrado;
}

export function Pastilla({ conexion, pendientesSync, ultimaSync, ahora }: PastillaProps) {
  const estado = useEstadoMostrado(conexion);
  const partesTitle: string[] = [textos.header.estadoTip[estado]];
  if (pendientesSync > 0) partesTitle.push(textos.header.pendientes(pendientesSync));
  if (ultimaSync !== null) partesTitle.push(textos.header.ultimaVez(haceCuanto(ultimaSync, ahora)));

  // lo que se anuncia: el estado; sin conexión, además la explicación (qué pasa con lo que hagas) y lo pendiente
  const anuncio: string[] = [textos.header.estado[estado]];
  if (estado === 'offline') anuncio.push(textos.header.estadoTip.offline);
  if (pendientesSync > 0) anuncio.push(textos.header.pendientes(pendientesSync));

  return (
    <motion.span className={s.pastilla} data-estado={estado} title={partesTitle.join('\n')} layout transition={spring.snappy}>
      <span className="sr-only" role="status" aria-live="polite">{anuncio.join('. ')}</span>
      <span className={s.punto} aria-hidden="true" />
      <span className={s.textoSlot} aria-hidden="true">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={estado}
            className={s.texto}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.fast }}
          >
            {textos.header.estado[estado]}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.span>
  );
}
