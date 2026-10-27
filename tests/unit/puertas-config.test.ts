/**
 * Los dos scripts del circuito (deploy.mjs y verificar-release.mjs) prometen fallar en formato de la casa
 * («ABORTADO: …» / «NO SE DEPLOYA: …»), pero los dos derivan config de archivos y esa lectura es I/O falible.
 * El circuito encontró que con firebase.json ausente, deploy.mjs reventaba a nivel de módulo con el stack
 * crudo de Node — y que el caso corrupto en verificar-release salía en formato de la casa SOLO por accidente
 * (el SyntaxError de JSON.parse no trae .path y esquivaba la relectura del catch).
 *
 * La segunda vuelta encontró la otra mitad: la «guarda» que deploy.mjs tenía sobre .firebaserc era un
 * `existsSync`, que responde «existe», no «se puede parsear». Cubría el archivo AUSENTE y dejaba afuera el
 * ilegible (`{roto` → SyntaxError con stack crudo) y el JSON válido que no es objeto (`null` → TypeError con
 * stack crudo). Por eso el invariante se fija acá para LOS DOS archivos de config, no para uno: config
 * ausente O corrupta, en CUALQUIERA de los dos scripts, sale en formato de la casa y sin stack crudo —
 * incluidos los casos que hoy pasan de casualidad, para que dejen de depender de la casualidad.
 *
 * Se corren los scripts REALES con spawnSync en una copia aislada (mkdtemp): el bug vive en el proceso
 * entero (evaluación de módulo, process.exit, stderr), no en una función importable.
 *
 * Ojo empírico: en el caso corrupto el mensaje de verificar-release NO nombra a firebase.json (el
 * SyntaxError de JSON.parse no trae el nombre del archivo), así que ahí se exige el formato y la ausencia
 * de stack — no el nombre. En deploy.mjs el nombre SÍ se exige: su mensaje de abort lo dice él mismo.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO = process.cwd();
/** La firma del stack crudo de Node («    at …»): la cara exacta que los scripts prometen no mostrar. */
const STACK_CRUDO = /\n\s+at /;

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'puertas-config-'));
  // scripts/ ENTERO, derivado del directorio real: una lista de archivos acá sería una enumeración que
  // envejece (los scripts se importan entre sí con rutas relativas y viajan juntos)
  cpSync(join(REPO, 'scripts'), join(tmp, 'scripts'), { recursive: true });
  // .firebaserc sano: la línea base, que los casos de firebase.json dejan pasar de largo y los de .firebaserc
  // envenenan a propósito. En deploy.mjs se lee ANTES que firebase.json, así que su abort gana siempre — por
  // eso los casos de .firebaserc de acá abajo son todos de deploy.mjs. En verificar-release el orden es al
  // revés (firebase.json entra en la puerta del dist, .firebaserc en la última), y por eso su caso de
  // .firebaserc vive en tests/unit/verificar-release.test.ts, donde el fixture llega a esa puerta
  writeFileSync(join(tmp, '.firebaserc'), JSON.stringify({ projects: { default: 'proyecto-fake' } }));
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

// deploy.mjs va con --solo-verificar: el abort bajo prueba pasa a nivel de módulo (idéntico con cualquier
// flag), pero si una regresión futura moviera la lectura, este modo falla rápido y sin hijos ni red — el
// modo sin flags intentaría correr la verificación completa (tsc, tests) antes de morir.
const correr = (script: string, ...args: string[]) =>
  spawnSync(process.execPath, [join(tmp, 'scripts', script), ...args], { encoding: 'utf8' });

describe('deploy.mjs cuando firebase.json es el problema', () => {
  it('ausente: aborta en formato de la casa, nombrando a firebase.json, sin stack crudo', () => {
    const r = correr('deploy.mjs', '--solo-verificar');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ABORTADO:');
    expect(r.stderr).toContain('firebase.json');
    expect(r.stderr).not.toMatch(STACK_CRUDO);
  });

  it('corrupto: ídem — el try de la guarda cubre también el JSON.parse', () => {
    writeFileSync(join(tmp, 'firebase.json'), '{roto');

    const r = correr('deploy.mjs', '--solo-verificar');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ABORTADO:');
    expect(r.stderr).toContain('firebase.json');
    expect(r.stderr).not.toMatch(STACK_CRUDO);
  });
});

describe('deploy.mjs cuando .firebaserc es el problema', () => {
  it('corrupto: aborta en formato de la casa, nombrando a .firebaserc, sin stack crudo', () => {
    writeFileSync(join(tmp, '.firebaserc'), '{roto');

    const r = correr('deploy.mjs', '--solo-verificar');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ABORTADO:');
    expect(r.stderr).toContain('.firebaserc');
    expect(r.stderr).not.toMatch(STACK_CRUDO);
  });

  it('JSON válido que no es objeto: ídem — el ?. cubre la forma, no solo el parse', () => {
    writeFileSync(join(tmp, '.firebaserc'), 'null');

    const r = correr('deploy.mjs', '--solo-verificar');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ABORTADO:');
    expect(r.stderr).toContain('.firebaserc');
    expect(r.stderr).not.toMatch(STACK_CRUDO);
  });

  it('sin proyecto default: el abort dice cómo se vuelve, como su hermano de una línea arriba', () => {
    writeFileSync(join(tmp, '.firebaserc'), JSON.stringify({ projects: {} }));

    const r = correr('deploy.mjs', '--solo-verificar');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ABORTADO:');
    expect(r.stderr).toContain('firebase use');   // la salida, no la frase entera: el copy puede afinarse
  });
});

describe('verificar-release.mjs --solo-dist cuando firebase.json es el problema', () => {
  it('ausente: falla en formato de la casa, nombrando a firebase.json (el ENOENT trae la ruta), sin stack crudo y sin hint de rebuild', () => {
    const r = correr('verificar-release.mjs', '--solo-dist');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA:');
    expect(r.stderr).toContain('firebase.json');
    expect(r.stderr).not.toMatch(STACK_CRUDO);
    expect(r.stderr).toContain('la puerta «Auditorías del dist» reventó');
    // Este es además el caso del doble-throw del catch de puerta(): el hint de rebuild se calcula ADENTRO
    // del catch re-leyendo firebase.json, así que con el archivo ausente esa relectura tiraba de nuevo y
    // salía el stack crudo. Mitad (a): sin firebase.json no hay hint (un rebuild no arregla nada, y encima
    // pisa el dist-ancla). La mitad (b) —que con firebase.json sano y el dist incompleto el hint SIGUE— vive
    // en tests/unit/verificar-release.test.ts: sin ella, «nunca hint» pasaría este caso.
    expect(r.stderr).not.toContain('¿dist incompleto o viejo?');
  });

  it('corrupto: falla en formato de la casa y sin stack crudo (hoy pasa de casualidad — que quede fijado)', () => {
    writeFileSync(join(tmp, 'firebase.json'), '{roto');

    const r = correr('verificar-release.mjs', '--solo-dist');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO SE DEPLOYA:');
    expect(r.stderr).not.toMatch(STACK_CRUDO);
  });
});
