/**
 * Ids generados en el cliente (idempotencia: "agregar" es escribir el documento con ESTE id).
 * 20 caracteres [A-Za-z0-9] ≈ 119 bits. Solo crypto.getRandomValues; nunca Date.now() ni Math.random().
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function nuevoId(largo = 20): string {
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < largo; i++) out += ALFABETO[bytes[i]! % ALFABETO.length];
  return out;
}

/** Id "legible" para listas: 20 chars también (es el secreto del link; no puede ser corto ni adivinable). */
export const nuevoIdLista = () => nuevoId(20);
