/**
 * El agujero que esta puerta tapa: las puertas deterministas auditaban el ARTEFACTO y las configs que están
 * en git, y nunca miraban el `.env` con el que Vite hornea el bundle — el único input del release que no
 * está versionado, y el que decide si la app habla con Firestore de verdad. Un build con `VITE_DB=fake`,
 * `VITE_USE_EMULATORS=true` o un projectId de otro proyecto pasaba las seis puertas en verde, y deploy.mjs
 * lo publicaba y confirmaba byte a byte con «Deploy completo y verificado en el aire»: la verificación
 * certificando fielmente que se publicó fielmente la cosa equivocada.
 *
 * Ojo con lo que estos tests exigen, que es el punto: «correr con un .env envenenado y que salga NO SE
 * DEPLOYA» YA pasaba antes del arreglo — un dist con VITE_DB=fake moría igual, pero por otra cosa (con el Db
 * falso vivo, la semilla demo viaja en el bundle y la caza la puerta de nombres), y con un mensaje que
 * mandaba al operador a buscar una fuga de nombre en vez de a mirar su `.env`. Un test que solo mirara el
 * exit code no fijaría nada. Por eso acá se exige la CAUSA nombrada en el mensaje y que el proceso muera en
 * la PRIMERA puerta, antes de gastar los minutos de tsc, tests y emulador.
 *
 * El end-to-end corre el script REAL en el repo REAL con el veneno inyectado por `process.env` (que es como
 * Vite lo hornearía, y por eso es fiel): no toca el `.env` de la máquina ni copia el repo a un mkdtemp —
 * desde %TEMP% el `import('vite')` de la puerta no resolvería.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — módulo .mjs de scripts/, sin tipos: acá solo importa su comportamiento
import { problemasDeEnv } from '../../scripts/env-release.mjs';

const REPO = process.cwd();
const PROYECTO = 'proyecto-de-prueba';
/** un env que sí produce el release: el resto de los casos es este con UNA cosa envenenada */
const SANO = {
  VITE_DB: 'firestore',
  VITE_ROUTER: 'path',
  VITE_FIREBASE_PROJECT_ID: PROYECTO,
  VITE_FIREBASE_API_KEY: 'una-clave',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROYECTO}.web.app`,
  VITE_FIREBASE_APP_ID: '1:1:web:1',
};
const problemas = (cambios: Record<string, string | undefined>) => {
  const env: Record<string, string | undefined> = { ...SANO, ...cambios };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  return problemasDeEnv(env, PROYECTO) as string[];
};

describe('problemasDeEnv: qué env produce el release y qué env produce otra app', () => {
  it('el env del release no tiene problemas (que la puerta no sea imposible de pasar)', () => {
    expect(problemas({})).toEqual([]);
  });

  it('VITE_DB ausente o distinto de firestore: lo nombra, y dice que lo publicado sería el Db falso', () => {
    for (const veneno of [undefined, 'fake', 'memoria']) {
      const p = problemas({ VITE_DB: veneno });
      expect(p.join('\n')).toContain('VITE_DB');
      expect(p.join('\n')).toMatch(/Db FALSO/i);
    }
  });

  it('VITE_USE_EMULATORS=true: lo nombra (el bundle publicado apuntaría a 127.0.0.1)', () => {
    expect(problemas({ VITE_USE_EMULATORS: 'true' }).join('\n')).toContain('VITE_USE_EMULATORS');
    expect(problemas({ VITE_USE_EMULATORS: 'false' })).toEqual([]);
  });

  // el criterio del router se compara contra 'hash', como src/app/router.ts — no contra 'path'. Un
  // VITE_ROUTER ausente ya rutea por path: frenarlo sería inventar un motivo que el producto no tiene
  it('VITE_ROUTER: hash es problema; ausente y path no lo son', () => {
    expect(problemas({ VITE_ROUTER: 'hash' }).join('\n')).toContain('VITE_ROUTER');
    expect(problemas({ VITE_ROUTER: undefined })).toEqual([]);
    expect(problemas({ VITE_ROUTER: 'path' })).toEqual([]);
  });

  it('el projectId del bundle contra el de .firebaserc: distinto o ausente es problema, y el mensaje dice los dos', () => {
    const otro = problemas({ VITE_FIREBASE_PROJECT_ID: 'otro-proyecto' }).join('\n');
    expect(otro).toContain('otro-proyecto');
    expect(otro).toContain(PROYECTO);
    expect(problemas({ VITE_FIREBASE_PROJECT_ID: undefined }).join('\n')).toContain('VITE_FIREBASE_PROJECT_ID');
  });

  it('las claves que crearFirebase() exige, vacías o ausentes: la app no abriría', () => {
    for (const clave of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID']) {
      expect(problemas({ [clave]: '   ' }).join('\n')).toContain(clave);
      expect(problemas({ [clave]: undefined }).join('\n')).toContain(clave);
    }
  });

  it('el AUTH_DOMAIN ausente: problema, y el mensaje no miente sobre la consecuencia (la lista abre; muere la cuenta)', () => {
    const p = problemas({ VITE_FIREBASE_AUTH_DOMAIN: undefined }).join('\n');
    expect(p).toContain('VITE_FIREBASE_AUTH_DOMAIN');
    expect(p).toContain('D23');
  });

  // acá el VALOR es el producto, y el valor equivocado no hay que inventarlo: lo produce sola la realidad.
  // `npx firebase apps:sdkconfig` —el comando que el README manda a correr para rehacer el .env en otra
  // máquina— devuelve `authDomain: <proyecto>.firebaseapp.com`, y con eso el circuito entero salía verde
  // (crearFirebase() no lo valida; la verificación en el aire pide /__/auth/handler sobre BASE, que sale de
  // .firebaserc y no del bundle) publicando la cuenta permanente rota
  it('el AUTH_DOMAIN que devuelve apps:sdkconfig (<proyecto>.firebaseapp.com) es problema: es EL valor que rompe D23', () => {
    const p = problemas({ VITE_FIREBASE_AUTH_DOMAIN: `${PROYECTO}.firebaseapp.com` }).join('\n');
    expect(p).toContain('firebaseapp.com');        // el valor visto, nombrado
    expect(p).toContain(`${PROYECTO}.web.app`);    // el esperado, nombrado
    expect(p).toContain('D23');                    // el por qué, alcanzable sin abrir decisiones.md
  });

  it('el AUTH_DOMAIN de OTRO proyecto tampoco pasa, y el sano sigue pasando (espacios y mayúsculas incluidos)', () => {
    expect(problemas({ VITE_FIREBASE_AUTH_DOMAIN: 'otro-proyecto.web.app' }).join('\n')).toContain('VITE_FIREBASE_AUTH_DOMAIN');
    expect(problemas({ VITE_FIREBASE_AUTH_DOMAIN: `  ${PROYECTO}.web.app  ` })).toEqual([]);
    expect(problemas({ VITE_FIREBASE_AUTH_DOMAIN: `${PROYECTO}.WEB.APP` })).toEqual([]);
  });

  // las dos escalas espejan la MISMA línea en los dos archivos del producto: `if (env !== undefined &&
  // env !== '') return Number(env); return 1;`. Por eso ausente y vacía TIENEN que pasar —ya son 1— y
  // cualquier presente que no se lea como 1 tiene que frenar, el NaN de un texto incluido. Si se pierde
  // ese matiz, la puerta frena un env sano por un motivo que el producto no tiene
  it.each(['VITE_TIMING_SCALE', 'VITE_MOTION_SCALE'])('%s: presente y distinto de 1 es problema; ausente, vacía y 1 no lo son', (clave) => {
    for (const veneno of ['0', '0.6', 'abc']) {
      expect(problemas({ [clave]: veneno }).join('\n'), `${clave}=${veneno} tendría que frenar`).toContain(clave);
    }
    for (const sano of [undefined, '', '1', '1.0']) {
      expect(problemas({ [clave]: sano }), `${clave}=${JSON.stringify(sano)} es lo que el producto lee como 1`).toEqual([]);
    }
  });

  it('el mensaje de VITE_TIMING_SCALE nombra la consecuencia, no solo la clave (el mensaje es el entregable)', () => {
    const p = problemas({ VITE_TIMING_SCALE: '0' }).join('\n');
    expect(p).toContain('0');            // el valor visto
    expect(p).toMatch(/Deshacer|Vaciar/); // qué se rompe en la app, alcanzable sin abrir timing.ts
  });

  // LA CUSTODIA de la enumeración, que es lo que hace que esta puerta no vuelva a envejecer: nació
  // incompleta —enumeró a mano las claves del incidente que la motivó (un .env de otra máquina) y se dejó
  // afuera las dos escalas— y nada avisaba. Los dos lados se derivan, como en comandos-firebase.test.ts
  it('la puerta mira TODAS las VITE_* que el producto lee: si mañana aparece otra, esto frena y se decide', () => {
    const archivos = readdirSync(join(REPO, 'src'), { recursive: true })
      .map(String)
      .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'));
    const delProducto = new Set<string>();
    for (const f of archivos) {
      for (const m of readFileSync(join(REPO, 'src', f), 'utf8').matchAll(/VITE_[A-Z0-9_]+/g)) delProducto.add(m[0]);
    }
    // cantidad primero: un regex que dejó de matchear o un readdir vacío tienen que fallar CERRADO, no
    // aprobar en vacío comparando un set vacío contra la puerta
    expect(delProducto.size, 'no se encontró ninguna VITE_* en src/ — ¿se rompió el barrido?').toBeGreaterThanOrEqual(9);

    const puerta = readFileSync(join(REPO, 'scripts', 'env-release.mjs'), 'utf8');
    expect(
      [...delProducto].filter((v) => !puerta.includes(v)),
      'estas VITE_* las lee el producto y scripts/env-release.mjs ni las menciona: deciden qué app se publica y ninguna puerta las mira. O se llevan su regla en problemasDeEnv(), o se las nombra en un comentario ahí explicando por qué no llevan ninguna — mencionarlas alcanza para pasar, y es a propósito: lo que este test exige es la decisión escrita',
    ).toEqual([]);
  });
});

/** el script real, con las VITE_* del veneno encima del .env de la máquina (la precedencia que usa Vite) */
function verificarCon(veneno: Record<string, string>) {
  return spawnSync(process.execPath, [join(REPO, 'scripts', 'verificar-release.mjs')], {
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, ...veneno },
    // margen de sobra para la puerta arreglada (muere en menos de un segundo) y freno para la rota: sin la
    // puerta, esta corrida se iba a los minutos de tsc + tests + emulador, y el timeout la deja en rojo igual
    timeout: 30_000,
  });
}

describe('la puerta del .env en el script real (el proceso entero, no una función importable)', () => {
  it('VITE_DB=fake: NO SE DEPLOYA nombrando la causa, y muere antes de tsc', () => {
    const r = verificarCon({ VITE_DB: 'fake' });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('VITE_DB');            // la CAUSA, nombrada: no «una fuga de nombre»
    expect(r.stdout).not.toContain('Tipos (tsc)');    // primera puerta: no se gastan los minutos de abajo
  });

  it('VITE_USE_EMULATORS=true: ídem — el caso que hoy pasaba TODO en verde, dist incluido', () => {
    const r = verificarCon({ VITE_USE_EMULATORS: 'true' });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('VITE_USE_EMULATORS');
    expect(r.stdout).not.toContain('Tipos (tsc)');
  });

  // Mismo argumento que el de VITE_DB, un escalón más abajo: sin esta regla la corrida TAMBIÉN moría, pero
  // recién en la puerta 3 y por otra cosa —dos aserciones de número absoluto de src/domain/timing.test.ts y
  // src/motion/tokens.test.ts, escritas para otro tema, que con la escala en 0 dejan de dar—. El operador
  // con un VITE_TIMING_SCALE olvidado en su `.env` esperaba tsc + tests para leer «el stagger del bolsillo»
  // y se iba a depurar tokens de motion en vez de mirar su env. Y ese freno era accidental: el día que esas
  // dos aserciones se reescriban relativas a timing()/k() —un refactor razonable— desaparece sin avisar.
  // De paso esto verifica —no asume— que loadEnv levanta estas dos claves exportadas en la terminal.
  it('VITE_TIMING_SCALE=0: muere en la PRIMERA puerta nombrando la clave, no minutos después en un test de stagger', () => {
    const r = verificarCon({ VITE_TIMING_SCALE: '0' });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA');
    expect(r.stderr).toContain('VITE_TIMING_SCALE');
    expect(r.stdout).not.toContain('Tipos (tsc)');
  });
});
