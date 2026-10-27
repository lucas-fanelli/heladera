/**
 * Fábrica del Db. La UI llama a `crearDb()` una vez y no sabe qué implementación hay detrás.
 *  - `VITE_DB=firestore` → Firestore real (src/db/firestore.ts) sobre la app inicializada en src/db/firebase.ts
 *    (con VITE_USE_EMULATORS=true apunta a los emuladores locales).
 *  - cualquier otra cosa, o el build demo → el Db falso en memoria con la lista de ejemplo.
 * Firebase se carga con import() dinámico: el build demo (single-file) y cualquier build con VITE_DB=fake no llevan
 * el SDK (~600 kB) adentro; con `__DEMO__` fijo en true la rama queda muerta y el bundler la descarta.
 */
import type { Db } from './types';
import { crearDbFake } from './fake';

export async function crearDb(): Promise<Db> {
  const demo = typeof __DEMO__ !== 'undefined' && __DEMO__;
  if (demo) return crearDbFake({ semilla: 'demo' });
  const cual = import.meta.env.VITE_DB ?? 'fake';
  if (cual === 'firestore') {
    const [{ crearFirebase }, { crearDbFirestore }] = await Promise.all([import('./firebase'), import('./firestore')]);
    const { db, listo, miUid, miCuenta, guardarCuenta, entrarConCuenta } = crearFirebase();
    return crearDbFirestore({ db, listo, miUid, miCuenta, guardarCuenta, entrarConCuenta });
  }
  return crearDbFake({ semilla: 'demo' });
}

export type { Db, Vista, Item, Miembro, Sugerencia, Yo, DbError, Lista, Estado, ColorPersona } from './types';
