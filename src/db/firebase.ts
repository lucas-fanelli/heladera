/**
 * Inicialización de Firebase para el nivel B: app + Firestore (con caché persistente en el navegador) + Auth anónima
 * + la cuenta permanente (D23: guardar el acceso con Google, por redirección, sin cambiar el uid).
 * Es lo ÚNICO que sabe de VITE_FIREBASE_* y lo único que importa firebase/auth: el resto del módulo db recibe
 * una instancia de Firestore ya lista y las funciones de cuenta como opciones.
 *  - VITE_USE_EMULATORS=true → apunta a los emuladores locales (firebase emulators:start): no hace falta proyecto real.
 *  - `listo` se resuelve cuando hay un usuario anónimo (las reglas exigen request.auth != null). Si el sign-in falla
 *    (primera apertura sin señal), se reintenta solo, con espera creciente (1 s, 2 s, 4 s… hasta 30 s) y también
 *    apenas vuelve la conexión; mientras tanto las escrituras quedan detrás de `listo` (Firestore las aplica
 *    localmente recién ahí: sin eco local que después el servidor rechace) y `suscribir` da una Vista provisional.
 */
import { getApps, initializeApp, type FirebaseApp, type FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider, connectAuthEmulator, getAuth, getRedirectResult, linkWithRedirect, onAuthStateChanged,
  signInAnonymously, signInWithCredential, signInWithRedirect, type Auth, type AuthCredential,
} from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { cuentaDe } from '@/domain/cuenta';
import type { Cuenta } from './types';

export interface Firebase {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  /** hay usuario (anónimo o con cuenta): se puede leer/escribir */
  listo: Promise<void>;
  /** el uid de este teléfono, o null hasta que la auth resuelve. Es lo que gatea el acceso (D22). */
  miUid: () => string | null;
  /** el estado de la cuenta (D23): espera a la auth y al regreso de una redirección, si lo hubo */
  miCuenta: () => Promise<Cuenta>;
  /** ata el acceso a una cuenta de Google por redirección (la página se va; el resultado se ve al volver) */
  guardarCuenta: () => Promise<void>;
  /** entra con una cuenta ya guardada: este dispositivo pasa a ser esa identidad (otro uid) */
  entrarConCuenta: () => Promise<void>;
}

/** Emuladores: en node, directo a 127.0.0.1; en el navegador, a través del origen de la página (Vite los reenvía por
 *  path: ver PROXY_EMULADORES en vite.config.ts), así también llega un teléfono de la red local (dev:emu:lan). */
const EMULADOR = { host: '127.0.0.1', firestore: 8080, auth: 9099 } as const;
function destinoEmuladores(): { firestore: { host: string; port: number }; auth: string } {
  if (typeof location !== 'undefined' && location.hostname && location.port) {
    return { firestore: { host: location.hostname, port: Number(location.port) }, auth: `${location.protocol}//${location.host}` };
  }
  return { firestore: { host: EMULADOR.host, port: EMULADOR.firestore }, auth: `http://${EMULADOR.host}:${EMULADOR.auth}` };
}
/** reintentos del sign-in anónimo: espera inicial y tope (se duplica en cada fallo) */
const REINTENTO_MS = { inicial: 1000, tope: 30000 } as const;

function env(nombre: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[nombre];
  return v && v.trim() !== '' ? v : undefined;
}

export function crearFirebase(): Firebase {
  const emuladores = env('VITE_USE_EMULATORS') === 'true';
  const config = {
    apiKey: env('VITE_FIREBASE_API_KEY') ?? (emuladores ? 'demo' : undefined),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN') ?? (emuladores ? 'localhost' : undefined),
    projectId: env('VITE_FIREBASE_PROJECT_ID') ?? (emuladores ? 'demo-heladera' : undefined),
    appId: env('VITE_FIREBASE_APP_ID') ?? (emuladores ? 'demo' : undefined),
  };
  if (!config.projectId || !config.apiKey || !config.appId) {
    throw new Error('Falta la configuración de Firebase (VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID) — ver .env.example');
  }
  const app = getApps()[0] ?? initializeApp(config);

  // caché persistente (IndexedDB) si el entorno la soporta: la lista abre sin señal y la cola de escrituras sobrevive
  // a cerrar la app; multi-tab para que dos pestañas del mismo teléfono/PC compartan la caché
  const enNavegador = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  const db = initializeFirestore(app, {
    localCache: enNavegador ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : memoryLocalCache(),
  });
  const auth = getAuth(app);
  if (emuladores) {
    const destino = destinoEmuladores();
    connectFirestoreEmulator(db, destino.firestore.host, destino.firestore.port);
    connectAuthEmulator(auth, destino.auth, { disableWarnings: true });
  }

  // ---------- la cuenta permanente (D23) ----------
  // El regreso de una redirección de Google se procesa UNA vez, acá. Dos finales posibles:
  //  - guardarCuenta salió bien → el usuario quedó vinculado (MISMO uid): no hay nada más que hacer;
  //  - la cuenta elegida ya guarda otro acceso → credential-already-in-use. Guardamos la credencial que viene
  //    en el error: así "entrar con esa cuenta" (si el usuario acepta el cambio de identidad) no necesita
  //    otro viaje a Google. Vive en memoria: si recarga sin decidir, la oferta se pierde y no pasa nada.
  let choque: { credencial: AuthCredential; email: string | null } | null = null;
  const regreso: Promise<void> = getRedirectResult(auth).then(
    () => undefined,
    (err: unknown) => {
      const e = err as { code?: string; customData?: { email?: string } };
      const credencial = e.code === 'auth/credential-already-in-use' ? GoogleAuthProvider.credentialFromError(err as FirebaseError) : null;
      if (credencial) choque = { credencial, email: e.customData?.email ?? null };
      else console.warn('[firebase] el regreso de Google falló', err);
    },
  );

  const listo = new Promise<void>(resolve => {
    let intentando = false;
    let espera: number = REINTENTO_MS.inicial;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ultimoCodigo: string | null = null;
    const cancelarReintento = (): void => { if (timer) { clearTimeout(timer); timer = null; } };
    const entrar = (): void => {
      if (intentando || auth.currentUser) return;
      cancelarReintento();                 // si venía un reintento programado (p. ej. volvió la señal antes), va ahora
      intentando = true;
      // nunca por encima de un regreso de Google a medio procesar: un anónimo nuevo acá pisaría esa sesión
      // (getAuth ya ordena el primer onAuthStateChanged después del regreso; esto cubre el evento 'online')
      regreso.then(() => (auth.currentUser ? null : signInAnonymously(auth))).then(
        () => { espera = REINTENTO_MS.inicial; ultimoCodigo = null; },
        (err: unknown) => {
          // sin señal (o el backend no contesta, o la auth anónima está deshabilitada en la consola): reintentamos
          // con espera creciente; avisamos por consola una vez por tipo de fallo para no quedar mudos
          const codigo = typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : String(err);
          if (codigo !== ultimoCodigo) { ultimoCodigo = codigo; console.warn(`[firebase] no pude entrar (${codigo}); reintento en ${espera} ms`); }
          timer = setTimeout(() => { timer = null; entrar(); }, espera);
          espera = Math.min(espera * 2, REINTENTO_MS.tope);
        },
      ).finally(() => { intentando = false; });
    };
    onAuthStateChanged(auth, user => { if (user) { cancelarReintento(); resolve(); } else entrar(); });
    if (typeof window !== 'undefined') window.addEventListener('online', entrar);
  });

  // Google con selector de cuenta: sin `select_account`, Google entra derecho con la última sesión, y en un
  // dispositivo compartido eso guarda el acceso en la cuenta equivocada sin preguntar.
  const proveedor = (): GoogleAuthProvider => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  };

  const miCuenta = async (): Promise<Cuenta> => {
    await listo;
    await regreso;
    const u = auth.currentUser;
    return cuentaDe(
      u ? { anonimo: u.isAnonymous, email: u.email ?? u.providerData.find(p => p.email)?.email ?? null } : null,
      choque && { email: choque.email },
    );
  };

  const guardarCuenta = async (): Promise<void> => {
    await listo;
    await regreso;
    // linkWithRedirect NAVEGA: en la práctica no vuelve. Si tira antes de irse (sin señal), la promesa rechaza
    // y la UI lo cuenta; el choque pendiente (si lo había) se conserva para que la oferta de entrar siga en pie.
    await linkWithRedirect(auth.currentUser!, proveedor());
  };

  const entrarConCuenta = async (): Promise<void> => {
    await listo;
    await regreso;
    if (choque) {
      // la credencial del choque: el usuario ya eligió la cuenta en Google, no lo mandamos de nuevo
      try {
        await signInWithCredential(auth, choque.credencial);
        choque = null;
        return;
      } catch (err) {
        const codigo = typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : '';
        if (codigo === 'auth/network-request-failed') throw err;   // sin señal: la credencial sigue buena, se reintenta
        // credencial muerta: el token de Google vive ~1 h y esto es memoria de página (pudo pasar la tarde en
        // segundo plano). Reintentarla sería un bucle de error sin salida — se descarta y cae al viaje completo,
        // donde el usuario re-elige la cuenta en Google y entra igual. (Lo cazó la revisión.)
        choque = null;
      }
    }
    await signInWithRedirect(auth, proveedor());
  };

  return { app, db, auth, listo, miUid: () => auth.currentUser?.uid ?? null, miCuenta, guardarCuenta, entrarConCuenta };
}
