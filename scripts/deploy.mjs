#!/usr/bin/env node
/**
 * El deploy con las puertas puestas (npm run deploy). Nunca `firebase deploy` a mano: este script existe para
 * que sea IMPOSIBLE publicar sin verificar — y sin consentimiento. Cuatro tiempos:
 *
 *   0. --dale                  — publicar es lo único irreversible del circuito: sin el flag (la palabra del
 *      dueño, codificada), el script verifica todo y se planta ANTES de tocar producción
 *   1. verificar-release.mjs   — todas las puertas deterministas (tests, build, auditorías del artefacto)
 *   2. firebase deploy         — firestore (reglas + índices) Y hosting, SIEMPRE juntos: deployar solo hosting
 *      dejaba al circuito ciego a la deriva de reglas (código nuevo contra reglas viejas = la pantalla
 *      «Esta lista no es tuya… todavía.» —así se ve una denegación de LECTURA desde D22, ver SINTOMA_PERMISO—
 *      en producción con todas las puertas en verde). Republicar reglas idénticas es gratis e idempotente.
 *   3. verificación en el aire — todo lo publicado EN HOSTING (la lista sale de recorrer dist/, no de una
 *      enumeración que envejece) se compara byte a byte con el dist local; el deep link de la SPA (/l/<listId>,
 *      la única URL por la que entra la familia, y que no es un archivo: lo fabrica el rewrite) tiene que
 *      devolver el index; y el handler de auth tiene que responder. De firestore —la otra mitad del tiempo 2,
 *      reglas E ÍNDICES— no se pide NADA acá, y por eso el cierre lo dice con todas las letras: ese «TODO lo
 *      publicado» hacía sonar verdadera una afirmación que firmaba por la mitad que nadie mira.
 *
 * `node scripts/deploy.mjs --solo-verificar` corre solo el tiempo 3: para auditar producción sin tocarla.
 * Con `--base <url>` la misma verificación apunta a un canal de preview (hosting:channel:deploy): el ensayo
 * general de la verificación entera, sin tocar el canal vivo.
 * Ojo: compara contra el dist LOCAL, y cada build lleva el sello __BUILD__ adentro — solo da idéntico con el
 * dist del deploy mismo. Un «DIFIERE» tras un rebuild posterior no es un incidente: es la comparación
 * haciendo su trabajo (el mensaje de error lo aclara en pantalla, no solo acá).
 *
 * Este script es la mitad determinista del proceso; la otra mitad (las dos consultoras ciegas, en loop hasta
 * que las seis firmas den «pasa») está en .claude/skills/deploy y corre ANTES de esto.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEADERS_SEGURIDAD, RUTA_SPA_DE_PRUEBA, archivosIgnorados, archivosPublicados, cachePolitica, directorioPublicado, imprescindiblesDelDist, pathDePedido, proyectoDelRelease } from './dist-publicado.mjs';
// el dominio de hosting sale del MISMO lugar que lo exige la puerta del .env (env-release.mjs: sin I/O ni
// dependencias): una sola definición de <proyecto>.web.app, para que BASE y el authDomain no puedan divergir
import { dominioDeHosting } from './env-release.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function abortar(msj) { console.error(`\nABORTADO: ${msj}`); process.exit(1); }

// los flags se validan TODOS: uno desconocido (o mal tipeado) no se traga en silencio — en este script un
// malentendido de línea de comandos puede significar verificar el blanco equivocado
const args = process.argv.slice(2);
const iBase = args.indexOf('--base');
// --base <url>: apuntar la verificación a un canal de preview (hosting:channel:deploy) para ensayarla
// ENTERA antes de tocar el canal vivo. La URL es OBLIGATORIA y validada: sin eso, un --base olvidado caía
// en silencio al canal vivo y el ensayo «contra el preview» corría contra producción (hallazgo, 4 firmas).
const baseOverride = iBase >= 0 ? args[iBase + 1] : null;
if (iBase >= 0 && !/^https?:\/\//.test(baseOverride ?? '')) abortar('--base pide la URL del canal de preview (https://…): sin ella la verificación apuntaría al canal vivo sin avisar');
for (const [i, a] of args.entries()) {
  if (i === iBase + 1 && iBase >= 0) continue;               // la URL de --base
  if (!['--dale', '--solo-verificar', '--base'].includes(a)) abortar(`flag desconocido: «${a}» (van --dale, --solo-verificar y --base <url>)`);
}
const soloVerificar = args.includes('--solo-verificar');
const dale = args.includes('--dale');
if (dale && soloVerificar) abortar('--dale es para publicar y --solo-verificar no publica: elegí uno (el consentimiento no se gasta en una corrida que no lo usa)');

// la URL sale de .firebaserc: nada hardcodeado, y si el proyecto cambia, esto sigue apuntando bien. El
// criterio vive en dist-publicado.mjs, COMPARTIDO con verificar-release.mjs: estaba escrito en los dos
// scripts y ya había divergido (el mismo archivo roto, dos diagnósticos distintos según qué comando corriera
// el operador). Esa lectura es I/O falible —ausente, ilegible, o un JSON válido que no es objeto reventaban
// acá con el stack crudo de Node— y el helper ya tira nombrando el archivo y la salida: acá solo se le pone
// el «ABORTADO:» que este script promete, igual que la de firebase.json más abajo
let proyecto;
try { proyecto = proyectoDelRelease(ROOT); } catch (e) { abortar(e.message); }
if (baseOverride && !soloVerificar) abortar('--base es solo para --solo-verificar: el deploy real siempre va al canal vivo');
const BASE = (baseOverride ?? `https://${dominioDeHosting(proyecto)}`).replace(/\/+$/, '');
/** cómo nombrar el blanco en los mensajes: decir «producción» apuntando a un canal de preview sería mentir */
const BLANCO = baseOverride ? `el canal de preview (${BASE})` : 'producción';
/** Con --base el blanco lo TIPEÓ el operador y es EFÍMERO (la skill crea el canal con `--expires 1h`): cuando
 *  del otro lado no vino lo que se esperaba, el sospechoso más probable es ese blanco, no la señal ni el
 *  servidor. Un solo lugar para la pista: la misma va en la rama de red y en la de status. Vacía sin --base,
 *  donde BASE sale de .firebaserc y es un host vivo por construcción — ahí «error de red» sí quiere decir
 *  «no hay red», y mandar a revisar la URL sería una pista falsa. */
const PISTA_BASE = baseOverride
  ? `\n(ojo: --base apunta a ${BASE} — el sospechoso más probable es ese blanco: revisá que sea la URL que imprimió \`hosting:channel:deploy\` y que el canal no se haya vencido (se crea con \`--expires 1h\`), antes de sospechar de la señal o del servidor)`
  : '';

function correr(cmd) {
  const r = spawnSync(cmd, { stdio: 'inherit', cwd: ROOT, shell: true });
  if (r.status !== 0) abortar(`«${cmd}» salió con código ${r.status}`);
}

/** El blanco real al restaurar reglas: lo que PRODUCCIÓN tenía, que no es un punto de la línea de tiempo de
 * git — una release agrupa commits y el deploy corre sobre el working tree, así que «el commit anterior»
 * puede ser una versión que nunca estuvo publicada. Un solo lugar para el criterio, en ambos mensajes. */
const REGLAS_DE_PROD = 'el firestore.rules que producción tenía hasta recién: el del último deploy — no necesariamente el del commit anterior, una release agrupa commits (`git log --oneline -- firestore.rules` para ubicar candidatos; el historial publicado autoritativo está en la consola de Firebase: Firestore → Reglas)';

/** El paso que le falta a la restauración. Pisar firestore.rules para parar el sangrado deja las reglas
 *  VIEJAS en el working tree, que es EL input del deploy (una release corre sobre el working tree y no sobre
 *  un commit: lo dice REGLAS_DE_PROD acá arriba), así que la convergencia —`npm run deploy -- --dale`—
 *  publicaría esas reglas contra el código NUEVO: el fallo simétrico del que existe este circuito (el
 *  incidente «mercados» de la línea 70 de decisiones.md), y esta vez sin una sola línea en pantalla que lo
 *  anuncie. El runbook estaba escrito como una secuencia de actos sobre PRODUCCIÓN, con el repo de
 *  escenografía de solo lectura; y la casa ya dice cómo se vuelve cada vez que manda a tocar un archivo del
 *  release (firebase.json acá abajo, .firebaserc en dist-publicado.mjs): ese criterio no había llegado justo
 *  acá, donde la instrucción venía disfrazada de acto de producción. Un solo lugar para el paso, en los dos
 *  mensajes que mandan a restaurar. El comando está VERIFICADO: `git checkout <sha> -- x` deja el viejo
 *  también en el ÍNDICE, así que `git checkout -- x` restaura DEL índice y no devuelve nada —el operador
 *  creería que deshizo y seguiría con las reglas viejas—; `git checkout HEAD -- x` sí devuelve, y solo si lo
 *  de la release estaba commiteado: por eso lo primero que se pide es la copia previa.
 *  tests/unit/runbook-devolver-reglas.test.ts exige que todo mensaje que mande a restaurar mande a devolver. */
const DEVOLVER_REGLAS = 'Y OJO con el ARCHIVO: parar el sangrado te deja el working tree con las reglas VIEJAS, y el deploy publica LO QUE HAY en el working tree. Antes de re-correr `npm run deploy -- --dale`, devolvé firestore.rules al de la release: guardá una copia del archivo ANTES de pisarlo (si el de la release estaba commiteado alcanza `git checkout HEAD -- firestore.rules`; `git checkout -- firestore.rules` NO sirve, porque `git checkout <sha> -- firestore.rules` dejó el viejo también en el índice y esa forma restaura DEL índice). Si no lo devolvés publicás código NUEVO contra reglas VIEJAS: si la suite del emulador cubre esa regla, `npm run verificar` sale rojo sin decirte que la causa es el archivo que restauraste; si no la cubre, se publica en silencio con las seis puertas en verde.';

/** Cómo se vuelve atrás DE VERDAD. `hosting:rollback` NO existe en firebase-tools: el registro de la versión
 * instalada solo tiene hosting:channel:…, hosting:clone, hosting:disable y hosting:sites:… — y sin embargo lo
 * prometían los tres mensajes del único momento irreversible del circuito, así que la única salida documentada
 * era una pared, descubierta con la app de la familia rota. Un solo lugar para el mecanismo: las menciones de
 * abajo salen de acá, y tests/unit/comandos-firebase.test.ts corre lo IMPRESO contra el firebase-tools real.
 * Y acá vive también el CRITERIO —qué se lleva puesto el que obedece—, no solo el mecanismo: ese hecho estaba
 * escrito una sola vez, pegado a la rama donde la fuga ya se había DETECTADO (cortarFuga), así que las otras
 * ramas mandaban a la versión anterior sin decir que republica lo que el `ignore` retiene hoy (el nombre
 * adentro del sourcemap: el incidente que fundó este circuito, D24). tests/unit/runbook-rollback.test.ts
 * exige la cláusula mientras el `ignore` retenga algo, y que el camino de vuelta no se escriba fuera de acá. */
const ROLLBACK = `volvé a la versión anterior desde la consola de Firebase (Hosting → ${proyecto} → historial de versiones → «⋮» de la versión anterior → «Rollback»), que es el camino autoritativo e inmediato; por CLI, con el id de versión que sale de esa misma pantalla: \`npx firebase hosting:clone ${proyecto}@<versionId> ${proyecto}:live\`. OJO con lo que te llevás: eso restaura el manifiesto COMPLETO de esa versión, no solo lo que falló, así que puede volver a publicar lo que el \`ignore\` de firebase.json saca HOY del release (hoy, los sourcemaps: llevan el fuente entero en sourcesContent, con los nombres adentro — el incidente que fundó este circuito, D24). Es contención TEMPORAL, para que la familia tenga la app en pie; no es el destino: apenas esté en pie, convergé hacia adelante y volvé a publicar por el circuito, no te quedes en la versión vieja`;

/** Cómo se vuelve atrás, completo: el rollback de hosting NO revierte reglas (van juntas en el deploy). */
const VUELTA_ATRAS = `${ROLLBACK} — y si esta release tocó firestore.rules o índices, el rollback solo NO alcanza: hay que restaurar ${REGLAS_DE_PROD} y \`npx firebase deploy --only firestore\`, o quedan las reglas nuevas contra el código viejo. ${DEVOLVER_REGLAS}`;

/** Qué NO hay que correr mientras un fallo post-publicación siga abierto, dicho DONDE el operador todavía
 * puede no hacerlo. El reflejo natural después de un rojo es «déjame re-correr las puertas», y las puertas de
 * este proyecto se abren con `npm run verificar` (CLAUDE.md, el README, el paso 1 de la skill, y el agente que
 * cierra cada vuelta del circuito): su última puerta es un `vite build`, que PISA dist/. Y dist/ es el único
 * ancla contra el que `--solo-verificar` —lo que estos mismos mensajes acaban de recomendar— puede contestar
 * qué está sirviendo producción: tras un rebuild, el primer archivo pedido ni siquiera da DIFIERE, da 404 (el
 * chunk cambió de hash), y la herramienta muere en el archivo 1 mandando a sospechar del servidor por una
 * herida hecha en la propia máquina. El peligro ya estaba escrito —verificar-release.mjs lo dice al validar
 * sus flags—, pero ahí solo protege al que YA sabe que existe `--solo-dist`; y el mensaje del DIFIERE lo
 * explica DESPUÉS de consumado, que es un post-mortem donde hacía falta un cartel. Se dice el MECANISMO
 * (cualquier cosa que corra `vite build`) con dos ejemplos, no una lista de comandos que envejece, y no se
 * promete «irreversible»: el sello tiene granularidad de minuto, así que la promesa sería más fuerte que el
 * código. Un solo lugar, dos usos; tests/unit/deploy-ancla-dist.test.ts ata lo que afirma a los scripts. */
const NO_REBUILDEAR = `Y hasta resolverlo NO rebuildees: cualquier cosa que corra \`vite build\` pisa dist/ —\`npm run verificar\` sin flags y \`npm run build\`, entre otras—, y dist/ es el único ancla contra el que \`--solo-verificar\` compara lo que sirve producción (cada build lleva un sello __BUILD__ nuevo, así que ese dist ya no es EL del deploy y la comparación pierde sentido). Para re-auditar el artefacto sin rebuildear: \`npm run verificar -- --solo-dist\`. Re-deployar con \`npm run deploy -- --dale\` sí rebuildea, pero republica: ahí el ancla vuelve.`;

/** Qué VE la familia cuando quedan reglas nuevas contra código viejo. Este runbook lo decía de memoria («la
 * familia ve "No tenés permiso"»), y esa frase envejeció sin que nadie la tocara: D22 sacó las denegaciones de
 * LECTURA del toast y las mandó a la pantalla entera (src/app/useLista.ts → estadoVacio 'sinAcceso' →
 * textos.vacio.sinAccesoTitulo). Nombrar el síntoma equivocado manda el diagnóstico al subsistema equivocado:
 * con D22/D23 recién publicados, un «me pide una invitación» por WhatsApp se lee como un bug de accesos, no
 * como reglas, y este mensaje existe justamente para que no se pierda ese minuto. Un solo lugar para el
 * síntoma, y tests/unit/runbook-sintoma.test.ts lo ata al copy vigente de src/ui/textos.ts. */
const SINTOMA_PERMISO = `la familia lo está viendo AHORA (en los teléfonos con la app abierta; los demás, al abrirla). Si lo que se endureció son LECTURAS no es un toast: es la pantalla entera «Esta lista no es tuya… todavía.», que les pide una invitación — y tarda ~3,5 s en aparecer, porque la suscripción reintenta 3 veces. Si son ESCRITURAS, sí es un toast: «No se pudo guardar “…”» o «No tenés permiso para hacer eso.»`;

/** ¿El error es de RED (y no una respuesta HTTP)? Un solo criterio para todas las ramas que preguntan.
 *  Un pedido que se pasó del tope entra por ACÁ y no por una copia: desde donde mira el operador, un blanco
 *  que acepta la conexión y no contesta es la red. Se mira `name` porque el message del DOMException que
 *  tira AbortSignal.timeout («The operation was aborted due to timeout») no matchea ninguna de las otras
 *  marcas y no trae `cause` — verificado a mano: sin este agregado, el tope nuevo dejaba al operador,
 *  después de publicar, SIN la línea que manda a re-verificar cuando vuelva la señal. */
const esDeRed = (e) => /fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|TimeoutError/i
  .test(String(e?.name ?? '') + String(e?.message ?? e) + String(e?.cause?.message ?? ''));

/** Cuánto se espera CADA pedido de la verificación en el aire antes de darlo por colgado. Sin tope rige el
 *  default de undici —300 s por pedido, verificado contra un servidor que acepta y nunca contesta—: tras
 *  publicar, en el único tramo del que no se vuelve sin tocar producción, la terminal quedaba muda minutos y
 *  quien resolvía el estado terminaba siendo el Ctrl+C del operador, que no deja NINGÚN veredicto sobre qué
 *  está sirviendo producción (que es exactamente para lo que existe esta verificación). Un fetch sin tope no
 *  falla cerrado: se cuelga. 20 s le sobran al publicable más grande (534 KB) y siguen siendo un orden de
 *  magnitud menos que el default. El env es un seam para los tests del circuito (que no pueden pagar 20 s por
 *  caso), no una perilla de operación: por eso se valida como los flags, en vez de degenerar en el RangeError
 *  crudo que tira AbortSignal.timeout(NaN) en el primer pedido. */
const ESPERA_MS = Number(process.env.HELADERA_ESPERA_AIRE_MS ?? 20000);
if (!Number.isInteger(ESPERA_MS) || ESPERA_MS <= 0) abortar(`HELADERA_ESPERA_AIRE_MS=«${process.env.HELADERA_ESPERA_AIRE_MS}» no es un entero de milisegundos mayor que cero — es el tope por pedido de la verificación en el aire (sin la variable, 20000)`);

/**
 * El fetch crudo, por PATH: devuelve la Response CON CUALQUIER status; solo un fallo de red —o el tope—
 * rechaza. Se pide por path y no por archivo porque no todo lo que hay que verificar ES un archivo: el deep
 * link de la SPA (`/l/<id>`) no existe en dist/ y lo fabrica el rewrite. El cache-bust, el no-cache y el tope
 * son los mismos para TODO pedido de la verificación en el aire: un solo lugar. La regla se dice DERIVADA y
 * no contando callers: TODO `fetch(` de este archivo tiene que estar acá adentro —un grep por `fetch(` sobre
 * scripts/deploy.mjs no puede devolver una línea de CÓDIGO que no sea la de abajo; el otro hit es este mismo
 * comentario—. Antes decía «las dos puntas», y ese número quedó congelado en la cirugía que extrajo el
 * helper: eran tres, y el que faltaba —el handler— se había llevado el tope y perdido el cache-bust. El que
 * abría esto para ver quién lo usaba leía «dos», encontraba dos, y el tercero no entraba nunca en su campo
 * visual: la enumeración a mano no solo envejeció, tapó el bug.
 */
async function traerPath(path) {
  // cache-bust + no-cache: la comparación es contra el ORIGEN, no contra lo que una caché tenga a mano.
  try {
    return await fetch(`${BASE}${path}?v=${Date.now()}`,
      { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(ESPERA_MS) });
  } catch (e) {
    if (e?.name !== 'TimeoutError') throw e;
    // el error del tope tiene que decir la verdad completa: QUÉ pedido se colgó y CUÁNTO se lo esperó. El de
    // undici no nombra ni el archivo ni los segundos, y en la ventana irreversible eso es todo lo que hay.
    const err = new Error(`GET ${path} no contestó en ${ESPERA_MS / 1000} s (se cortó la espera)`);
    err.name = 'TimeoutError';                 // para que entre por el criterio único de esDeRed, no por una copia
    err.cause = e;
    throw err;
  }
}

/** El mismo pedido para un ARCHIVO del dist: el path (cleanUrls: el index vive en «/») sale del helper
 *  compartido, no de otra copia. */
const traerCrudo = (rel) => traerPath(pathDePedido(rel));

async function traer(rel) {
  const res = await traerCrudo(rel);
  if (!res.ok) {
    const err = new Error(`GET /${rel} respondió ${res.status}`);
    err.status = res.status;                 // el status viaja como dato, no como texto a regexear
    throw err;
  }
  return { datos: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}

// el directorio publicado sale de firebase.json — y esa lectura es I/O FALIBLE, como la de .firebaserc de
// arriba: sin guarda, un firebase.json ausente o corrupto reventaba acá (nivel de módulo) con el stack crudo
// de Node, sin el «ABORTADO:» que este script promete (hallazgo del circuito; el try cubre también el parse)
let DIST;
try {
  DIST = join(ROOT, directorioPublicado(ROOT));
} catch (e) {
  abortar(`no se pudo leer firebase.json (${e?.message ?? e}) — es la fuente de verdad del release (public, ignore, headers): restauralo (git status / git checkout -- firebase.json) antes de verificar o deployar`);
}
/** La salida común de la propagación de CDN, para todo fallo post-deploy que pueda ser un edge atrasado. */
const salidaCDN = (contexto) => contexto === 'deploy'
  ? ' Recién publicado puede ser un edge de la CDN sirviendo la release vieja: esperá un minuto y corré `node scripts/deploy.mjs --solo-verificar`; si persiste, ' + VUELTA_ATRAS
  : '';
/** El arranque de la acción tras una respuesta que contradice la config de hosting (un header, el destino
 *  de un rewrite): tras un deploy, recién después de descartar propagación; en frío, directo (nadie
 *  mencionó propagación y no es la causa probable). */
const revisaConfig = (contexto) => contexto === 'deploy'
  ? `${salidaCDN(contexto)} Si no es propagación: revisá`
  : ' Revisá';
/** Los headers viajan DENTRO de la release de hosting: por eso la vuelta atrás también los restaura. Un solo
 *  lugar para el criterio, en los dos mensajes de headers — y el mecanismo entero se deletrea UNA vez por
 *  mensaje: cuando la salida de propagación ya lo dijo dos renglones antes, acá se lo referencia. La condición
 *  se DERIVA de esa misma salida (no se re-escribe el `contexto === 'deploy'`), así «la de arriba» no puede
 *  quedar señalando a nada si mañana cambia cuándo se imprime. */
const rollbackHeaders = (contexto) => `viajan con la release de hosting, así que volver atrás también restaura los anteriores${salidaCDN(contexto) ? ' (la vuelta atrás es la de arriba)' : `: ${ROLLBACK}`}`;

/**
 * Los headers que salieron EN EL AIRE contra la política, para cualquier cosa servida: recibe los headers de
 * la Response y una etiqueta, no un `rel`. Va por headers y no por archivo porque no todo lo servido ES un
 * archivo: el deep link de la SPA (`/l/<listId>`) lo fabrica el rewrite y también los recibe — y quedaba
 * afuera del bucle de archivos, que era la única custodia de headers en vivo (hallazgo del circuito).
 * El mensaje de seguridad NO nombra el bloque «**»: para el deep link el culpable probable es un bloque NUEVO
 * (tipo `/l/**`) que le gana al catch-all, no el catch-all.
 */
function exigirHeadersEnElAire(headers, etiqueta, politica, contexto) {
  const cacheControl = headers.get('cache-control') ?? '';
  if (!cacheControl.includes(politica)) {
    throw new Error(`${etiqueta} salió con Cache-Control «${cacheControl}» y la política del build pide «${politica}».${revisaConfig(contexto)} los headers de firebase.json — ${rollbackHeaders(contexto)}.`);
  }
  for (const [clave, valor] of Object.entries(HEADERS_SEGURIDAD)) {
    const vino = headers.get(clave) ?? '';
    if (vino !== valor) throw new Error(`${etiqueta} salió con ${clave} «${vino}» y la política pide «${valor}».${revisaConfig(contexto)} qué bloque de \`headers\` de firebase.json matchea ese path (gana el ÚLTIMO que matchea) — los headers ${rollbackHeaders(contexto)}.`);
  }
}

/** Cómo se CORTA una fuga viva del candado del espejo: contener PRIMERO, diagnosticar después — es el único
 *  fallo del circuito cuya consecuencia es una fuga de datos de la familia. El BLANCO manda: contra un canal
 *  de preview el corte es borrar el canal, y ahí el mensaje NO puede nombrar `--dale` ni un `firebase deploy`
 *  (publicaría producción en medio de un ensayo). Y volver atrás no es salida: la release anterior puede
 *  estar sirviendo lo mismo — le pasó a esta app (D24), que es de donde salió este candado. */
const cortarFuga = (esMapa) => baseOverride
  ? `Contención: borrá el canal (\`npx firebase hosting:channel:delete <canal> --project ${proyecto} --force\`) y no publiques nada al canal vivo hasta corregir esto.`
  : `Contención primero (segundos): borrá de dist/ ese archivo y los demás ignorados (si el espejo se corrió, no es el único servido), y \`npx firebase deploy --only hosting --project ${proyecto}\` — excepción de emergencia sancionada al «nunca firebase deploy a mano» (.claude/skills/deploy §4); las reglas no se tocan. Volver a la versión anterior NO es la salida: puede estar sirviendo los mismos archivos (le pasó a esta app, D24). Y recién después convergé con calma${esMapa ? ': `sourcemap: false` en el `build` de vite.config.ts y `npm run deploy -- --dale` — OJO: el deploy rebuildea, así que borrarlos del dist a mano NO sobrevive al build' : ' por el circuito, con el ignore corregido y `npm run deploy -- --dale`'}.`;

/** Qué significa un DIFIERE cuando NO se acaba de publicar (el camino en frío, `--solo-verificar`). Son TRES
 *  estados, no dos. El modelo binario viejo —«hubo rebuild = ESPERADO; si no, es un incidente»— declaraba
 *  incidente justamente el estado que FABRICA el runbook: la vuelta atrás deliberada de .claude/skills/deploy
 *  §4 (2), que en su (3) manda a re-correr esto. O sea que el operador que llegaba por ahí leía en pantalla lo
 *  contrario de lo que acababa de leer en la página que lo trajo, y sobre si producción está sana, en el peor
 *  minuto del circuito. Y era la única rama del camino en frío que terminaba sin decir cómo se sigue (las de
 *  headers pasan por `rollbackHeaders`, la de imprescindibles manda a corregir y re-deployar, la de la FUGA
 *  tiene `cortarFuga`, la del deep link nombra el rewrite). El script NO puede distinguir los tres casos —no
 *  sabe si rebuildeaste ni si volviste atrás—: el discriminador lo tiene el operador, así que se le dan los
 *  tres CON su salida, y el significado queda en UN solo lugar (SKILL.md ya no lo define por su cuenta: nombra
 *  estos casos). El final depende del BLANCO por la misma razón que `cortarFuga` —el criterio se explica
 *  allá—: un mensaje leído durante el ensayo general no puede mandar a publicar el canal VIVO para arreglar un
 *  canal de preview. */
const DIFIERE_EN_FRIO = ` Son TRES casos, y el único que sabe cuál es sos vos: (a) si hubo un rebuild local desde el último deploy es ESPERADO —el sello __BUILD__ cambia el bundle en cada build— y ${BLANCO} puede estar perfecto; (b) si este dist es EL del deploy y venís de una vuelta atrás DELIBERADA, también es lo esperado: ${BLANCO} quedó A PROPÓSITO en la versión anterior, y de acá se sigue por el circuito (empezando por \`npm run verificar\`), no re-verificando; (c) si este dist es EL del deploy y nadie volvió atrás, ${BLANCO} está sirviendo otra versión: recién publicado puede ser un edge de la CDN —esperá un minuto y re-corré esto—, y si persiste, esta release no llegó a publicarse ahí: ${baseOverride ? 'volvé a publicar el canal (`npx firebase hosting:channel:deploy …`) y re-corré el ensayo' : 're-deployá por el circuito (`npm run deploy -- --dale`)'}.`;

/** Compara TODO lo publicado contra dist/ (bytes Y headers), exige que el deep link de la SPA devuelva el
 *  index con esos mismos headers (que la app se pueda ABRIR, no solo que sus archivos estén) y que el handler
 *  de auth responda. */
async function verificarEnElAire(contexto) {
  if (!existsSync(join(DIST, 'index.html'))) {
    abortar(contexto === 'deploy'
      ? 'no hay dist/ para comparar — corré `npm run build` primero'
      // un build nuevo NO sirve para auditar: su sello __BUILD__ cambia el bundle y va a dar DIFIERE seguro
      : `no hay dist/ local, y sin EL dist del deploy no hay contra qué comparar bytes (un build nuevo lleva otro sello __BUILD__ y da DIFIERE sí o sí). Para auditar ${BLANCO} sin ese dist, mirá los headers y el handler a mano.`);
  }
  const archivos = archivosPublicados(ROOT);
  // La misma puerta que verificar-release.mjs, con la MISMA función (compartida, no una copia): acá hace
  // falta aparte porque `--solo-verificar` NO corre aquel script y es la herramienta con la que se audita
  // producción. Sin esto, un release al que el `ignore` le sacó la hoja de estilos (o el sw) sale con la
  // salida ENTERA en verde —«N archivos idénticos», «N ignorados verificados como NO servidos»— porque lo
  // que no se publica tampoco se pide, y lo que sí se pide vuelve 200 con el index del rewrite.
  const faltan = imprescindiblesDelDist(DIST).filter(rel => !archivos.includes(rel));
  if (archivos.length === 0 || faltan.length > 0) {
    throw new Error(`lo que ${contexto === 'deploy' ? 'se publicó' : 'se está verificando'} no incluye archivos de los que la app depende para arrancar: ${faltan.join(', ') || 'ninguno — el `ignore` de firebase.json deja el release en CERO archivos'}. Si están en dist/, los tapa una entrada del \`ignore\` de firebase.json; si no están, el index o el service worker referencian algo que el build no emitió. De cualquier modo pedirlos devuelve 200 con el index del rewrite, así que esta verificación no los va a extrañar y hasta los daría por «no servidos». Corregí la causa y re-deployá${contexto === 'deploy' ? `; mientras tanto, ${VUELTA_ATRAS}` : ''}`);
  }
  const ignorados = archivosIgnorados(ROOT);
  // El tercer estado de este script: ni pasa ni falla, ESPERA — y espera decenas de pedidos en serie JUSTO
  // después del único paso irreversible. Sin decir cuánto trabajo hay ni cuánto puede tardar cada pedido, una
  // terminal quieta se lee como colgada, y el Ctrl+C que sigue no deja veredicto de qué está publicado. Las
  // cantidades se DERIVAN de las listas de arriba: acá no se enumera nada que pueda envejecer.
  console.log(`\n[aire] comparando ${BASE} contra dist/ byte a byte: ${archivos.length} publicados + el deep link + ${ignorados.length} ignorados + el handler (hasta ${ESPERA_MS / 1000} s por pedido)…`);
  // una línea por archivo ANTES de pedirlo, en los dos bucles: sin `\r`, porque esta salida se lee capturada
  // (el agente del circuito, un log), donde reescribir la misma línea es ruido y no progreso.
  for (const [i, rel] of archivos.entries()) {
    console.log(`[aire] ${i + 1}/${archivos.length} ${rel}`);
    const local = readFileSync(join(DIST, rel));
    let remoto;
    try {
      remoto = await traer(rel);
    } catch (e) {
      // un 4xx/5xx sobre un publicable recién deployado es la OTRA cara de la propagación de CDN (un edge
      // con la release vieja no conoce el asset nuevo): misma salida que su hermano DIFIERE, no un error crudo
      // con --base, «el canal venció o la URL está mal» es más probable que «el servidor sirve otra cosa»:
      // la pista va acá y no afuera del catch, para que cada modo de fallo la reciba exactamente una vez
      if (typeof e?.status === 'number') throw new Error(`${e.message} —${salidaCDN(contexto) || ' revisá qué está sirviendo el servidor para ese path.'}${PISTA_BASE}`);
      throw e;
    }
    if (!local.equals(remoto.datos)) {
      throw new Error(`dist/${rel} DIFIERE de lo publicado.${contexto === 'deploy' ? salidaCDN(contexto) : DIFIERE_EN_FRIO}`);
    }
    // los headers que sostienen la actualización de la PWA (caché) y los de seguridad, según la POLÍTICA
    // compartida y testeada de dist-publicado.mjs. Un header viejo recién publicado también puede ser un edge
    // atrasado: misma salida de propagación antes de escalar a config/rollback (hallazgo del circuito)
    exigirHeadersEnElAire(remoto.headers, `/${rel}`, cachePolitica(rel), contexto);
  }
  console.log(`    ${archivos.length} archivos idénticos, con sus headers de caché (la lista sale de dist/ + el ignore real)`);
  // Y la app se puede ABRIR: hasta acá todo lo verificado son ARCHIVOS, y la URL por la que entra el 100% del
  // tráfico no es ninguno. La app se reparte por el link de la lista (`/l/<listId>`), un path que no existe en
  // dist/ y que fabrica el rewrite de firebase.json. Sin ese rewrite —o con el `source` angostado— los
  // archivos siguen idénticos con sus headers, «/» sigue devolviendo el index, el handler responde, y cada
  // link de la familia da 404 hasta que alguien avisa por WhatsApp. Va ANTES del candado de los ignorados a
  // propósito: ese candado APOYA su semántica en el rewrite, así que si el rewrite está muerto hay que
  // decirlo acá y no dejar que el candado pase por la razón equivocada.
  console.log(`[aire] deep link ${RUTA_SPA_DE_PRUEBA} (el rewrite SPA)…`);
  const spa = await traerPath(RUTA_SPA_DE_PRUEBA);
  if (!spa.ok) {
    throw new Error(`GET ${RUTA_SPA_DE_PRUEBA} respondió ${spa.status}: ${BLANCO} no está resolviendo los links de lista, que es la ÚNICA URL por la que entra la familia (la app se reparte por /l/<listId>, y ese path no es un archivo: lo fabrica el rewrite). Lo publicado se acaba de verificar y está perfecto (${archivos.length} archivos idénticos, con sus headers): la app está igual inalcanzable. Esperar a la CDN no lo arregla —un edge con la release vieja traería su propio rewrite—: revisá \`hosting.rewrites\` en firebase.json, que va {"source": "**", "destination": "/index.html"}${contexto === 'deploy' ? ` — el rewrite viaja DENTRO de la release de hosting, así que volver atrás también restaura el anterior: ${ROLLBACK}` : ''}`);
  }
  if (!readFileSync(join(DIST, 'index.html')).equals(Buffer.from(await spa.arrayBuffer()))) {
    throw new Error(`${RUTA_SPA_DE_PRUEBA} contestó 200 pero con bytes que no son los de dist/index.html — y el index publicado sí dio idéntico recién, así que no es un rebuild local.${revisaConfig(contexto)} el \`destination\` de \`hosting.rewrites\` en firebase.json: si el rewrite manda los links de lista a otro archivo, la familia entra a otra cosa (va /index.html).`);
  }
  // y con los headers de la política, que hasta acá solo se le exigían a los ARCHIVOS: este path no es
  // ninguno, así que un bloque nuevo tipo `/l/**` podía servir el link de WhatsApp —por donde entra un
  // teléfono nuevo— cacheado una hora (el incidente que motivó la política, D24) y sin `no-referrer`, o sea
  // filtrando el listId, que es la llave. La política es la del index porque es lo que el rewrite sirve ahí
  // (recién comprobado, byte a byte). El body ya se consumió; los headers siguen en la mano.
  exigirHeadersEnElAire(spa.headers, `${RUTA_SPA_DE_PRUEBA} (el deep link)`, cachePolitica('index.html'), contexto);
  console.log('    el deep link devuelve el index, con los headers de la política: el rewrite SPA está vivo (la app se puede abrir)');
  // el chequeo NEGATIVO: lo que el espejo dice que NO se publica (los .map) de verdad no está servido.
  // Sin esto, una deriva muda entre el espejo y el listFiles real de firebase-tools resucitaría el incidente
  // fundacional (el sourcemap con el nombre adentro) con todas las puertas en verde. Sana es CUALQUIER
  // respuesta HTTP que no sirva los bytes (el rewrite —que el chequeo de arriba acaba de probar vivo—
  // devuelve index.html; un 404 también vale) — pero un fallo de RED se propaga al camino rojo: un candado
  // que se traga el error aprueba en vacío (hallazgo).
  for (const [i, rel] of ignorados.entries()) {
    console.log(`[aire] ignorado ${i + 1}/${ignorados.length} ${rel}`);
    const local = readFileSync(join(DIST, rel));
    const res = await traerCrudo(rel);
    if (res.ok && local.equals(Buffer.from(await res.arrayBuffer()))) {
      // el orden es el del operador asustado, no el del autor del espejo: qué está en juego y que pasa AHORA
      // → cómo se corta → recién después el diagnóstico. Lo específico del .map se DERIVA del archivo que
      // saltó (mañana el ignore puede cubrir otra cosa), no se enumera.
      const esMapa = rel.endsWith('.map');
      throw new Error(`FUGA: dist/${rel} NO debía publicarse y ${BLANCO} lo está sirviendo tal cual, AHORA${esMapa ? ' — es un sourcemap: lleva el fuente entero en sourcesContent, con comentarios y nombres adentro (el incidente que fundó este circuito, D24)' : ''}. ${cortarFuga(esMapa)} Después, el diagnóstico: el espejo del ignore y firebase-tools divergieron — revisá dist-publicado.mjs contra la versión instalada de firebase-tools (está con caret: un npm i pudo moverla abajo nuestro).`);
    }
  }
  console.log(ignorados.length > 0
    ? `    ${ignorados.length} archivos ignorados verificados como NO servidos (el candado del espejo)`
    : '    el espejo no predice NINGÚN archivo ignorado en este dist: el candado del espejo no tuvo nada que chequear (no es un candado cerrado — revisá si el `ignore` de firebase.json quedó vacío)');
  // /__/auth/* lo sirve la PLATAFORMA de Firebase Hosting: no viaja en la release, así que un fallo acá no
  // lo causó el deploy ni lo arregla un rollback — y un parpadeo de red no puede escalar a incidente:
  // se reintenta antes de creerle (hallazgo del circuito: el runbook mandaba a rollback por esto)
  console.log('[aire] handler /__/auth/handler…');
  let handler = null;
  /** El último fallo de RED del handler (null si lo que falló fue el status). El `.catch(() => null)` que
   *  había acá se lo tragaba, y el veredicto dejaba un ENOTFOUND y un pedido colgado indistinguibles. */
  let ultimo = null;
  for (let intento = 1; intento <= 3 && !handler?.ok; intento++) {
    // los reintentos son 10 s de espera: mudos se leían como un cuelgue, y este es el último tramo antes del
    // veredicto. Se avisa ANTES de dormir, con el número de intento y los segundos que se van a esperar.
    if (intento > 1) {
      console.log(`[aire] el handler no respondió; reintento ${intento} de 3 en ${2 * intento} s…`);
      await new Promise(r => setTimeout(r, 2000 * intento));
    }
    // por el helper compartido, como todo pedido de acá: el cache-bust y el no-cache valen en este path más
    // que en ninguno —la plataforma lo contesta con `max-age=1800`, verificado contra el host real—, así que
    // un fetch pelado lo puede resolver un edge o un proxy con una copia guardada de hasta media hora, sin
    // tocar el origen: el chequeo firmaría «tienen puerta ahí» sobre una respuesta que no probó nada del
    // estado actual. Se lleva además el error del tope enriquecido, que nombra QUÉ pedido se colgó y CUÁNTO.
    try { handler = await traerPath('/__/auth/handler'); ultimo = null; }
    catch (e) { ultimo = e; handler = null; }
  }
  // El diagnóstico del último intento viaja en el TEXTO, no en un `err.cause`: esta rama escribe su propia
  // línea de la señal («es de Firebase o de la señal, no de esta release»), más precisa que la genérica de
  // `esDeRed`; y para llegar hasta acá BASE ya se probó alcanzable —los publicables y el deep link salieron
  // de ahí—, así que la PISTA_BASE que vendría pegada mandaría a revisar una URL recién validada.
  if (!handler?.ok) throw new Error(`/__/auth/handler no responde (3 intentos${ultimo ? `; el último: ${ultimo.message}` : handler ? `; el último respondió ${handler.status}` : ''}): los viajes de la cuenta (D23) están sin puerta. OJO: /__/ lo sirve Firebase Hosting por plataforma — NO viaja en el deploy, así que un rollback no lo arregla. Reintentá \`node scripts/deploy.mjs --solo-verificar\` en un rato; si persiste, es de Firebase o de la señal, no de esta release.`);
  // Lo que este fetch prueba es que el handler responde EN EL BLANCO, y nada más. Que el bundle publicado
  // redirija justamente ahí no lo prueba: eso lo sostienen la puerta del .env sobre VITE_FIREBASE_AUTH_DOMAIN
  // y que BASE salga de `dominioDeHosting()`, el mismo lugar que esa puerta exige. Con --base ni siquiera
  // coinciden —el canal es efímero y el bundle sigue redirigiendo a producción—, así que el mensaje no puede
  // decir la misma frase en los dos casos: firmaría algo que no miró.
  console.log(`    /__/auth/handler responde en ${BLANCO}: los viajes de la cuenta (D23) tienen puerta ahí${baseOverride
    ? ' — pero es el handler DEL CANAL: el bundle redirige al authDomain que lleva horneado, no acá'
    : ' (que el bundle redirija ahí lo sostiene la puerta del .env sobre VITE_FIREBASE_AUTH_DOMAIN, no este chequeo)'}`);
}

if (soloVerificar) {
  try {
    await verificarEnElAire('auditoria');
    // se nombra QUÉ se verificó, no solo el blanco: este comando audita hosting y nada más, así que
    // «Verificado producción» a secas es la misma sobre-afirmación que el cierre del deploy, acá en frío
    // (cosmético: por este camino no se publicó nada, y de firestore no se tocó ni se miró nada).
    console.log(`\nVerificado ${BLANCO}: el HOSTING, que es lo único que este comando mira (no se deployó nada).`);
  } catch (e) {
    // la pregunta por la señal solo cuando el fallo ES de red: pegársela a un DIFIERE confunde (hallazgo).
    // Y con --base va DESPUÉS de la pista del blanco: ordenar por probabilidad es todo el arreglo — el
    // operador con internet perfecto no puede leer «problema de señal» por una URL mal copiada (hallazgo).
    // La pista va DENTRO del ternario: afuera se duplicaría con la del 404 y caería sobre DIFIERE y headers,
    // donde el servidor SÍ contestó y «revisá la URL del canal» sería una pista falsa.
    abortar(`${e.message ?? e}${esDeRed(e) ? `${PISTA_BASE}\n(parece un problema de señal: sin red no se puede confirmar qué hay publicado)` : ''}`);
  }
} else {
  correr('node scripts/verificar-release.mjs');
  if (!dale) {
    console.log(`\nLas puertas deterministas pasaron, pero PUBLICAR es lo único irreversible del circuito y pide
consentimiento explícito: cuando el dueño dé el ok, corré \`npm run deploy -- --dale\`.
(El circuito completo — consultoras incluidas — está en .claude/skills/deploy.)`);
    process.exit(1);
  }
  // el ÚNICO comando irreversible, con su propio estado de fallo. Y el corte a la mitad NO es de dos tiempos:
  // la CLI corre la fase `deploys` ENTERA —donde firestore YA publica índices y fieldOverrides— antes de la
  // fase `releases`, donde recién se liberan las reglas y, al final de todo, el hosting. Verificado contra el
  // firebase-tools instalado (deploy/index.js: `chain(deploys)` de todos los targets y después
  // `chain(releases)`; filterTargets ordena por VALID_DEPLOY_TARGETS, así que el orden del `--only` no manda),
  // no razonado desde acá: el mensaje de abajo decía «falló antes de releasing → no pasó nada» mientras la
  // pantalla, dos líneas más arriba, decía «deployed indexes … successfully». Los tres escalones se enumeran
  // en UN solo lugar —el mensaje— y tests/unit/fases-deploy.test.ts ata cada marcador a su fase real.
  const d = spawnSync(`npx firebase deploy --only firestore,hosting --project ${proyecto}`, { stdio: 'inherit', cwd: ROOT, shell: true });
  if (d.status !== 0) {
    console.error(`\nOJO: el deploy CORTÓ (código ${d.status}). La CLI publica en TRES tiempos y cada uno deja su
línea en la salida de arriba: primero los índices y fieldOverrides de firestore («deployed indexes … successfully»),
después las reglas («released rules …»), y recién al final el hosting («releasing new version…»).
Buscá cuál fue la ÚLTIMA que salió — eso, y no el código de error, dice qué tocó producción:
- NINGUNA de las tres → no se publicó nada: corregí la causa y volvé a correr;
- «deployed indexes» y NO «released rules» → las reglas y el código que sirve producción siguen siendo los
  viejos, pero el juego de índices YA se movió. Si esta release AGREGÓ índices, se están construyendo (tardan
  minutos). Si SACÓ alguno y contestaste que sí al prompt de borrado, producción lo perdió — ojo con el
  fieldOverride de collection group de \`acceso.uid\`, que es de lo que depende entrar con la cuenta desde otro
  teléfono (D23) y lo usa también el código viejo que se sigue sirviendo. O sea: si abandonás la release acá,
  producción NO quedó intacta. Comprobá con \`npx firebase firestore:indexes --project ${proyecto}\` contra
  firestore.indexes.json, y si falta alguno, republicalo con \`npx firebase deploy --only firestore\`;
- «released rules» y NO «releasing new version» → quedaron reglas nuevas contra código viejo. Y si esta release
  ENDURECIÓ reglas, ${SINTOMA_PERMISO}
  Primero pará el sangrado — restaurá
  ${REGLAS_DE_PROD}
  y \`npx firebase deploy --only firestore\` (segundos, y deja todo
  coherente en la versión vieja) — y recién después convergé con calma re-corriendo \`npm run deploy -- --dale\`.
  ${DEVOLVER_REGLAS}
  Si las reglas no cambiaron (o solo aflojan), alcanza con re-correr \`npm run deploy -- --dale\` directo;
- «releasing new version» YA salió → el corte fue en el último tramo y puede haber quedado todo publicado: no
  lo adivines, corré \`node scripts/deploy.mjs --solo-verificar\` para saber qué está sirviendo producción.
  ${NO_REBUILDEAR}`);
    process.exit(1);
  }
  try {
    await verificarEnElAire('deploy');
    // El cierre es la ÚLTIMA línea que lee el operador después del único paso irreversible, y decía «Deploy
    // completo y verificado en el aire» mientras `verificarEnElAire()` mira SOLO hosting. Esta release ensanchó
    // el `--only` a `firestore,hosting`, así que desde ahora el deploy publica también firestore.indexes.json
    // (con el `--only` viejo, prepare.js ponía firestoreIndexes=false: ver tests/unit/indices-firestore.test.ts)
    // — o sea que el cierre firmaba justo por la mitad que esta release agregó y que nadie verifica. Se nombra
    // lo verificado Y lo no verificado; no se repiten los conteos, que `verificarEnElAire()` ya imprimió tres
    // renglones arriba derivados de las listas reales (re-enumerarlos acá sería una segunda enumeración).
    // El bullet se describe en CONDICIONAL y por sus dos formas porque las dos existen y dicen cosas distintas:
    // verificado en el firebase-tools instalado (lib/firestore/api.js), no interactivo imprime «there are N …
    // not present in your firestore indexes file» y NO borra nada; interactivo imprime «The following … are not
    // present in your firestore indexes file» y pregunta «Would you like to delete these…» con default No — un
    // «sí» ahí sí borra. Afirmar «no se borró nada» a secas sería la misma enfermedad al revés.
    // tests/unit/cierre-deploy.test.ts ata este bloque al `--only` real y al cableado de firebase.json.
    console.log(`\nDeploy completo. Lo que se verificó en el aire es el HOSTING: todo lo de acá arriba, desde
la primera línea [aire]. Firestore también se publicó —reglas E ÍNDICES— y NO se verifica acá.
Lo que sí conviene ir a buscar hacia arriba: si producción tiene índices o field overrides
que firestore.indexes.json no declara, la CLI lo dijo en una línea «firestore: … not present in your firestore
indexes file» que salió ANTES de toda la subida del hosting, así que quedó decenas de renglones más arriba. Si
fue solo ese bullet, no se borró nada; si en cambio te preguntó «Would you like to delete these…» y contestaste
que SÍ, producción ya los perdió. En los dos casos producción y el archivo divergieron: compará con
\`npx firebase firestore:indexes --project ${proyecto}\` y lo que falte va AL ARCHIVO — de producción no se
borra nada (.claude/skills/deploy §4). Del fieldOverride de collection group de \`acceso.uid\` depende entrar
con la cuenta desde otro teléfono (D23).`);
  } catch (e) {
    console.error(`\nOJO: el deploy YA SE PUBLICÓ; lo que falló es la VERIFICACIÓN de lo publicado:\n${e.message ?? e}`);
    // la pregunta por la señal solo cuando el fallo ES de red: los demás errores ya traen su propia salida
    if (esDeRed(e)) {
      console.error('Parece un problema de señal: corré `node scripts/deploy.mjs --solo-verificar` en cuanto vuelva — hasta ahí no sabemos qué está sirviendo producción.');
    }
    // ÚLTIMO: el renglón pegado al prompt es donde caen los ojos, y es ahí donde dispara el reflejo de volver
    // al circuito. Va en el catch EXTERIOR para que lo reciban TODOS los modos de fallo de verificarEnElAire
    // (DIFIERE, 404, headers, rewrite, FUGA, handler), que es cuando el dist local todavía es EL del deploy.
    console.error(NO_REBUILDEAR);
    process.exit(1);
  }
}
