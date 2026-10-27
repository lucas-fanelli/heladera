/**
 * El catch de puerta() (scripts/verificar-release.mjs) promete traducir cualquier excepción cruda al formato
 * de la casa («NO SE DEPLOYA: …»), y el hint de rebuild que calcula ADENTRO del catch re-lee firebase.json
 * (directorioPublicado). El circuito encontró que la clase de error que motivó ese hint —firebase.json
 * ausente/ilegible— era exactamente la que hacía tirar la relectura POR SEGUNDA VEZ adentro del catch:
 * salía el stack crudo sin «NO SE DEPLOYA», la cara exacta que el catch promete no mostrar. El arreglo
 * tiene DOS mitades y cada una vive donde le toca: que SIN firebase.json el fallo salga en formato de la
 * casa y sin hint (a) se fija en tests/unit/puertas-config.test.ts —junto al resto del cuadro «config
 * ausente o corrupta × los dos scripts», que es el escenario del que (a) es un caso—; acá queda (b), que
 * con firebase.json sano y el dist incompleto el hint SIGUE apareciendo: que el arreglo no degenere en
 * «nunca hint».
 *
 * El segundo describe fija otra cosa que también vive en el proceso entero: la puerta de sourcemaps, que
 * afirmaba el MECANISMO (el literal del glob de maps en el ignore de firebase.json) en vez de la PROPIEDAD
 * (ningún .map entre los publicables) y por eso mentía en las dos direcciones — ver ahí.
 *
 * El tercero fija el invariante del index PUBLICADO: que linkee las cuatro cosas de las que cuelga la app
 * (los dos íconos, la hoja de estilos y el manifest) y que las cuatro estén entre los publicables. La puerta
 * miraba solo los íconos, que son los dos links escritos a mano en el index del repo; los otros dos los
 * inyecta el build y se podían caer con TODO en verde — ver ahí. Y su describe hermano fija que la hoja
 * linkeada además PINTA los --paper de tokens.css: el CSS se auditaba por existencia y nunca se abría, así
 * que vacío o con el papel corrido salía en verde igual — ver ahí.
 *
 * El cuarto fija la IDENTIDAD del artefacto: que el dist sea la app del proyecto al que se deploya, y no
 * otra construida con otro `.env` — la única entrada del release que git no muestra — ver ahí.
 *
 * Las aserciones de COLOR (el manifest de la saga de la barra y la familia cromática del index: los dos
 * <meta theme-color> y el <meta color-scheme>) tienen su describe de venenos: eran las únicas que ningún test
 * podía volver rojas —el fixture sano las ejerce en verde y nada más—, y ya dejaron pasar una regresión por
 * eso — ver ahí. Y pegado abajo, el CUARTO <meta> escrito a mano del mismo <head>, que no es de color y por
 * eso tiene describe propio: el viewport-fit=cover del que cuelgan los env(safe-area-inset-*) — ver ahí.
 *
 * Se corre el script REAL con spawnSync en una copia aislada (mkdtemp): el bug vive en el proceso entero
 * (process.exit, stderr), no en una función importable.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — módulo .mjs de scripts/, sin tipos: el path del deep link se toma de su fuente de verdad
// (una copia acá envejecería el día que cambie el id de mentira)
import { RUTA_SPA_DE_PRUEBA } from '../../scripts/dist-publicado.mjs';

const REPO = process.cwd();

let tmp: string;

function armarCopia(): string {
  tmp = mkdtempSync(join(tmpdir(), 'verificar-release-'));
  // scripts/ ENTERO, derivado del directorio real: verificar-release importa a sus hermanos con rutas
  // relativas y tienen que viajar todos. La lista a mano que había acá era una enumeración que envejece, y
  // envejeció: el día que el script sumó un hermano (env-release.mjs), la copia quedaba sin él y estos dos
  // tests morían con el ERR_MODULE_NOT_FOUND que justamente prometen que no puede pasar.
  cpSync(join(REPO, 'scripts'), join(tmp, 'scripts'), { recursive: true });
  return tmp;
}

function correrSoloDist(raiz: string) {
  return spawnSync(process.execPath, [join(raiz, 'scripts', 'verificar-release.mjs'), '--solo-dist'], { encoding: 'utf8' });
}

afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('el hint de rebuild del catch de puerta()', () => {
  it('con firebase.json sano y dist incompleto: el hint de rebuild SIGUE apareciendo (que el arreglo no degenere en «nunca hint»)', () => {
    const raiz = armarCopia();
    writeFileSync(join(raiz, 'firebase.json'), JSON.stringify({ hosting: { public: 'dist', ignore: [] } }));
    // lo mínimo para llegar hasta dist('sw.js'): tokens con un --paper por esquema, y el index presente
    mkdirSync(join(raiz, 'src', 'styles'), { recursive: true });
    writeFileSync(join(raiz, 'src', 'styles', 'tokens.css'), [
      ':root { --paper: #F6F1E7; }',
      '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #1C1D1A; } }',
    ].join('\n'));
    mkdirSync(join(raiz, 'dist'));
    writeFileSync(join(raiz, 'dist', 'index.html'), '<!doctype html>');
    // SIN dist/sw.js: el ENOENT trae un path bajo /dist/ — el caso para el que el hint existe

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('la puerta «Auditorías del dist» reventó');
    expect(r.stderr).toContain('¿dist incompleto o viejo?');
  });
});

/**
 * Lo mínimo para LLEGAR a la puerta de sourcemaps: todas las anteriores tienen que pasar (index.html existe →
 * tokens.css → sw.js → manifest → los dos theme-color → el color-scheme de las dos mitades → el viewport →
 * publicables → [acá]). Los íconos NO hacen falta: su puerta
 * es POSTERIOR, y que corte ahí es justamente lo que prueba que la corrida pasó de largo la de sourcemaps.
 */
function armarDistHastaLaPuertaDeMaps(raiz: string, { ignore, conMap }: { ignore: string[]; conMap: boolean }) {
  writeFileSync(join(raiz, 'firebase.json'), JSON.stringify({ hosting: { public: 'dist', ignore } }));
  mkdirSync(join(raiz, 'src', 'styles'), { recursive: true });
  writeFileSync(join(raiz, 'src', 'styles', 'tokens.css'), [
    ':root { --paper: #F6F1E7; color-scheme: light dark; }',
    '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #1C1D1A; } }',
  ].join('\n'));
  mkdirSync(join(raiz, 'dist'), { recursive: true });
  writeFileSync(join(raiz, 'dist', 'index.html'), [
    '<!doctype html><html><head>',
    // este fixture es el dist MÍNIMO que llega sano hasta la puerta de maps, y las del <head> corren antes:
    // sin el viewport la corrida moriría ahí y estos casos dejarían de probar lo suyo
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F6F1E7">',
    '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1C1D1A">',
    // la cadena de arranque que la puerta de imprescindibles DERIVA del artefacto (un <script src> y su
    // archivo): sin ella este fixture ya no llega a la puerta de maps, que es todo su trabajo — y con ella
    // el dist mínimo se parece un poco más al real
    '<script type="module" src="/app.js"></script>',
    '</head><body></body></html>',
  ].join('\n'));
  writeFileSync(join(raiz, 'dist', 'app.js'), 'const app = 1;');
  writeFileSync(join(raiz, 'dist', 'sw.js'), String.raw`navigateFallbackDenylist:[/^\/__\//];precacheAndRoute([{url:"index.html",revision:"a"},{url:"app.js",revision:"b"}],{})`);
  writeFileSync(join(raiz, 'dist', 'manifest.webmanifest'), JSON.stringify({
    name: 'Heladera',
    background_color: '#F6F1E7',
  }));
  if (conMap) {
    mkdirSync(join(raiz, 'dist', 'assets'), { recursive: true });
    writeFileSync(join(raiz, 'dist', 'assets', 'app-abc123.js.map'), '{"version":3,"sourcesContent":["// inocuo"]}');
  }
}

/**
 * La puerta de sourcemaps pregunta por la PROPIEDAD (ningún .map entre los publicables), no por el mecanismo
 * que hoy la cumple (el literal del glob de maps en el ignore). Afirmar el literal fallaba en las DOS direcciones y
 * hay un test por cada una.
 */
describe('la puerta de sourcemaps mira los publicables, no el literal del ignore', () => {
  it('falso verde: el ignore no cubre los .map, hay uno en el dist y la puerta lo nombra', () => {
    const raiz = armarCopia();
    armarDistHastaLaPuertaDeMaps(raiz, { ignore: [], conMap: true });

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    // ESTA es la aserción que fija el bug: afirmar el literal cortaba igual acá ([].includes('**/*.map') es
    // false), pero con un mensaje que no nombra un solo archivo — porque nunca miró el dist. Que el path
    // aparezca es la prueba de que la puerta midió la propiedad y no la config.
    expect(r.stderr).toContain('assets/app-abc123.js.map');
  });

  it('falso rojo: sin la entrada del ignore pero sin un solo .map en el dist (el escenario `build.sourcemap: false`), la puerta NO dispara', () => {
    const raiz = armarCopia();
    armarDistHastaLaPuertaDeMaps(raiz, { ignore: ['firebase.json', '**/.*', '**/node_modules/**'], conMap: false });

    const r = correrSoloDist(raiz);

    expect(r.stderr).not.toContain('sourcemap');
    // y la aserción negativa no puede aprobar en vacío (si un typo la volviera trivial no lo veríamos): se
    // exige que la corrida haya LLEGADO más allá de la puerta de sourcemaps. El manifest del fixture no trae
    // icons, así que la puerta SIGUIENTE corta determinísticamente ahí.
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('íconos');
  });

  it('falso rojo, la otra cara: un patrón equivalente («**/*.map*») cubre igual y la puerta tampoco dispara', () => {
    const raiz = armarCopia();
    armarDistHastaLaPuertaDeMaps(raiz, { ignore: ['firebase.json', '**/.*', '**/node_modules/**', '**/*.map*'], conMap: false });

    const r = correrSoloDist(raiz);

    expect(r.stderr).not.toContain('sourcemap');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('íconos');
  });
});

const CLARO = '#AABBCC';
const OSCURO = '#112233';
/** El valor del contrato cromático con el sistema, el que viaja en las DOS mitades (tokens.css y el <meta>). */
const ESQUEMA = 'light dark';
const PROYECTO = 'heladera-fixture';

/** Los cuatro <link> que el index publicado tiene que traer, tal como los emite el build. */
const LINKS_SANOS = [
  '<link rel="icon" href="/icons/favicon.svg">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
  '<link rel="stylesheet" crossorigin href="/assets/index-abc123.css">',
  '<link rel="manifest" href="/manifest.webmanifest">',
];

/**
 * El TERCERO de la familia cromática del <head>, el que gobierna el canvas del navegador antes de que
 * aplique el CSS. Va en un knob SEPARADO de METAS_SANOS a propósito: los casos de theme-color indexan por
 * posición (METAS_SANOS[0]) y meterlo ahí adentro los rompería.
 */
const META_ESQUEMA = `<meta name="color-scheme" content="${ESQUEMA}">`;

/**
 * El CUARTO del <head> escrito a mano, el único que no es de color. Va con las DOS directivas que lleva el
 * index real y en el MISMO atributo `content`, que es el detalle del que depende el veneno realista: quien
 * se lleva puesto el viewport-fit no borra el meta, reescribe su content. Knob separado por la misma razón
 * que META_ESQUEMA: METAS_SANOS se indexa por posición.
 */
const META_VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">';

/** Los dos <meta theme-color>, uno por esquema y con el --paper que le toca, tal como los emite el build. */
const METAS_SANOS: [string, string] = [
  `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${CLARO}">`,
  `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${OSCURO}">`,
];

/** El woff2 de la tipografía, tal como lo referencia la hoja y como viaja en dist/assets/. */
const WOFF2 = 'assets/f-abc123.woff2';

/**
 * Los tokens que declara el tokens.css del fixture, además de --paper: la puerta compara los custom
 * properties de la FUENTE contra los de la hoja, así que con --paper solo no habría nada que perder y el
 * veneno de «hoja medio vacía» no podría escribirse. Son de las cuatro familias que el mensaje nombra
 * (color, tipografía, escala, tamaño) para que el caso se parezca al real.
 */
const TOKENS_EXTRA = { '--ink': '#111111', '--font-body': 'system-ui', '--s-4': '1rem', '--target': '2.75rem' };
const CSS_TOKENS_EXTRA = Object.entries(TOKENS_EXTRA).map(([k, v]) => `${k}:${v}`).join(';');

/** Los selectores de la capa global (el base.css del fixture), tal como los emite el build: MINIFICADOS. */
const CSS_BASE = `body{background:var(--paper);color:var(--ink);font-family:var(--font-body)}:focus-visible{outline:1px solid red}`;

/** Una @font-face con url() PROPIA: la carga que la puerta exige por cantidad. */
const CSS_FUENTES = `@font-face{font-family:Fixture Variable;src:url(/${WOFF2})format("woff2")}`;

/**
 * La hoja publicada tal como la emite el build: MINIFICADA y con sus TRES cargas — los tokens (que la puerta
 * deriva de tokens.css), la capa global (que deriva de base.css) y la tipografía. El fixture ejerce a
 * propósito las dos cosas de las que depende la puerta de contenido —el valor de `data-theme` SIN comillas y
 * el hex en minúscula—, que son justo las que el lector de --paper no sabía leer cuando solo miraba la
 * fuente escrita a mano.
 *
 * Tenía SOLO el par --paper, que es exactamente el veneno que salía en verde: la puerta heredó del incidente
 * del `.css` vacío la pregunta por UN token, y el catalogo de venenos —que es lo que de verdad define el
 * alcance de una puerta— quedó del tamaño del incidente.
 */
const CSS_SANO = `${CSS_FUENTES}:root{--paper:${CLARO.toLowerCase()};${CSS_TOKENS_EXTRA};color-scheme:light dark}${CSS_BASE}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--paper:${OSCURO.toLowerCase()}}}:root[data-theme=dark]{--paper:${OSCURO.toLowerCase()}}`;

/**
 * El service worker tal como lo emite VitePWA, en lo que estas puertas miran: la entrada `/__/` de la
 * denylist (los handlers de auth de D23) y el precache, de donde sale parte del conjunto de imprescindibles.
 * Extraído a constante para poder envenenar SOLO la denylist y dejar el precache intacto: si el veneno se
 * comiera también las URLs, el caso cortaría por otra puerta y quedaría verde por la razón equivocada.
 */
const SW_SANO = String.raw`navigateFallbackDenylist:[/^\/__\//];precacheAndRoute([{url:"index.html",revision:"a"},{url:"assets/index-abc123.js",revision:"b"},{url:"assets/index-abc123.css",revision:"c"},{url:"manifest.webmanifest",revision:"d"},{url:"icons/icon-192.png",revision:"e"}],{})`;

/** Los tres íconos que el manifest siempre tuvo (192, 512, maskable), tal como los declara vite.config.ts. */
const ICONOS_SANOS: { src: string; sizes: string; type: string; purpose?: string }[] = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

/** Lo que se le puede envenenar al dist sano; lo que no se pasa viaja sano. */
type VenenoDelDist = { links?: string[]; metas?: string[]; esquema?: string[]; viewport?: string[]; esquemaCss?: string; manifest?: Record<string, unknown>; css?: string; sw?: string };

/**
 * Un dist COMPLETO: con estos archivos la puerta --solo-dist pasa ENTERA (el caso a). Por eso el
 * firebase.json es el REAL del repo copiado —los headers y el ignore que rigen, no una copia congelada que
 * envejece— y hay un .firebaserc con un projectId que aparece adentro del bundle (el candado del artefacto).
 *
 * Los venenos entran por acá y no por una copia del fixture: `links`, `metas`, `esquema` y `viewport`
 * reemplazan lo que va al index, `esquemaCss` es la mitad CSS del contrato cromático que se escribe en tokens.css (vacío = sin
 * declaración), y `manifest` se esparce AL FINAL del manifest sano. El merge es SUPERFICIAL —`color_scheme_dark` se
 * reemplaza entero, con sus dos subcampos— y un valor `undefined` BORRA el campo, porque JSON.stringify lo
 * descarta: ese es el mecanismo para envenenar «el campo no está».
 */
function armarDistSano(raiz: string, { links = LINKS_SANOS, metas = METAS_SANOS, esquema = [META_ESQUEMA], viewport = [META_VIEWPORT], esquemaCss = ESQUEMA, manifest = {}, css = CSS_SANO, sw = SW_SANO }: VenenoDelDist = {}) {
  cpSync(join(REPO, 'firebase.json'), join(raiz, 'firebase.json'));
  writeFileSync(join(raiz, '.firebaserc'), JSON.stringify({ projects: { default: PROYECTO } }));
  mkdirSync(join(raiz, 'src', 'styles'), { recursive: true });
  writeFileSync(join(raiz, 'src', 'styles', 'tokens.css'), [
    `:root { --paper: ${CLARO}; ${Object.entries(TOKENS_EXTRA).map(([k, v]) => `${k}: ${v};`).join(' ')}${esquemaCss ? ` color-scheme: ${esquemaCss};` : ''} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: ${OSCURO}; } }`,
  ].join('\n'));
  // la capa global: la puerta DERIVA de acá los selectores que la hoja publicada tiene que traer, así que
  // sin este archivo la corrida muere con «la puerta reventó» (ENOENT) en vez de por lo que el caso prueba
  writeFileSync(join(raiz, 'src', 'styles', 'base.css'), [
    'body { background: var(--paper); color: var(--ink); font-family: var(--font-body); }',
    ':focus-visible { outline: 1px solid red; }',
  ].join('\n'));
  mkdirSync(join(raiz, 'dist', 'assets'), { recursive: true });
  mkdirSync(join(raiz, 'dist', 'icons'), { recursive: true });
  writeFileSync(join(raiz, 'dist', 'index.html'), [
    '<!doctype html><html><head>',
    ...viewport,
    ...esquema,
    ...metas,
    ...links,
    '<script type="module" crossorigin src="/assets/index-abc123.js"></script>',
    '</head><body></body></html>',
  ].join('\n'));
  // el sw REAL trae su precache, y de ahí sale parte del conjunto de imprescindibles. Todas estas URLs son
  // publicables, así que el dist sano sigue siendo el control POSITIVO (status 0) de todo el archivo.
  writeFileSync(join(raiz, 'dist', 'sw.js'), sw);
  writeFileSync(join(raiz, 'dist', 'manifest.webmanifest'), JSON.stringify({
    name: 'Heladera',
    background_color: CLARO,
    icons: ICONOS_SANOS,
    ...manifest,
  }));
  // el bundle lleva horneada la config de Firebase: de acá sale el projectId que la última puerta exige ver
  writeFileSync(join(raiz, 'dist', 'assets', 'index-abc123.js'), `const cfg={projectId:"${PROYECTO}"};`);
  writeFileSync(join(raiz, 'dist', 'assets', 'index-abc123.css'), css);
  // el woff2 que la hoja sana referencia con url(): sin el archivo en dist/, imprescindiblesDelDist lo mete
  // en el conjunto y el control POSITIVO se caería por OTRA puerta (la de «archivos de los que la app
  // depende para arrancar»), no por la de la hoja
  writeFileSync(join(raiz, 'dist', ...WOFF2.split('/')), 'woff2 de mentira');
  for (const icono of ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    writeFileSync(join(raiz, 'dist', 'icons', icono), 'dibujito de mentira');
  }
}

/**
 * La puerta parseaba TODOS los <link> del index publicado y después tiraba los que no fueran íconos, así que
 * custodiaba justo la mitad que el repo ya muestra en cualquier diff (icon y apple-touch-icon están escritos
 * a mano en index.html) y dejaba libre la mitad que INYECTA el build: el del CSS y el del manifest. Con los
 * dos borrados y los dos archivos intactos en dist/, la corrida entera daba verde: se publicaba una app sin
 * una sola regla de estilo, y las auditorías del manifest auditaban un archivo que el navegador nunca iba a
 * leer.
 */
describe('los <link> del index publicado', () => {
  it('control positivo: el dist sano pasa la puerta entera (sin esto, los venenos podrían dar rojo por cualquier otra cosa)', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);

    const r = correrSoloDist(raiz);

    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('sin el <link rel="stylesheet">, con el .css todavía en dist y publicable: la puerta corta', () => {
    const raiz = armarCopia();
    armarDistSano(raiz, { links: LINKS_SANOS.filter(l => !l.includes('stylesheet')) });

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('<link rel="stylesheet">');
  });

  it('sin el <link rel="manifest">, con el manifest.webmanifest intacto y perfecto: la puerta corta', () => {
    const raiz = armarCopia();
    armarDistSano(raiz, { links: LINKS_SANOS.filter(l => !l.includes('manifest')) });

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    // el literal, no la palabra suelta «manifest»: la matchean otros mensajes de la misma puerta
    expect(r.stderr).toContain('<link rel="manifest">');
    // y el mensaje dice la verdad de HOY sobre qué queda inerte. Decía «los campos oscuros de la barra»:
    // un mecanismo que D25 borró del manifest y que la aserción de más arriba ahora RECHAZA — el operador
    // que lee esto en un deploy caído salía a buscar campos que no existen. Lo que de verdad queda huérfano
    // sin el link sale de vite.config.ts: los íconos y el background_color del splash. Corta en la primera
    // aserción que falla, así que en un dist sano ningún otro mensaje puede traer estos fragmentos.
    expect(r.stderr).not.toMatch(/campos oscuros/);
    expect(r.stderr).toContain('maskable');
    expect(r.stderr).toContain('background_color');
  });

  it('con el href del stylesheet apuntando a algo que no se publica: la puerta corta', () => {
    const raiz = armarCopia();
    armarDistSano(raiz, { links: LINKS_SANOS.map(l => l.replace('/assets/index-abc123.css', '/assets/index-abc123.css.map')) });

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no está entre los publicables');
  });
});

/**
 * Y el CONTENIDO de esa hoja, no solo que esté linkeada y publicada. La puerta de arriba chequeaba que el
 * ARCHIVO estuviera referenciado y entre los publicables, y nunca lo abría: para un PNG —de donde ese bloque
 * heredó la forma— «existe y se publica» ES la auditoría completa, pero el .css es el único archivo que
 * pinta la pantalla. Probado con veneno sobre el dist REAL antes de escribir esto: con la hoja truncada a 0
 * bytes la corrida salía en VERDE y se publicaba la app sin una sola regla (paleta, escala de espaciado,
 * --font-*, el --target de 44px); y con los --paper corridos también, que es la deriva de la saga de la
 * barra entrando por la otra pata — las aserciones de color de más arriba validan el manifest y los
 * dos <meta> contra tokens.css, o sea la METADATA, y el archivo que de verdad pinta `background: var(--paper)`
 * no lo miraba nadie en ninguna de las dos puntas (deploy.mjs tampoco: compara lo publicado contra el MISMO
 * dist, así que confirma transporte y no contenido).
 *
 * Y no por UN token: la hoja trae TRES cargas (los tokens de tokens.css, la capa global de base.css y las
 * @font-face de la tipografía, que src/main.tsx importa en el mismo bloque de líneas 3-6) y la puerta
 * custodiaba la primera, de la primera un token, y del token la existencia. De ahí los tres venenos del
 * final, que son el caso MEDIO VACÍO — el que quedó vivo cuando se curó el vacío.
 *
 * Los venenos van de a UNO, por la misma razón que los campos oscuros del manifest: envenenados
 * juntos el mensaje nombra solo al primero y se reproduce la cobertura parcial que causó el bug. Y cada caso
 * afirma el FRAGMENTO del mensaje y no un status 1 pelado: el resto del dist viaja sano, pero un rojo de
 * cualquier OTRA puerta pasaría un test de status y el caso quedaría verde por la razón equivocada. El
 * control POSITIVO es el de más arriba («el dist sano pasa la puerta entera»), con la hoja MINIFICADA que
 * emite el build.
 */
describe('el contenido de la hoja publicada', () => {
  function correrConVeneno(css: string) {
    const raiz = armarCopia();
    armarDistSano(raiz, { css });
    return correrSoloDist(raiz);
  }

  it('la hoja VACÍA, con el <link> puesto y el archivo publicable: corta — el veneno que salía en verde', () => {
    const r = correrConVeneno('');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('al menos uno de cada esquema');
    // el mensaje manda al DESTINO del arreglo y no a los operandos (misma convención que los venenos de
    // color del manifest): el .css del dist lo genera el build, «arreglarlo» ahí se evapora
    expect(r.stderr).toContain('src/main.tsx');
    expect(r.stderr).toContain('rebuildeá');
  });

  it('con el bloque claro y NINGÚN oscuro: corta por CANTIDAD — la mitad que evita el every() en vacío', () => {
    const r = correrConVeneno(`:root{--paper:${CLARO.toLowerCase()};color-scheme:light dark}`);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('al menos uno de cada esquema');
    expect(r.stderr).toContain('1 --paper claros y 0 oscuros');
  });

  it('con el --paper CLARO corrido y el oscuro intacto: corta nombrando los dos operandos', () => {
    const r = correrConVeneno(CSS_SANO.replace(CLARO.toLowerCase(), '#ffffff'));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('la hoja publicada');
    expect(r.stderr).toContain('#FFFFFF');   // lo que pinta la pantalla
    expect(r.stderr).toContain(CLARO);       // y lo que dice el token
    expect(r.stderr).toContain('rebuildeá');
    // el mensaje nombra a los custodios de la barra que SÍ quedaron: los dos <meta theme-color>. Decía
    // «manifest y <meta theme-color>» y desde D25 el manifest no lleva ningún color de barra (su único
    // color es el del splash), así que mandaba al operador a buscar la barra donde ya no está. Esta es la
    // aserción que se habría puesto en rojo cuando se le sacó el theme_color al manifest.
    expect(r.stderr).toContain('<meta theme-color>');
    expect(r.stderr).not.toContain('manifest');
  });

  it('con el --paper OSCURO corrido y el claro intacto: corta igual (la deriva de la barra por la otra pata)', () => {
    const r = correrConVeneno(CSS_SANO.replaceAll(OSCURO.toLowerCase(), '#0a0a0a'));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('la hoja publicada');
    expect(r.stderr).toContain('#0A0A0A');
    expect(r.stderr).toContain(OSCURO);
    expect(r.stderr).toContain('src/styles/tokens.css');
  });

  // Los tres de abajo son el caso MEDIO VACÍO, que sobrevivió al arreglo del caso vacío. Los cuatro de
  // arriba son todos sobre --paper porque la puerta nació del veneno «el .css vacío salía en verde» y se
  // quedó con esa pregunta: mientras el MENSAJE prometió cuidar «la paleta, la escala de espaciado,
  // --font-display/--font-body y el --target de 44px», la ASERCIÓN miró UN token — así que una hoja de 128
  // bytes con solo el par --paper, y hasta una sin ninguna @font-face, salían en VERDE sobre el dist REAL
  // (reproducido antes de escribir esto). El gatillo es el bloque de imports de src/main.tsx (líneas 3-6):
  // son CUATRO cargas y la puerta cubría la tercera. Cada veneno saca UNA de las tres del CSS_SANO —de a
  // uno, como el resto del archivo— y afirma SU fragmento de mensaje, no un status 1 pelado: con el resto
  // del dist sano, un rojo de cualquier otra puerta dejaría el caso verde por la razón equivocada.

  it('la hoja con SOLO el par --paper: corta nombrando los tokens que faltan (el veneno de 128 bytes que salía en verde)', () => {
    const r = correrConVeneno(`:root{--paper:${CLARO.toLowerCase()};color-scheme:light dark}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--paper:${OSCURO.toLowerCase()}}}`);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('tokens de src/styles/tokens.css');
    // los nombres salen DERIVADOS de tokens.css, no de una lista adentro del script
    expect(r.stderr).toContain('--target');
    expect(r.stderr).toContain('--font-body');
    expect(r.stderr).toContain('src/main.tsx');
  });

  it('la hoja con tokens y @font-face pero SIN los selectores de base.css: corta nombrando body y :focus-visible', () => {
    const r = correrConVeneno(CSS_SANO.replace(CSS_BASE, ''));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('selectores de src/styles/base.css');
    expect(r.stderr).toContain('body');
    expect(r.stderr).toContain(':focus-visible');
    expect(r.stderr).toContain('src/main.tsx');
  });

  it('la hoja con tokens y base.css pero SIN ninguna @font-face: corta nombrando la tipografía', () => {
    const r = correrConVeneno(CSS_SANO.replace(CSS_FUENTES, ''));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('@font-face');
    expect(r.stderr).toContain('Georgia');
    expect(r.stderr).toContain('DM Sans');
    expect(r.stderr).toContain('src/main.tsx');
  });
});

/**
 * La IDENTIDAD del artefacto, que es otra pregunta que su FORMA: todo lo de arriba audita cómo está HECHO el
 * dist (manifest, metas, links, íconos, headers, sourcemaps, nombres) y nada de eso puede notar que el dist
 * es OTRA app. El bundle lleva horneada la config del `.env` — el único input del release que no está en git,
 * que no sale en `git status` y que no mira ninguna auditoría del circuito — así que un `.env` de otra
 * máquina, o con `VITE_DB=fake`, construye una app distinta que pasa todas las puertas de forma. Y la
 * verificación «en el aire» tampoco la caza: compara lo publicado contra el MISMO dist, así que confirma el
 * transporte y nunca la procedencia. Por eso el candado se afirma acá, y con veneno: el control positivo de
 * más arriba (dist sano, status 0, con el projectId adentro del bundle) es la otra mitad —que la puerta no
 * degenere en «siempre dispara»— pero por sí solo quedaría en verde aunque el candado no existiera.
 */
describe('el candado de identidad del artefacto', () => {
  it('un dist que no menciona el proyecto de .firebaserc: la puerta corta y manda al .env, no a cazar un nombre en el bundle', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    // mismo dist perfecto, con el bundle horneado contra OTRO proyecto (el `.env` de otra máquina)
    writeFileSync(join(raiz, 'dist', 'assets', 'index-abc123.js'), 'const cfg={projectId:"otro-proyecto-cualquiera"};');

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain(PROYECTO);
    // el mensaje tiene que nombrar al culpable: el operador asustado va al .env, no al bundle minificado
    expect(r.stderr).toContain('.env');
  });

  it('sin .firebaserc: falla CERRADO, en formato de la casa y nombrando el archivo (no aprueba por no poder preguntar)', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    rmSync(join(raiz, '.firebaserc'));

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('.firebaserc');
    expect(r.stderr).not.toMatch(/\n\s+at /);   // el stack crudo que puerta() promete no escupir
  });

  it('.firebaserc ilegible: el MISMO diagnóstico que da deploy.mjs — nombra el archivo y dice cómo se vuelve (no un SyntaxError anónimo detrás de «la puerta reventó»)', () => {
    // el criterio «de dónde sale el proyecto del release» vivía escrito en los dos scripts y ya había
    // divergido: acá caía al catch genérico de puerta() con un «Expected property name…» ambiguo entre los
    // TRES JSON que esa puerta parsea (firebase.json, el manifest y este) y sin decir cómo se vuelve
    const raiz = armarCopia();
    armarDistSano(raiz);
    writeFileSync(join(raiz, '.firebaserc'), '{roto');

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('.firebaserc');
    expect(r.stderr).toContain('firebase use');
    expect(r.stderr).not.toContain('reventó');   // el catch genérico no es el que tiene que contestar
    expect(r.stderr).not.toMatch(/\n\s+at /);
  });
});

/**
 * Las aserciones de COLOR del artefacto —el manifest de la saga de la barra y los dos <meta theme-color> del
 * index— eran las únicas de este archivo sin un solo veneno: `armarDistSano` las ejerce en verde y NADA las
 * ejercía en rojo, así que se podían borrar, invertir o cruzar (comparar un campo oscuro contra el papel
 * CLARO) y la suite seguía entera en verde. Probado antes de escribir esto: con las `exigir` de color del
 * bloque amputadas de una copia del script, el control positivo daba status 0 con stderr vacío y ningún test
 * caía.
 *
 * Y es exactamente la regresión que YA ocurrió: dos de los cuatro valores oscuros que se horneaban ENTONCES no
 * se chequeaban (D24), y el arreglo de ese bug viajaba sin SU test porque la verificación con veneno se había
 * hecho A MANO en el bautismo — una prueba manual no custodia nada la próxima vez que alguien toque el bloque.
 * Por eso los campos van de a UNO: envenenados juntos el mensaje nombra solo al primero, o sea que un caso
 * único reproduciría la misma cobertura parcial que causó el bug.
 *
 * Cada caso afirma el FRAGMENTO específico del mensaje y no un status 1 pelado: el resto del dist viaja sano,
 * pero un rojo de cualquier OTRA puerta pasaría un test de status y el caso quedaría verde por la razón
 * equivocada. El control POSITIVO es el de más arriba («el dist sano pasa la puerta entera»): mismo fixture,
 * mismo firebase.json real, status 0 — estos casos son ESE dist con un solo color corrido.
 *
 * Y cada caso afirma además el DESTINO del arreglo, que es la otra mitad de decir la verdad completa: estos
 * mensajes nombraban los dos operandos de la comparación —el artefacto y el token— y ninguno de los dos se
 * edita (uno es generado, el otro es la fuente de verdad), así que el ÚNICO archivo que el operador leía era
 * tokens.css y «arreglar» ahí revierte el cambio de paleta. El hex horneado vive en el bloque `manifest` de
 * vite.config.ts (lo demás lo genera VitePWA) y en el index.html de la RAÍZ del repo (no en el dist/index.html
 * que la puerta leyó: editar ese se evapora en el próximo build). Los fragmentos se eligen distintivos:
 * «index.html de la RAÍZ» y no el suelto `index.html`, que lo matchean otros mensajes de la misma corrida.
 */
describe('las aserciones de color del artefacto (el manifest y la familia cromática del index)', () => {
  function correrConVeneno(veneno: VenenoDelDist) {
    const raiz = armarCopia();
    armarDistSano(raiz, veneno);
    return correrSoloDist(raiz);
  }

  it('con theme_color de vuelta en el manifest (VitePWA inyectándolo): la puerta corta', () => {
    const r = correrConVeneno({ manifest: { theme_color: CLARO } });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('el manifest trae theme_color');
  });

  it('con el verde Vue metido en otro campo del manifest, en MAYÚSCULA: el centinela lo caza igual', () => {
    // sin theme_color: el centinela del literal tiene que ser una aserción PROPIA y no el reflejo de la de
    // arriba. Y en mayúscula, que es lo que ejerce el .toLowerCase() del script
    const r = correrConVeneno({ manifest: { id: '/?v=42B883' } });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('el manifest trae el verde Vue');
    expect(r.stderr).toContain('vite.config.ts');
  });

  it('con background_color contra el papel OSCURO: corta nombrando el campo y el esquema que le tocaba', () => {
    const r = correrConVeneno({ manifest: { background_color: OSCURO } });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('background_color del manifest');
    expect(r.stderr).toContain('no es el --paper claro');
    expect(r.stderr).toContain('vite.config.ts');
    // …y el PORQUÉ del claro, que es la única custodia escrita del último color horneado: este campo pinta
    // el SPLASH (no la barra), Chrome no tiene variante por modo para él y sin el campo cae a blanco, peor
    // que el crema en los dos modos (D25). Sin esto, «exige el claro» se lee como deriva de la saga de la
    // barra y el próximo lector lo borra o le hornea el papel oscuro: los dos caminos rompen algo.
    expect(r.stderr).toContain('SPLASH');
    expect(r.stderr).toContain('cae a blanco');
  });

  // Los campos oscuros del manifest son CÓDIGO MUERTO: manifest_parser.cc de Blink no los mira y el mojom
  // los marca «obsolete fields, to remove». Se publicaron durante la saga creyendo que Chrome los parsearía
  // «cuando se pusiera al día», y esa creencia costó una regresión entera (D25). La puerta ya no verifica que
  // ESPEJEN el token: verifica que NO ESTÉN, porque publicarlos hace creer que existe un mecanismo de color
  // por modo que no existe. El veneno es su reaparición, no su deriva.
  const CAMPOS_MUERTOS = ['dark_theme_color', 'dark_background_color', 'color_scheme_dark'];

  it.each(CAMPOS_MUERTOS)('con %s de vuelta en el manifest: corta y lo nombra a él', (campo) => {
    const r = correrConVeneno({ manifest: { [campo]: OSCURO } });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`el manifest declara ${campo}`);
    expect(r.stderr).toContain('vite.config.ts');
  });

  it('con un <meta theme-color> de más: corta, porque el de más PISA a los buenos aunque los buenos estén', () => {
    const r = correrConVeneno({ metas: [...METAS_SANOS, '<meta name="theme-color" content="#42b883">'] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('tienen que ser exactamente 2');
    expect(r.stderr).toContain('index.html de la RAÍZ');
  });

  it('con exactamente DOS metas pero los dos de light: corta — el agujero que contarlos no ve', () => {
    const r = correrConVeneno({ metas: [METAS_SANOS[0], METAS_SANOS[0]] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('el <meta theme-color> de light');
    expect(r.stderr).toContain('está repetido');
  });

  it('con el meta de dark corrido del token (un color a mano en vez del --paper): corta', () => {
    const r = correrConVeneno({ metas: [METAS_SANOS[0], '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000">'] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('el <meta theme-color> de dark');
    expect(r.stderr).toContain('index.html de la RAÍZ');
  });

  /**
   * El TERCERO de la familia, que hasta acá no tenía ninguna aserción: el <head> declara `color-scheme` al
   * lado de los dos theme-color (index.html:7, contra :8 y :9) y tokens.css lo espeja en el `:root`, y de las
   * tres declaraciones escritas a mano la puerta policiaba solo las dos que ya habían tenido su incidente.
   * Perderla no deja rastro en ninguna otra auditoría —no está en el manifest ni en el CSS de componentes— y
   * la barra de estado seguiría perfecta: quedaba el modo oscuro roto justo por donde estas puertas no
   * miraban. El caso (a) es EL bug: antes del arreglo ese dist salía en VERDE.
   * Probado con las tres `exigir` nuevas amputadas de una copia del script: los cuatro casos caen.
   */
  it('sin el <meta name="color-scheme"> en el index: corta — el arranque en frío en oscuro sería blanco', () => {
    const r = correrConVeneno({ esquema: [] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('<meta name="color-scheme">');
    expect(r.stderr).toContain('index.html de la RAÍZ');
  });

  it('con DOS <meta name="color-scheme">: corta en vez de elegir uno — qué meta gana no se verificó', () => {
    const r = correrConVeneno({ esquema: [META_ESQUEMA, META_ESQUEMA] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('tiene que ser exactamente 1');
  });

  it('con el meta corrido de tokens.css: corta nombrando los DOS valores, no solo que difieren', () => {
    const r = correrConVeneno({ esquema: ['<meta name="color-scheme" content="light">'] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('«light»');
    expect(r.stderr).toContain(`«${ESQUEMA}»`);
    expect(r.stderr).toContain('index.html de la RAÍZ');
  });

  it('sin la mitad CSS (tokens.css sin color-scheme): corta ahí, en vez de comparar el meta contra un vacío', () => {
    const r = correrConVeneno({ esquemaCss: '' });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('tokens.css declara 0');
  });

});

/**
 * El CUARTO <meta> escrito a mano del <head>, y el que quedó afuera cuando se cerró el agujero del
 * color-scheme: el conjunto de metas custodiados se venía armando por AUTOPSIA —cada uno entró cuando ya
 * había sangrado— y `viewport-fit=cover` no había sangrado nunca, así que quedó sin puerta justo en el lote
 * en que D25 lo asciende a pieza portante. Va en su PROPIO describe y no adentro del de color porque no es
 * cromático: no se compara contra ningún token, y meterlo ahí haría mentir al título del vecino.
 * Se pierde por el mismo camino que los otros tres —vive en el MISMO atributo `content` que
 * interactive-widget=resizes-content— y sale más caro: HOY apaga en silencio los cuatro
 * env(safe-area-inset-*) de tokens.css (la capa de bordes entera, de Header a Medidor) sin ROMPER nada —el
 * sistema inset-ea el viewport solo, así que ninguna prueba manual lo ve—, y MAÑANA es la línea a la que
 * D25 le apuesta el cierre de la saga de la barra. El caso (b) es EL bug: antes del arreglo ese dist salía
 * en VERDE. Cada caso afirma el FRAGMENTO del mensaje y el destino, no un status 1 pelado: con el resto del
 * dist sano, un rojo de cualquier otra puerta dejaría el caso verde por la razón equivocada.
 * Probado con las dos `exigir` nuevas amputadas de una copia del script: los tres casos caen.
 */
describe('la custodia del <meta viewport>: el cuarto del <head>, el que no es de color', () => {
  function correrConVeneno(veneno: VenenoDelDist) {
    const raiz = armarCopia();
    armarDistSano(raiz, veneno);
    return correrSoloDist(raiz);
  }

  it('sin el <meta name="viewport"> en el index: corta — los env(safe-area-inset-*) quedarían en 0px', () => {
    const r = correrConVeneno({ viewport: [] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('<meta name="viewport">');
    expect(r.stderr).toContain('index.html de la RAÍZ');
  });

  it('con el <meta viewport> puesto pero SIN viewport-fit=cover: corta nombrando las DOS consecuencias', () => {
    // el veneno realista: el meta sigue ahí y bien formado, pero alguien reescribió su `content` y se llevó
    // puesta la directiva — viven en el MISMO atributo que interactive-widget=resizes-content
    const r = correrConVeneno({ viewport: ['<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">'] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('viewport-fit=cover');
    expect(r.stderr).toContain('safe-area-inset');   // la de hoy
    expect(r.stderr).toContain('D25');               // la de mañana
    expect(r.stderr).toContain('index.html de la RAÍZ');
    // y lo que SÍ había, que es de dónde el operador saca qué le comió la directiva
    expect(r.stderr).toContain('interactive-widget=resizes-content');
  });

  it('con DOS <meta name="viewport">: corta en vez de elegir uno — qué meta gana no se verificó', () => {
    const r = correrConVeneno({ viewport: [META_VIEWPORT, META_VIEWPORT] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('tiene que ser exactamente 1');
  });
});

/**
 * Las otras tres puertas que leen el ARTEFACTO y se arreglan en vite.config.ts: la entrada `/__/` de la
 * denylist del service worker (los handlers de auth de D23) y las dos de íconos del manifest. Sus mensajes
 * nombraban el SÍNTOMA y no el DESTINO —la convención que el describe de arriba ya custodia para los colores
 * con su `toContain('vite.config.ts')`— porque la convención nació como parche del incidente de la deriva de
 * color y nunca barrió el archivo: quedaron con el síntoma justo las tres que todavía no habían mordido.
 * Sin destino, el operador abre `dist/sw.js` (el único archivo que el mensaje nombraba, y el que la puerta
 * acaba de leer), agrega la entrada a mano, lo ve VERDE con `--solo-dist` —el loop rápido que el propio
 * docstring del script ofrece— y descubre que no arregló nada recién con el deploy en curso, cuando el
 * `vite build` de la puerta 5 le evapora el parche y la MISMA puerta lo corta del otro lado.
 *
 * Y de paso son las dos únicas puertas del artefacto que no tenían NINGÚN veneno: `armarDistSano` las ejerce
 * en verde y nada las ejercía en rojo, así que se podían borrar enteras sin que cayera un solo test. Cada
 * caso afirma el FRAGMENTO del mensaje y el destino, no un status 1 pelado: el resto del dist viaja sano,
 * pero un rojo de cualquier otra puerta pasaría un test de status y el caso quedaría verde por la razón
 * equivocada. El control POSITIVO es el mismo de siempre («el dist sano pasa la puerta entera»).
 */
describe('las puertas del sw y de los íconos dicen dónde se arreglan (no solo qué se rompió)', () => {
  function correrConVeneno(veneno: VenenoDelDist) {
    const raiz = armarCopia();
    armarDistSano(raiz, veneno);
    return correrSoloDist(raiz);
  }

  it('sin la entrada /__/ en la denylist del sw: corta, y manda a vite.config.ts y no a dist/sw.js', () => {
    // se envenena SOLO la denylist: el precache queda intacto, así que la puerta de imprescindibles no tiene
    // nada que decir y el rojo es indudablemente el del service worker
    const r = correrConVeneno({ sw: SW_SANO.replace(String.raw`[/^\/__\//]`, '[]') });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('navigateFallbackDenylist');
    expect(r.stderr).toContain('vite.config.ts');
  });

  it('con un ícono de menos en el manifest: corta contando los que quedan, y manda a vite.config.ts', () => {
    // dos y no tres: la puerta exige CANTIDAD, y con 2 corta ahí — el caso del maskable va aparte porque con
    // este veneno esa segunda aserción no se ejerce nunca
    const r = correrConVeneno({ manifest: { icons: ICONOS_SANOS.slice(0, 2) } });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('declara 2 íconos');
    expect(r.stderr).toContain('vite.config.ts');
  });

  it('con los tres íconos pero ninguno maskable: corta igual, y manda a vite.config.ts', () => {
    // la cantidad está: lo que falta es el `purpose`, que es la mitad que la puerta de cantidad no ve
    const r = correrConVeneno({ manifest: { icons: ICONOS_SANOS.map(i => ({ ...i, purpose: undefined })) } });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('perdió el ícono maskable');
    expect(r.stderr).toContain('vite.config.ts');
  });
});

/**
 * `hosting.ignore` decide qué se PUBLICA y —porque TODAS las puertas del artefacto iteran `publicables`—
 * decidía también qué se AUDITA. No había una sola puerta en la dirección contraria («esto TIENE que estar
 * publicado»), así que agregarle una entrada apagaba la custodia de lo que nombra. Probado con veneno sobre
 * el dist real antes del arreglo: con `index.html`, `sw.js` o `registerSW.js` adentro del ignore, la corrida
 * entera salía en VERDE y se publicaba un release sin shell o sin service worker — las puertas del index
 * leen el archivo DEL DISCO, no de los publicables, así que aprobaban felices un index que no se iba a
 * publicar. Es «aprobar en vacío» un piso más arriba de donde se lo buscó: no una puerta que no encuentra
 * nada, sino el CONJUNTO entero sobre el que iteran todas.
 *
 * Los casos son los que NINGUNA otra puerta cubre. La hoja de estilos y el manifest no están acá a propósito:
 * los custodia el describe de los <link> de más arriba, que además dice qué se cae — cuando una puerta más
 * específica ya sabe la respuesta, que hable ella.
 *
 * Cada veneno afirma el TEXTO de la puerta —qué archivo falta Y que el culpable puede ser el `ignore` de
 * firebase.json—, no un status 1 pelado: un rojo por cualquier OTRA puerta pasaría un test de status y el
 * caso quedaría verde por la razón equivocada, que es justo la enfermedad que este arreglo cura. El control
 * POSITIVO es el de más arriba («el dist sano pasa la puerta entera»): mismo fixture, mismo firebase.json
 * real, status 0 — estos casos son ESE dist con una entrada de más en el ignore.
 */
describe('el `ignore` de firebase.json no puede sacar del release lo que la app necesita para arrancar', () => {
  /** el ignore REAL que copió armarDistSano MÁS el veneno: nada de una copia congelada acá */
  function envenenarElIgnore(raiz: string, extra: string[]) {
    const cfg = JSON.parse(readFileSync(join(raiz, 'firebase.json'), 'utf8'));
    cfg.hosting.ignore = [...cfg.hosting.ignore, ...extra];
    writeFileSync(join(raiz, 'firebase.json'), JSON.stringify(cfg));
  }

  it('con `index.html` en el ignore: corta nombrando el shell (antes salía VERDE: las puertas del index lo leen del disco)', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    envenenarElIgnore(raiz, ['index.html']);

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('para arrancar: index.html');
    // el operador tiene que leer QUIÉN es el culpable, no solo que algo falta
    expect(r.stderr).toContain('`ignore` de firebase.json');
  });

  it('con `sw.js` en el ignore: corta nombrando el service worker (su cadena de arranque no la miraba ninguna puerta)', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    envenenarElIgnore(raiz, ['sw.js']);

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('para arrancar: sw.js');
    expect(r.stderr).toContain('`ignore` de firebase.json');
  });

  it('con el <script> de entrada en el ignore: corta nombrándolo, y no por el rebote de la puerta de identidad', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    envenenarElIgnore(raiz, ['assets/index-abc123.js']);

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('para arrancar: assets/index-abc123.js');
    // el <script src> del index no lo miraba ninguna puerta: la corrida cortaba de rebote en la de IDENTIDAD
    // (ningún publicable menciona el proyecto, porque el bundle era lo que se dejó afuera) y mandaba al
    // operador a revisar su `.env` cuando el culpable estaba en firebase.json — un diagnóstico equivocado
    expect(r.stderr).not.toContain('.env');
  });

  it('con un ignore que se come el dist entero: corta diciendo que no se publica NI UN archivo (el conjunto vacío no pasa en silencio)', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    envenenarElIgnore(raiz, ['**']);

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NI UN archivo');
  });
});

/**
 * La tercera clave del bloque `hosting`. Las auditorías de arriba preguntan todas por ARCHIVOS —cuáles se
 * publican, con qué headers— y esa pregunta no alcanza a la ÚNICA URL por la que entra la familia: la app se
 * reparte por el link de la lista (`/l/<listId>`, que `src/app/router.ts` rutea por pathname), un path que no
 * existe en dist/ y que fabrica el rewrite. `ignore` y `headers` se auditaban exhaustivamente y `rewrites` no
 * lo leía nadie: enumerar dos de tres, con la tercera sosteniendo el 100% del tráfico.
 * El control POSITIVO es el de más arriba (dist sano, firebase.json REAL, status 0); estos son ESE dist con
 * el rewrite envenenado, y el criterio en sí lo fijan los tests de `destinosDeRewrite`.
 */
describe('el rewrite SPA de firebase.json tiene puerta antes de publicar', () => {
  function envenenarElRewrite(raiz: string, rewrites: unknown) {
    const cfg = JSON.parse(readFileSync(join(raiz, 'firebase.json'), 'utf8'));
    if (rewrites === undefined) delete cfg.hosting.rewrites; else cfg.hosting.rewrites = rewrites;
    writeFileSync(join(raiz, 'firebase.json'), JSON.stringify(cfg));
  }

  it('sin el bloque `rewrites`: corta ANTES de publicar y dice que los links de lista darían 404', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    envenenarElRewrite(raiz, undefined);

    const r = correrSoloDist(raiz);

    // el bug: sin esta puerta la corrida entera salía VERDE (los archivos y sus headers están perfectos) y
    // se publicaba un release impecable al que la familia no puede entrar
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('hosting.rewrites');
    expect(r.stderr).toContain('404');
    // y corta EN esta puerta, no de rebote en otra: la de identidad —la única posterior— manda al `.env`
    expect(r.stderr).not.toContain('.env');
  });

  it('con un `source` que ya no cubre los links de lista: ídem, aunque el rewrite siga existiendo', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    envenenarElRewrite(raiz, [{ source: '/api/**', destination: '/index.html' }]);

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('hosting.rewrites');
  });

  it('con una regla que matchea pero manda a otro archivo: el mensaje NOMBRA al destino intruso', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    envenenarElRewrite(raiz, [{ source: '**', destination: '/mantenimiento.html' }]);

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('/mantenimiento.html');
  });
});

/**
 * La intersección que nadie había preguntado: el deep link también LLEVA headers. La custodia de headers
 * entró por el incidente del shell viejo clavado una hora (D24) y se escribió sobre el bucle de ARCHIVOS; el
 * deep link entró por el incidente del rewrite y se chequea solo su existencia y su destino. Pero hosting
 * matchea headers por PATH DE PEDIDO, y `/l/<listId>` es el único path servido que no tiene archivo atrás:
 * quedaba por definición afuera de las dos mitades.
 *
 * El bug, verificado envenenando la config real ANTES del arreglo: con un bloque `/l/**` agregado a
 * `hosting.headers`, los publicables siguen todos pasando cache y seguridad (ese bloque no matchea ningún
 * path de archivo), `destinosDeRewrite` sigue dando `['/index.html']` y la corrida entera salía en VERDE —
 * con el link de WhatsApp, que es por donde entra un teléfono nuevo, sirviéndose cacheado una hora (el
 * incidente que motivó la política) y filtrando el listId por Referer.
 * El control POSITIVO es el de más arriba (dist sano, firebase.json REAL, status 0): estos son ESE dist con
 * un bloque de headers de más.
 */
describe('el deep link también recibe headers, y por eso tiene puerta antes de publicar', () => {
  /** los headers REALES que copió armarDistSano MÁS un bloque que le gana al catch-all en `/l/**` */
  function envenenarLosHeadersDelDeepLink(raiz: string, headers: { key: string; value: string }[]) {
    const cfg = JSON.parse(readFileSync(join(raiz, 'firebase.json'), 'utf8'));
    cfg.hosting.headers = [...cfg.hosting.headers, { source: '/l/**', headers }];
    writeFileSync(join(raiz, 'firebase.json'), JSON.stringify(cfg));
  }

  it('con un `/l/**` que le da caché de una hora: corta nombrando el deep link y la política que se pisó', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    envenenarLosHeadersDelDeepLink(raiz, [{ key: 'Cache-Control', value: 'public, max-age=3600' }]);

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain(RUTA_SPA_DE_PRUEBA);
    expect(r.stderr).toContain('public, max-age=3600');
    expect(r.stderr).toContain('no-cache');
    // y corta EN esta puerta, no de rebote en otra: la de identidad —la única posterior— manda al `.env`
    expect(r.stderr).not.toContain('.env');
  });

  it('con un `/l/**` que le afloja el Referrer-Policy: corta igual — esa URL lleva el listId, que es la llave', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    envenenarLosHeadersDelDeepLink(raiz, [{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }]);

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain(RUTA_SPA_DE_PRUEBA);
    expect(r.stderr).toContain('Referrer-Policy');
    expect(r.stderr).not.toContain('.env');
  });
});

/**
 * Un piso más arriba que los dos describes de acá arriba: no una CLAVE de `hosting` sin puerta, sino la
 * CONFIG entera con una mitad que nadie mira. Cada lector del espejo nació de un incidente y trajo la postura
 * correcta —lo que no modelo, TIRA—, pero aplicada a SU clave; el objeto `hosting` entero no lo custodiaba
 * nadie, así que el conjunto de claves modeladas lo definía qué lectores se habían escrito, y no qué honra
 * hosting. Cualquier clave que hosting honre y este espejo no lea era invisible por construcción.
 *
 * El veneno, verificado sobre el repo real ANTES del arreglo: con un bloque `redirects` agregado al
 * firebase.json REAL, la corrida entera salía en VERDE (los publicables, sus headers y el rewrite están
 * todos impecables) y se publicaba un release donde hosting —que resuelve redirects ANTES que los archivos
 * estáticos y que los rewrites— se lleva `/l/<listId>` a otro origen, con el listId, que es la llave, en el
 * path del 301. Se descubría recién en el aire, con el deploy ya afuera.
 * Y no es una forma exótica: el único `redirects` que este repo tuvo en su vida fue el `/h` que colapsó el
 * modelo de acceso entero (D22).
 * El control POSITIVO es el de más arriba (dist sano, firebase.json REAL, status 0); este es ESE dist con
 * una clave de más en `hosting`.
 */
describe('una clave de `hosting` que este espejo no modela frena el deploy antes de publicar', () => {
  function agregarleAlHosting(raiz: string, extra: Record<string, unknown>) {
    const cfg = JSON.parse(readFileSync(join(raiz, 'firebase.json'), 'utf8'));
    writeFileSync(join(raiz, 'firebase.json'), JSON.stringify({ ...cfg, hosting: { ...cfg.hosting, ...extra } }));
  }

  it('con un `redirects` que se roba el deep link: corta NOMBRANDO la clave (antes salía verde entero)', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    agregarleAlHosting(raiz, { redirects: [{ source: '/l/**', destination: 'https://otro.example/robado', type: 301 }] });

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('redirects');
    // en formato de la casa, no el stack crudo que el catch de puerta() promete traducir
    expect(r.stderr).not.toMatch(/at .*dist-publicado\.mjs/);
  });

  it('cualquier otra clave que hosting honre y nadie lea corta igual: la puerta es la FORMA, no una lista de venenos', () => {
    const raiz = armarCopia();
    armarDistSano(raiz);
    agregarleAlHosting(raiz, { i18n: { root: '/localized' } });

    const r = correrSoloDist(raiz);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('i18n');
  });

  it('el firebase.json REAL pasa: la lista modelada no quedó más angosta que la config del repo', () => {
    // la dirección contraria del mismo candado — que este arreglo no frene un deploy sano. Sin esto, sacar
    // una clave de CLAVES_MODELADAS abortaría TODOS los deploys y ningún test de este archivo lo vería.
    const raiz = armarCopia();
    armarDistSano(raiz);

    expect(correrSoloDist(raiz).status).toBe(0);
  });
});
