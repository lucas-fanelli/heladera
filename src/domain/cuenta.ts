/**
 * La cuenta permanente (D23). El uid anónimo vive en el navegador: limpiar los datos del sitio o perder el
 * dispositivo lo pierde, y con él todas sus llaves (para el dueño de una lista, sin vuelta). "Guardar el acceso"
 * lo ata a una cuenta (hoy: Google): el uid NO cambia, y entrar con esa cuenta en otro dispositivo te devuelve
 * el mismo uid — tus llaves te siguen. Nadie está obligado: los uid anónimos funcionan igual que siempre.
 */
import type { Cuenta } from '@/db/types';

/**
 * Qué cuenta tiene este dispositivo, a partir de lo que sabe la auth. El choque manda: si el último intento de
 * guardar chocó con una cuenta que ya guarda otro acceso, eso es lo que hay que contarle a la UI (todavía tiene
 * la puerta abierta para entrar con ella), aunque el usuario de este dispositivo siga siendo el anónimo de antes.
 */
export function cuentaDe(
  usuario: { anonimo: boolean; email: string | null } | null,
  choque: { email: string | null } | null,
): Cuenta {
  if (choque) return { estado: 'choque', email: choque.email };
  if (usuario && !usuario.anonimo) return { estado: 'guardada', email: usuario.email };
  return { estado: 'anonima' };
}
