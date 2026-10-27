/**
 * Header fijo: rótulo "Heladera" · pastilla de estado · avatar (¿Quién sos?) · botón ⋯ (menú).
 * Solo información y dos accesos: fuera de la zona del pulgar, no se mueve nunca.
 */
import { motion } from 'motion/react';
import type { HeaderProps } from '@/ui/contratos';
import { textos } from '@/ui/textos';
import { scl, spring } from '@/motion/tokens';
import { Pastilla } from './Pastilla';
import { Avatar } from './Avatar';
import s from './Header.module.css';

export function Header({ nombreApp, nombreLista, onVolver, conexion, pendientesSync, ultimaSync, ahora, yo, miembros, onQuienSos, onMenu }: HeaderProps) {
  const miembro = yo.memberId ? miembros.find(m => m.id === yo.memberId) : undefined;
  const nombre = miembro?.nombre ?? yo.nombre;
  return (
    <header className={s.header}>
      {onVolver ? (
        <motion.button
          type="button"
          className={s.boton}
          aria-label={textos.header.volver}
          onClick={onVolver}
          whileTap={{ scale: scl.press }}
          transition={spring.snappy}
        >
          <svg className={s.icono} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
      ) : null}
      {/* con varias listas, el título dice DÓNDE estás; la marca queda para la home */}
      <h1 className={s.marca}>{nombreLista || nombreApp}</h1>
      <Pastilla conexion={conexion} pendientesSync={pendientesSync} ultimaSync={ultimaSync} ahora={ahora} />
      <div className={s.acciones}>
        <motion.button
          type="button"
          className={s.boton}
          aria-label={nombre ? textos.header.quienSosActual(nombre) : textos.header.quienSosAnonimo}
          onClick={onQuienSos}
          whileTap={{ scale: scl.press }}
          transition={spring.snappy}
        >
          <Avatar nombre={nombre} color={miembro?.color ?? null} />
        </motion.button>
        <motion.button
          type="button"
          className={s.boton}
          aria-label={textos.header.menu}
          onClick={onMenu}
          whileTap={{ scale: scl.press }}
          transition={spring.snappy}
        >
          <svg className={s.icono} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="5" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="19" cy="12" r="2" fill="currentColor" />
          </svg>
        </motion.button>
      </div>
    </header>
  );
}
