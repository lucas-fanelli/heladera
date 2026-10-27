/**
 * La fuente de verdad sobre el ARTEFACTO publicado, compartida por verificar-release.mjs y deploy.mjs:
 *  - qué archivos publica hosting (recorrer dist/ menos el `ignore` real de firebase.json);
 *  - qué Cache-Control le corresponde a cada uno (la política) y cuál le da la config (firebase.json);
 *  - por qué URL entra la familia (`/l/<listId>`, que no es ningún archivo) y adónde la manda el rewrite;
 *  - a qué PROYECTO va ese release (`.firebaserc`), que es de dónde salen la URL del aire y el candado de
 *    identidad del artefacto.
 *
 * Está acá, exportado y con tests (tests/unit/dist-publicado.test.ts), porque el circuito de auditorías
 * encontró TRES veces la misma enfermedad en versiones anteriores: criterio inline, duplicado o traducido a
 * mano, que envejece y miente — la lista de archivos enumerada (se olvidaba de registerSW.js), la traducción
 * glob-a-regex que se corrompía a sí misma (el doble asterisco quedaba cubriendo un nivel), y una heurística
 * de «hash en el nombre» que clasificaba dos íconos como inmutables y hacía fallar la verificación de TODOS
 * los deploys (seis firmas convergieron en eso, a ciegas).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La salida que este espejo ofrece cada vez que se rehúsa a modelar una forma de firebase.json, escrita UNA
 * vez: la usan destinosDeRewrite, headerSegunPedido y configHosting. Estaba copiada literal en cada mensaje
 * —el mismo criterio duplicado que este archivo ya persigue en todo lo demás—, así que el día que la salida
 * cambie (otro comando, otro documento) no puede quedar la mitad diciendo lo viejo. Mismo patrón que el
 * COMO_VOLVER de proyectoDelRelease.
 */
const COMO_EXTENDER = 'extendé dist-publicado.mjs CON test antes de deployar esa forma';

/**
 * Traduce un glob de firebase.json a RegExp. Cubre lo que nuestra config usa: literales, `*`, `**` (con y
 * sin barra). Cualquier otra sintaxis (extglob, llaves, `?`, clases) TIRA en vez de traducirse mal en
 * silencio: la deriva muda es la peor dirección (un archivo publicado sin custodia).
 */
export function globARegex(patron) {
  const conMarcas = patron.replaceAll('**/', '<GLOBSTAR/>').replaceAll('**', '<GLOBSTAR>').replaceAll('*', '<STAR>');
  const resto = conMarcas.replaceAll('<GLOBSTAR/>', '').replaceAll('<GLOBSTAR>', '').replaceAll('<STAR>', '');
  if (/[?[\]{}()!+@]/.test(resto)) throw new Error(`glob no soportado por el traductor del circuito: «${patron}» — agregalo a dist-publicado.mjs CON test antes de usarlo`);
  const cuerpo = conMarcas
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('<GLOBSTAR/>', '(?:.*/)?')
    .replaceAll('<GLOBSTAR>', '.*')
    .replaceAll('<STAR>', '[^/]*');
  return new RegExp(`^${cuerpo}$`);
}

/**
 * ¿El ARCHIVO `rel` queda afuera del release según estos patrones? Fiel al mecanismo REAL de firebase-tools:
 * su listFiles usa glob con la opción `ignore` (no minimatch con matchBase), y ahí TODOS los patrones se
 * comparan contra el camino completo — uno sin barra ancla SOLO en la raíz ('firebase.json' excluye el de la
 * raíz y publica 'subcarpeta/firebase.json'). El circuito cazó dos semánticas equivocadas antes que esta:
 * por segmento (excluía de más) y por basename (ídem) — la dirección muda, un publicado sin custodia.
 */
export function ignoradoPor(patrones) {
  const regexes = patrones.map(globARegex);
  return (rel) => regexes.some(re => re.test(rel));
}

/**
 * Los ignores que firebase-tools agrega SIEMPRE por su cuenta (lib/listFiles.js), espejados acá porque el
 * deploy no puede depender de parsear un archivo compilado de una dependencia: un refactor río arriba
 * abortaría el release en vez de dar una señal barata. Lo que ata la copia a la versión instalada (está con
 * caret) es tests/unit/dist-publicado.test.ts, que los lee de node_modules y exige igualdad: un bump que los
 * cambie sale rojo ahí —antes del build y del deploy— y no como un «DIFIERE» falso en pleno deploy, que
 * manda al operador a esperar una propagación que no existe y a un rollback que no arregla nada.
 * Si el traductor propio alguna vez estorba, la salida es usar `glob` (viene con firebase-tools) tal cual lo
 * usa listFiles — pero eso es un cambio de diseño, con su vuelta de circuito.
 */
export const IGNORES_DE_FIREBASE_TOOLS = ['**/firebase-debug.log', '**/firebase-debug.*.log', '.firebase/*'];

/**
 * La POLÍTICA de caché, anclada a la estructura del build (invariante de Vite), no a la forma del nombre:
 * en assets/ vive TODO lo hasheado (inmutable por construcción) y el runtime de workbox sale hasheado en la
 * raíz; el resto se sirve con revalidación SIEMPRE — sin no-cache, el shell viejo queda clavado una hora en
 * los teléfonos (pasó: el incidente del index viejo, D24).
 */
export function cachePolitica(rel) {
  return rel.startsWith('assets/') || /^workbox-[0-9a-f]+\.js$/.test(rel) ? 'immutable' : 'no-cache';
}

/**
 * En qué path se PIDE el archivo `rel`: con cleanUrls el index vive en «/» y cualquier otro .html en su
 * URL sin extensión — pero como este espejo solo modela el caso del index (no hay otro .html en el build),
 * un .html nuevo TIRA en vez de modelarse mal en silencio. Compartido entre el espejo de headers y el fetch
 * del aire: el mapeo duplicado en dos archivos era otra copia que envejece (hallazgo del circuito).
 */
export function pathDePedido(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('.html')) throw new Error(`cleanUrls sirve «${rel}» en otra URL y este espejo solo modela el index — agregá el caso a pathDePedido() CON test antes de publicar otro .html`);
  return `/${rel}`;
}

/**
 * Qué valor declaran estos bloques de headers para el PATH DE PEDIDO dado y la clave dada (o null si ninguno).
 * Reproduce la semántica verificada contra hosting real: de las reglas cuyo `source` matchea, la ÚLTIMA con
 * la clave gana.
 *
 * Es por PEDIDO y no por archivo porque no todo lo que hosting sirve ES un archivo: `/l/<listId>` —la URL por
 * la que entra la familia— lo fabrica el rewrite y también recibe headers. Toda la custodia de headers estaba
 * escrita del lado archivo de ese seam, así que un bloque nuevo tipo `/l/**` podía servir el deep link
 * cacheado una hora (el incidente de D24) y filtrar el listId por Referer con las seis puertas en verde.
 *
 * Un bloque con otra forma (`regex`, que hosting acepta) TIRA nombrándola, como su hermano destinosDeRewrite:
 * sin esto la corrida moría igual —cerrado, que está bien— pero con el «Cannot read properties of undefined
 * (reading 'replaceAll')» crudo que puerta() promete traducir, o sea sin decirle al operador qué miró ni qué
 * hacer.
 */
export function headerSegunPedido(bloques, pedido, clave) {
  const buscada = clave.toLowerCase();
  let valor = null;
  for (const b of bloques) {
    if (typeof b?.source !== 'string') throw new Error(`firebase.json tiene un bloque de \`hosting.headers\` que este espejo no modela (espera {source} string; «regex» no está cubierto): ${JSON.stringify(b)} — ${COMO_EXTENDER}`);
    if (!globARegex(b.source).test(pedido)) continue;
    const h = (b.headers ?? []).find(x => x.key.toLowerCase() === buscada);
    if (h) valor = h.value;
  }
  return valor;
}

/**
 * Lo mismo para el ARCHIVO `rel`: el match es contra el path del PEDIDO, no del archivo — con cleanUrls el
 * index se pide en «/», así que una regla con source «/index.html» no le aplica nunca (ese fue exactamente el
 * bug del no-cache que jamás rigió, D24: este espejo tiene que fallar igual que hosting para poder custodiarlo).
 */
export function headerSegunReglas(bloques, rel, clave) { return headerSegunPedido(bloques, pathDePedido(rel), clave); }

export function cacheSegunReglas(bloques, rel) { return headerSegunReglas(bloques, rel, 'cache-control'); }

/**
 * El path por el que entra la familia: la app se reparte por el link de la lista (`/l/<listId>`) y ese path
 * NO existe como archivo — lo fabrica el rewrite SPA de firebase.json. Vive acá, en un solo lugar, porque lo
 * usan las dos puntas (la puerta de config de verificar-release.mjs y el pedido real de deploy.mjs) y una
 * copia en cada script sería el mismo criterio duplicado que ya envejeció otras veces en este circuito.
 * El id de mentira matchea el LIST_ID_RE de src/app/router.ts: si alguien lo pide de verdad, la app lo rutea
 * como una lista (vacía) en vez de romper.
 */
export const RUTA_SPA_DE_PRUEBA = '/l/verificacion-de-deploy';

/**
 * Los `destination` de TODAS las reglas de rewrite cuyo `source` matchea `pedido` (vacío = ninguna matchea,
 * o sea: hosting contesta ese path con un 404).
 *
 * Devuelve TODOS los matcheantes y no «el primero» a propósito: hosting resuelve rewrites por la primera
 * regla que matchea, pero esa semántica NO la verificó empíricamente este circuito —la que sí se verificó es
 * la de headers, y es la contraria (gana la última)—, así que exigir que TODOS los matcheantes vayan al mismo
 * lado es lo único correcto bajo cualquiera de los dos órdenes. Codear contra un orden asumido es la
 * enfermedad de suponer la semántica; si mañana hace falta distinguirlos, primero se verifica y después se
 * codea.
 *
 * Una regla con otra forma (`regex`, `function`, `run`, `dynamicLinks`) TIRA en vez de contarse como «no
 * matchea» —que sería aprobar en vacío—: la misma postura de globARegex, pathDePedido y configHosting.
 */
export function destinosDeRewrite(rewrites, pedido) {
  if (!Array.isArray(rewrites)) throw new Error(`firebase.json tiene un \`hosting.rewrites\` que no es una lista de reglas (${JSON.stringify(rewrites)}): hosting espera un array — corregilo antes de deployar`);
  const destinos = [];
  for (const r of rewrites) {
    if (typeof r?.source !== 'string' || typeof r?.destination !== 'string') {
      throw new Error(`firebase.json tiene un rewrite que este espejo no modela (espera {source, destination} strings; «regex», «function», «run» y «dynamicLinks» no están cubiertos): ${JSON.stringify(r)} — ${COMO_EXTENDER}`);
    }
    if (globARegex(r.source).test(pedido)) destinos.push(r.destination);
  }
  return destinos;
}

/** Los headers de seguridad que TODO lo servido tiene que llevar: la política, en un solo lugar. */
export const HEADERS_SEGURIDAD = { 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };

/** El directorio que hosting publica, según firebase.json — para que ningún script lo hardcodee. */
export function directorioPublicado(root) { return configHosting(root).public; }

/**
 * Las claves de `hosting` que este espejo modela, UNA por cada lector de este archivo: `public`
 * (directorioPublicado), `ignore` (ignoradoSegunConfig), `rewrites` (destinosDeRewrite), `headers`
 * (headerSegunPedido) y `cleanUrls` (la semántica que asume pathDePedido). Cualquier otra clave hosting la
 * honra IGUAL y no la mira NADIE — y eso no es una laguna teórica: `redirects` se evalúa ANTES que los
 * archivos estáticos y que los rewrites, así que se lleva `/l/<listId>` —la única URL por la que entra la
 * familia, con el listId (la llave) viajando en el path del 301— mientras la puerta del deep link, que solo
 * lee `hosting.rewrites`, firma verde. Probado con veneno sobre el repo real: con un bloque `redirects`
 * puesto, `verificar-release.mjs --solo-dist` salía VERDE ENTERO y el desvío se descubría recién en el aire,
 * con el deploy ya publicado.
 *
 * Y la forma puede volver: el único `redirects` que este repo tuvo en su vida fue el `/h` que regalaba el
 * listId a quien pidiera una URL de dos caracteres, y que colapsó el modelo de acceso entero (D22) — pero
 * `.env.example` y scripts/qr.mjs todavía nombran esa URL.
 *
 * Se enumera a mano porque es la frontera de lo MODELADO (no hay fuente de verdad de la que derivarla: es
 * qué lectores se escribieron acá), y por eso el riesgo es que envejezca al revés —más angosta que la config
 * real, frenando un deploy sano—. Contra eso está el test que corre `directorioPublicado(process.cwd())`
 * sobre el firebase.json REAL: sacar una clave de acá lo pone rojo antes de cualquier deploy.
 */
const CLAVES_MODELADAS = ['public', 'ignore', 'cleanUrls', 'rewrites', 'headers'];

/**
 * La forma de hosting que este espejo modela: UN sitio, objeto con `public` string y NADA fuera de
 * CLAVES_MODELADAS. Cualquier otra forma válida para firebase-tools (multi-sitio en array, `source`) o
 * cualquier clave que este espejo no lea TIRA en vez de degradar a auditar dist/ con ignore vacío —o a
 * auditar un release que hosting va a servir de otra manera— como si nada: un espejo que se rehúsa, no uno
 * que aprueba en vacío (misma postura que globARegex y pathDePedido).
 *
 * Es la ÚNICA función que ve el objeto `hosting` entero, así que la custodia de la FORMA le toca a ella: la
 * postura «lo que no modelo, tira» estaba aplicada por lector (una clave por vez) y nunca al objeto, o sea
 * que el conjunto modelado se definía por qué lectores existían y no por qué honra hosting.
 */
function configHosting(root) {
  const hosting = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8')).hosting;
  if (typeof hosting !== 'object' || hosting === null || Array.isArray(hosting) || typeof hosting.public !== 'string') {
    throw new Error(`firebase.json tiene un hosting que este espejo no modela (espera UN sitio: objeto con «public» string; multi-sitio en array o «source» no están cubiertos) — ${COMO_EXTENDER}`);
  }
  const ajenas = Object.keys(hosting).filter(k => !CLAVES_MODELADAS.includes(k));
  if (ajenas.length > 0) {
    throw new Error(`firebase.json tiene claves en \`hosting\` que este espejo no modela (${ajenas.map(k => `«${k}»`).join(', ')}; modela ${CLAVES_MODELADAS.join(', ')}): hosting las honra igual y ninguna puerta las mira — el caso peor es \`redirects\`, que se resuelve ANTES que los archivos y que los rewrites, así que puede llevarse «${RUTA_SPA_DE_PRUEBA}» (la única URL por la que entra la familia, con el listId adentro) a otro lado sin que nada se entere hasta el aire, con el deploy ya publicado. Si la clave la agregaste a propósito, no hay nada que restaurar: hay que decidirla — ${COMO_EXTENDER}`);
  }
  return hosting;
}

/**
 * A qué proyecto se deploya el release: `.firebaserc`, la autoridad ÚNICA de los dos scripts (la URL del aire
 * de deploy.mjs y el candado de identidad del artefacto de verificar-release.mjs). Vive acá —la casa del
 * criterio compartido, como directorioPublicado— porque estaba escrito dos veces y ya había divergido: el
 * MISMO `.firebaserc` roto daba dos diagnósticos distintos según qué comando corriera el operador, y el de
 * verificar-release ni nombraba el archivo ni decía cómo se vuelve (hallazgo del circuito).
 *
 * TIRA nombrando el archivo y la salida —nunca devuelve un falsy de fallback—; quien llama solo le pone su
 * formato de aborto («ABORTADO:» / «NO SE DEPLOYA:»).
 */
export function proyectoDelRelease(root) {
  const COMO_VOLVER = 'restauralo (`git checkout -- .firebaserc`) o corré `npx firebase use <projectId>`';
  // el existsSync se conserva a propósito: el archivo AUSENTE es otro diagnóstico (un clon que todavía no
  // corrió `firebase use`), y ahí no hay nada que restaurar
  if (!existsSync(join(root, '.firebaserc'))) throw new Error('no hay .firebaserc — ¿este clon todavía no corrió `firebase use`? De ahí sale el proyecto al que se deploya: `npx firebase use <projectId>`');
  let config;
  try {
    config = JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8'));
  } catch (e) {
    throw new Error(`no se pudo leer .firebaserc (${e?.message ?? e}) — de ahí sale el proyecto al que se deploya: ${COMO_VOLVER}`);
  }
  const proyecto = config?.projects?.default;
  if (typeof proyecto !== 'string' || !proyecto) throw new Error(`no hay proyecto default en .firebaserc — de ahí sale el proyecto al que se deploya: ${COMO_VOLVER}`);
  return proyecto;
}

function todosLosArchivos(root) {
  const out = [];
  const caminar = (dir, prefijo) => {
    for (const nombre of readdirSync(dir)) {
      const abs = join(dir, nombre);
      const rel = prefijo ? `${prefijo}/${nombre}` : nombre;
      if (statSync(abs).isDirectory()) caminar(abs, rel);
      else out.push(rel);
    }
  };
  // el directorio publicado también sale de firebase.json (hosting.public): el espejo que lee el ignore
  // real pero hardcodea el directorio era medio espejo
  caminar(join(root, directorioPublicado(root)), '');
  return out.sort();
}

const ignoradoSegunConfig = (root) => ignoradoPor([
  ...(configHosting(root).ignore ?? []),
  ...IGNORES_DE_FIREBASE_TOOLS,
]);

/** Los paths (relativos a dist/, con /) que `firebase deploy` va a publicar. `root` = la raíz del repo. */
export function archivosPublicados(root) {
  const ignorado = ignoradoSegunConfig(root);
  return todosLosArchivos(root).filter(rel => !ignorado(rel));   // se filtran ARCHIVOS, como firebase-tools
}

/**
 * Lo que este espejo predice que NO se publica (hoy: los sourcemaps). La verificación en el aire lo usa
 * para el chequeo NEGATIVO — pedirlos y exigir que el servidor no los tenga: es el candado empírico, en
 * cada deploy, contra una deriva entre este espejo y el listFiles real de firebase-tools (que se verificó
 * una vez a mano, pero firebase-tools está con caret y puede cambiar abajo nuestro).
 */
export function archivosIgnorados(root) {
  const ignorado = ignoradoSegunConfig(root);
  return todosLosArchivos(root).filter(ignorado);
}

/**
 * ¿La referencia `u` la sirve ESTE hosting? Quedan afuera las absolutas y las de cualquier otro esquema
 * (https:, //cdn, data:, blob:): pedirle a `publicables` un `https://…` sería un rojo falso.
 *
 * Exportado —y no una copia en cada llamador— porque lo usan las dos puntas: imprescindiblesDelDist() acá
 * abajo, para armar el conjunto, y la puerta de la hoja publicada de verificar-release.mjs, para exigir al
 * menos una `@font-face` con `url()` propia. El mismo criterio escrito dos veces es la enfermedad que este
 * archivo ya vio envejecer tres veces.
 */
export const esLocal = (u) => !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u);

/**
 * Las referencias `url(...)` que declara una hoja de estilos, tal cual las escribe (el filtro `local()` y la
 * normalización quedan afuera, igual que con los <script> y los <link>). Exportada —y no una regex inline—
 * porque el ancla contra el dist real la necesita: un test que la copiara sería el criterio duplicado que
 * este circuito ya vio envejecer tres veces.
 */
export function urlsDeCss(css) {
  // el `.trim()` no es cosmético: la clase `[^'")]+` es golosa y se come los espacios de `url( /a.png )`
  // (el `\s*` de la derecha no puede recuperarlos), y un path con un espacio pegado no matchea NUNCA contra
  // los publicables — o sea, la referencia se caería del conjunto en silencio, que es el bug de al lado
  return [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(m => m[1].trim());
}

/**
 * Lo que el release NO PUEDE dejar de publicar, DERIVADO del artefacto (jamás enumerado a mano): el index,
 * todo lo que el index carga (<script src>, <link rel=stylesheet|manifest>), las `url()` locales que declara
 * esa hoja (la tipografía), la cadena de arranque del service worker (registerSW.js -> el sw que registra ->
 * el chunk de workbox que ese sw importa) y las URLs de su precache. `dist` es el directorio publicado,
 * absoluto.
 *
 * Existe porque `hosting.ignore` decide qué se PUBLICA y —como todas las puertas del artefacto iteran
 * `archivosPublicados`— decidía también qué se AUDITA: agregarle una entrada apagaba la custodia de lo que
 * nombra, sin que nada preguntara nunca en la dirección contraria («esto TIENE que estar publicado»).
 * Probado con veneno sobre el dist real: con `index.html`, `sw.js` o `registerSW.js` en el ignore, TODAS las
 * puertas salían verdes y la verificación en el aire firmaba «verificado» sobre un release sin shell o sin
 * service worker (lo que falta ni se pide, y el rewrite catch-all contesta 200 por él). Es la enfermedad de
 * «aprobar en vacío» un piso más arriba: no una puerta sin nada que mirar, sino el CONJUNTO entero.
 *
 * Falla CERRADO donde no leer significa perder custodia de verdad: si el index no declara ningún <script
 * src> (o sea: se rompió el index, o se rompió esta lectura) y si el sw existe con un precache ilegible (son
 * 18 URLs saliendo del conjunto en silencio). Devolver un conjunto corto sin decir nada sería exactamente la
 * enfermedad que esta función cura, un piso más abajo.
 */
export function imprescindiblesDelDist(dist) {
  const hay = (rel) => existsSync(join(dist, rel));
  const leer = (rel) => readFileSync(join(dist, rel), 'utf8');
  /** de referencia del navegador a path relativo al dist, como los que lista `archivosPublicados` */
  const norm = (u) => u.split(/[?#]/)[0].replace(/^\.?\//, '');
  const req = new Set(['index.html']);

  const index = leer('index.html');
  const scripts = [...index.matchAll(/<script[^>]*>/g)]
    .map(tag => tag[0].match(/src="([^"]+)"/)?.[1])
    .filter(src => src && esLocal(src));
  if (scripts.length === 0) throw new Error('el index del dist no carga NINGÚN <script src>: o el build cambió de forma o el index está roto — averiguá cuál de las dos antes de publicar (así, la app no arranca)');
  // rel y href se extraen POR SEPARADO del tag, como en la puerta de los <link> de verificar-release.mjs:
  // una regex que exigiera un orden de atributos se apagaría en silencio si el build los reordena
  const links = [...index.matchAll(/<link[^>]*>/g)]
    .map(tag => ({ rel: tag[0].match(/rel="([^"]+)"/)?.[1], href: tag[0].match(/href="([^"]+)"/)?.[1] }));
  const hojas = links.filter(l => l.rel === 'stylesheet' || l.rel === 'manifest').map(l => l.href);
  const referidas = [...scripts, ...hojas].filter(u => u && esLocal(u)).map(norm);
  for (const u of referidas) req.add(u);

  // …y lo que la HOJA declara adentro: las woff2 de la tipografía (--font-display / --font-body) no las
  // nombra ninguna otra referencia del artefacto. Entraban al conjunto de casualidad, por el precache del sw
  // (el `globPatterns` de vite.config.ts las barre): la custodia de la tipografía la sostenía la config de
  // OTRO subsistema, y angostar ese glob la apagaba en silencio. Probado con veneno sobre el dist real: sin
  // las fuentes en el precache y con `assets/*.woff2` en el ignore, la puerta salía VERDE con las cinco
  // afuera del release — y el rewrite catch-all contesta esos paths con el index (200, no 404), así que el
  // navegador recibe HTML donde espera un woff2 y las dos pantallas caen a Georgia / system-ui.
  // El `hay()` es a propósito, como el del sw: si la hoja no está, ya entró al conjunto acá arriba y la
  // puerta la nombra con el resto — abrirla igual sería un ENOENT crudo apuntando al culpable equivocado.
  // Que una hoja no declare NINGUNA `url()` no tira: una hoja sin assets es legítima, y frenar el release
  // por eso es el mismo exceso que el registerSW.js ilegible de abajo. La exigencia de CANTIDAD (al menos
  // una `@font-face` con `url()` propia) vive en la puerta de la hoja publicada de verificar-release.mjs.
  // Antes decía «va en el test contra el dist real, que es donde vale», y eso era correcto en criterio y nulo
  // en el tiempo: ese test (tests/unit/dist-publicado.test.ts) corre en la puerta 3 y el build es la puerta
  // 5, así que su sujeto es el dist ANTERIOR — el release malo salía verde y el rojo aparecía recién en la
  // corrida siguiente, y bajo `--solo-dist` ni corría. El test se queda igual (es el ancla contra el dist
  // real); lo que se mudó es la custodia del release que se está por publicar.
  for (const hoja of referidas.filter(rel => rel.endsWith('.css') && hay(rel))) {
    for (const u of urlsDeCss(leer(hoja))) if (esLocal(u)) req.add(norm(u));
  }

  // registerSW.js ya entra por el <script src> del index; leerlo sirve para lo OTRO: enterarse de cómo se
  // llama el service worker cuando no es «sw.js». Que no se pueda leer NO tira, y a propósito: el sw también
  // se pinnea solo (abajo), y verificar-release.mjs ya revienta una puerta antes si dist/sw.js no está.
  if (hay('registerSW.js')) req.add('registerSW.js');
  const registrado = hay('registerSW.js')
    ? leer('registerSW.js').match(/serviceWorker\.register\(\s*['"]([^'"]+)['"]/)?.[1]
    : null;
  const sw = registrado && esLocal(registrado) ? norm(registrado) : (hay('sw.js') ? 'sw.js' : null);

  // si el registrador nombra un sw que el build no emitió, que lo reporte la puerta (con el resto de lo que
  // falta y su mismo mensaje), no un throw suelto acá
  if (sw) req.add(sw);
  if (sw && hay(sw)) {
    const src = leer(sw);
    // el chunk de workbox que el sw importa, sacado del propio sw (define([...])) y no de una lista: es
    // LITERALMENTE la pieza que la enumeración a mano ya se olvidó una vez (D24). El «.js» lo agrega el
    // loader del sw (new URL(i + ".js", …)): se espeja el mecanismo real, no se adivina el nombre.
    const deps = [...(src.match(/define\(\[([^\]]*)\]/)?.[1] ?? '').matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const d of deps) if (esLocal(d)) req.add(`${norm(d)}.js`);
    // el precache no es cosmético: una URL precacheada que hosting NO sirve rompe el install del service
    // worker («bad-precaching-response») y deja colgada a la app instalada — el único lugar donde eso se ve
    const bloque = src.match(/precacheAndRoute\(\[(.*?)\]\s*[,)]/s)?.[1];
    if (bloque === undefined) throw new Error(`${sw} no tiene un precacheAndRoute legible: no se puede saber qué URLs precachea, y una precacheada que hosting no sirve rompe el install del service worker («bad-precaching-response») en la app instalada — extendé imprescindiblesDelDist() CON test antes de publicar este sw`);
    const urls = [...bloque.matchAll(/["']?url["']?\s*:\s*["']([^"']+)["']/g)].map(m => m[1]);
    if (urls.length === 0) throw new Error(`el precacheAndRoute de ${sw} no declara NINGUNA URL: o el build cambió de forma o el precache quedó vacío (y un precache vacío deja a la app instalada sin nada offline)`);
    for (const u of urls) if (esLocal(u)) req.add(norm(u));
  }

  return [...req].sort();
}
