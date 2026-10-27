/**
 * Estados vacíos (§9): primera vez, todo comprado, sin señal ni caché, filtro sin resultados, lista inexistente.
 * Vive dentro del área de la lista; no mueve la barra de abajo.
 */
import { motion } from 'motion/react';
import type { EmptyStateProps } from '@/ui/contratos';
import type { EstadoVacio } from '@/domain';
import { textos } from '@/ui/textos';
import { scl, spring } from '@/motion/tokens';
import s from './EmptyState.module.css';

type Tipo = Exclude<EstadoVacio, 'ninguno'>;

const COPY: Record<Tipo, { titulo: string; texto: string }> = {
  primeraVez: { titulo: textos.vacio.primeraVezTitulo, texto: textos.vacio.primeraVezTexto },
  todoComprado: { titulo: textos.vacio.todoCompradoTitulo, texto: textos.vacio.todoCompradoTexto },
  sinSenalSinCache: { titulo: textos.vacio.sinSenalTitulo, texto: textos.vacio.sinSenalTexto },
  filtro: { titulo: textos.vacio.filtroTitulo, texto: textos.vacio.filtroTexto },
  noExiste: { titulo: textos.vacio.noExisteTitulo, texto: textos.vacio.noExisteTexto },
  sinAcceso: { titulo: textos.vacio.sinAccesoTitulo, texto: textos.vacio.sinAccesoTexto },
};

export function EmptyState({ tipo, onReintentar }: EmptyStateProps) {
  if (tipo === 'ninguno') return null;
  const c = COPY[tipo];
  return (
    <div className={s.vacio} data-tipo={tipo}>
      <Ilustracion tipo={tipo} />
      <h2 className={s.titulo}>{c.titulo}</h2>
      <p className={s.texto}>{c.texto}</p>
      {tipo === 'sinSenalSinCache' ? (
        <motion.button type="button" className={s.boton} onClick={onReintentar} whileTap={{ scale: scl.press }} transition={spring.snappy}>
          {textos.vacio.reintentar}
        </motion.button>
      ) : null}
    </div>
  );
}

/** Dibujitos mínimos en currentColor: papel con renglones (o un check cuando no falta nada). */
function Ilustracion({ tipo }: { tipo: Tipo }) {
  if (tipo === 'todoComprado') {
    return (
      <svg className={s.dibujo} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M21 33l7 7 15-16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tipo === 'sinSenalSinCache') {
    return (
      <svg className={s.dibujo} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M14 30a26 26 0 0 1 36 0M21 38a16 16 0 0 1 22 0M28 46a6 6 0 0 1 8 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M16 16l32 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={s.dibujo} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="14" y="8" width="36" height="48" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M22 22h20M22 32h20M22 42h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
