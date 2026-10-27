/**
 * El cierre del deploy es la ÚLTIMA línea que lee el operador después del único paso irreversible del
 * circuito, y decía «Deploy completo y verificado en el aire». No era cierto: `verificarEnElAire()` mira SOLO
 * hosting (bytes, headers, el deep link del rewrite, los ignorados, el handler) y de firestore no pide nada.
 *
 * El bug que este test fija: esta release ensanchó el paso irreversible de `--only hosting,firestore:rules` a
 * `--only firestore,hosting`, o sea que desde ahora el deploy publica también `firestore.indexes.json` (con el
 * `--only` viejo, `lib/deploy/firestore/prepare.js` ponía `firestoreIndexes = false`; lo cuenta entero
 * tests/unit/indices-firestore.test.ts). El ensanchamiento se razonó ENTERO en el vocabulario de «reglas» y
 * nadie re-auditó la afirmación de cierre contra el nuevo alcance: el mensaje firmaba por la mitad que la
 * release recién agregaba y que nadie verifica — la enfermedad 6 (mensajes que no dicen la verdad completa) en
 * el único tramo del que no se vuelve.
 *
 * Lo que se custodia acá NO es la redacción: es el ACOPLAMIENTO que faltaba. El alcance de lo publicado vive
 * en un string (el `--only`) y la afirmación de lo verificado vive en otro (el cierre), y no había nada que
 * los atara: sumar mañana otro target al `--only` volvería a dejar el cierre firmando por algo que nadie mira.
 * Por eso los dos lados se DERIVAN —el `--only` del propio fuente, la ruta de los índices de `firebase.json`—
 * y cada derivación exige cantidad, para que un regex que dejó de matchear falle CERRADO en vez de aprobar en
 * vacío.
 *
 * NO se importa scripts/deploy.mjs: tiene efectos al importarse (parsea argv y deploya). Se lee como texto,
 * igual que hacen fases-deploy.test.ts, runbook-sintoma.test.ts y comandos-firebase.test.ts. Y esa lectura es
 * la única custodia posible de este texto: tests/unit/deploy-aire.test.ts ya deja dicho que la rama `--dale`
 * no es alcanzable por los tests, así que hasta el incidente real nadie lo ejerce.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const leer = (ruta: string): string => readFileSync(join(ROOT, ruta), 'utf8').replace(/\r\n/g, '\n');

const DEPLOY = leer('scripts/deploy.mjs');

/**
 * Los targets del paso irreversible, derivados del propio fuente. Se ancla en el `spawnSync` a propósito: el
 * archivo imprime otros `firebase deploy --only …` en los runbooks de emergencia (hosting solo, firestore
 * solo), y agarrar cualquiera de ésos sería custodiar el alcance equivocado.
 */
const ONLY = [...DEPLOY.matchAll(/spawnSync\(`npx firebase deploy --only ([a-z:,]+)/g)].map((m) => m[1] as string);
const TARGETS = (ONLY[0] ?? '').split(',').filter(Boolean);

/** La ruta del archivo de índices NO se hardcodea: es el cableado de firebase.json el que la decide. */
const RUTA_INDICES = (JSON.parse(leer('firebase.json')) as { firestore?: { indexes?: string } }).firestore?.indexes;

/**
 * El bloque del cierre: lo que se imprime DESPUÉS de que la verificación en el aire pasó, hasta el `} catch`
 * que abre la rama de fallo. Se afirma sobre el BLOQUE y no sobre el archivo entero por la misma razón que
 * fases-deploy.test.ts: el archivo está lleno de comentarios y runbooks que nombran firestore y los índices, y
 * una aserción contra todo el archivo se aprobaría contra ESA compañía aunque el cierre siguiera diciendo
 * «Deploy completo y verificado en el aire» a secas.
 */
function bloqueDeCierre(): string | undefined {
  const i = DEPLOY.indexOf("await verificarEnElAire('deploy');");
  const fin = i < 0 ? -1 : DEPLOY.indexOf('} catch', i);
  return i < 0 || fin < 0 ? undefined : DEPLOY.slice(i, fin);
}

/**
 * El cuerpo de `verificarEnElAire()`, para la dirección contraria: hoy el cierre afirma que firestore «NO se
 * verifica acá», y esa afirmación también puede envejecer — hacia el otro lado.
 */
function cuerpoDeVerificarEnElAire(): string | undefined {
  const i = DEPLOY.indexOf('async function verificarEnElAire(');
  const fin = i < 0 ? -1 : DEPLOY.indexOf('\n}\n', i);
  return i < 0 || fin < 0 ? undefined : DEPLOY.slice(i, fin);
}

describe('el cierre del deploy nombra TODO lo que el paso irreversible publica', () => {
  it('el `--only` del paso irreversible se leyó del fuente y trae más de un target', () => {
    expect(
      ONLY.length,
      'no encontré el `spawnSync(`npx firebase deploy --only …`)` de scripts/deploy.mjs: si el paso irreversible cambió de forma, este test dejó de custodiar el alcance — arreglá el regex, no lo borres',
    ).toBe(1);
    expect(
      TARGETS.length,
      `el \`--only\` del deploy quedó en «${ONLY[0]}»: con un solo target esto aprobaría en vacío`,
    ).toBeGreaterThan(1);
    expect(TARGETS, 'el paso irreversible dejó de publicar hosting: revisá qué verifica `verificarEnElAire()`').toContain('hosting');
  });

  it('el bloque del cierre existe (sin esto, todo lo de abajo aprobaría en vacío)', () => {
    expect(
      bloqueDeCierre(),
      'no encontré el bloque que se imprime después de `await verificarEnElAire(\'deploy\')`: si se movió, este test dejó de custodiar la última línea que lee el operador',
    ).toBeTruthy();
  });

  // LA aserción que caza el bug de hoy: `verificarEnElAire()` verifica hosting y nada más, así que todo target
  // del `--only` que no sea hosting es algo que se publicó y NADIE miró — y el cierre tiene que decirlo.
  it.each(TARGETS.filter((t) => t !== 'hosting'))('el cierre nombra «%s», que se publica y no se verifica', (target) => {
    const bloque = bloqueDeCierre() ?? '';
    expect(
      bloque.toLowerCase(),
      `el paso irreversible publica «${target}» (\`--only ${ONLY[0]}\`) y \`verificarEnElAire()\` solo mira hosting, pero el cierre del deploy no lo nombra: la última línea que lee el operador estaría firmando por algo que nadie verificó. Nombralo, y decí que NO se verifica acá.`,
    ).toContain(target.toLowerCase());
  });

  it('el cierre apunta al archivo de índices REAL y al comando con el que se compara', () => {
    const bloque = bloqueDeCierre() ?? '';
    expect(
      typeof RUTA_INDICES,
      'firebase.json perdió firestore.indexes: sin esa clave el deploy deja de publicar índices EN SILENCIO (prepare.js: `if (firestoreConfig.indexes)`) y el cierre estaría mandando a comparar contra un archivo que no viaja',
    ).toBe('string');
    expect(
      bloque,
      `el cierre no nombra «${RUTA_INDICES}» (la ruta sale de firebase.json): si el cableado cambió, el mensaje manda al operador a comparar contra un archivo que no es el que se publica`,
    ).toContain(RUTA_INDICES as string);
    expect(
      bloque,
      'el cierre no nombra `firestore:indexes`: sin el comando, «producción y el archivo divergieron» es un susto sin salida — que exista de verdad lo custodia tests/unit/comandos-firebase.test.ts',
    ).toContain('firestore:indexes');
  });

  it('y no miente al revés: `verificarEnElAire()` sigue sin verificar nada de los índices', () => {
    const cuerpo = cuerpoDeVerificarEnElAire();
    expect(
      cuerpo,
      'no encontré el cuerpo de `verificarEnElAire()` en scripts/deploy.mjs: si cambió de forma, este test dejó de custodiarlo',
    ).toBeTruthy();
    for (const marca of ['firestore:indexes', RUTA_INDICES as string]) {
      expect(
        cuerpo,
        `\`verificarEnElAire()\` ahora menciona «${marca}»: si de verdad se implementó la comparación de índices contra producción, SACÁ del cierre el «NO se verifica acá» y contá lo que sí se verifica — dejarlo sería la misma enfermedad al revés (un mensaje que no dice la verdad completa), y este test existe para forzar esa relectura.`,
      ).not.toContain(marca);
    }
  });
});
