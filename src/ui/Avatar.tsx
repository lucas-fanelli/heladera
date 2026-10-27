/**
 * Círculo con la inicial de una persona, en su color (--p1..--p4). "?" si todavía no eligió quién es.
 * Decorativo: el nombre accesible lo pone quien lo usa (botón / texto al lado).
 */
import type { ColorPersona } from '@/db/types';
import { inicial } from '@/domain';
import s from './Avatar.module.css';

export interface AvatarProps {
  nombre: string | null | undefined;
  color: ColorPersona | null | undefined;
  /** 'sm' = header (var(--avatar-size)); 'md' = sheets */
  tamano?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ nombre, color, tamano = 'sm', className }: AvatarProps) {
  const letra = inicial(nombre);
  const anonimo = !color || letra === '?';
  return (
    <span
      className={[s.avatar, className].filter(Boolean).join(' ')}
      data-tamano={tamano}
      data-anonimo={anonimo ? 'true' : undefined}
      style={anonimo ? undefined : { backgroundColor: `var(--${color})` }}
      aria-hidden="true"
    >
      {letra}
    </span>
  );
}
