/**
 * El traductor glob→regex que decide QUÉ archivos publica hosting (scripts/dist-publicado.mjs) es el
 * keystone de la verificación en el aire y del escaneo de nombres: si excluye de más, un archivo publicado
 * queda sin custodia (la dirección muda); si excluye de menos, la verificación pide algo que hosting no
 * sirve y el rewrite catch-all fabrica un «DIFIERE» falso en pleno deploy. La primera versión se corrompía
 * a sí misma (los replace encadenados se pisaban y «**» cubría un solo nivel) y lo cazó el circuito de
 * auditorías: estos tests fijan la semántica con los patrones REALES del ignore de firebase.json.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — módulo .mjs de scripts/, sin tipos: acá solo importa su comportamiento
import { HEADERS_SEGURIDAD, IGNORES_DE_FIREBASE_TOOLS, RUTA_SPA_DE_PRUEBA, cachePolitica, cacheSegunReglas, destinosDeRewrite, directorioPublicado, globARegex, headerSegunPedido, headerSegunReglas, ignoradoPor, imprescindiblesDelDist, pathDePedido, proyectoDelRelease, urlsDeCss } from '../../scripts/dist-publicado.mjs';

// el ignore REAL, leído de firebase.json: una copia congelada acá dejaría de custodiar lo que de verdad
// rige el release apenas alguien edite la config (hallazgo del circuito)
const CONFIG = JSON.parse(readFileSync(join(process.cwd(), 'firebase.json'), 'utf8'));
const IGNORE_REAL: string[] = CONFIG.hosting.ignore;

describe('globARegex', () => {
  it('«**/» cubre CUALQUIER cantidad de niveles, incluso ninguno (el bug original lo dejaba en uno)', () => {
    const re = globARegex('**/*.map');
    expect(re.test('c.map')).toBe(true);
    expect(re.test('assets/c.map')).toBe(true);
    expect(re.test('a/b/c/d.map')).toBe(true);
    expect(re.test('c.mapx')).toBe(false);
  });

  it('«**» en el medio cruza barras; «*» solo no', () => {
    expect(globARegex('**/node_modules/**').test('x/node_modules/a/b.js')).toBe(true);
    expect(globARegex('**/node_modules/**').test('node_modules/a/b.js')).toBe(true);
    expect(globARegex('*.map').test('a/c.map')).toBe(false);   // sin doble asterisco, la barra corta
  });

  it('escapa los metacaracteres de regex del patrón (el punto no es comodín)', () => {
    expect(globARegex('firebase.json').test('firebase.json')).toBe(true);
    expect(globARegex('firebase.json').test('firebasexjson')).toBe(false);
  });

  it('la sintaxis que no cubre TIRA, no se traduce mal en silencio (la deriva muda es la peor dirección)', () => {
    for (const patron of ['*.{js,css}', 'archivo?.js', '!(assets)/**', '[abc].js']) {
      expect(() => globARegex(patron), patron).toThrow();
    }
  });
});

describe('cachePolitica (la política del build, no la forma del nombre)', () => {
  it('inmutable SOLO lo hasheado por construcción: assets/ y el runtime de workbox', () => {
    expect(cachePolitica('assets/index-vE6TANRi.js')).toBe('immutable');
    expect(cachePolitica('assets/firestore-CMZ-SHta.js')).toBe('immutable');   // hash con guion adentro
    expect(cachePolitica('assets/dm-sans-latin-wght-normal-Xz1IZZA0.woff2')).toBe('immutable');
    expect(cachePolitica('workbox-9c191d2f.js')).toBe('immutable');
  });

  it('los íconos NO son hasheados aunque sus nombres tengan guiones largos (el bloqueante que las seis firmas convergieron)', () => {
    // una heurística por forma de nombre los clasificaba como inmutables: rediseñar un ícono lo habría
    // dejado clavado un año en los teléfonos, y la verificación en el aire fallaba en CADA deploy
    expect(cachePolitica('icons/apple-touch-icon.png')).toBe('no-cache');
    expect(cachePolitica('icons/icon-maskable-512.png')).toBe('no-cache');
    expect(cachePolitica('icons/icon-192.png')).toBe('no-cache');
  });

  it('el shell y todo lo sin hash revalida siempre: sin no-cache, el index viejo queda clavado (el incidente de D24)', () => {
    for (const rel of ['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest', 'robots.txt']) {
      expect(cachePolitica(rel), rel).toBe('no-cache');
    }
  });
});

describe('pathDePedido (dónde pide cleanUrls cada archivo del dist)', () => {
  it('el index se pide en «/», el resto en su path literal, y un .html no modelado TIRA en vez de traducirse mal en silencio', () => {
    expect(pathDePedido('index.html')).toBe('/');
    expect(pathDePedido('sw.js')).toBe('/sw.js');
    expect(() => pathDePedido('otro.html')).toThrow();
  });
});

describe('ignoradoPor (la semántica de firebase-tools)', () => {
  const ignorado = ignoradoPor(IGNORE_REAL);

  it('excluye lo que hosting excluye: maps a cualquier profundidad, dotfiles, firebase.json', () => {
    expect(ignorado('assets/index-abc123.js.map')).toBe(true);
    expect(ignorado('sw.js.map')).toBe(true);
    expect(ignorado('.vite')).toBe(true);
    expect(ignorado('a/.env')).toBe(true);
    expect(ignorado('firebase.json')).toBe(true);
  });

  it('NO excluye lo que hosting publica (excluir de más = archivos publicados sin custodia)', () => {
    for (const rel of ['index.html', 'sw.js', 'registerSW.js', 'workbox-9c191d2f.js', 'manifest.webmanifest', 'assets/index-abc123.js', 'icons/icon-192.png', 'robots.txt']) {
      expect(ignorado(rel), rel).toBe(false);
    }
  });

  it('todos los patrones se comparan contra el camino COMPLETO, como la opción ignore de glob (el mecanismo real de firebase-tools)', () => {
    // «**/*.map» (con barra) no matchea un directorio llamado x.map ni su contenido
    expect(ignorado('x.map/archivo.js')).toBe(false);
    // «firebase.json» (sin barra) ancla SOLO en la raíz: hosting SÍ publica subcarpeta/firebase.json.
    // Dos semánticas anteriores (por segmento, por basename) excluían de más — la dirección muda: un
    // archivo que hosting sube quedaba fuera de toda custodia. Verificado contra el listFiles real.
    expect(ignorado('firebase.json')).toBe(true);
    expect(ignorado('subcarpeta/firebase.json')).toBe(false);
    expect(ignorado('firebase.json/x.js')).toBe(false);
  });
});

describe('directorioPublicado (la forma de hosting que el espejo modela)', () => {
  // un root temporal con un firebase.json fixture: la única forma de probar configs que el repo real no tiene
  const raizCon = (hosting: unknown) => {
    const raiz = mkdtempSync(join(tmpdir(), 'espejo-'));
    writeFileSync(join(raiz, 'firebase.json'), JSON.stringify({ hosting }));
    return raiz;
  };

  it('con el firebase.json REAL devuelve su hosting.public (sin fallback que lo tape)', () => {
    // derivado del CONFIG ya leído, no re-listado acá: una copia congelada envejece
    expect(directorioPublicado(process.cwd())).toBe(CONFIG.hosting.public);
  });

  it('las formas que no modela TIRAN, no degradan a auditar dist/ con ignore vacío (la deriva muda)', () => {
    // sin hosting, multi-sitio en array (válido para firebase-tools) y source: las tres pasaban en silencio
    for (const hosting of [undefined, [{ target: 'app', public: 'dist' }], { source: '.' }]) {
      expect(() => directorioPublicado(raizCon(hosting)), JSON.stringify(hosting)).toThrow(/espejo no modela/);
    }
  });

  it('una clave de `hosting` que no lee NADIE tira nombrándola: hosting la honra igual y ninguna puerta la mira', () => {
    // el veneno REAL, probado sobre el repo: con este bloque puesto, `verificar-release.mjs --solo-dist`
    // salía VERDE ENTERO y el deep link —la única URL por la que entra la familia, con el listId en el path
    // del 301— se iba a otro origen. Los redirects se resuelven antes que los archivos y que los rewrites, y
    // la puerta del deep link solo lee `rewrites`. La postura «lo que no modelo, tira» estaba aplicada por
    // lector y nunca al objeto entero: el conjunto modelado lo definía qué lectores había, no qué honra hosting.
    const conRedirect = { public: 'dist', redirects: [{ source: '/l/**', destination: 'https://otro.example/robado', type: 301 }] };
    expect(() => directorioPublicado(raizCon(conRedirect))).toThrow(/no modela[\s\S]*redirects/);
    for (const clave of ['i18n', 'trailingSlash', 'appAssociation']) {
      expect(() => directorioPublicado(raizCon({ public: 'dist', [clave]: {} })), clave).toThrow(new RegExp(clave));
    }
  });

  // la dirección contraria —que la lista modelada no quede más ANGOSTA que el firebase.json del repo y frene
  // un deploy sano— ya la cubre el test de acá arriba que corre sobre `process.cwd()`: si alguien saca una
  // clave de CLAVES_MODELADAS, ese se pone rojo solo.
});

/**
 * «De dónde sale el proyecto del release» estaba escrito DOS veces —verificar-release.mjs y deploy.mjs— y ya
 * había divergido: el mismo `.firebaserc` roto daba dos diagnósticos distintos según qué comando corriera el
 * operador, y el de verificar-release ni nombraba el archivo ni decía cómo se vuelve. Acá el criterio se
 * prueba UNA vez, en la casa compartida: la red contra la próxima divergencia.
 */
describe('proyectoDelRelease (a qué proyecto se deploya: un solo criterio para los dos scripts)', () => {
  const raizCon = (firebaserc?: string) => {
    const raiz = mkdtempSync(join(tmpdir(), 'firebaserc-'));
    if (firebaserc !== undefined) writeFileSync(join(raiz, '.firebaserc'), firebaserc);
    return raiz;
  };

  it('con un .firebaserc sano devuelve el projectId', () => {
    const raiz = raizCon(JSON.stringify({ projects: { default: 'heladera-de-mentira' } }));
    expect(proyectoDelRelease(raiz)).toBe('heladera-de-mentira');
  });

  it('ausente: el diagnóstico del clon nuevo, con la salida y sin mandar a restaurar lo que no está', () => {
    const raiz = raizCon();
    expect(() => proyectoDelRelease(raiz)).toThrow(/\.firebaserc/);
    expect(() => proyectoDelRelease(raiz)).toThrow(/firebase use/);
    expect(() => proyectoDelRelease(raiz)).not.toThrow(/git checkout/);
  });

  it('ilegible, JSON que no es objeto o sin proyecto default: TIRA nombrando el archivo y cómo se vuelve (nunca un falsy de fallback)', () => {
    for (const contenido of ['{roto', 'null', JSON.stringify({ projects: {} })]) {
      const raiz = raizCon(contenido);
      expect(() => proyectoDelRelease(raiz), contenido).toThrow(/\.firebaserc/);
      expect(() => proyectoDelRelease(raiz), contenido).toThrow(/git checkout/);
      expect(() => proyectoDelRelease(raiz), contenido).toThrow(/firebase use/);
    }
  });
});

describe('cacheSegunReglas (el espejo de la config de headers)', () => {
  const BLOQUES = [
    { source: '**', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    { source: '/assets/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ];

  it('de las reglas que matchean, la ÚLTIMA con la clave gana (semántica verificada contra hosting real)', () => {
    expect(cacheSegunReglas(BLOQUES, 'assets/index-abc12345.js')).toContain('immutable');
    expect(cacheSegunReglas(BLOQUES, 'index.html')).toBe('no-cache');
    expect(cacheSegunReglas([], 'index.html')).toBeNull();
  });

  it('el match es contra el path del PEDIDO: con cleanUrls, una regla «/index.html» no aplica nunca (el bug del no-cache que jamás rigió, D24)', () => {
    const conReglaMuerta = [{ source: '/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }];
    expect(cacheSegunReglas(conReglaMuerta, 'index.html')).toBeNull();   // el pedido real es «/», no /index.html
    expect(cacheSegunReglas([{ source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }], 'index.html')).toBe('no-cache');
  });

  it('la config REAL de firebase.json le da a cada clase del dist lo que la política pide', () => {
    const reglas = CONFIG.hosting.headers;
    for (const rel of ['index.html', 'sw.js', 'registerSW.js', 'icons/apple-touch-icon.png', 'robots.txt']) {
      expect(cacheSegunReglas(reglas, rel), rel).toContain(cachePolitica(rel));
    }
    for (const rel of ['assets/index-vE6TANRi.js', 'workbox-9c191d2f.js']) {
      expect(cacheSegunReglas(reglas, rel), rel).toContain('immutable');
    }
  });
});

/**
 * La otra mitad del mismo seam: `headerSegunReglas` pregunta por ARCHIVO, y toda la custodia de headers del
 * circuito estaba escrita de ese lado — las dos mitades (la puerta de config y la del aire) iteran los
 * publicables. Pero hosting matchea headers por PATH DE PEDIDO, y el único path servido que no tiene archivo
 * atrás es justo la URL por la que entra la familia: `/l/<listId>`, que fabrica el rewrite. Un bloque nuevo
 * tipo `/l/**` lo servía cacheado una hora —el incidente que motivó la política, D24— y sin `no-referrer`
 * (o sea filtrando el listId, que es la llave) con los publicables y el rewrite en verde.
 */
describe('headerSegunPedido (los headers de lo que hosting sirve SIN archivo atrás)', () => {
  const CON_BLOQUE_NUEVO = [
    { source: '**', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Referrer-Policy', value: 'no-referrer' }] },
    { source: '/l/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] },
  ];

  it('sobre el deep link —un path que no es ningún archivo— gana la ÚLTIMA regla que matchea, como en hosting', () => {
    expect(headerSegunPedido(CON_BLOQUE_NUEVO, RUTA_SPA_DE_PRUEBA, 'Cache-Control')).toBe('public, max-age=3600');
    expect(headerSegunPedido(CON_BLOQUE_NUEVO, RUTA_SPA_DE_PRUEBA, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('la trampa que fija POR QUÉ el chequeo va por pedido: preguntar por ARCHIVO devuelve la respuesta equivocada, en silencio', () => {
    // pathDePedido('/l/…') le antepone OTRA barra («//l/…»), que `/l/**` no matchea: la vía «archivo» contesta
    // el valor del catch-all y firmaría un verde falso con el bloque envenenado puesto
    expect(pathDePedido(RUTA_SPA_DE_PRUEBA)).toBe(`/${RUTA_SPA_DE_PRUEBA}`);
    expect(headerSegunReglas(CON_BLOQUE_NUEVO, RUTA_SPA_DE_PRUEBA, 'Cache-Control')).toBe('no-cache');
  });

  it('con la config REAL de firebase.json, el deep link recibe hoy la política del index y los headers de seguridad', () => {
    const reglas = CONFIG.hosting.headers;
    expect(headerSegunPedido(reglas, RUTA_SPA_DE_PRUEBA, 'Cache-Control')).toContain(cachePolitica('index.html'));
    for (const [clave, valor] of Object.entries(HEADERS_SEGURIDAD as Record<string, string>)) {
      expect(headerSegunPedido(reglas, RUTA_SPA_DE_PRUEBA, clave), clave).toBe(valor);
    }
  });

  it('un bloque en forma `regex` tira con el mensaje modelado, no con el «Cannot read properties of undefined» crudo que puerta() promete no escupir', () => {
    // hosting acepta bloques `{regex}`; este espejo no los modela. Fallar cerrado ya fallaba —el globARegex
    // reventaba solo—, pero con el error crudo de JS en vez del mensaje que su hermano destinosDeRewrite sí
    // da para exactamente el mismo caso: el operador leía un TypeError y no qué se miró ni cómo se sigue.
    const enRegex = [{ regex: '^/l/(.*)$', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }];
    expect(() => headerSegunPedido(enRegex, RUTA_SPA_DE_PRUEBA, 'Cache-Control')).toThrow(/no modela/);
    expect(() => headerSegunPedido(enRegex, RUTA_SPA_DE_PRUEBA, 'Cache-Control')).not.toThrow(/replaceAll/);
  });
});

/**
 * El rewrite es la única clave de `hosting` que habla de una URL que NO es un archivo, y por eso se había
 * quedado afuera del marco entero: el circuito se construyó alrededor de «qué ARCHIVOS se publican y con qué
 * headers», y ser exhaustivo ahí se sentía como ser exhaustivo. Pero la app se reparte por el link de la
 * lista (`/l/<listId>`, `src/app/router.ts` rutea por pathname): si el rewrite se rompe, los publicables
 * siguen idénticos con sus headers, «/» sigue devolviendo el index, y cada link de la familia da 404.
 */
describe('destinosDeRewrite (la URL por la que entra la familia, que no es ningún archivo)', () => {
  it('el firebase.json REAL manda el deep link al index (si alguien rompe o borra el rewrite, esto se pone rojo)', () => {
    // el `?? []` es a propósito: si alguien BORRA el bloque, este test tiene que fallar con el diff honesto
    // («[] no es ['/index.html']») y no con un TypeError que se lee como test roto
    expect(destinosDeRewrite(CONFIG.hosting.rewrites ?? [], RUTA_SPA_DE_PRUEBA)).toEqual(['/index.html']);
  });

  it('el path de prueba es un listId válido para el router: si se pide de verdad, rutea como lista', () => {
    // el mismo LIST_ID_RE de src/app/router.ts — que este path sea legal es lo que lo hace inocuo
    expect(RUTA_SPA_DE_PRUEBA.match(/^\/l\/([^/]+)$/)?.[1]).toMatch(/^[A-Za-z0-9_-]{6,64}$/);
  });

  it('ninguna regla que matchee = lista vacía, y ahí la puerta falla CERRADO (el bug: sin esto pasaba igual)', () => {
    expect(destinosDeRewrite([{ source: '/api/**', destination: '/index.html' }], RUTA_SPA_DE_PRUEBA)).toEqual([]);
    expect(destinosDeRewrite([], RUTA_SPA_DE_PRUEBA)).toEqual([]);
  });

  it('una regla que matchea pero manda a otro lado se reporta CON su destino (para poder nombrarlo)', () => {
    expect(destinosDeRewrite([{ source: '**', destination: '/mantenimiento.html' }], RUTA_SPA_DE_PRUEBA))
      .toEqual(['/mantenimiento.html']);
  });

  it('devuelve TODOS los matcheantes, no el primero: el orden de resolución de hosting no está verificado', () => {
    const dos = [{ source: '/l/**', destination: '/otro.html' }, { source: '**', destination: '/index.html' }];
    expect(destinosDeRewrite(dos, RUTA_SPA_DE_PRUEBA)).toEqual(['/otro.html', '/index.html']);
  });

  it('una forma que el espejo no modela TIRA, no se cuenta como «no matchea» (que sería aprobar en vacío)', () => {
    for (const regla of [{ regex: '/l/.*', destination: '/index.html' }, { source: '**', function: 'ssr' }, { source: '**', run: { serviceId: 'x' } }]) {
      expect(() => destinosDeRewrite([regla], RUTA_SPA_DE_PRUEBA), JSON.stringify(regla)).toThrow(/no modela/);
    }
  });
});

/**
 * El conjunto de imprescindibles es la puerta en la dirección CONTRARIA a todo lo demás de este archivo: el
 * resto del espejo dice qué se PUBLICA (dist menos el ignore) y esta función dice qué NO SE PUEDE dejar de
 * publicar. Existe porque `hosting.ignore` decidía las dos cosas a la vez —qué se publica y, porque todas
 * las puertas iteran `archivosPublicados`, qué se AUDITA—, así que una entrada de más apagaba la custodia de
 * lo que nombra y el circuito firmaba «verificado» sobre un release sin shell o sin service worker.
 * Se DERIVA del artefacto y nunca se enumera: enumerar a mano es la enfermedad que ya se olvidó una vez el
 * chunk de workbox. Y falla CERRADO: un parse mudo devolvería un conjunto corto y volvería a aprobar en
 * vacío, que es justo lo que esta función cura.
 */
describe('imprescindiblesDelDist (qué NO se puede dejar de publicar, derivado del artefacto)', () => {
  /** un dist mínimo con la forma del real: index + entrada + hoja + manifest + la cadena del service worker */
  function distMinimo(cambios: { index?: string; sw?: string; registerSW?: string; css?: string } = {}) {
    const dist = mkdtempSync(join(tmpdir(), 'imprescindibles-'));
    // la hoja que el index linkea, ESCRITA en disco y con las formas que emite Vite: la tipografía entra por
    // acá y por ningún otro lado (el precache de abajo NO nombra ninguna woff2 local, a propósito)
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'assets/app-abc.css'), cambios.css ?? [
      '@font-face{font-family:Fraunces;src:url(/assets/fraunces-abc.woff2) format("woff2")}',
      'body{background:url("./assets/textura.png")}',
      '.i{background-image:url(data:image/svg+xml;base64,AAA)}',
    ].join('\n'));
    writeFileSync(join(dist, 'index.html'), cambios.index ?? [
      '<!doctype html><html><head>',
      '<link rel="icon" href="/icons/favicon.svg">',
      '<link rel="stylesheet" crossorigin href="/assets/app-abc.css">',
      '<link rel="manifest" href="/manifest.webmanifest">',
      '<script type="module" crossorigin src="/assets/app-abc.js"></script>',
      '<script src="https://cdn.example.com/analitica.js"></script>',
      '</head><body></body></html>',
    ].join('\n'));
    writeFileSync(join(dist, 'registerSW.js'), cambios.registerSW
      ?? `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js', { scope: '/' })}`);
    writeFileSync(join(dist, 'sw.js'), cambios.sw ?? String.raw`define(["./workbox-abc123"],function(e){e.precacheAndRoute([{url:"index.html",revision:"a"},{url:"assets/app-abc.js",revision:"b"},{url:"icons/icon-192.png",revision:"c"},{url:"https://cdn.example.com/tipografia.woff2",revision:null}],{})})`);
    writeFileSync(join(dist, 'robots.txt'), 'User-agent: *');   // está en el dist y NO es cadena de arranque
    return dist;
  }

  it('deriva el index, su entrada, su hoja, su manifest y la cadena entera del service worker (registerSW → sw → workbox → precache)', () => {
    // el conjunto EXACTO, no un «contiene»: así el test también custodia que no se cuele nada de más
    expect(imprescindiblesDelDist(distMinimo())).toEqual([
      'assets/app-abc.css',
      'assets/app-abc.js',
      'assets/fraunces-abc.woff2',   // la declara la HOJA, y el precache de este fixture no la nombra
      'assets/textura.png',          // ídem, con la otra forma de url() que emite el build
      'icons/icon-192.png',      // sale del precache, que es la única puerta que lo nombra
      'index.html',
      'manifest.webmanifest',
      'registerSW.js',
      'sw.js',
      'workbox-abc123.js',       // el chunk que el sw importa: la pieza que la enumeración a mano ya olvidó
    ]);
  });

  it('deja afuera lo que hosting no tiene que servir sí o sí: lo que no es cadena de arranque y lo que no es de este origen', () => {
    const req: string[] = imprescindiblesDelDist(distMinimo());
    expect(req).not.toContain('robots.txt');
    // las referencias externas no se le pueden pedir a `publicables`: sería un rojo falso
    expect(req.some(rel => rel.includes('cdn.example.com') || rel.includes('analitica') || rel.includes('tipografia'))).toBe(false);
    // el favicon tampoco: no es cadena de arranque, y su propia puerta (los <link> del index) ya lo custodia
    expect(req).not.toContain('icons/favicon.svg');
  });

  it('la tipografía entra POR la hoja y no por el precache: el sw de este fixture no nombra ninguna woff2 local', () => {
    // el bug: la hoja entraba al conjunto como un href a verificar y nunca se abría, así que las cinco woff2
    // del dist real (--font-display Fraunces / --font-body DM Sans) estaban cubiertas solo porque el
    // `globPatterns` de vite.config.ts las metía en el precache del sw — la custodia de la tipografía
    // dependía de la config de otro subsistema. Probado con veneno: sacándolas del precache y poniendo
    // `assets/*.woff2` en el ignore, la puerta salía verde con las cinco afuera del release, y el rewrite
    // catch-all contesta esos paths con el index (200), así que la app cae entera a Georgia / system-ui.
    // Por eso el precacheAndRoute del fixture se deja SIN woff2 local: si mañana alguien vuelve a derivar
    // las fuentes solo del precache, esto se pone rojo.
    const dist = distMinimo();
    // la premisa del test, verificada y no asumida: si alguien le agrega una woff2 local al precache del
    // fixture, este test dejaría de probar nada y hay que enterarse acá
    expect(readFileSync(join(dist, 'sw.js'), 'utf8')).not.toMatch(/url:"(?!https?:)[^"]*\.woff2"/);
    const req: string[] = imprescindiblesDelDist(dist);
    expect(req).toContain('assets/fraunces-abc.woff2');   // url(/…) raíz-absoluta, la forma que emite Vite
    expect(req).toContain('assets/textura.png');          // url("./…") entre comillas y relativa
    // y el filtro de siempre sigue rigiendo adentro de la hoja: ni las data: ni las de otro origen
    expect(req.some(rel => rel.startsWith('data:') || rel.includes('base64'))).toBe(false);
  });

  it('falla CERRADO si el index no carga NINGÚN <script src>: sin entrada la app no arranca, y devolver un conjunto corto sería aprobar en vacío', () => {
    expect(() => imprescindiblesDelDist(distMinimo({ index: '<!doctype html><html><head></head><body></body></html>' })))
      .toThrow(/NING.N <script src>/);
  });

  it('falla CERRADO si el sw existe y su precache no se puede leer (una URL precacheada que hosting no sirve rompe el install del SW)', () => {
    expect(() => imprescindiblesDelDist(distMinimo({ sw: 'self.skipWaiting()' }))).toThrow(/precacheAndRoute/);
    expect(() => imprescindiblesDelDist(distMinimo({ sw: 'precacheAndRoute([],{})' }))).toThrow(/NINGUNA URL/);
  });

  it('el service worker sale de registerSW.js aunque no se llame sw.js (por eso se lee el registrador, y no una lista)', () => {
    const dist = distMinimo({ registerSW: `navigator.serviceWorker.register('/service-worker.js', { scope: '/' })` });
    writeFileSync(join(dist, 'service-worker.js'), String.raw`precacheAndRoute([{url:"index.html",revision:"a"}],{})`);
    const req: string[] = imprescindiblesDelDist(dist);
    expect(req).toContain('service-worker.js');
  });

  it('un registerSW.js ilegible NO tira: el sw ya se pinnea solo, y tirar acá sería frenar el release por algo que no perdió custodia', () => {
    // el límite del «fallar cerrado»: se TIRA donde no leer pierde custodia de verdad (la entrada del index,
    // el precache del sw), no cada vez que una lectura no da lo esperado. registerSW.js entra igual al
    // conjunto por el <script src> del index, y dist/sw.js lo pinnea la rama de abajo.
    const req: string[] = imprescindiblesDelDist(distMinimo({ registerSW: 'console.log("nada")' }));
    expect(req).toContain('registerSW.js');
    expect(req).toContain('sw.js');
  });

  it('contra el dist REAL del repo: no tira, y el índice y la cadena del sw están adentro (que el fixture no sea la única forma que sabe leer)', () => {
    const dist = join(process.cwd(), directorioPublicado(process.cwd()));
    const req: string[] = imprescindiblesDelDist(dist);
    for (const rel of ['index.html', 'registerSW.js', 'sw.js']) expect(req, rel).toContain(rel);
    expect(req.some(rel => /^workbox-[0-9a-f]+\.js$/.test(rel))).toBe(true);
    // y ni un .map ni robots.txt: el conjunto es la cadena de arranque, no «todo el dist»
    expect(req.some(rel => rel.endsWith('.map') || rel === 'robots.txt')).toBe(false);
    // y lo que la HOJA REAL declara adentro (hoy: las cinco woff2 de Fraunces y DM Sans) también, sin
    // enumerar un solo nombre de fuente: se saca con el MISMO urlsDeCss que usa la derivación —copiar la
    // regex acá sería el criterio duplicado de siempre— y se exige CANTIDAD, porque sobre una lista vacía
    // el for de abajo aprobaría en vacío justo cuando Vite cambie la forma de la salida
    const locales = req.filter(rel => rel.endsWith('.css'))
      .flatMap(hoja => urlsDeCss(readFileSync(join(dist, hoja), 'utf8')) as string[])
      .map(u => u.split(/[?#]/)[0] ?? u)
      .filter(u => !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u));
    expect(locales.length, 'el CSS del dist real no declara NINGUNA url() local: este ancla estaría aprobando en vacío').toBeGreaterThan(0);
    for (const u of locales) expect(req, u).toContain(u.replace(/^\.?\//, ''));
  });
});

/**
 * La regex que lee las `url()` de la hoja es el punto donde la tipografía entera puede caerse en silencio: si
 * Vite emite una forma que no matchea, las fuentes vuelven a depender del precache (que es de dónde venían de
 * casualidad) y nadie se entera. Estos casos fijan las formas que emite hoy y las que emitiría después de un
 * cambio de minificador, y que el FILTRO vive afuera: la función devuelve todo lo que declara la hoja, y
 * quien llama decide qué es local.
 */
describe('urlsDeCss (lo que la hoja declara adentro)', () => {
  it('lee las tres formas de comillas y tolera espacios adentro del paréntesis', () => {
    expect(urlsDeCss('a{background:url("/assets/a.png")}')).toEqual(['/assets/a.png']);
    expect(urlsDeCss("a{background:url('/assets/b.png')}")).toEqual(['/assets/b.png']);
    expect(urlsDeCss('a{background:url(/assets/c.png)}')).toEqual(['/assets/c.png']);
    expect(urlsDeCss('a{background:url(  /assets/d.png  )}')).toEqual(['/assets/d.png']);
  });

  it('devuelve las DOS de un mismo src, con el format() en el medio (así declara @font-face el build)', () => {
    const css = '@font-face{src:url(/assets/f.woff2) format("woff2"),url(/assets/f.woff) format("woff")}';
    expect(urlsDeCss(css)).toEqual(['/assets/f.woff2', '/assets/f.woff']);
  });

  it('devuelve TAMBIÉN las externas y las data:, porque el filtro no es asunto suyo (lo aplica quien llama)', () => {
    const css = '@font-face{src:url(https://cdn.example.com/f.woff2)}.i{background:url(data:image/svg+xml;base64,AAA)}';
    expect(urlsDeCss(css)).toEqual(['https://cdn.example.com/f.woff2', 'data:image/svg+xml;base64,AAA']);
  });

  it('una hoja sin assets devuelve la lista vacía y no tira: frenar el release por eso sería un exceso', () => {
    expect(urlsDeCss(':root{--paper:#fff}')).toEqual([]);
  });
});

/**
 * `IGNORES_DE_FIREBASE_TOOLS` es lo único del espejo que se re-lista a mano: son los ignores por defecto de
 * una dependencia (`firebase-tools`, que en package.json está con caret). El deploy tiene un candado empírico
 * para eso, pero es UNIDIRECCIONAL: solo caza que el espejo excluya de MÁS (pide un «ignorado» y el servidor
 * lo tiene). La dirección contraria —un ignore por defecto NUEVO río arriba que el espejo no tiene— no la ve
 * nadie: el archivo entra en `archivosPublicados`, hosting no lo publica, el rewrite catch-all contesta el
 * index y el deploy muere en un «DIFIERE» falso que manda al operador a esperar propagación de CDN y a hacer
 * un rollback que no arregla nada. Este test es la otra mitad del candado, y del lado barato: lee los
 * defaults del paquete INSTALADO y exige igualdad, así un `npm update` que los cambie sale rojo en
 * `npm test` (que `npm run verificar` corre antes del build) y no en pleno deploy.
 */
describe('IGNORES_DE_FIREBASE_TOOLS (el espejo de los internals de firebase-tools)', () => {
  /** Los ignores por defecto REALES, leídos del paquete instalado: la constante es una copia y esta es su ancla. */
  const defaultsReales = (): string[] => {
    let fuente: string;
    try {
      fuente = readFileSync(createRequire(import.meta.url).resolve('firebase-tools/lib/listFiles.js'), 'utf8');
    } catch (e) {
      throw new Error(`no se pudo leer el listFiles de firebase-tools instalado (${(e as Error).message}): el espejo de scripts/dist-publicado.mjs se quedó sin fuente de verdad — si el paquete movió el archivo, arreglá ESTE test y revisá IGNORES_DE_FIREBASE_TOOLS a mano contra la versión instalada`);
    }
    // el «.concat(» ancla en ESE array (los defaults de listFiles), no en cualquier «ignore:» que aparezca mañana
    const m = fuente.match(/ignore:\s*\[([^\]]*)\]\s*\.concat\(/);
    if (!m) throw new Error('el listFiles de firebase-tools ya no expone el array literal de ignores por defecto (¿refactor arriba?): sin extracción, IGNORES_DE_FIREBASE_TOOLS queda sin custodia — arreglá esta extracción y revisá la constante de scripts/dist-publicado.mjs a mano contra la versión instalada');
    const reales: string[] = JSON.parse(`[${m[1]}]`);
    // fallar CERRADO: una extracción vacía haría pasar el test comparando nada contra nada
    expect(reales.length, 'la extracción de los ignores por defecto devolvió una lista vacía: aprobaría en vacío').toBeGreaterThan(0);
    return reales;
  };

  it('espeja EXACTAMENTE los ignores por defecto de la versión instalada (un bump que los cambie rompe acá, no en pleno deploy)', () => {
    // igualdad de conjuntos y no «cada patrón mío aparece allá»: la contención floja solo cubre la dirección
    // que el candado del aire YA cubre. Ordenado, para no ponerse rojo por un reordenamiento cosmético.
    expect([...IGNORES_DE_FIREBASE_TOOLS].sort()).toEqual([...defaultsReales()].sort());
  });

  it('y el traductor del circuito sabe traducir todos sus patrones (si no, el deploy revienta adentro de globARegex)', () => {
    // sincronizar la constante a mano con un patrón que globARegex no cubre (llaves, «?», clases) pasaría la
    // igualdad y abortaría recién durante el deploy: acá cuesta un test rápido
    expect(() => IGNORES_DE_FIREBASE_TOOLS.map(globARegex)).not.toThrow();
  });
});
