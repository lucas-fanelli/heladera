/**
 * Quién puede entrar a una lista (D22 · Etapa 1). Lo que vive acá es lo que no depende de Firestore:
 * cuánto dura una invitación, cómo se genera un código y cómo viaja en el link.
 *
 * El código de invitación es un bearer token: quien lo tiene, entra. Por eso viaja en el **fragmento** de la URL
 * (`#i=…`), que el navegador NO manda al servidor — no aparece en los logs de Hosting ni en el Referer — y por eso
 * se genera con `crypto.getRandomValues`, igual que los ids: adivinarlo es entrar.
 */
import { nuevoId } from './ids';

/** Largo del código. 24 caracteres de 62 ≈ 143 bits; las reglas exigen ≥ 20 y no lo dejan más corto. */
export const LARGO_CODIGO = 24;

/** Cuánto vive una invitación. No se puede hacer de un solo uso (las reglas no saben contar), así que vence. */
export const VENCIMIENTO_INVITACION_MS = 7 * 24 * 60 * 60 * 1000;

/** El parámetro del fragmento que lleva el código. */
export const CLAVE_CODIGO = 'i';

export function nuevoCodigo(): string {
  return nuevoId(LARGO_CODIGO);
}

/** ¿Tiene forma de código? Mismo criterio que las reglas, para fallar temprano y con un mensaje nuestro. */
export function codigoValido(codigo: string): boolean {
  return /^[A-Za-z0-9]{20,64}$/.test(codigo);
}

/** El link que se manda para sumar a alguien: la lista, y el código en el fragmento. */
export function linkDeInvitacion(urlDeLaLista: string, codigo: string): string {
  return `${urlDeLaLista}#${CLAVE_CODIGO}=${codigo}`;
}

/**
 * Lee el código del fragmento de la URL. Devuelve null si no hay o si no tiene forma de código.
 * Se lee una vez al abrir y se limpia enseguida (ver `limpiarCodigo`): no queremos que quede en el historial
 * ni que se comparta de nuevo por accidente al copiar la barra de direcciones.
 */
export function codigoDeLaUrl(hash = typeof location === 'undefined' ? '' : location.hash): string | null {
  const crudo = hash.replace(/^#/, '');
  if (!crudo) return null;
  const v = new URLSearchParams(crudo).get(CLAVE_CODIGO);
  return v && codigoValido(v) ? v : null;
}

/** Cuántos días le quedan (redondeando hacia arriba: "vence en 1 día" hasta el último momento). 0 = ya venció. */
export function diasQueLeQuedan(venceEn: number | null, ahora: number): number {
  if (venceEn === null) return 0;
  return Math.max(0, Math.ceil((venceEn - ahora) / (24 * 60 * 60 * 1000)));
}

/** ¿Está vencida o revocada? (el servidor es el que manda; esto es para no ofrecer lo que ya no sirve) */
export function invitacionViva(inv: { venceEn: number | null; revocada: boolean }, ahora: number): boolean {
  return !inv.revocada && inv.venceEn !== null && inv.venceEn > ahora;
}
