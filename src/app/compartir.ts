/**
 * Sacar algo de la app: el link de la lista, la lista como texto, el export en JSON.
 *
 * Cada botón promete una cosa y tiene que cumplir ESA:
 *  - "Copiar el link" copia y nada más (`soloCopiar`). Si el portapapeles falla, se avisa que no se pudo. Terminar
 *    abriendo WhatsApp desde un botón que dice Copiar es una promesa rota (bug que encontró el dueño).
 *  - "Mandar" sí puede escalar: Web Share primero (es el que deja elegir la app), después portapapeles con aviso, y
 *    como último recurso WhatsApp por URL.
 * Que el usuario cancele el diálogo del sistema cuenta como éxito: hizo lo que quiso.
 */

/** Último recurso para compartir texto cuando no hay Web Share ni portapapeles: WhatsApp web/app por URL. */
export const WA_ME_URL = 'https://wa.me/?text=';

export interface OpcionesCompartir {
  /** se llama si terminó copiando al portapapeles (para avisar) */
  avisarCopiado: () => void;
  /** JSON: intenta compartir como archivo con este nombre */
  nombreArchivo?: string;
  /** "Copiar": copia o falla, sin abrir nada más */
  soloCopiar?: boolean;
  /** último recurso para textos: abrir WhatsApp con el texto */
  whatsapp?: boolean;
}

/** Devuelve false solo si NINGÚN camino funcionó (ahí quien llama muestra el error). */
export async function compartirTexto(texto: string, opts: OpcionesCompartir): Promise<boolean> {
  const copiar = async (): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texto); opts.avisarCopiado(); return true; }
    } catch { /* sin permiso o sin foco: probamos el camino viejo */ }
    // el portapapeles moderno solo existe en contexto seguro (https o localhost): por http en la red de casa no está,
    // y ahí este truco de siempre sigue funcionando
    if (copiarALaVieja(texto)) { opts.avisarCopiado(); return true; }
    return false;
  };
  const share = async (): Promise<boolean> => {
    try {
      if (opts.nombreArchivo && typeof File !== 'undefined' && navigator.canShare) {
        const file = new File([texto], opts.nombreArchivo, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: opts.nombreArchivo }); return true; }
      }
      if (navigator.share) { await navigator.share({ text: texto }); return true; }
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return true;   // el usuario canceló: no es un fallo
    }
    return false;
  };
  const whatsapp = (): boolean => {
    if (!opts.whatsapp || typeof window.open !== 'function') return false;
    // con 'noopener' window.open devuelve null aunque haya abierto: solo un throw cuenta como fallo
    try { window.open(WA_ME_URL + encodeURIComponent(texto), '_blank', 'noopener'); return true; } catch { return false; }
  };

  if (opts.soloCopiar) return copiar();
  if (await share()) return true;
  if (await copiar()) return true;
  return whatsapp();
}

/** Copiar sin `navigator.clipboard` (http, navegadores viejos): textarea fuera de pantalla + execCommand. */
export function copiarALaVieja(texto: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, texto.length);   // iOS necesita el rango explícito
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}
