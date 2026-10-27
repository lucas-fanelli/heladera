/**
 * Menú ⋯: todo lo secundario en cuatro filas. "Sumar a alguien" muestra el link con Copiar / Mandar.
 */
import { useEffect, useId, useState } from 'react';
import { motion } from 'motion/react';
import type { MenuProps } from '@/ui/contratos';
import { textos } from '@/ui/textos';
import { scl } from '@/motion/tokens';
import { Sheet } from './Sheet';
import c from '@/ui/controles.module.css';
import s from './Menu.module.css';

/** Íconos inline (24px, currentColor). Sin librería. */
const Icono = {
  /** la llave: quién puede entrar (D22) */
  llave: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="14" r="4" /><path d="M11 11 20 2" /><path d="M17 5l2.5 2.5" /><path d="M14.5 7.5 17 10" />
    </svg>
  ),
  mandar: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 3 10.5 13.5" /><path d="M21 3 14 21l-3.5-7.5L3 10z" />
    </svg>
  ),
  sumar: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M19 8v6M16 11h6" />
    </svg>
  ),
  nombre: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 8.5 16.5 11.5" />
    </svg>
  ),
  exportar: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 17v3h16v-3" />
    </svg>
  ),
  chevron: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  ),
};

export function Menu({ abierto, lista, pendientes, yo, onMandarWhatsApp, onInvitar, onCopiarLink, onMandarLink, onAccesos, onRenombrar, onCambiarNombre, onExportar, onCerrar, onSalida }: MenuProps) {
  const idTitulo = useId();
  const n = pendientes.length;
  /** el link de invitación recién creado. No se crea al abrir el menú: una invitación es un acto, no una vista. */
  const [invitacion, setInvitacion] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  /** el editor del nombre de la lista (abierto/borrador) */
  const [renombrando, setRenombrando] = useState(false);
  const [borradorNombre, setBorradorNombre] = useState('');
  const idNombre = useId();
  // al cerrar el menú se olvida: la próxima vez que quieras sumar a alguien, es una invitación nueva
  useEffect(() => { if (!abierto) { setInvitacion(null); setCreando(false); setRenombrando(false); } }, [abierto]);

  const crear = async (): Promise<void> => {
    if (creando) return;
    setCreando(true);
    const l = await onInvitar();
    setCreando(false);
    if (l) setInvitacion(l);
  };

  return (
    <Sheet abierto={abierto} onCerrar={onCerrar} onSalida={onSalida} labelledBy={idTitulo}>
      <h2 id={idTitulo} className="sr-only">{textos.menu.titulo}</h2>
      <ul className={s.filas}>
        <li>
          <motion.button type="button" className={s.fila} onClick={onMandarWhatsApp} disabled={n === 0} whileTap={{ scale: scl.press }}>
            <span className={s.icono}><Icono.mandar /></span>
            <span className={s.textos}>
              <span className={s.titulo}>{textos.menu.mandar}</span>
              <span className={s.sub}>{textos.menu.mandarSub(n)}</span>
            </span>
            <span className={s.chevron}><Icono.chevron /></span>
          </motion.button>
        </li>
        <li className={s.filaSumar}>
          <div className={s.fila}>
            <span className={s.icono}><Icono.sumar /></span>
            <span className={s.textos}>
              <span className={s.titulo}>{textos.menu.sumar}</span>
              <span className={s.sub}>{textos.menu.sumarSub}</span>
            </span>
          </div>
          <div className={s.linkZona}>
            {invitacion === null ? (
              <motion.button type="button" className={c.secundario} onClick={crear} disabled={creando} whileTap={{ scale: scl.press }}>
                {creando ? textos.menu.generandoInvitacion : textos.menu.generarInvitacion}
              </motion.button>
            ) : (
              <>
                <p className={s.ayudaInvitacion}>{textos.menu.invitacionLista}</p>
                <p className={s.link} title={invitacion}><span className="sr-only">{textos.menu.linkLabel}: </span>{invitacion}</p>
                <div className={s.linkBotones}>
                  <motion.button type="button" className={c.secundario} onClick={() => onCopiarLink(invitacion)} whileTap={{ scale: scl.press }}>{textos.menu.copiarLink}</motion.button>
                  <motion.button type="button" className={c.secundario} onClick={() => onMandarLink(invitacion)} whileTap={{ scale: scl.press }}>{textos.menu.mandarLink}</motion.button>
                </div>
              </>
            )}
          </div>
        </li>
        <li className={s.filaSumar}>
          {renombrando ? (
            <form
              className={s.linkZona}
              onSubmit={e => { e.preventDefault(); const n = borradorNombre.replace(/\s+/g, ' ').trim(); if (n) onRenombrar(n); setRenombrando(false); }}
            >
              <label htmlFor={idNombre} className="sr-only">{textos.menu.renombrarLabel}</label>
              <input
                id={idNombre}
                className={c.campo}
                value={borradorNombre}
                onChange={e => setBorradorNombre(e.target.value)}
                maxLength={textos.limites.listaMax}
                autoComplete="off"
                autoFocus
              />
              <div className={s.linkBotones}>
                <motion.button type="submit" className={c.secundario} whileTap={{ scale: scl.press }}>{textos.menu.guardar}</motion.button>
                <motion.button type="button" className={c.texto} onClick={() => setRenombrando(false)} whileTap={{ scale: scl.press }}>{textos.confirmar.cancelar}</motion.button>
              </div>
            </form>
          ) : (
            <motion.button type="button" className={s.fila} onClick={() => { setBorradorNombre(lista?.nombre ?? ''); setRenombrando(true); }} whileTap={{ scale: scl.press }}>
              <span className={s.icono}><Icono.nombre /></span>
              <span className={s.textos}>
                <span className={s.titulo}>{textos.menu.renombrar}</span>
              </span>
              <span className={s.valor}>{lista?.nombre ?? ''}</span>
              <span className={s.chevron}><Icono.chevron /></span>
            </motion.button>
          )}
        </li>
        <li>
          <motion.button type="button" className={s.fila} onClick={onAccesos} whileTap={{ scale: scl.press }}>
            <span className={s.icono}><Icono.llave /></span>
            <span className={s.textos}>
              <span className={s.titulo}>{textos.menu.accesos}</span>
            </span>
            <span className={s.chevron}><Icono.chevron /></span>
          </motion.button>
        </li>
        <li>
          <motion.button type="button" className={s.fila} onClick={onCambiarNombre} whileTap={{ scale: scl.press }}>
            <span className={s.icono}><Icono.nombre /></span>
            <span className={s.textos}>
              <span className={s.titulo}>{textos.menu.cambiarNombre}</span>
            </span>
            <span className={s.valor}>{yo.nombre ?? textos.menu.sinNombre}</span>
            <span className={s.chevron}><Icono.chevron /></span>
          </motion.button>
        </li>
        <li>
          <motion.button type="button" className={s.fila} onClick={onExportar} whileTap={{ scale: scl.press }}>
            <span className={s.icono}><Icono.exportar /></span>
            <span className={s.textos}>
              <span className={s.titulo}>{textos.menu.exportar}</span>
              <span className={s.sub}>{textos.menu.exportarSub}</span>
            </span>
            <span className={s.chevron}><Icono.chevron /></span>
          </motion.button>
        </li>
      </ul>
      <div className={s.pie}>
        <motion.button type="button" className={c.texto} onClick={onCerrar} whileTap={{ scale: scl.press }}>{textos.menu.cerrar}</motion.button>
      </div>
    </Sheet>
  );
}
