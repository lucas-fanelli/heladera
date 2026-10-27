/**
 * Personas: asignación de color por orden de llegada, búsqueda por nombre (sin tildes/mayúsculas).
 */
import type { ColorPersona, Mercado, Miembro } from '@/db/types';
import { agruparPorMercado, hayQueAgrupar } from './mercados';
import { normalizar } from './normalizar';

export const COLORES_PERSONA: ColorPersona[] = ['p1', 'p2', 'p3', 'p4'];

/** El color menos usado; en empate, el primero libre en orden. */
export function siguienteColor(miembros: Miembro[]): ColorPersona {
  const uso = new Map<ColorPersona, number>(COLORES_PERSONA.map(c => [c, 0]));
  for (const m of miembros) uso.set(m.color, (uso.get(m.color) ?? 0) + 1);
  let mejor: ColorPersona = 'p1', min = Number.POSITIVE_INFINITY;
  for (const c of COLORES_PERSONA) { const u = uso.get(c) ?? 0; if (u < min) { min = u; mejor = c; } }
  return mejor;
}

/** Busca un miembro por nombre, tolerando mayúsculas y tildes ("mamá" == "Mamá" == "MAMA"). */
export function buscarPorNombre(miembros: Miembro[], nombre: string): Miembro | undefined {
  const n = normalizar(nombre);
  if (!n) return undefined;
  return miembros.find(m => normalizar(m.nombre) === n);
}

/** Valida y limpia un nombre de persona. Devuelve el nombre limpio o un error. */
export function validarNombre(nombre: string, max: number): { ok: true; nombre: string } | { ok: false; motivo: 'vacio' | 'largo' } {
  const n = nombre.replace(/\s+/g, ' ').trim();
  if (!n) return { ok: false, motivo: 'vacio' };
  if (n.length > max) return { ok: false, motivo: 'largo' };
  return { ok: true, nombre: n };
}

/**
 * Texto plano de la lista para mandar por WhatsApp.
 * Si hay súper, sale agrupado igual que en pantalla (D16): lo que no tiene ninguno primero y sin título, y cada
 * súper con su separador. Con un solo grupo no se pone ningún título — el mensaje queda como siempre.
 */
export function textoParaCompartir(
  nombreLista: string,
  pendientes: Array<{ texto: string; mercado?: string | null }>,
  t: { titulo: (nombre: string, n: number) => string; pie: string; seccion: (nombre: string) => string },
  mercados: Mercado[] = [],
): string {
  const secciones = agruparPorMercado(pendientes, p => p.mercado, mercados);
  const conTitulos = hayQueAgrupar(secciones);
  const cuerpo: string[] = [];
  for (const sec of secciones) {
    // el grupo sin súper va primero y sin título (acá nunca se reordena): es "la lista"
    if (conTitulos && sec.mercado !== null) {
      if (cuerpo.length > 0) cuerpo.push('');
      cuerpo.push(t.seccion(sec.mercado.nombre));
    }
    for (const p of sec.filas) cuerpo.push(`· ${p.texto}`);
  }
  return [t.titulo(nombreLista, pendientes.length), ...cuerpo, '', t.pie].join('\n');
}
