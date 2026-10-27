/**
 * Después de publicar, la ÚNICA herramienta que contesta «qué está sirviendo producción» es
 * `node scripts/deploy.mjs --solo-verificar`, y esa herramienta no compara contra nada abstracto: compara
 * contra el `dist/` LOCAL, que tiene que seguir siendo EL del deploy.
 *
 * El bug que este test fija: cuando la verificación en el aire salía en rojo, los mensajes decían qué correr
 * (`--solo-verificar`) y no decían qué NO correr. El reflejo del operador después de un rojo es «déjame
 * re-correr las puertas» → `npm run verificar`, la puerta de entrada institucional del proyecto (CLAUDE.md,
 * el README, el paso 1 de la skill, y el agente que cierra cada vuelta del circuito). Ese comando termina en
 * un `vite build` que PISA dist/; como cada build hornea un `__BUILD__` nuevo, el chunk cambia de hash y a
 * partir de ahí `--solo-verificar` ni siquiera da un DIFIERE legible: muere con 404 en el primer archivo,
 * mandando a sospechar del servidor por una herida hecha en la propia máquina — justo en el único tramo del
 * que no se vuelve sin tocar producción. El aviso existía a medias: `verificar-release.mjs` lo escribe al
 * validar sus flags (protege al que YA conoce `--solo-dist`) y el mensaje del DIFIERE lo explica DESPUÉS de
 * consumado. Faltaba el cartel donde el operador está parado cuando todavía puede no hacerlo.
 *
 * Por eso las aserciones son de DOS clases, y la segunda es la que lo hace un test y no un corrector
 * ortográfico: (a) que el aviso esté en los bloques que el operador lee, y (b) que lo que el aviso AFIRMA
 * siga siendo cierto contra los scripts reales — derivado, no congelado. Si mañana el build sale de la rama
 * de `--solo-dist`, o `npm run verificar` deja de ser ese comando, el test se rompe y el mensaje se revisa en
 * vez de envejecer.
 *
 * Que `--solo-dist` NO buildea ya lo prueba empíricamente verificar-release.test.ts (corre el script real en
 * un mkdtemp SIN node_modules): acá no se duplica ese harness.
 *
 * NO se importa scripts/deploy.mjs: tiene efectos al importarse (parsea argv y deploya). Se lee como texto,
 * igual que fases-deploy.test.ts y runbook-sintoma.test.ts. readFileSync tira si un archivo se movió: falla
 * cerrado, que es la alarma que se quiere.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = process.cwd();
const DEPLOY = readFileSync(join(REPO, 'scripts/deploy.mjs'), 'utf8');
const VERIFICAR = readFileSync(join(REPO, 'scripts/verificar-release.mjs'), 'utf8');

// el cuerpo se lee par a par (cualquier cosa que no sea backtick ni barra, o una barra con lo que le siga):
// el aviso lleva backticks ESCAPADOS adentro, que son los comandos que el operador copia y pega
const NO_REBUILDEAR = DEPLOY.match(/const NO_REBUILDEAR = `((?:[^`\\]|\\[\s\S])*)`;/)?.[1];

/**
 * Los dos momentos en que producción YA se tocó y el mensaje manda a `--solo-verificar` con el dist-ancla en
 * la mano. Se recorta el BLOQUE que el operador lee y no el archivo entero: el docstring y el comentario de
 * la constante también hablan del rebuild, y una aserción contra todo el archivo se aprobaría contra ESA
 * compañía aunque el aviso nunca llegara a imprimirse — la constante muerta es exactamente el modo de fallo.
 */
const BLOQUES: [string, (txt: string) => string | undefined][] = [
  // el catch de la verificación en el aire después de publicar: desde el «OJO» hasta su process.exit(1)
  ['el fallo de la verificación en el aire', (txt) => {
    const i = txt.indexOf('OJO: el deploy YA SE PUBLICÓ');
    const fin = i < 0 ? -1 : txt.indexOf('process.exit(1)', i);
    return i < 0 || fin < 0 ? undefined : txt.slice(i, fin);
  }],
  // el último escalón del corte a la mitad: el hosting ya salió, así que también hay dist-ancla que cuidar
  ['el último escalón del corte a la mitad', (txt) => {
    const i = txt.indexOf('«releasing new version» YA salió');
    const fin = i < 0 ? -1 : txt.indexOf('`);', i);
    return i < 0 || fin < 0 ? undefined : txt.slice(i, fin);
  }],
];

/** El bloque de verificar-release.mjs que NO corre bajo `--solo-dist`: ahí adentro vive el build. */
const BLOQUE_COMPLETO = (() => {
  // Los finales de línea del repo están MEZCLADOS: verificar-release.mjs quedó en CRLF y este test lo leía
  // crudo, así que el `\n}\n` no matcheaba nunca y el ancla salía undefined — el test moría con «no encontré
  // el bloque» sobre un script perfectamente sano. Se normaliza antes de buscar, como el resto del repo.
  const texto = VERIFICAR.replace(/\r\n/g, '\n');
  const i = texto.indexOf('if (!soloDist) {');
  const fin = i < 0 ? -1 : texto.indexOf('\n}\n', i);
  return i < 0 || fin < 0 ? undefined : texto.slice(i, fin);
})();

/** La INVOCACIÓN del build, no sus menciones en prosa: los comentarios de los dos scripts lo nombran. */
const INVOCA_BUILD = /correr\(\s*['"]npx vite build/g;
const contar = (texto: string, re: RegExp): number => texto.match(re)?.length ?? 0;

describe('el aviso de no pisar el dist-ancla existe y llega a la pantalla', () => {
  it('encuentra la constante NO_REBUILDEAR en scripts/deploy.mjs', () => {
    // sin esta guarda, un renombre dejaría el resto aprobando en vacío justo en el mensaje del único tramo
    // del que no se vuelve sin tocar producción
    expect(NO_REBUILDEAR, 'no encontré `const NO_REBUILDEAR = `…`;` en scripts/deploy.mjs').toBeTruthy();
  });

  it.each(BLOQUES)('%s lo imprime (no es una constante muerta)', (_nombre, extraer) => {
    const bloque = extraer(DEPLOY);
    expect(bloque, 'no encontré el bloque en scripts/deploy.mjs: si se movió, este test dejó de custodiarlo').toBeTruthy();
    expect(
      bloque,
      'ese bloque manda a `--solo-verificar` sin decir que el comando más a mano (`npm run verificar`) pisa el dist contra el que compara: el operador se queda sin la única herramienta que contesta qué está sirviendo producción',
    ).toContain('NO_REBUILDEAR');
  });
});

describe('lo que el aviso afirma sigue siendo cierto contra los scripts reales', () => {
  const PKG = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

  it('`npm run verificar` es el script que el aviso señala, y corre SIN --solo-dist', () => {
    // si mañana el atajo pasara a llevar --solo-dist, dejaría de buildear y el aviso estaría mintiendo
    expect(PKG.scripts?.verificar, 'package.json ya no tiene el script `verificar`').toContain('scripts/verificar-release.mjs');
    expect(PKG.scripts.verificar, '`npm run verificar` ya no corre la verificación completa: revisá el aviso de NO_REBUILDEAR').not.toContain('--solo-dist');
  });

  it('el build vive DENTRO de la rama que `--solo-dist` se saltea: por eso el pelado pisa el dist', () => {
    expect(BLOQUE_COMPLETO, 'no encontré el bloque `if (!soloDist) { … }` en scripts/verificar-release.mjs').toBeTruthy();
    const enElArchivo = contar(VERIFICAR, INVOCA_BUILD);
    // cantidad exigida en las dos direcciones: sin esto, un build que cambió de forma aprobaría en vacío
    expect(enElArchivo, 'no encontré ningún `correr(\'npx vite build\')` en verificar-release.mjs: si el build cambió de forma, revisá qué afirma NO_REBUILDEAR').toBeGreaterThanOrEqual(1);
    expect(
      contar(BLOQUE_COMPLETO ?? '', INVOCA_BUILD),
      'el `vite build` de verificar-release.mjs se corre fuera del `if (!soloDist)`: si `--solo-dist` empezó a buildear, el aviso de NO_REBUILDEAR manda al operador a pisar el dist-ancla con el comando que le ofrece como salida',
    ).toBe(enElArchivo);
  });

  it('el aviso ofrece la salida que de verdad existe: --solo-dist, y el re-deploy que republica', () => {
    expect(NO_REBUILDEAR).toContain('npm run verificar -- --solo-dist');
    expect(NO_REBUILDEAR).toContain('npm run deploy -- --dale');
  });
});
