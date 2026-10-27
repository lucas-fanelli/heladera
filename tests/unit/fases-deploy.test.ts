/**
 * Los runbooks del deploy le mandan al operador BUSCAR UNA LÍNEA en la salida de la CLI para saber qué tocó
 * producción cuando el deploy cortó a la mitad. Ese marcador es un string de firebase-tools, igual que los
 * comandos que custodia tests/unit/comandos-firebase.test.ts — y la vuelta anterior cerró solo la mitad de
 * los comandos, dejando la otra mitad de la misma clase (los MARCADORES) sin puerta.
 *
 * El bug que este test fija: el mensaje del corte decía «si no llegó a publicar nada (falló antes de
 * "releasing"), no pasó nada». No es cierto. `releasing new version` lo imprime SOLO la fase `releases` del
 * hosting, la última de todas; una fase ANTES, dentro de `deploys`, firestore ya publicó índices y
 * fieldOverrides y lo dijo en pantalla («deployed indexes … successfully»). Un corte durante la subida del
 * hosting no muestra «releasing», así que el operador leía «no pasó nada» mientras la CLI, dos líneas más
 * arriba, decía lo contrario — y con un índice borrado (el fieldOverride de collection group de `acceso.uid`,
 * del que depende entrar con la cuenta desde otro teléfono, D23) producción NO quedó intacta.
 *
 * Se afirma sobre el firebase-tools INSTALADO, no sobre lo que recordamos de él: la dependencia va con caret
 * y el runbook no lo compila tsc ni lo ejerce el ensayo general, que recorre el camino feliz. `require` y
 * `readFileSync` tiran si la dependencia mueve o renombra esos archivos: falla CERRADO, que es justo la
 * alarma que se quiere (un marcador que ya no existe es un runbook que manda a buscar una línea fantasma).
 *
 * NO se importa scripts/deploy.mjs: tiene efectos al importarse (parsea argv y deploya). Se lee como texto,
 * igual que hacen comandos-firebase.test.ts y runbook-sintoma.test.ts.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const requerir = createRequire(import.meta.url);

/** El fuente instalado de firebase-tools, por subpath de lib/. Tira si el archivo se movió: falla cerrado. */
const fuente = (sub: string): string => readFileSync(requerir.resolve(`firebase-tools/lib/${sub}`), 'utf8');

/**
 * Los tres marcadores, en el orden en que la CLI los imprime. Es la escalera que los dos runbooks le hacen
 * leer al operador con el reloj corriendo, y cada uno pertenece a una fase distinta: el primero se imprime
 * cuando producción YA se tocó, los otros dos una fase más tarde.
 */
const MARCAS = ['deployed indexes', 'released rules', 'releasing new version'] as const;

const leer = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/**
 * Los dos textos de ops que enumeran la escalera. Se afirma sobre el BLOQUE que el operador lee, no sobre el
 * archivo entero: en los dos archivos la escalera está rodeada de comentarios y prosa que también nombran los
 * marcadores, y una aserción contra todo el archivo se aprobaría contra ESA compañía aunque el mensaje se
 * hubiera quedado con un solo escalón — el mismo modo de aprobar en vacío que evita runbook-sintoma.test.ts
 * afirmando sobre SINTOMA_PERMISO y no sobre deploy.mjs completo.
 */
const RUNBOOKS: [string, (txt: string) => string | undefined][] = [
  // el console.error del corte: desde «OJO: el deploy CORTÓ» hasta el backtick que cierra el template.
  ['scripts/deploy.mjs', (txt) => {
    const i = txt.indexOf('OJO: el deploy CORTÓ');
    const fin = i < 0 ? -1 : txt.indexOf('`);', i);
    return i < 0 || fin < 0 ? undefined : txt.slice(i, fin);
  }],
  // la sección §4 del runbook: desde su título en negrita hasta el próximo título en negrita.
  ['.claude/skills/deploy/SKILL.md', (txt) => {
    const i = txt.indexOf('**Si el deploy corta A LA MITAD**');
    const fin = i < 0 ? -1 : txt.indexOf('\n**Si ', i + 1);
    return i < 0 || fin < 0 ? undefined : txt.slice(i, fin);
  }],
];

describe('el modelo de fases del deploy es el del firebase-tools instalado', () => {
  it('la fase `deploys` de TODOS los targets corre antes que la fase `releases` (no es target por target)', () => {
    const orq = fuente('deploy/index.js');
    const iDeploys = orq.indexOf('chain(deploys');
    const iReleases = orq.indexOf('chain(releases');
    expect(iDeploys, 'no encontré `chain(deploys` en deploy/index.js: el orquestador cambió de forma').toBeGreaterThan(-1);
    expect(
      iReleases,
      'no encontré `chain(releases` DESPUÉS de `chain(deploys` en deploy/index.js: si las fases dejaron de ser globales, la escalera de los runbooks ya no describe lo que pasa',
    ).toBeGreaterThan(iDeploys);
  });

  it('firestore va antes que hosting, y el orden lo fija la CLI — no el orden del `--only`', () => {
    // filterTargets hace intersection(VALID_DEPLOY_TARGETS, --only), y lodash.intersection conserva el orden
    // del PRIMER array: por eso `--only firestore,hosting` y `--only hosting,firestore` publican igual.
    const { VALID_DEPLOY_TARGETS } = requerir('firebase-tools/lib/deploy/index.js') as { VALID_DEPLOY_TARGETS: string[] };
    expect(VALID_DEPLOY_TARGETS.length, 'el registro de targets vino vacío: sin esto lo de abajo aprobaría en vacío').toBeGreaterThan(5);
    expect(VALID_DEPLOY_TARGETS.indexOf('firestore')).toBeGreaterThan(-1);
    expect(VALID_DEPLOY_TARGETS.indexOf('firestore')).toBeLessThan(VALID_DEPLOY_TARGETS.indexOf('hosting'));
    expect(fuente('filterTargets.js'), 'filterTargets dejó de intersecar contra la lista ordenada: el `--only` podría estar mandando el orden').toContain('intersection');
    // Timeout propio: éste es el único test del archivo que `require` de verdad (los demás leen archivos sueltos),
    // y ese require arrastra el grafo entero de firebase-tools —el CLI completo—. En frío eso son decenas de
    // segundos de I/O en Windows; con el default de 5 s la puerta salía ROJA por el disco, no por el release,
    // y una puerta que grita en falso es una puerta que después se ignora cuando grita en serio.
  }, 120_000);

  it('«deployed indexes» sale de la fase `deploys`: cuando se lee, producción YA se tocó', () => {
    // firestore/deploy.js corre deployRules (que solo CREA el ruleset, no libera nada) y deployIndexes, que
    // llama a FirestoreApi.deploy: crea, parchea y —si el operador dice que sí al prompt— BORRA índices.
    expect(fuente('deploy/firestore/deploy.js')).toContain(MARCAS[0]);
  });

  it('«released rules» sale de la fase `releases`: las reglas se vuelven vivas ahí, no antes', () => {
    expect(fuente('deploy/firestore/release.js'), 'firestore/release.js ya no delega en rulesDeploy.release').toContain('rulesDeploy');
    expect(fuente('rulesDeploy.js')).toContain(MARCAS[1]);
  });

  it('«releasing new version» sale de la fase `releases` del hosting: es el ÚLTIMO escalón', () => {
    expect(fuente('deploy/hosting/release.js')).toContain(MARCAS[2]);
  });

  it('«releasing new version» NO pertenece a la subida del hosting — el bug de hoy en una línea', () => {
    // Ésta es la aserción que caza el mensaje viejo: usaba «releasing» como proxy de «¿se publicó algo?»,
    // pero la subida del dist (fase `deploys`) no lo imprime, y para cuando corre, firestore ya publicó.
    expect(
      fuente('deploy/hosting/deploy.js'),
      'si la subida del hosting empezó a imprimir «releasing new version», la escalera de los runbooks quedó mal: revisala contra las fases reales',
    ).not.toContain(MARCAS[2]);
  });
});

describe('los runbooks del corte a la mitad nombran los tres marcadores, no uno solo', () => {
  it.each(RUNBOOKS)('%s le da al operador la escalera entera', (ruta, extraer) => {
    const bloque = extraer(leer(ruta));
    // sin esta guarda, un archivo reescrito dejaría el bloque vacío y las aserciones de abajo aprobarían en
    // vacío justo cuando más importa: es el texto del único momento irreversible del circuito
    expect(bloque, `no encontré el bloque del corte a la mitad en ${ruta}: si se movió, este test dejó de custodiarlo`).toBeTruthy();
    for (const marca of MARCAS) {
      expect(
        bloque,
        `el bloque del corte a la mitad de ${ruta} no nombra «${marca}»: quien lo lea se queda sin el escalón que le dice si producción ya se tocó`,
      ).toContain(marca);
    }
  });
});
