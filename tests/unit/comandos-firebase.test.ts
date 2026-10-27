/**
 * El circuito IMPRIME comandos que un humano copia y pega — a veces con la app de la familia rota y el reloj
 * corriendo. Y un comando impreso es solo un string: no lo compila tsc, no lo corre ningún test y el ensayo
 * general contra un canal de preview recorre el camino FELIZ, así que la rama de fallo post-publicación
 * —cuyo contenido entero ES ese texto— nunca se ejerce hasta el incidente real. Así vivió
 * `npx firebase hosting:rollback`, que NO existe en firebase-tools, en la única salida documentada del único
 * momento irreversible del circuito: `scripts/deploy.mjs` (tres veces) y el runbook de la skill de deploy.
 *
 * Este test cierra esa frontera: TODO comando `npx firebase …` que el repo imprima tiene que existir en el
 * firebase-tools INSTALADO. El registro sale de la dependencia instalada y los archivos, de recorrer el
 * disco, y las dos direcciones exigen cantidad para que un require roto o un regex que dejó de matchear
 * fallen CERRADO en vez de aprobar en vacío.
 *
 * Queda un tercer eje que la primera versión de este archivo dejó a mano y que nació envejecido: las RAÍCES
 * que se recorren. Derivar los archivos DENTRO de una raíz no deriva el CONJUNTO de raíces, y en el mismo
 * working tree que estrenó esta puerta ya había dos archivos de ops afuera del barrido (`CLAUDE.md`, lo
 * primero que lee cualquier agente, y `.claude/workflows/`, que instruye a los del circuito). La guarda de
 * cantidad es ciega a eso por construcción: cuenta COMANDOS, no FUENTES, y una raíz sin cubrir aporta cero.
 * Por eso las raíces se auditan contra el repo ENTERO (`git ls-files`, la fuente de verdad de qué archivo es
 * del repo, que además deja afuera gratis node_modules, dist y .env): si un archivo del repo imprime
 * `npx firebase …` y el barrido no lo mira, esto se pone ROJO nombrándolo. La única lista a mano que queda es
 * la excepción de `tests/` —los tests nombran comandos rotos a propósito, empezando por el
 * `hosting:rollback` de acá arriba— y falla RUIDOSA: lo que aparece de más se ve, no se pierde.
 *
 * Corolario del barrido ampliado: `.claude/` no está en `.gitignore`, así que es el mismo en cualquier clon;
 * si alguien deja ahí un `.md` local con un comando inventado, la puerta se pone roja — y es lo correcto.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const requerir = createRequire(import.meta.url);

/**
 * El set de comandos REALES, derivado del firebase-tools instalado: su objeto `client` es el registro, y
 * anida los comandos como propiedades (`client.hosting.channel.deploy` ⇢ `hosting:channel:deploy`).
 * Derivarlo —en vez de re-listar los comandos acá— es lo que hace que no envejezca cuando la dependencia
 * sube de versión. WeakSet contra ciclos y tope de profundidad para no recorrer el mundo.
 */
function comandosReales(): Set<string> {
  const client = requerir('firebase-tools') as Record<string, unknown>;
  const vistos = new WeakSet<object>();
  const cmds = new Set<string>();
  const recorrer = (nodo: Record<string, unknown>, prefijo: string, prof: number): void => {
    if (prof > 4 || vistos.has(nodo)) return;
    vistos.add(nodo);
    for (const clave of Object.keys(nodo)) {
      const valor = nodo[clave];
      const nombre = prefijo ? `${prefijo}:${clave}` : clave;
      if (typeof valor === 'function') cmds.add(nombre);
      else if (valor && typeof valor === 'object') recorrer(valor as Record<string, unknown>, nombre, prof + 1);
    }
  };
  recorrer(client, '', 0);
  return cmds;
}

/**
 * Dónde vive lo copiable y pegable: los scripts del circuito, los documentos que alguien lee EN la emergencia
 * y los textos de ops que instruyen a los agentes. Los archivos de cada raíz salen de recorrer el disco, y
 * que el conjunto de RAÍCES no se quede corto lo custodia el describe de huérfanos de más abajo.
 */
function archivosQueImprimenComandos(): string[] {
  const scripts = readdirSync(join(ROOT, 'scripts'))
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => join('scripts', f));
  // `.claude` entero, no solo `skills`: ahí viven el runbook (skills), los workflows que instruyen a los
  // agentes y lo que venga. `.md` y `.js` dejan afuera `launch.json` y cualquier otra config.
  const claude = readdirSync(join(ROOT, '.claude'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.md') || f.endsWith('.js'))
    .map((f) => join('.claude', f));
  return [...scripts, ...claude, 'README.md', 'CLAUDE.md'];
}

/** La forma exacta en que el repo los imprime: lo que el operador copia y pega tal cual. */
const USO = /npx firebase ([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)*)/g;

/** comando → los archivos donde aparece (para que el error diga DÓNDE hay que corregirlo). */
function comandosImpresos(): Map<string, Set<string>> {
  const hallados = new Map<string, Set<string>>();
  for (const rel of archivosQueImprimenComandos()) {
    for (const m of readFileSync(join(ROOT, rel), 'utf8').matchAll(USO)) {
      const cmd = m[1];
      if (!cmd) continue;
      const donde = hallados.get(cmd) ?? new Set<string>();
      donde.add(rel);
      hallados.set(cmd, donde);
    }
  }
  return hallados;
}

const REALES = comandosReales();
const IMPRESOS = comandosImpresos();

/** git habla con «/» y `join` con «\» en Windows: sin normalizar, los archivos que YA se barren se leerían
 *  como huérfanos y la puerta nacería en rojo falso. */
const NORM = (f: string): string => f.replaceAll('\\', '/');

/** Los tests NOMBRAN comandos rotos a propósito —el docstring de acá arriba cita `hosting:rollback`, el caso
 *  testigo—: son el único lugar del repo donde «npx firebase X» no es una instrucción copiable. Esta lista de
 *  excepciones sí es a mano, pero falla RUIDOSA: un archivo nuevo con comandos aparece como huérfano, no se
 *  pierde en silencio. Meter `tests/` al barrido pondría este archivo en rojo permanente contra su propio
 *  caso testigo. */
const EXENTOS = /^tests\//;

/** El MISMO criterio de `USO` —de ahí sale, para que no puedan driftear a dos definiciones de «esto es un
 *  comando impreso»— sin la bandera `g`, que en `.test()` es stateful y saltearía archivos. */
const IMPRIME_COMANDO = new RegExp(USO.source);

/** Los archivos DEL REPO (versionados o nuevos sin ignorar) que imprimen la forma copiable. `git ls-files` es
 *  la fuente de verdad de qué es del repo y gratis deja afuera node_modules, dist y `.env`. Si git tira, tira
 *  el archivo entero: falla cerrado. */
const CANDIDATOS = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .filter((f) => {
    try {
      return IMPRIME_COMANDO.test(readFileSync(join(ROOT, f), 'utf8'));
    } catch {
      return false; // borrado o renombrado entre el ls-files y la lectura: no es un archivo que imprima nada
    }
  });

const BARRIDOS = new Set(archivosQueImprimenComandos().map(NORM));

describe('los comandos de firebase que el circuito imprime existen de verdad', () => {
  it('el registro sale del firebase-tools instalado y viene poblado (si no, todo esto aprobaría en vacío)', () => {
    // sin esta guarda, un require que devolviera {} dejaría el set vacío y el barrido de abajo sin nada que
    // comparar; y si el require TIRA, el archivo entero falla — las dos direcciones fallan cerrado
    expect(REALES.size).toBeGreaterThan(50);
  });

  it('el barrido encuentra los comandos que el repo imprime (un regex que dejó de matchear no aprueba en vacío)', () => {
    expect(IMPRESOS.size).toBeGreaterThanOrEqual(8);
  });

  it.each([...IMPRESOS].map(([cmd, donde]): [string, string] => [cmd, [...donde].join(', ')]))(
    '«npx firebase %s» está en el registro real (impreso en %s)',
    (cmd, donde) => {
      expect(
        REALES.has(cmd),
        `«npx firebase ${cmd}» se imprime en ${donde} y NO existe en el firebase-tools instalado: quien lo copie en una emergencia se come «${cmd} is not a Firebase command» con producción rota. Corregilo por el comando que sí existe, no por el que suena bien.`,
      ).toBe(true);
    },
  );
});

/** La puerta de la puerta: que el barrido de arriba mire TODAS las raíces donde el repo imprime comandos. Sin
 *  esto, la lista de raíces es lo único de este archivo que puede envejecer sin avisar — y cuando envejece no
 *  se pone roja: aprueba en silencio, que es justo el modo de fallo que este archivo existe para matar. */
describe('el barrido cubre todos los archivos del repo que imprimen comandos', () => {
  it('el universo sale de git y viene poblado (si git tira o el filtro deja de matchear, no aprueba en vacío)', () => {
    // hoy son 11: 6 barridos (4 scripts + SKILL.md + README.md) y 5 de `tests/`, exentos
    expect(CANDIDATOS.length).toBeGreaterThanOrEqual(6);
  });

  it('ninguno queda huérfano: si un archivo imprime comandos, el barrido lo mira o está exceptuado', () => {
    const huerfanos = CANDIDATOS.filter((f) => !EXENTOS.test(f) && !BARRIDOS.has(f));
    expect(
      huerfanos,
      `Fuera del barrido de esta puerta (imprimen «npx firebase …» y nadie los mira): ${huerfanos.join(', ')}. Un comando inventado ahí adentro se publica sin que nadie lo note. Por cada uno: sumá su raíz a archivosQueImprimenComandos(), o exceptualo en EXENTOS con la razón escrita.`,
    ).toEqual([]);
  });
});
