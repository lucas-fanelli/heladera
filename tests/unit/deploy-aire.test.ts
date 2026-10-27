/**
 * La verificación en el aire corre JUSTO después del único paso irreversible del circuito, y hasta este
 * arreglo tenía dos agujeros del mismo modelo mental binario (verde con resumen / rojo con mensaje): el
 * tercer estado —ni pasa ni falla, ESPERA— no tenía ni representación ni tope.
 *
 *  - Sin tope: ningún fetch llevaba `signal`, así que regía el default de undici (300 s por pedido,
 *    verificado a mano contra un servidor que acepta la conexión y nunca contesta). Un edge colgado dejaba
 *    la terminal muda minutos, y quien terminaba resolviendo el estado era el Ctrl+C del operador — que no
 *    deja NINGÚN veredicto sobre qué está sirviendo producción, que es justo para lo que existe esto.
 *  - Sin progreso: entre el cartel de arranque y el resumen no se imprimía nada durante ~27 pedidos en
 *    serie (21 publicados + 6 ignorados, medidos con el propio espejo) más hasta 3 del handler con 10 s de
 *    sleeps mudos. Una terminal quieta ahí se lee como colgada.
 *
 * La trampa del arreglo, y por qué el caso (a) exige la línea de la señal: `AbortSignal.timeout` rechaza con
 * un DOMException `name: 'TimeoutError'`, `message: 'The operation was aborted due to timeout'` y SIN
 * `cause` — que el `esDeRed` viejo (regex sobre message+cause.message) no matcheaba. Poner el tope sin tocar
 * ese criterio dejaba al operador, después de publicar, con un mensaje en inglés que no nombra el archivo y
 * sin la línea «corré --solo-verificar en cuanto vuelva»: el arreglo ingenuo empeoraba el peor momento.
 *
 * Se corre el script REAL sobre una copia aislada del repo (mkdtemp), con spawn y no spawnSync: los
 * servidores de prueba viven en ESTE proceso y un spawn bloqueante los dejaría sin event loop para
 * contestar. El tope se baja por `HELADERA_ESPERA_AIRE_MS` (el seam existe para esto: la suite rápida no
 * puede pagar 20 s por caso).
 *
 * Limitación honesta, la misma que los otros tests de este script: la rama del deploy real (`--dale`) no es
 * alcanzable acá, así que se fija el recorrido por `--solo-verificar`, que es el mismo `verificarEnElAire()`.
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error — módulo .mjs de scripts/, sin tipos: el servidor verde reproduce la política REAL de
// caché y de seguridad en vez de copiarla acá, que sería otro criterio duplicado que envejece
import { HEADERS_SEGURIDAD, RUTA_SPA_DE_PRUEBA, cachePolitica } from '../../scripts/dist-publicado.mjs';

const REPO = process.cwd();

/** El dist de mentira. Los publicables SALEN ordenados (assets/… < index.html < registerSW.js), así el
 *  contador del progreso es predecible y el primer pedido del recorrido tiene nombre propio — lo que le
 *  permite al caso (a) exigir que el mensaje del tope diga QUÉ pedido se colgó. El .map es el ignorado. */
const PUBLICABLES: Record<string, string> = {
  'assets/app-abc123.js': 'export const x = 1;\n',
  // el index CARGA su bundle: la puerta de imprescindibles deriva del artefacto la cadena de arranque, y
  // apunta a un publicable que ya estaba en esta lista (no cambia ni el orden ni la cantidad de pedidos)
  'index.html': '<!doctype html><title>heladera</title><script type="module" src="/assets/app-abc123.js"></script>',
  'registerSW.js': '/* registerSW */\n',
};
const IGNORADO = 'app.js.map';
const PRIMER_PEDIDO = '/assets/app-abc123.js';

let tmp: string;
let colgado: Server;
let verde: Server;
let sinRewrite: Server;
let deepLinkCacheado: Server;
let deepLinkSinReferrer: Server;
let otraVersion: Server;
let baseColgada: string;
let baseVerde: string;
let baseSinRewrite: string;
let baseDeepLinkCacheado: string;
let baseDeepLinkSinReferrer: string;
let baseOtraVersion: string;
/** Lo que el script PIDIÓ en el handler, crudo. El bug: ese pedido esquivaba `traerPath` y salía sin
 *  cache-bust ni no-cache —y la plataforma contesta ese path con `max-age=1800`—, así que un edge o un proxy
 *  con una copia guardada lo daba 200 sin tocar el origen y el script firmaba «los viajes de la cuenta (D23)
 *  tienen puerta ahí» sobre una respuesta que no probó nada del estado actual. */
let pedidoHandler: { url: string; cacheControl: string } | null = null;

/** Acepta la conexión y no contesta NUNCA: el edge colgado, que sin tope son 300 s por pedido. */
function servidorColgado(): Server {
  return createServer(() => {});
}

/** El hosting sano: sirve los publicables con los headers de la política, resuelve el deep link de la SPA con
 *  el index (eso hace el rewrite), no tiene el ignorado (404) y contesta el handler. La demora es real —una
 *  fracción del tope— para que el caso (b) pruebe algo.
 *  `conRewrite: false` es el hosting que publicó TODO bien y perdió el rewrite: los archivos idénticos, sus
 *  headers, «/» con el index y el handler vivo — y cada link de lista en 404.
 *  `headersDelDeepLink` es la otra mitad de esa misma historia: el rewrite VIVO, los bytes correctos, y ese
 *  path servido con OTROS headers que los de la política (lo que hace un bloque `/l/**` en firebase.json, que
 *  no toca ningún archivo). Se pisan SOLO los del deep link: los publicables siguen sanos, así que si la
 *  corrida corta, cortó por esto. */
function servidorVerde(demoraMs: number, conRewrite = true, headersDelDeepLink: Record<string, string> = {}): Server {
  return createServer((req, res) => {
    const ruta = new URL(req.url ?? '/', 'http://x').pathname;   // el fetch va con ?v=<ts> para saltear cachés
    setTimeout(() => {
      if (ruta === '/__/auth/handler') {
        pedidoHandler = { url: req.url ?? '', cacheControl: String(req.headers['cache-control'] ?? '') };
        res.writeHead(200); res.end('ok'); return;
      }
      const rel = ruta === '/' ? 'index.html' : ruta.slice(1);   // cleanUrls: el index se pide en «/»
      // el rewrite SPA, acotado al deep link: lo demás (el ignorado) sigue dando 404, que es lo que el
      // candado del espejo prueba en este mismo recorrido
      const esDeepLink = conRewrite && ruta === RUTA_SPA_DE_PRUEBA;
      const cuerpo = esDeepLink ? PUBLICABLES['index.html'] : PUBLICABLES[rel];
      res.writeHead(cuerpo === undefined ? 404 : 200, {
        ...HEADERS_SEGURIDAD,
        'Cache-Control': cachePolitica(rel),
        ...(esDeepLink ? headersDelDeepLink : {}),
      });
      res.end(cuerpo ?? '');
    }, demoraMs);
  });
}

/** El hosting que quedó en la versión ANTERIOR, que es lo que deja una vuelta atrás deliberada: contesta
 *  200 a TODO con los bytes del index viejo —el rewrite catch-all de firebase.json—, así que el primer
 *  publicable del recorrido (assets/…, que la lista ordenada pone primero) da DIFIERE y no 404. Es el
 *  estado que el runbook FABRICA en su paso (2) y al que manda a correr esto en su (3). */
function servidorOtraVersion(): Server {
  return createServer((_req, res) => {
    res.writeHead(200, { ...HEADERS_SEGURIDAD, 'Cache-Control': cachePolitica('index.html') });
    res.end('<!doctype html><title>heladera</title><script type="module" src="/assets/app-viejo.js"></script>');
  });
}

async function escuchar(s: Server): Promise<string> {
  await new Promise<void>(listo => s.listen(0, '127.0.0.1', listo));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'deploy-aire-'));
  // scripts/ ENTERO, derivado del directorio real (se importan entre sí y viajan juntos), como en los otros
  // tests del circuito: una lista de archivos acá sería una enumeración que envejece
  cpSync(join(REPO, 'scripts'), join(tmp, 'scripts'), { recursive: true });
  writeFileSync(join(tmp, '.firebaserc'), JSON.stringify({ projects: { default: 'proyecto-fake' } }));
  writeFileSync(join(tmp, 'firebase.json'), JSON.stringify({ hosting: { public: 'dist', ignore: ['**/*.map'], cleanUrls: true } }));
  mkdirSync(join(tmp, 'dist', 'assets'), { recursive: true });
  for (const [rel, cuerpo] of Object.entries(PUBLICABLES)) writeFileSync(join(tmp, 'dist', ...rel.split('/')), cuerpo);
  writeFileSync(join(tmp, 'dist', IGNORADO), JSON.stringify({ version: 3, sources: ['app.ts'], sourcesContent: ['// el fuente entero'] }));

  colgado = servidorColgado();
  verde = servidorVerde(250);
  sinRewrite = servidorVerde(0, false);
  // el deep link sirviéndose cacheado una hora: EL incidente que motivó la política (D24), en el único path
  // que ninguna de las dos mitades miraba
  deepLinkCacheado = servidorVerde(0, true, { 'Cache-Control': 'public, max-age=3600' });
  // y la otra pérdida en esa misma URL: es la que lleva el listId, o sea la llave
  deepLinkSinReferrer = servidorVerde(0, true, { 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  otraVersion = servidorOtraVersion();
  baseColgada = await escuchar(colgado);
  baseVerde = await escuchar(verde);
  baseSinRewrite = await escuchar(sinRewrite);
  baseDeepLinkCacheado = await escuchar(deepLinkCacheado);
  baseDeepLinkSinReferrer = await escuchar(deepLinkSinReferrer);
  baseOtraVersion = await escuchar(otraVersion);
});

afterAll(async () => {
  await Promise.all([colgado, verde, sinRewrite, deepLinkCacheado, deepLinkSinReferrer, otraVersion]
    .map(s => new Promise<void>(listo => s.close(() => listo()))));
  rmSync(tmp, { recursive: true, force: true });
});

function correr(esperaMs: number, ...args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise(resolver => {
    const hijo = spawn(process.execPath, [join(tmp, 'scripts', 'deploy.mjs'), ...args],
      { env: { ...process.env, HELADERA_ESPERA_AIRE_MS: String(esperaMs) } });
    let stdout = '';
    let stderr = '';
    hijo.stdout.setEncoding('utf8');
    hijo.stderr.setEncoding('utf8');
    hijo.stdout.on('data', d => { stdout += d; });
    hijo.stderr.on('data', d => { stderr += d; });
    hijo.on('close', status => resolver({ status, stdout, stderr }));
  });
}

describe('la verificación en el aire, cuando el blanco acepta la conexión y no contesta', () => {
  it('corta la espera y da veredicto en segundos, nombrando el pedido colgado y cuánto se esperó', async () => {
    const t0 = Date.now();
    const r = await correr(800, '--solo-verificar', '--base', baseColgada);

    // el bug: sin tope esto se queda 300 s por pedido y el veredicto lo termina dando el Ctrl+C del operador
    // (acá lo da el timeout del propio test, en rojo). Que TERMINE es la mitad principal del arreglo.
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ABORTADO:');
    // la verdad completa: QUÉ pedido se colgó y CUÁNTO se lo esperó — el mensaje de undici no dice ninguna
    // de las dos cosas («The operation was aborted due to timeout»)
    expect(r.stderr).toContain(PRIMER_PEDIDO);
    expect(r.stderr).toContain('no contestó en');
    expect(r.stderr).toContain('0.8 s');
    // la mitad que el arreglo INGENUO rompe: el TimeoutError no matcheaba el esDeRed viejo, así que el tope
    // se colaba sin la línea que manda a re-verificar cuando vuelva la señal — justo después de publicar
    expect(r.stderr).toContain('parece un problema de señal');
  });
});

describe('la verificación en el aire, contra un blanco sano que tarda', () => {
  let r: { status: number | null; stdout: string; stderr: string };

  beforeAll(async () => { r = await correr(1500, '--solo-verificar', '--base', baseVerde); }, 20000);

  it('no degenera en «todo es timeout»: una respuesta que tarda una fracción del tope pasa verde', () => {
    expect(r.stderr).not.toContain('ABORTADO');
    expect(r.stderr).not.toContain('no contestó en');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Verificado el canal de preview');
  });

  it('el estado de espera EXISTE: declara el trabajo y el tope, y va diciendo en qué archivo está', () => {
    // el cartel de arranque, con las cantidades derivadas de las listas (no enumeradas) y el peor caso
    expect(r.stdout).toContain('3 publicados');
    expect(r.stdout).toContain('1.5 s por pedido');
    // un renglón por archivo ANTES de pedirlo, en los DOS bucles, y el handler anunciado: hasta el arreglo,
    // los tres tramos eran mudos de punta a punta
    expect(r.stdout).toContain('[aire] 1/3 assets/app-abc123.js');
    expect(r.stdout).toContain('[aire] 2/3 index.html');
    expect(r.stdout).toContain('[aire] 3/3 registerSW.js');
    expect(r.stdout).toContain(`[aire] ignorado 1/1 ${IGNORADO}`);
    expect(r.stdout).toContain('[aire] handler /__/auth/handler');
  });

  it('el deep link de la SPA también se pide, y se anuncia como los demás tramos', () => {
    expect(r.stdout).toContain(`[aire] deep link ${RUTA_SPA_DE_PRUEBA}`);
    expect(r.stdout).toContain('el rewrite SPA está vivo');
  });

  // El handler era la tercera punta que salía a la red, y la única que armaba su `fetch` a mano: se llevaba el
  // tope y perdía las otras dos mitades del criterio. Es el pedido donde más duele —la plataforma lo contesta
  // con `max-age=1800`, o sea AUTORIZA a cualquier intermediario a servir una copia de media hora— y corre en
  // el peor momento, después de publicar: sin bust, una caché intermedia lo daba 200 y este chequeo firmaba
  // sobre nada. Es el único recorrido del archivo que llega al handler (el colgado corta en el primer archivo
  // y los demás en el deep link), así que el registro no se contamina.
  it('el pedido del handler sale por el mismo helper que los demás: con cache-bust y no-cache', () => {
    expect(pedidoHandler?.url).toMatch(/^\/__\/auth\/handler\?v=\d+$/);
    expect(pedidoHandler?.cacheControl).toBe('no-cache');
  });

  // El handler se pide sobre BASE, y con --base ese BASE es el canal EFÍMERO que tipeó el operador — no el
  // authDomain que el bundle lleva horneado (que va a producción). El mensaje viejo firmaba «los viajes de la
  // cuenta (D23) tienen puerta», a secas y en los dos casos: leído en un ensayo general contra un canal, decía
  // que quedó verificado algo que ese pedido no tocó. La rama sin --base no es alcanzable desde acá (pediría
  // producción de verdad), la misma limitación honesta que declara el encabezado: se fija la que sí lo es.
  it('con --base, la línea del handler no firma más de lo que miró: nombra el blanco y el canal', () => {
    expect(r.stdout).toContain(`/__/auth/handler responde en el canal de preview (${baseVerde})`);
    expect(r.stdout).toContain('es el handler DEL CANAL');
    expect(r.stdout).not.toContain('/__/auth/handler responde: los viajes de la cuenta (D23) tienen puerta');
  });
});

/**
 * El otro agujero del mismo modelo mental, un piso más arriba: la verificación en el aire preguntaba SOLO por
 * archivos, y la URL por la que entra el 100% del tráfico no es ninguno — la app se reparte por el link de la
 * lista (`/l/<listId>`, que rutea `src/app/router.ts` por pathname) y ese path lo fabrica el rewrite de
 * firebase.json. Sin custodia, el escenario era: alguien toca el bloque `hosting` (justo lo que esta release
 * reestructuró), el rewrite se rompe, los archivos siguen todos idénticos con sus headers, «/» sigue
 * devolviendo el index, el handler contesta, el script imprime «Deploy completo y verificado en el aire» — y
 * cada link de la familia da 404 hasta que alguien avisa por WhatsApp.
 */
describe('la verificación en el aire, contra un blanco que publicó todo bien pero perdió el rewrite SPA', () => {
  it('no firma «verificado»: aborta nombrando el deep link y hosting.rewrites', async () => {
    const r = await correr(1500, '--solo-verificar', '--base', baseSinRewrite);

    // el bug: TODO lo demás pasa (archivos idénticos, headers, ignorado no servido, handler vivo), así que
    // sin este chequeo la corrida entera salía verde sobre una app 100% inalcanzable
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('Verificado');
    expect(r.stderr).toContain('ABORTADO:');
    expect(r.stderr).toContain(RUTA_SPA_DE_PRUEBA);
    expect(r.stderr).toContain('hosting.rewrites');
    // y manda al lugar correcto: ni a la propagación de la CDN ni a la señal — el servidor contestó, y
    // rápido. Un diagnóstico equivocado acá cuesta el minuto que este mensaje existe para ahorrar.
    expect(r.stderr).not.toContain('problema de señal');
    expect(r.stderr).not.toContain('edge de la CDN');
  }, 20000);

  it('corta ANTES del candado de los ignorados, que apoya su semántica en el rewrite', async () => {
    const r = await correr(1500, '--solo-verificar', '--base', baseSinRewrite);

    // el candado negativo aprueba igual con rewrite (200 + bytes distintos) que sin rewrite (404): dejarlo
    // correr primero lo haría pasar por la razón equivocada y taparía el diagnóstico de verdad
    expect(r.stdout).toContain(`[aire] deep link ${RUTA_SPA_DE_PRUEBA}`);
    expect(r.stdout).not.toContain('[aire] ignorado');
  }, 20000);
});

/**
 * Y la intersección de las dos custodias, que era el agujero: el deep link se chequeaba por status y bytes, y
 * los headers se le exigían SOLO a los archivos (este bucle era la única custodia de headers en vivo). Pero
 * hosting matchea headers por PATH DE PEDIDO y `/l/<listId>` es el único path servido que no tiene archivo
 * atrás — un bloque `/l/**` en firebase.json no toca ni un publicable. El escenario: los 21 archivos siguen
 * idénticos con sus headers, el deep link sigue devolviendo el index, todo firma «verificado» — y el link de
 * WhatsApp, por donde entra un teléfono nuevo, se sirve cacheado una hora (el incidente que motivó la
 * política, D24) y filtrando el listId por Referer, que es la llave.
 * El control POSITIVO es el describe de arriba: el servidor verde ya manda la política REAL en ese path
 * (`cachePolitica('l/verificacion-de-deploy')` = no-cache + los headers de seguridad) y sigue en verde.
 */
describe('la verificación en el aire, contra un blanco que sirve el deep link con otros headers que la política', () => {
  it('con el deep link cacheado una hora: no firma «verificado» y nombra el path y el header', async () => {
    const r = await correr(1500, '--solo-verificar', '--base', baseDeepLinkCacheado);

    // el bug: los archivos, sus headers, el rewrite y los bytes están TODOS bien, así que sin este chequeo la
    // corrida entera salía verde con la URL de entrada de la familia clavada una hora
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('Verificado');
    expect(r.stderr).toContain('ABORTADO:');
    expect(r.stderr).toContain(RUTA_SPA_DE_PRUEBA);
    expect(r.stderr).toContain('Cache-Control');
    expect(r.stderr).toContain('public, max-age=3600');
    // corta EN este chequeo: pasó el bucle de archivos y no llegó al candado de los ignorados
    expect(r.stdout).toContain('[aire] 3/3 registerSW.js');
    expect(r.stdout).not.toContain('[aire] ignorado');
    // y manda al lugar correcto: el servidor contestó rápido y bien, no es la señal ni un edge atrasado
    expect(r.stderr).not.toContain('problema de señal');
    expect(r.stderr).not.toContain('edge de la CDN');
  }, 20000);

  it('con el Referrer-Policy aflojado en el deep link: ídem — esa URL es la que lleva el listId', async () => {
    const r = await correr(1500, '--solo-verificar', '--base', baseDeepLinkSinReferrer);

    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('Verificado');
    expect(r.stderr).toContain(RUTA_SPA_DE_PRUEBA);
    expect(r.stderr).toContain('Referrer-Policy');
    // el mensaje NO puede culpar al bloque «**»: acá el sospechoso es un bloque NUEVO que le gana al catch-all
    expect(r.stderr).not.toContain('el bloque «**»');
    expect(r.stderr).toContain('gana el ÚLTIMO que matchea');
  }, 20000);
});

/**
 * La contradicción que fija este describe: el runbook (.claude/skills/deploy §4) manda, cuando la
 * verificación post-deploy sale roja, a volver atrás en su punto (2) y a re-correr `--solo-verificar` en el
 * (3) — y el mensaje del DIFIERE en frío modelaba el mundo en DOS estados («hubo rebuild» = esperado / «este
 * dist es EL del deploy» = incidente), así que le contestaba «solo es un incidente si este dist es EL del
 * deploy» justo al operador que acababa de volver atrás A PROPÓSITO, y que tenía EL dist del deploy en la
 * mano. Dos textos de la misma release contradiciéndose sobre si producción está sana, en el peor minuto del
 * circuito — y encima era la única rama del camino en frío que terminaba sin decir cómo se sigue (las de
 * headers pasan por `rollbackHeaders`, la de imprescindibles manda a corregir y re-deployar, la de la FUGA
 * tiene su contención, la del deep link nombra el rewrite).
 *
 * Limitación honesta, la misma que declara deploy-candado-espejo: el final del caso (c) depende del BLANCO, y
 * la rama del canal VIVO no es alcanzable end-to-end (sin `--base`, BASE sale de `.firebaserc` y apunta a
 * producción). Acá se fija la que sí lo es, que además es la PELIGROSA: la que no puede mandar a publicar el
 * canal vivo para arreglar un canal de preview en medio del ensayo general.
 */
describe('la verificación en frío, contra un blanco que quedó en la versión anterior (lo que deja una vuelta atrás)', () => {
  it('nombra los TRES casos y da salida en cada uno, en vez de declarar incidente lo que el runbook llama esperado', async () => {
    const r = await correr(1500, '--solo-verificar', '--base', baseOtraVersion);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ABORTADO:');
    // el rewrite catch-all hace que esto sea un DIFIERE y no un 404, y corta en el PRIMER publicable: lo nombra
    expect(r.stderr).toContain(`dist/${PRIMER_PEDIDO.slice(1)} DIFIERE`);
    expect(r.stderr).toContain('__BUILD__');                  // (a) el rebuild local, que sigue siendo esperado
    expect(r.stderr).toMatch(/vuelta atrás/i);                // (b) el estado que FABRICA el runbook…
    expect(r.stderr).toContain('A PROPÓSITO');                // …nombrado como esperado, no como incidente
    expect(r.stderr).toContain('npm run verificar');          // (b) su salida: el circuito, no re-verificar
    expect(r.stderr).toContain('edge de la CDN');             // (c) la causa probable si nadie volvió atrás…
    expect(r.stderr).toContain('hosting:channel:deploy');     // …y su salida, la del blanco que se está mirando
    // el bug exacto: la frase que le contestaba «es un incidente» al que venía de la vuelta atrás deliberada
    expect(r.stderr).not.toContain('Solo es un incidente si este dist es EL del deploy');
    // y lo que un mensaje leído durante el ensayo no puede decir jamás: publicar acá tocaría el canal VIVO
    expect(r.stderr).not.toContain('--dale');
  }, 20000);
});
