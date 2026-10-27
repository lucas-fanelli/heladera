/**
 * El criterio sobre el ENV con el que Vite hornea el bundle: qué valores hacen que lo publicado NO sea la app
 * que la familia usa. Sin I/O y en un solo lugar: verificar-release.mjs corre la puerta, y deploy.mjs importa
 * de acá el dominio de hosting para armar la BASE que verifica en el aire.
 *
 * Por qué hace falta una puerta para esto: `.env` es el único input del release que NO está en git. Todo lo
 * demás que decide qué se publica (firebase.json, tokens.css, .firebaserc, vite.config.ts) está versionado y
 * por eso alguien lo mira — el diff, la revisión, las puertas. El `.env` no lo miraba nadie, y es el que
 * decide si el bundle habla con Firestore de verdad o con el Db falso de la lista de ejemplo. El agujero no
 * era hipotético: la salida de `apps:sdkconfig` que el README manda a correr trae las cuatro VITE_FIREBASE_*
 * y NO trae VITE_DB, y `.env.example` ships `VITE_DB=fake`. Y de las cuatro que sí trae, el authDomain viene
 * como `<proyecto>.firebaseapp.com`, que es justo el que rompe la cuenta permanente (D23): ver la regla de abajo.
 *
 * Casi cada regla espeja UNA línea del producto y la cita al lado: si esa línea cambia, esta tiene que
 * cambiar con ella. No es una copia de valores congelada acá — es el mismo criterio, mirado desde el otro
 * lado. La excepción es el AUTH_DOMAIN: ahí la línea espejada (`authDomain: env(…) ?? …`) no tiene opinión
 * sobre el valor, y el criterio viene de una DECISIÓN (D23) más la topología del deploy. Antes de escribir
 * una regla, la pregunta es «¿qué hace que este valor esté MAL?», no «¿qué mira el código que lo consume?».
 *
 * Las reglas están escritas a mano, pero el CONJUNTO no queda librado a la memoria de nadie: la lista nació
 * incompleta (enumeró las claves del incidente que la motivó y se dejó dos afuera), así que
 * tests/unit/env-release.test.ts deriva las VITE_* que el producto lee y exige que TODAS estén nombradas
 * acá. Si mañana aparece otra, ese test frena y hay que decidir: o se lleva su regla, o se la nombra en un
 * comentario diciendo por qué no lleva ninguna.
 */

/**
 * NUESTRO dominio de hosting, derivado del proyecto de `.firebaserc`: la MISMA autoridad de la que deploy.mjs
 * arma la BASE que después verifica en el aire. Un solo lugar — el día que haya dominio propio, se decide
 * (D23) y se cambia acá, no en dos archivos que se desincronizan en silencio.
 *
 * @param {string} proyecto  el projectId de .firebaserc
 * @returns {string}
 */
export const dominioDeHosting = (proyecto) => `${proyecto}.web.app`;

/**
 * Los problemas del env con el que `vite build` va a hornear el bundle, contra el proyecto de `.firebaserc`.
 * Array vacío = con ese env sale el release de verdad.
 *
 * @param env       lo que devuelve loadEnv('production', ROOT, 'VITE_'): los .env de la máquina más las
 *                  VITE_* exportadas en la terminal, que es exactamente lo que va a ver `vite build`
 * @param proyecto  el projectId de .firebaserc (el que manda en el deploy). Obligatorio: quien llama exige
 *                  que exista antes — sin él no hay contra qué comparar, y comparar contra undefined sería
 *                  aprobar en vacío.
 * @returns {string[]} un renglón por problema, el más consecuente primero
 */
export function problemasDeEnv(env, proyecto) {
  const problemas = [];

  // src/db/index.ts: `const cual = import.meta.env.VITE_DB ?? 'fake'` — cualquier valor que no sea
  // 'firestore' cae al Db en memoria, y el minificador se lleva puestos hasta los import() del SDK
  if (env.VITE_DB !== 'firestore') {
    problemas.push(`VITE_DB=«${env.VITE_DB ?? '(ausente)'}»: el bundle saldría con el Db FALSO (src/db/index.ts) — la familia abriría la lista de ejemplo, y lo que anote no se guarda en ningún lado ni se sincroniza entre teléfonos`);
  }

  // src/db/firebase.ts: `const emuladores = env('VITE_USE_EMULATORS') === 'true'`
  if (env.VITE_USE_EMULATORS === 'true') {
    problemas.push('VITE_USE_EMULATORS=true: el SDK del bundle publicado apuntaría a 127.0.0.1 (los emuladores de esta máquina), que en el teléfono de la familia no existen');
  }

  // src/app/router.ts: `import.meta.env.VITE_ROUTER === 'hash'`. OJO: se compara contra 'hash', NO contra
  // 'path' — el valor ausente ya rutea por path, así que exigir 'path' frenaría un env sano con un motivo
  // falso (y sería el criterio del router escrito acá con OTRA semántica que la de allá)
  if (env.VITE_ROUTER === 'hash') {
    problemas.push('VITE_ROUTER=hash: la app rutearía por #/l/<id> (src/app/router.ts) y los /l/<id> que la familia ya tiene guardados dejarían de abrir');
  }

  // el proyecto del bundle contra el proyecto del deploy: .firebaserc es la autoridad (deploy.mjs saca de ahí
  // la URL que después verifica en el aire), así que un bundle horneado contra otro proyecto se publicaría
  // igual y hablaría con la base de datos equivocada
  if (env.VITE_FIREBASE_PROJECT_ID !== proyecto) {
    problemas.push(`VITE_FIREBASE_PROJECT_ID=«${env.VITE_FIREBASE_PROJECT_ID ?? '(ausente)'}» y .firebaserc deploya a «${proyecto}»: el bundle publicado hablaría con otro proyecto — o, si está ausente, no abriría (crearFirebase() exige projectId)`);
  }

  // src/db/firebase.ts:crearFirebase() tira si falta alguna de estas (su env() descarta también las vacías):
  // el build sale igual, y la app muere al arrancar con las puertas en verde
  for (const clave of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID']) {
    if (!env[clave]?.trim()) {
      problemas.push(`${clave} vacía o ausente: crearFirebase() tira «Falta la configuración de Firebase» y la app no abre (src/db/firebase.ts)`);
    }
  }

  // Acá la regla NO espeja una línea de código: `authDomain: env('VITE_FIREBASE_AUTH_DOMAIN') ?? …`
  // (src/db/firebase.ts:crearFirebase()) no tiene opinión sobre el VALOR, y por eso el criterio hay que
  // traerlo de donde vive: D23 decide que el authDomain es NUESTRO dominio de hosting —el mismo del que
  // deploy.mjs arma BASE— porque el viaje de linkWithRedirect/signInWithRedirect tiene que ser same-origin
  // en la app publicada. Nada aguas abajo lo caza: crearFirebase() no lo exige, el candado del artefacto se
  // conforma con que el projectId aparezca (y «<proyecto>.firebaseapp.com» lo contiene), y la verificación
  // en el aire pide /__/auth/handler sobre BASE, no sobre el authDomain horneado en el bundle. Si esta
  // puerta solo mirara que no esté vacía, el valor que devuelve `npx firebase apps:sdkconfig` —el comando
  // que el README manda a correr— pasa entera y se publica con la cuenta permanente rota.
  const dominio = env.VITE_FIREBASE_AUTH_DOMAIN?.trim().toLowerCase();
  const esperado = dominioDeHosting(proyecto);
  if (dominio !== esperado.toLowerCase()) {
    problemas.push(`VITE_FIREBASE_AUTH_DOMAIN=«${dominio || '(ausente)'}» y la app se publica en «${esperado}»: tiene que ser ESE dominio. La lista abre igual, pero «guardar tu acceso con Google» (D23) redirige fuera de nuestro origen —o, si falta, ni arranca— y muere en los navegadores que particionan el almacenamiento de terceros. Ojo: «${proyecto}.firebaseapp.com» es lo que devuelve \`npx firebase apps:sdkconfig\`, el comando del README: ahí hay que poner «${esperado}»`);
  }

  // src/motion/tokens.ts:scale() y src/domain/timing.ts:scale(), la MISMA línea en los dos:
  //   `if (env !== undefined && env !== '') return Number(env); return 1;`
  // OJO, como con VITE_ROUTER: ausente —o vacía— YA es 1, así que frenar eso sería inventar un motivo. El
  // problema es un valor PRESENTE que el producto no leería como 1, incluido el NaN de cualquier texto.
  // Van al final porque son las menos consecuentes de la lista: con estas la app abre igual.
  for (const [clave, donde, queSeRompe] of [
    ['VITE_TIMING_SCALE', 'src/domain/timing.ts', 'todos los tiempos del dominio salen multiplicados por eso. Con 0, TOAST_MS y TOAST_VACIADO_MS quedan en 0: el toast se cerraría en el mismo tick y «Vaciar» se publicaría sin su Deshacer. Con el NaN de cualquier texto, salen NaN'],
    ['VITE_MOTION_SCALE', 'src/motion/tokens.ts', 'todas las animaciones salen multiplicadas por eso. Con 0 se publicaría una app sin una sola transición; con el NaN de cualquier texto, las duraciones salen NaN. En ningún caso son las que se calibraron en el teléfono (D21)'],
  ]) {
    const valor = env[clave];
    if (valor !== undefined && valor !== '' && Number(valor) !== 1) {
      problemas.push(`${clave}=«${valor}» (el producto multiplicaría por ${Number(valor)}, ${donde}): ${queSeRompe}. En el release va 1 o ausente — sacala de tu .env o de esta terminal`);
    }
  }

  return problemas;
}
