/**
 * Router mínimo. La app tiene dos rutas:
 *   /                → home (crear lista / abrir la última)
 *   /l/<listId>      → la lista. `?anotar` = "abrí lista para escribir". Hoy no lo produce nadie: lo usaba el
 *                      redirect `/h`, que se fue con "El QR y la pegatina se van". El mecanismo se conserva
 *                      para cuando el índice de listas quiera "abrir para anotar" desde una fila.
 * En modo demo (artifact, sin servidor) o con VITE_ROUTER=hash, las rutas van después del #: #/l/<id>?anotar
 * La app no sabe ni le importa desde dónde la abrieron: solo ve la URL.
 */
export type Ruta =
  | { tipo: 'home' }
  | { tipo: 'lista'; listId: string; anotar: boolean };

const HASH = (typeof __DEMO__ !== 'undefined' && __DEMO__) || import.meta.env.VITE_ROUTER === 'hash';
const LIST_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

function leerPathYQuery(): { path: string; query: URLSearchParams } {
  if (HASH) {
    const h = location.hash.replace(/^#/, '');
    const [path = '/', q = ''] = h.split('?');
    return { path: path.startsWith('/') ? path : '/' + path, query: new URLSearchParams(q) };
  }
  return { path: location.pathname, query: new URLSearchParams(location.search) };
}

export function rutaActual(): Ruta {
  const { path, query } = leerPathYQuery();
  const m = path.match(/^\/l\/([^/]+)\/?$/);
  if (m && m[1] && LIST_ID_RE.test(m[1])) return { tipo: 'lista', listId: m[1], anotar: query.has('anotar') };
  return { tipo: 'home' };
}

export function urlDeLista(listId: string, opts: { anotar?: boolean; absoluta?: boolean } = {}): string {
  const rel = `/l/${listId}${opts.anotar ? '?anotar' : ''}`;
  const base = opts.absoluta ? location.origin + (HASH ? location.pathname : '') : '';
  return HASH ? `${base}#${rel}` : `${base}${rel}`;
}

/**
 * Le devuelve a `url` las perillas que ya venían en la URL (`?fps`, `?motion=`, `?hold=`, `?teclado=`…): todo lo
 * que hay, menos `anotar`, que lo decide la ruta. Se DERIVA de la URL — el router no enumera perillas, así que
 * la que se agregue mañana viaja sola. Moverse por dentro de la app no puede apagar el instrumento con el que
 * se la está midiendo: `?teclado=vk` tiene que sobrevivir a "Abrir «Casa»" o D28 no se puede medir.
 * OJO: esto NO va en `urlDeLista`, que además construye el link que se comparte — ahí la query actual sería una
 * fuga (el `?teclado=vk` de una sesión de diagnóstico viajando por WhatsApp adentro de la llave de la lista).
 */
function conPerillas(url: string): string {
  const { query } = leerPathYQuery();
  query.delete('anotar');
  const q = query.toString();
  return q ? url + (url.includes('?') ? '&' : '?') + q : url;
}

export function navegar(ruta: Ruta, replace = false): void {
  const target = conPerillas(ruta.tipo === 'home' ? (HASH ? '#/' : '/') : urlDeLista(ruta.listId, { anotar: ruta.anotar }));
  if (HASH) {
    if (replace) history.replaceState(null, '', target); else location.hash = target.slice(1);
    // location.hash= dispara hashchange; replaceState no → notificamos a mano
    if (replace) window.dispatchEvent(new PopStateEvent('popstate'));
  } else {
    if (replace) history.replaceState(null, '', target); else history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

/**
 * Quita el código de invitación del fragmento (#i=…) sin recargar. Se usa una sola vez, al canjearlo: si quedara
 * en la barra, cualquiera que copie la URL estaría re-compartiendo la invitación sin saberlo.
 * En modo hash el fragmento ES la ruta, así que ahí no se toca (la demo no tiene invitaciones).
 */
export function limpiarCodigo(): void {
  if (HASH || !location.hash) return;
  history.replaceState(null, '', location.pathname + location.search);
}

/** Quita `?anotar` de la URL sin recargar (después de usarlo para enfocar el input). Saca eso y NADA más. */
export function limpiarAnotar(): void {
  const r = rutaActual();
  if (r.tipo === 'lista' && r.anotar) history.replaceState(null, '', conPerillas(urlDeLista(r.listId)));
}

export function escucharRuta(cb: (r: Ruta) => void): () => void {
  const h = () => cb(rutaActual());
  window.addEventListener('popstate', h);
  window.addEventListener('hashchange', h);
  return () => { window.removeEventListener('popstate', h); window.removeEventListener('hashchange', h); };
}
