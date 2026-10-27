#!/usr/bin/env node
/**
 * La puerta determinista antes de cualquier deploy (npm run verificar; npm run deploy la corre solo).
 * Corre TODO lo que se puede verificar sin criterio humano, de lo barato a lo caro, y corta al primer fallo:
 *
 *   1. config del .env    — con qué env va a hornear el build: el ÚNICO input del release que no está en git,
 *                           y el que decide si el bundle habla con Firestore o con el Db falso de ejemplo
 *   2. tsc                — el tipo es la primera línea de defensa
 *   3. vitest unit + ui   — dominio y componentes
 *   4. vitest emulador    — el Db real contra las reglas reales
 *   5. build              — lo que de verdad se va a servir
 *   6. auditorías del dist — regresiones que los tests no ven porque viven en el ARTEFACTO, no en el código:
 *        · el service worker no se puede comer /__/ (los handlers de auth de D23; navigateFallbackDenylist)
 *        · el manifest sin theme_color inyectado (VitePWA mete #42b883 —verde Vue— si el campo falta: la saga
 *          de la barra de estado) y SIN los campos oscuros, que Chromium no parsea (ver D25)
 *        · la familia cromática del index: los dos <meta theme-color> con su media query y su token (no
 *          solo "que haya dos"), y el <meta color-scheme> que gobierna el canvas del navegador ANTES del
 *          CSS — los tres contra tokens.css
 *        · y el CUARTO <meta> escrito a mano, el que no es de color: el viewport declara viewport-fit=cover,
 *          la directiva que hace que env(safe-area-inset-*) devuelva algo distinto de 0px. Se pierde SIN
 *          romper nada (la app deja de ir de borde a borde y listo) y es la pieza a la que D25 le apuesta el
 *          cierre de la saga de la barra
 *        · el index LINKEA la hoja de estilos y el manifest (además de los dos íconos), y los cuatro hrefs
 *          están entre los publicables: los dos primeros los inyecta el build, así que no los ve ningún
 *          diff — y si se caen, el archivo sigue publicándose igual y todo lo demás queda en verde
 *        · y el CONTENIDO de la hoja linkeada, no solo la referencia: sus TRES cargas —los tokens que
 *          declara tokens.css, la capa global que declara base.css, y al menos una @font-face con url()
 *          propia; o sea las cuatro cosas que src/main.tsx importa en bloque— más los MISMOS --paper que
 *          tokens.css. Vacía, MEDIO vacía o con el papel corrido, el <link> sigue impecable
 *        · los sourcemaps NO se publican (llevan el fuente entero en sourcesContent, nombres incluidos)
 *        · el rewrite SPA manda los links de lista (/l/<listId>, la única URL por la que entra la familia,
 *          y que no existe como archivo) al index: sin él se publica un release impecable e inalcanzable
 *          — y esa URL recibe los MISMOS headers que los archivos: hosting matchea por path de PEDIDO, así
 *          que el único path sin archivo atrás quedaba afuera de la auditoría de headers, que itera archivos
 *        · el nombre de nadie viaja en NINGÚN archivo publicable
 *        · el projectId de .firebaserc SÍ viaja en alguno: un dist sin la config de Firebase adentro se
 *          construyó con otro .env (el candado sobre el artefacto, que vale también bajo --solo-dist)
 *      Los colores se comparan contra tokens.css (la fuente de verdad), no contra copias en este script:
 *      una copia congelada acá dejaría pasar la deriva token↔manifest, que es LA regresión de la saga.
 *
 * `--solo-dist`: solo las auditorías del artefacto ya construido (re-auditar rápido, y probarse a sí mismo).
 *
 * Las auditorías de criterio (UI/UX/arquitectura) NO viven acá: son el circuito de dos consultoras ciegas de
 * .claude/workflows/auditoria-release.js, y las dos cosas juntas son el proceso (.claude/skills/deploy).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEADERS_SEGURIDAD, RUTA_SPA_DE_PRUEBA, archivosPublicados, cachePolitica, destinosDeRewrite, directorioPublicado, esLocal, headerSegunPedido, imprescindiblesDelDist, pathDePedido, proyectoDelRelease as proyectoSegunConfig, urlsDeCss } from './dist-publicado.mjs';
import { problemasDeEnv } from './env-release.mjs';
import { esquemasDeTokens, papelesDeTokens, propiedadesDeCss, selectoresDeCss } from './tokens-css.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// los flags se validan TODOS antes de tocar nada: un typo de --solo-dist dispararía la corrida completa,
// y su `vite build` PISA el dist del deploy — el único ancla contra el que --solo-verificar puede comparar
for (const a of process.argv.slice(2)) {
  if (a !== '--solo-dist') { console.error(`\nNO SE DEPLOYA: flag desconocido: «${a}» (va --solo-dist, nada más)`); process.exit(1); }
}
const soloDist = process.argv.includes('--solo-dist');

/** Nombres que no pueden viajar en el producto (la app se comparte). Acá y solo acá: es la lista de control.
 *  'luke' cubre el username de esta máquina: las herramientas hornean rutas absolutas (pasó en sw.js.map). */
const NOMBRES_PROHIBIDOS = ['lucas', 'fanelli', 'luke'];
/** y la CLASE entera del leak de rutas, sin depender del username de turno (en minúsculas, como el scan) */
const PATRONES_RUTA = [':/users/', '\\users\\'];
const VERDE_VUE = '42b883';           // el default que inyecta VitePWA si theme_color falta

let paso = 0;
function puerta(nombre, fn) {
  paso++;
  process.stdout.write(`\n[${paso}] ${nombre}\n`);
  const inicio = Date.now();
  try {
    fn();
  } catch (e) {
    // una excepción cruda también es un NO, pero explicada en el formato de la casa y no como stack trace.
    // El consejo de rebuildear va SOLO cuando el archivo que faltó vive bajo el dist: pegárselo a un
    // firebase.json roto mandaba a un rebuild inútil (que encima pisa el dist-ancla) — hallazgo del circuito.
    // Y el hint lleva su PROPIO try: directorioPublicado re-lee firebase.json, y si el error original ES
    // firebase.json ausente/ilegible, esa relectura tiraría DE NUEVO acá adentro y saldría el stack crudo
    // que este catch promete no escupir. En ese caso enDist queda false —sin consejo de rebuild, que era el
    // punto del arreglo anterior— y el mensaje original ya nombra al culpable.
    let enDist = false;
    try { enDist = typeof e?.path === 'string' && e.path.replace(/\\/g, '/').includes(`/${directorioPublicado(ROOT)}/`); } catch { /* firebase.json ilegible */ }
    fallar(`la puerta «${nombre}» reventó: ${e?.message ?? e}${enDist ? '\n(¿dist incompleto o viejo? corré npm run build y probá de nuevo)' : ''}`);
  }
  process.stdout.write(`    ok (${((Date.now() - inicio) / 1000).toFixed(1)} s)\n`);
}
function correr(cmd) {
  const r = spawnSync(cmd, { stdio: 'inherit', cwd: ROOT, shell: true });
  if (r.status !== 0) fallar(`«${cmd}» salió con código ${r.status}`);
}
function fallar(msj) {
  console.error(`\nNO SE DEPLOYA: ${msj}`);
  process.exit(1);
}
function exigir(cond, msj) { if (!cond) fallar(msj); }
const fuente = (rel) => readFileSync(join(ROOT, rel), 'utf8');
/** El proyecto al que se deploya: `.firebaserc`, leído por dist-publicado.mjs — la MISMA función que usa
 *  deploy.mjs, no una segunda copia con el mismo comentario (eran dos, y del mismo archivo roto ya decían
 *  cosas distintas). El helper nombra el archivo y dice cómo se vuelve; acá va solo el formato de la casa.
 *  Se llama ADENTRO de puerta(), así que tiene que fallar() y no re-tirar: el catch genérico lo vestiría de
 *  «la puerta … reventó» —que es el bug— y encima apuntando a la puerta equivocada. Y fallar() sale del
 *  proceso, así que tampoco puede devolver undefined río abajo. */
function proyectoDelRelease() {
  try { return proyectoSegunConfig(ROOT); } catch (e) { fallar(e.message); }
}

if (!soloDist) {
  // `vite` se importa ACÁ adentro y no arriba del archivo: bajo --solo-dist este script corre en copias sin
  // node_modules (los tests lo spawnean en un mkdtemp), y un import de módulo lo mataría en la evaluación,
  // con el stack crudo de Node que puerta() promete no mostrar.
  const { loadEnv } = await import('vite');
  puerta('Configuración del build (.env)', () => {
    // El env se lee con el cargador de Vite y no con un parser propio: mismos archivos y misma precedencia
    // (.env, .env.local, .env.production, .env.production.local, y encima de todos las VITE_* exportadas en
    // la terminal) que la que va a usar el `npx vite build` de cuatro puertas abajo — verificado contra este
    // repo, no asumido, y vite.config.ts no toca envDir ni envPrefix.
    const problemas = problemasDeEnv(loadEnv('production', ROOT, 'VITE_'), proyectoDelRelease());
    exigir(problemas.length === 0, `el bundle se construiría con un .env que no es el del release:\n  · ${problemas.join('\n  · ')}\n(el .env no está en git, así que no lo ve ni el diff ni la revisión: mirá el tuyo —y las VITE_* exportadas en esta terminal, que lo pisan—. El README, bloque «rehacerlo en otra máquina», dice qué tiene que tener.)`);
  });
  puerta('Tipos (tsc)', () => correr('npx tsc --noEmit -p tsconfig.json'));
  puerta('Tests rápidos (unit + ui)', () => correr('npx vitest run --project unit --project ui'));
  puerta('Tests contra el emulador (Db real + reglas reales)', () => correr('node scripts/test-emu.mjs'));
  puerta('Build de producción', () => correr('npx vite build'));
}

puerta('Auditorías del dist', () => {
  const DIST = join(ROOT, directorioPublicado(ROOT));   // el directorio publicado sale de firebase.json, como el ignore
  exigir(existsSync(join(DIST, 'index.html')), 'no hay dist/ construido — corré `npm run build` (o `npm run verificar` sin --solo-dist)');
  const dist = (rel) => readFileSync(join(DIST, rel));

  /** Toda puerta que lee el ARTEFACTO nombra la FUENTE que lo genera, y no solo el síntoma: el problema se
   *  VE en dist/ y se corrige en vite.config.ts. Sin el destino, el operador «arregla» a mano el archivo del
   *  dist —el único que el mensaje nombraba, y el que la puerta acaba de leer—, lo ve verde con --solo-dist…
   *  y el próximo build se lo lleva puesto: se entera recién con el deploy en curso, del otro lado de la
   *  misma puerta. La regla es de la CLASE y no del incidente de turno: valen todas, hayan mordido o no. */
  const DONDE_VITE = (bloque) => `no se edita a mano: lo genera VitePWA desde \`${bloque}\` en vite.config.ts, y editarlo en dist/ se evapora en el próximo build (el que corre npm run deploy antes de publicar)`;

  // la fuente de verdad visual: los --paper de tokens.css, con el esquema (claro/oscuro) leído del BLOQUE
  // que declara cada uno (media query / data-theme — lo mismo que lee el navegador), no del orden de
  // aparición: un valor viejo en un comentario o un bloque claro nuevo fabricaban un «no coinciden» falso
  const tokensCss = fuente('src/styles/tokens.css');
  const { claros, oscuros } = papelesDeTokens(tokensCss);
  exigir(claros.length >= 1 && oscuros.length >= 1, `tokens.css declara ${claros.length} --paper claros y ${oscuros.length} oscuros, y hace falta al menos uno de cada esquema (¿cambió el formato de la paleta?)`);
  const paperClaro = claros[0].valor;
  const paperOscuro = oscuros[0].valor;
  const listado = (grupo) => grupo.map(p => `${p.valor} (${p.donde})`).join(', ');
  exigir(claros.every(p => p.valor === paperClaro), `tokens.css tiene --paper claros que no coinciden entre sí: ${listado(claros)}`);
  exigir(oscuros.every(p => p.valor === paperOscuro), `tokens.css tiene --paper oscuros que no coinciden entre sí: ${listado(oscuros)}`);

  // el SW no se come los handlers de auth (D23): sin esta entrada, el viaje a Google muere SOLO en la app
  // instalada — que es donde hay SW; ni tests ni emulador pueden verlo (lo cazó la revisión adversaria).
  // Se busca el patrón LITERAL (\/__\/): un «__» suelto en cualquier otra entrada del denylist no cuenta.
  exigir(dist('sw.js').toString('utf8').includes('\\/__\\/'), `el service worker no tiene la entrada /__/ en la navigateFallbackDenylist (se comería /__/auth/*) — el sw ${DONDE_VITE('workbox.navigateFallbackDenylist')}`);

  // el manifest de la saga de la barra: sin theme_color (ni el verde Vue inyectado) y SIN los campos
  // oscuros. Los dos «no» tienen la misma razon, verificada contra el codigo de Chromium y medida en el
  // telefono: en una PWA instalada la barra la pinta Chrome, y hornear un color rompe la pareja
  // fondo/iconos (los iconos los decide el MODO del sistema, no nuestro color: barra oscura en modo claro
  // = reloj negro sobre negro). Los campos dark_* / color_scheme_dark ni existen para Blink —
  // manifest_parser.cc no los mira y el mojom los marca «obsolete fields, to remove»—: publicarlos era
  // ruido que ademas hacia creer que habia un mecanismo. Ver D25 en decisiones.md.
  // Y ojo con el atajo al leer D25: ese «no hornear» es de los colores de BARRA. background_color pinta el
  // SPLASH, es la excepcion decidida y sigue horneado, asi que aca se EXIGE (el claro de tokens.css, uno para
  // los dos modos) en vez de prohibirse — la puerta no quedo vieja.
  // Los mensajes de deriva llevan el DESTINO del arreglo, y no solo el síntoma: el color se ve en el
  // ARTEFACTO (generado) pero el hex se edita en la fuente que lo genera. Sin esto, el único archivo que
  // estos mensajes nombraban era tokens.css —justo el que NO se toca, es la fuente de verdad—, así que el
  // operador «arreglaba» revirtiendo el cambio de paleta y el hex horneado seguía derivado. El destino va en
  // una constante y no pegado en cada mensaje: son varias aserciones y sería el mismo criterio escrito una vez
  // por cada una. No promete «los únicos lugares donde vive este hex» (también está en scripts/gen-icons.mjs
  // y scripts/qr.mjs): dice dónde vive el valor que ESTA puerta comparó, que es lo que el operador necesita.
  const NO_ES_TOKENS = 'tokens.css es la fuente de verdad de la paleta y acá no se toca';
  const DONDE_MANIFEST = `el manifest ${DONDE_VITE('manifest')}. En ese bloque está horneado el hex que hay que corregir. ${NO_ES_TOKENS}`;
  // El destino es el MISMO para los cuatro <meta> escritos a mano, pero la coletilla de tokens.css solo
  // aplica a los cromáticos: mandar a la fuente de verdad de la PALETA a alguien que perdió el viewport-fit
  // es ruido que lo hace abrir el archivo equivocado. Por eso el destino se comparte y el «no toques
  // tokens.css» se le cuelga solo a los que comparan un color.
  const DONDE_HEAD = 'estos <meta> se escriben a mano en el index.html de la RAÍZ del repo, no en el dist/index.html que esta puerta leyó (editarlo ahí se evapora en el próximo build)';
  const DONDE_METAS = `${DONDE_HEAD}. ${NO_ES_TOKENS}`;
  const manifestCrudo = dist('manifest.webmanifest').toString('utf8');
  const manifest = JSON.parse(manifestCrudo);
  exigir(!('theme_color' in manifest), 'el manifest trae theme_color: VitePWA lo inyectó de vuelta (¿se tocó el undefined explícito de vite.config.ts?)');
  exigir(!manifestCrudo.toLowerCase().includes(VERDE_VUE), `el manifest trae el verde Vue #${VERDE_VUE} — ${DONDE_MANIFEST}`);
  exigir(manifest.background_color?.toUpperCase() === paperClaro, `background_color del manifest (${manifest.background_color}) no es el --paper claro de tokens.css (${paperClaro}): va en CLARO a propósito — es el fondo del SPLASH, no de la barra, Chrome no tiene variante por modo para él (dark_background_color es código muerto) y sin el campo cae a blanco, peor que el crema en los dos modos. Ver D25. — ${DONDE_MANIFEST}`);
  for (const campo of ['dark_theme_color', 'dark_background_color', 'color_scheme_dark']) {
    exigir(!(campo in manifest), `el manifest declara ${campo}, que Chromium NO parsea (codigo muerto marcado para borrar): publicarlo es ruido y hace creer que hay un mecanismo de color por modo que no existe — ${DONDE_MANIFEST}`);
  }

  // EXACTAMENTE dos <meta theme-color> en el index, cada uno con su media query y su token. Ni contarlos ni
  // «que exista uno correcto» alcanzaba: el navegador usa el PRIMER meta cuya media matchea, así que un meta
  // de más (o uno sin media) pisa a los buenos aunque los buenos estén — todos tienen que estar bien.
  const metas = [...dist('index.html').toString('utf8').matchAll(/<meta[^>]*name="theme-color"[^>]*>/g)].map(m => m[0]);
  exigir(metas.length === 2, `el index tiene ${metas.length} <meta theme-color> y tienen que ser exactamente 2 (uno de más pisa a los buenos) — ${DONDE_METAS}`);
  const delEsquema = (esquema) => metas.filter(m => m.includes(`prefers-color-scheme: ${esquema}`));
  for (const [esquema, color] of [['light', paperClaro], ['dark', paperOscuro]]) {
    const propios = delEsquema(esquema);
    exigir(propios.length === 1 && propios[0].toUpperCase().includes(color), `el <meta theme-color> de ${esquema} no está, está repetido, o no lleva el --paper de tokens.css (${color}) — ${DONDE_METAS}`);
  }

  // La TERCERA de la familia, y hasta acá la única sin custodia: los dos theme-color de arriba pintan la
  // barra; `color-scheme` le dice al navegador que su PROPIO canvas —y los controles nativos que la app no
  // repinta— van oscuros ANTES de que llegue una regla de CSS. Si se pierde, con el teléfono en oscuro el
  // arranque en frío es blanco hasta que aplica la hoja, y el index va con `no-cache` mientras el .css va
  // hasheado e immutable: cada release estrena hash, así que el primer arranque de cada deploy es
  // exactamente esa ventana. Se cae en el próximo retoque del <head> sin dejar rastro en ninguna otra
  // auditoría de forma (no está en el manifest ni en el CSS de componentes), y la barra de estado seguiría
  // perfecta: el modo oscuro roto justo por donde estas puertas no miraban.
  // El valor NO se copia acá: sale de tokens.css, como los --paper, así que la puerta custodia las DOS
  // mitades del contrato y ninguna copia congelada suya puede firmar la deriva. Y exactamente 1 de cada
  // lado, como los <link>: qué declaración gana cuando hay dos es una precedencia que este circuito no
  // verificó, así que una forma nueva FRENA y se decide.
  const esquemas = esquemasDeTokens(tokensCss);
  exigir(esquemas.length === 1, `tokens.css declara ${esquemas.length} \`color-scheme\` y tiene que declarar exactamente 1 (hoy «light dark», en el :root): es la mitad CSS del contrato con el sistema, y el valor contra el que se compara el <meta name="color-scheme"> del index`);
  const metasEsquema = [...dist('index.html').toString('utf8').matchAll(/<meta[^>]*name="color-scheme"[^>]*>/g)].map(m => m[0]);
  exigir(metasEsquema.length === 1, `el index tiene ${metasEsquema.length} <meta name="color-scheme"> y tiene que ser exactamente 1: sin él, con el teléfono en oscuro el navegador arranca con su canvas CLARO hasta que aplica el CSS (flash blanco en cada arranque en frío, scrollbars claras, y los controles nativos que la app no repinta —el input de agregar, el dialog— en su variante clara sobre la pizarra) — ${DONDE_METAS}`);
  const esquemaDelMeta = metasEsquema[0].match(/content="([^"]*)"/)?.[1]?.replace(/\s+/g, ' ').trim().toLowerCase();
  exigir(esquemaDelMeta === esquemas[0], `el <meta name="color-scheme"> del index dice «${esquemaDelMeta}» y tokens.css declara «${esquemas[0]}»: las dos mitades del contrato con el sistema tienen que decir lo mismo — ${DONDE_METAS}`);

  // El CUARTO del <head> escrito a mano, y el único que quedaba sin custodia. No es cromático —por eso su
  // mensaje NO manda a tokens.css— pero se pierde por el mismo camino que los otros tres, y peor: vive en el
  // MISMO atributo `content` que interactive-widget=resizes-content, así que cualquier retoque del viewport
  // se lo lleva sin dejar rastro en ninguna otra auditoría de forma. Lo que se cae son las DOS puntas de D25.
  // HOY: sin `viewport-fit=cover` los cuatro env(safe-area-inset-*) de tokens.css devuelven 0px y se apaga en
  // silencio la capa de bordes entera (header, barra de agregar, done bar, toast, sheets, home, lista,
  // medidor). No se ROMPE nada —el sistema inset-ea el viewport solo—, así que ninguna prueba manual lo ve:
  // la app simplemente deja de ir de borde a borde en el teléfono con notch. MAÑANA: D25 le apuesta a esta
  // línea el cierre de la saga de la barra («la app ya está lista desde el nivel A»), y el día que Chrome
  // active el short-edges cutout mode la barra NO tomaría la paleta. `exactamente 1` como los <link> y el
  // color-scheme: qué meta gana cuando hay dos es una precedencia que este circuito no verificó, así que una
  // forma nueva FRENA y se decide. Y el `content` se parte como la LISTA de directivas que es, no se le
  // pregunta por un substring: así el mensaje puede imprimir las que SÍ había, que es lo que el operador
  // necesita ver para saber qué le comió la suya.
  const metasViewport = [...dist('index.html').toString('utf8').matchAll(/<meta[^>]*name="viewport"[^>]*>/g)].map(m => m[0]);
  exigir(metasViewport.length === 1, `el index tiene ${metasViewport.length} <meta name="viewport"> y tiene que ser exactamente 1: sin él el navegador cae a su viewport de escritorio (la app entra zoom-eada en el teléfono, y de paso los cuatro env(safe-area-inset-*) de tokens.css valen 0px), y con dos, qué declaración gana es una precedencia que este circuito no verificó — ${DONDE_HEAD}`);
  const directivasViewport = (metasViewport[0].match(/content="([^"]*)"/)?.[1] ?? '').split(',').map(d => d.trim().toLowerCase());
  exigir(directivasViewport.includes('viewport-fit=cover'), `el <meta name="viewport"> del index no declara viewport-fit=cover (dice «${directivasViewport.join(', ')}»): sin esa directiva los cuatro env(safe-area-inset-*) de tokens.css valen 0px y se apaga SIN ROMPER NADA la capa de bordes entera (header, barra de agregar, done bar, toast, sheets, home) — la app deja de ir de borde a borde en el teléfono con notch y ninguna prueba manual lo ve. Y es la pieza a la que D25 le apuesta el cierre de la saga de la barra: el día que Chrome active el short-edges cutout mode, sin ella la barra no toma la paleta. Vive en el MISMO atributo content que interactive-widget=resizes-content, así que se pierde en cualquier retoque del viewport — ${DONDE_HEAD}`);

  const publicables = archivosPublicados(ROOT);

  // Antes que NADA de lo que sigue, porque todo lo que sigue itera `publicables`: el conjunto no puede estar
  // vacío. Una puerta que valida lo que encuentra aprueba en vacío cuando no encuentra nada (lo dice el
  // comentario de los íconos, más abajo) — y `hosting.ignore` puede vaciar de un plumazo el conjunto sobre el
  // que iteran TODAS, que es esa misma enfermedad un piso más arriba.
  exigir(publicables.length > 0, 'con este `ignore` de firebase.json el release no publica NI UN archivo: dist/ entero queda ignorado, y todas las auditorías de abajo aprobarían sobre un conjunto vacío');

  // los sourcemaps se generan (debug local) pero NO se publican: llevan sourcesContent = el fuente entero,
  // comentarios con nombres incluidos. El circuito encontró un nombre propio servido en producción por este agujero.
  // Se pregunta por la PROPIEDAD —ningún .map entre los publicables—, no por el mecanismo: hoy lo resuelve
  // «**/*.map» en el ignore de firebase.json, pero un `build.sourcemap: false` en vite.config.ts o un patrón
  // equivalente («**/*.map*») lo resuelven igual. Afirmar el literal fallaba en las dos direcciones: abortaba
  // el deploy con un diagnóstico falso («se publicarían») cuando el leak ya estaba resuelto por el otro
  // camino, y quedaba verde si globARegex —el traductor del ignore, que ya se corrompió una vez— dejaba
  // entrar los .map a publicables (ahí el único backstop era que el sourcemap trajera un nombre adentro).
  const maps = publicables.filter(rel => rel.endsWith('.map'));
  exigir(maps.length === 0, `se publicarían sourcemaps (llevan el fuente entero adentro, en sourcesContent): ${maps.join(', ')} — o el ignore de firebase.json dejó de cubrirlos (hoy «**/*.map»), o apagá build.sourcemap en vite.config.ts`);

  // ni un archivo oculto en el dist: la semántica de hosting para dotfiles es ambigua (el ignore «**/.*» no
  // los cubre a cualquier profundidad según minimatch) — si un build futuro emite uno, esta puerta lo trae
  // a la mesa ANTES de que la ambigüedad decida sola qué se publica
  exigir(!publicables.some(rel => rel.split('/').some(p => p.startsWith('.'))), `dist/ trae archivos ocultos: ${publicables.filter(rel => rel.split('/').some(p => p.startsWith('.'))).join(', ')} — decidir si se publican y reflejarlo en firebase.json`);

  // los íconos: una puerta que «valida lo que encuentra» aprueba en vacío cuando no encuentra nada (las dos
  // consultoras lo convergieron, una lo probó con veneno) — por eso acá se exige CANTIDAD además de existencia
  exigir((manifest.icons ?? []).length >= 3, `el manifest declara ${manifest.icons?.length ?? 0} íconos y siempre tuvo 3 (192, 512, maskable): la instalación quedaría sin ícono en silencio — el manifest ${DONDE_VITE('manifest.icons')}`);
  exigir((manifest.icons ?? []).some(i => i.purpose === 'maskable'), `el manifest perdió el ícono maskable — el manifest ${DONDE_VITE('manifest.icons')}`);
  for (const icono of manifest.icons ?? []) {
    const rel = icono.src.replace(/^\//, '');
    exigir(publicables.includes(rel), `el manifest declara ${icono.src} y no está entre los publicables`);
  }
  // y los <link> del index PUBLICADO: no solo los íconos (este bloque nació como apéndice de la auditoría de
  // arriba y se quedó con su pregunta angosta). Dos de los cuatro están escritos a mano en el index del repo
  // —icon y apple-touch-icon, los ve cualquier diff— y los otros dos los INYECTA el build: el del CSS lo mete
  // Vite y el del manifest VitePWA. Esos dos no tienen más testigo que el ARTEFACTO, que es textualmente la
  // razón de existir de estas auditorías, y se caen en silencio: el .css puede seguir en dist/, entrar en
  // publicables, cobrar su immutable y comparar byte a byte idéntico contra lo publicado mientras el index
  // dejó de referenciarlo (se sirve la app sin una sola regla de estilo); y sin el link del manifest, las
  // auditorías del manifest de más arriba quedan mirando un archivo que el navegador nunca lee.
  // Los <link> se matchean por tag y el rel/href se extraen POR SEPARADO: una regex que exigiera un orden
  // de atributos se apagaría en silencio si alguien los reordena
  const links = [...dist('index.html').toString('utf8').matchAll(/<link[^>]*>/g)].map(m => m[0])
    .map(tag => ({ rel: tag.match(/rel="([^"]+)"/)?.[1], href: tag.match(/href="([^"]+)"/)?.[1] }));
  // cada uno con QUÉ se cae si falta: el mensaje lo va a leer alguien asustado, y «falta un link» no le dice
  // qué se rompió. `exactamente 1` es lo que el build emite hoy: si cambia de forma, la puerta FRENA y se
  // decide — la misma postura de pathDePedido/globARegex/configHosting, no una que se degrada sola.
  const LINKS_DEL_INDEX = [
    ['icon', 'el favicon'],
    ['apple-touch-icon', 'el ícono de iOS (instala con este, no con los del manifest)'],
    ['manifest', 'la instalación entera: sin el link el navegador NUNCA lee el manifest, y las aserciones de color de arriba quedan auditando un archivo huérfano (el ícono, el maskable y el background_color de la pantalla de arranque, inertes)'],
    ['stylesheet', 'la capa visual entera: se publicaría la app sin una sola regla de estilo'],
  ];
  for (const [rel, queSeCae] of LINKS_DEL_INDEX) {
    const propios = links.filter(l => l.rel === rel);
    exigir(propios.length === 1, `el index tiene ${propios.length} <link rel="${rel}"> y tiene que ser exactamente 1 — sin él se cae ${queSeCae}`);
    exigir(publicables.includes(propios[0]?.href?.replace(/^\//, '') ?? ''), `el index referencia ${propios[0]?.href} (${rel}) y no está entre los publicables — se cae ${queSeCae}`);
  }

  // …y el CONTENIDO de esa hoja, no solo que esté linkeada y publicada: hasta acá el CSS se auditaba por
  // EXISTENCIA, que es la pregunta completa para un PNG (de donde este bloque heredó la forma) y no para el
  // único archivo que pinta la pantalla. Probado con veneno sobre el dist real: con el .css VACÍO la corrida
  // entera salía en VERDE y se publicaba la app sin una sola regla (paleta, escala de espaciado, --font-*,
  // el --target de 44px); y con los --paper corridos, la pantalla pinta un papel y la barra de estado
  // —manifest y metas, que las aserciones de color de arriba sí validan contra tokens.css— pinta el otro: la
  // deriva de la saga entrando por la pata que nadie miraba. El gatillo realista no es borrar el .css a
  // mano: es que se caiga el `import './styles/tokens.css'` de src/main.tsx, o que un cambio de
  // cssCodeSplit/cssMinify o de plugin se coma el chunk — la clase de regresión que vive en el ARTEFACTO,
  // que es la razón de ser de estas auditorías. Se lee con el MISMO papelesDeTokens que la fuente (un solo
  // lector de --paper, no un segundo criterio más débil al lado) y se exige CANTIDAD antes de comparar:
  // sobre grupos vacíos el every() aprueba en vacío, que es exactamente el bug que este bloque arregla.
  // Va DESPUÉS del loop a propósito: recién acá está garantizado que hay exactamente 1 stylesheet y que su
  // href está entre los publicables, así que el archivo existe y dist(...) no puede tirar ENOENT.
  // Si algún día un componente declara --paper por su cuenta, papelesDeTokens TIRA nombrando el bloque
  // (falla cerrado, la postura del módulo) y se le enseña ahí CON test antes de publicarlo.
  const hojaPublicada = links.find(l => l.rel === 'stylesheet').href.replace(/^\//, '');
  const hoja = dist(hojaPublicada).toString('utf8');
  // El DESTINO del arreglo, escrito UNA vez para las cinco aserciones que siguen: el `.css` del dist lo
  // genera el build, así que el problema se VE acá y se corrige en la fuente — sin esto el operador
  // «arregla» a mano el único archivo que el mensaje nombraba y el próximo build se lo lleva puesto.
  const DONDE_HOJA = 'El .css del dist lo genera el build desde los `import` de src/main.tsx (líneas 3-6: las dos tipografías de @fontsource-variable, ./styles/tokens.css y ./styles/base.css) — fijate que sigan ahí y que vite.config.ts no haya cambiado cssCodeSplit/cssMinify; después rebuildeá (editar el .css en dist/ se evapora en el próximo build).';
  const pintados = papelesDeTokens(hoja);
  exigir(pintados.claros.length >= 1 && pintados.oscuros.length >= 1, `la hoja publicada (${hojaPublicada}) declara ${pintados.claros.length} --paper claros y ${pintados.oscuros.length} oscuros, y tiene que traer al menos uno de cada esquema: el <link> está y el archivo se publica, pero adentro no hay paleta — la pantalla se pintaría con el fondo por defecto del navegador en los dos modos. ${DONDE_HOJA}`);
  exigir(pintados.claros.every(p => p.valor === paperClaro) && pintados.oscuros.every(p => p.valor === paperOscuro), `la hoja publicada (${hojaPublicada}) pinta --paper ${listado(pintados.claros)} / ${listado(pintados.oscuros)} y tokens.css dice ${paperClaro} (claro) y ${paperOscuro} (oscuro): la pantalla pintaría un papel y la barra de estado —los dos <meta theme-color>, que sí coinciden con el token— pintaría el otro. El CSS publicado lo genera el build desde src/styles/tokens.css: no lo edites en dist/, rebuildeá.`);

  // …y las OTRAS DOS cargas de la hoja, más la CANTIDAD de la primera. Hasta acá este bloque preguntaba por
  // UN token (--paper) mientras su propio mensaje prometía cuidar «la paleta, la escala de espaciado,
  // --font-display/--font-body y el --target de 44px»: la brecha entre lo que el mensaje decía y lo que la
  // aserción miraba era la firma del bug. Nació del veneno «el .css VACÍO salía en verde» y se quedó con ESA
  // pregunta — el caso vacío curado y el MEDIO VACÍO vivo, que es la misma aprobación en vacío con otro
  // nivel de llenado (la enfermedad que este archivo ya curó dos veces más arriba: los íconos y el conjunto
  // de publicables). Reproducido con veneno sobre el dist REAL: una hoja de 128 bytes con SOLO el par
  // --paper salía en VERDE, y encima con las cinco woff2 borradas del dist y del precache también — o sea,
  // se publicaba una app sin `body { background: var(--paper) }`, sin el anillo :focus-visible, sin una
  // regla de los .module.css y con Fraunces y DM Sans caídas a Georgia / system-ui, con los tokens
  // declarados y nadie usándolos. El gatillo es el que el mensaje ya nombraba, una línea más abajo:
  // src/main.tsx importa CUATRO cosas (líneas 3-6) y este bloque cubría la tercera.
  // Las tres se DERIVAN de la fuente y no de una lista de nombres acá adentro: enumerar tokens y selectores
  // en este script los dejaría envejecer con cada retoque de tokens.css/base.css — justo lo contrario de lo
  // que promete el encabezado del archivo (los valores se comparan contra la fuente, no contra copias acá).
  // Lo que NO cubre, dicho a propósito: las reglas de los .module.css. CSS Modules hashea los nombres de
  // clase en el build, así que no hay derivación posible desde la fuente sin inventar un criterio nuevo, y
  // su caída es por componente (los importa cada uno), no de la capa entera.
  const listaCorta = (xs) => xs.slice(0, 6).join(', ') + (xs.length > 6 ? `, … (+${xs.length - 6} más)` : '');

  // A · los TOKENS, derivados de tokens.css: la escala de espaciado, --font-display/--font-body y el --target
  // que el mensaje de arriba prometía y nunca miraba. Medido: hoy sobreviven al build los 115 de los 115.
  const propiedadesDeLaHoja = propiedadesDeCss(hoja);
  const declaradas = propiedadesDeCss(tokensCss);
  const sinToken = declaradas.filter(prop => !propiedadesDeLaHoja.includes(prop));
  exigir(sinToken.length === 0, `la hoja publicada (${hojaPublicada}) no declara ${sinToken.length} de los ${declaradas.length} tokens de src/styles/tokens.css (${listaCorta(sinToken)}): el sistema de tokens no llegó entero, y todo lo que los pide —la escala de espaciado, --font-display/--font-body, el --target de 44px— se queda sin valor. ${DONDE_HOJA}`);

  // B · la CAPA GLOBAL de base.css: sin ella los tokens quedan declarados y no los usa nadie. Se lee acá
  // adentro y no arriba con tokensCss a propósito: arriba, una corrida que todavía no llegó a este bloque
  // (dist incompleto) moriría por un base.css ausente en vez de por lo suyo — el hint de rebuild de
  // puerta() tiene su test y llega hasta acá con solo tokens.css escrito.
  // La pregunta es por la CAPA y no por cada regla: se comparan los SELECTORES que base.css declara contra
  // los que trae la hoja, así que caza el `import './styles/base.css'` caído —que es el gatillo— y no la
  // pérdida de una regla suelta adentro de un selector que igual está.
  const baseCss = fuente('src/styles/base.css');
  const selectoresDeLaHoja = selectoresDeCss(hoja);
  const deBase = selectoresDeCss(baseCss);
  const sinBase = deBase.filter(sel => !selectoresDeLaHoja.includes(sel));
  exigir(sinBase.length === 0, `la hoja publicada (${hojaPublicada}) no trae ${sinBase.length} de los ${deBase.length} selectores de src/styles/base.css (${listaCorta(sinBase)}): la capa global no llegó, así que los tokens quedan declarados y no los usa nadie — se cae el body con \`background: var(--paper)\`, \`color: var(--ink)\` y \`font-family: var(--font-body)\` (pantalla blanca del navegador con su letra, en los dos modos), el anillo \`:focus-visible\` de todo lo interactivo y el bloque global de prefers-reduced-motion. ${DONDE_HOJA}`);

  // C · la TIPOGRAFÍA, con CANTIDAD: al menos una @font-face que pida un woff2 NUESTRO. El predicado de
  // «local» sale de dist-publicado.mjs (esLocal) y no de una segunda copia acá. Esta exigencia estaba
  // delegada al test contra el dist real —correcta en criterio y nula en el tiempo: ese test corre en la
  // puerta 3 y el build es la 5, así que su sujeto es el dist ANTERIOR, y bajo --solo-dist ni corre—.
  // Medido: 5 caras en el dist limpio, 0 con los `import '@fontsource-variable/…'` caídos.
  const caras = [...hoja.matchAll(/@font-face\s*\{[^}]*\}/g)].map(m => m[0]).filter(b => urlsDeCss(b).some(esLocal));
  exigir(caras.length >= 1, `la hoja publicada (${hojaPublicada}) no declara NINGUNA @font-face con un url() propio: no pide una sola woff2 de este release, así que --font-display y --font-body caen a sus fallbacks y la app se sirve en Georgia y system-ui en vez de Fraunces y DM Sans. ${DONDE_HOJA}`);

  // Y la misma pregunta para TODO el arranque, no solo para los cuatro <link> de arriba: `hosting.ignore`
  // decide qué se publica y —porque todas estas puertas iteran `publicables`— decidía también qué se AUDITA,
  // sin que nada preguntara nunca en la dirección contraria («esto TIENE que estar publicado»). Probado con
  // veneno sobre el dist real: con `index.html`, `sw.js` o `registerSW.js` adentro del ignore, la corrida
  // entera salía en VERDE — las puertas del index leen el archivo DEL DISCO, así que aprueban felices un
  // index que no se va a publicar, y el `<script>` de entrada y la cadena del service worker no los miraba
  // nadie. Va DESPUÉS del bloque de los <link> a propósito: ahí donde una puerta más específica ya sabe qué
  // se cae, que hable ella. El conjunto se DERIVA del artefacto (index → sus <script>/<link> → registerSW →
  // el sw que registra → el chunk de workbox que importa → las URLs de su precache; y las `url()` locales
  // de la hoja, que son las que traen la tipografía) y vive en dist-publicado.mjs, compartido con
  // deploy.mjs: enumerarlo acá envejecería, y `--solo-verificar` —que no corre este script y es con lo que
  // se audita producción— se quedaría sin la puerta.
  const faltan = imprescindiblesDelDist(DIST).filter(rel => !publicables.includes(rel));
  exigir(faltan.length === 0, `el release no va a publicar archivos de los que la app depende para arrancar: ${faltan.join(', ')}. Si están en dist/, los tapa una entrada del \`ignore\` de firebase.json (sacala); si no están, el index o el service worker referencian algo que el build no emitió. En cualquiera de los dos casos hosting contesta esos paths con el index del rewrite (200, no 404) y ninguna otra puerta se entera: lo que no se publica tampoco se audita. Ojo si lo que falta sale del precache del service worker: una URL precacheada que hosting no sirva rompe su install («bad-precaching-response») y eso solo se ve en la app instalada.`);

  // la config de headers le da a cada publicable EXACTAMENTE lo que la política manda: caché según el build
  // (inmutable lo hasheado, revalidación el resto) y los headers de seguridad en todo. Chequeado ACÁ, antes
  // de publicar — que la config esté mal no puede descubrirse recién en el aire, con el deploy ya afuera
  const hosting = JSON.parse(fuente('firebase.json')).hosting ?? {};
  const bloques = hosting.headers ?? [];
  // el criterio se escribe UNA vez y se le pregunta por PEDIDO (que es como matchea hosting), para poder
  // usarlo también sobre el path que no tiene archivo atrás — el deep link, abajo del rewrite
  const exigirHeadersDe = (pedido, politica, etiqueta) => {
    const config = headerSegunPedido(bloques, pedido, 'Cache-Control');
    exigir(config !== null && config.includes(politica), `los headers de firebase.json le dan a ${etiqueta} «${config}» y la política del build pide «${politica}»`);
    for (const [clave, valor] of Object.entries(HEADERS_SEGURIDAD)) {
      exigir(headerSegunPedido(bloques, pedido, clave) === valor, `firebase.json no le da ${clave}: ${valor} a ${etiqueta}`);
    }
  };
  for (const rel of publicables) exigirHeadersDe(pathDePedido(rel), cachePolitica(rel), `/${rel}`);

  // y el rewrite SPA, la tercera clave del bloque `hosting`. Las dos auditorías de arriba preguntan por
  // ARCHIVOS (cuáles se publican, con qué headers) y esa pregunta no alcanza a la ÚNICA URL por la que entra
  // la familia: la app se reparte por el link de la lista (`/l/<listId>`), que no existe como archivo y lo
  // fabrica este rewrite. Sin él —o con un `source` angostado, o una regla nueva que matchee con otro
  // destino— los publicables siguen todos perfectos con sus headers, «/» sigue devolviendo el index, y cada
  // link de la familia da 404. Se exige CANTIDAD (falla cerrado: sin `rewrites`, esto da CERO destinos y no
  // se deploya, en vez de aprobar en vacío) y que TODAS las reglas que matchean manden al index — todas, no
  // «la primera», porque el orden de resolución de hosting no lo verificó este circuito (ver destinosDeRewrite).
  const destinos = destinosDeRewrite(hosting.rewrites ?? [], RUTA_SPA_DE_PRUEBA);
  exigir(destinos.length > 0, `ninguna regla de \`hosting.rewrites\` en firebase.json matchea «${RUTA_SPA_DE_PRUEBA}»${(hosting.rewrites ?? []).length === 0 ? ' (no hay ni una)' : ''}: ese path no es un archivo, lo sirve el rewrite — sin él hosting contesta 404 a CADA link de lista, que es la única URL por la que entra la familia (la app se reparte por /l/<listId>). Todo lo demás del release puede estar impecable igual. Va {"source": "**", "destination": "/index.html"}`);
  exigir(destinos.every(d => d === '/index.html'), `\`hosting.rewrites\` manda «${RUTA_SPA_DE_PRUEBA}» a ${destinos.filter(d => d !== '/index.html').map(d => `«${d}»`).join(', ')} y tiene que ir a /index.html: los links de lista son la única URL por la que entra la familia, y ahí tiene que contestar el shell de la app`);

  // y esa misma URL también LLEVA headers. La auditoría de arriba pregunta por ARCHIVOS y este path no es
  // ninguno, así que quedaba fuera de las dos mitades: un bloque nuevo tipo `/l/**` (o angostar el «**» a «/»)
  // servía el link de WhatsApp —por donde entra un teléfono nuevo— cacheado una hora, que es LITERALMENTE el
  // incidente que motivó la política (D24), y sin `no-referrer` filtraba el listId, que es la llave.
  // Se pregunta por PEDIDO y no por archivo: hosting matchea por el path pedido, y pathDePedido() acá
  // devolvería «//l/…» (otra barra) — o sea, la respuesta equivocada en silencio.
  // Va DESPUÉS de las dos aserciones del rewrite a propósito: que ese path sirva el index es la premisa de
  // exigirle la política del index. Si el rewrite está roto, que hable la puerta del rewrite.
  exigirHeadersDe(RUTA_SPA_DE_PRUEBA, cachePolitica('index.html'),
    `${RUTA_SPA_DE_PRUEBA} (el link de lista: no es un archivo, lo sirve el rewrite con el index)`);

  // el nombre de nadie viaja: TODO lo publicable, recursivo, sin distinguir mayúsculas — y tampoco viaja
  // ninguna ruta absoluta de máquina (la clase entera del leak, no solo el username de hoy).
  // En el mismo pase, el candado sobre el ARTEFACTO (no sobre la intención): el bundle del release lleva
  // horneada la config de Firebase, así que el projectId de .firebaserc tiene que aparecer en alguno. Si no
  // aparece, este dist se construyó con otro .env — es la app con el Db falso, y la puerta del .env no lo
  // ve bajo --solo-dist (donde no corre). Verificado en las dos direcciones sobre el dist real.
  const proyecto = proyectoDelRelease();
  let vioAlProyecto = false;
  for (const rel of publicables) {
    const contenido = dist(rel).toString('latin1').toLowerCase();
    if (contenido.includes(proyecto.toLowerCase())) vioAlProyecto = true;
    for (const nombre of NOMBRES_PROHIBIDOS) exigir(!contenido.includes(nombre), `«${nombre}» viaja en dist/${rel}`);
    for (const patron of PATRONES_RUTA) exigir(!contenido.includes(patron), `una ruta absoluta de máquina («…${patron}…») viaja en dist/${rel}`);
  }
  exigir(vioAlProyecto, `ningún archivo publicable menciona «${proyecto}»: este dist no lleva adentro la config de Firebase del proyecto al que se deploya, así que se construyó con otro .env — con VITE_DB distinto de «firestore» el bundle es la app con el Db falso y la lista de ejemplo; con otro VITE_FIREBASE_PROJECT_ID habla con otra base. Rebuildeá con el .env del release: npm run verificar (sin --solo-dist)`);
});

console.log(soloDist
  ? '\nAuditorías del dist pasaron (--solo-dist: la config del .env, tipos, tests, emulador y build NO corrieron — y el dist puede ser viejo).'
  : '\nRelease verificada: todas las puertas deterministas pasaron.');
