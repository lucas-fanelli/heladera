/**
 * `.claude/workflows/barra-estado.js` es el instrumento de la investigación de la barra: un prompt que leen
 * cuatro expertos, un auditor por hipótesis y un constructor. Se construyó mientras la pregunta estaba
 * ABIERTA y, para ahorrarles una lectura, CONGELÓ adentro tres cosas que viven en otro lado: la paleta
 * (`#F6F1E7` / `#1C1D1A`, que son los `--paper` de src/styles/tokens.css), el número de la decisión que hay
 * que leer (`D24`), y el relato del dueño. Las tres envejecieron el mismo día: D25 cerró la saga con el root
 * cause medido, y `## D24` pasó a ser «El circuito de deploy» — o sea que el puntero no quedó incompleto,
 * quedó FALSO, y lo lee un tribunal de seis agentes que tienen prohibido contradecir el CONTEXTO.
 *
 * Nada lo ataba: `grep -rn "barra-estado"` en todo el repo devolvía SOLO el propio archivo — ningún doc,
 * ninguna puerta, ningún test. Eso es lo que arreglan estas dos aserciones: atan el workflow a las dos
 * fuentes de verdad que ya existen (decisiones.md y tokens.css) para que la próxima vez que una se mueva,
 * esto se ponga en rojo en vez de envejecer en silencio.
 *
 * La prosa del prompt (el planteo, las misiones, el `whenToUse`) NO lleva aserción a propósito: es
 * redacción, la regla del repo dice que los mensajes no llevan test, y afirmar sobre frases sería frágil y
 * no custodiaría nada. Lo que corta la recurrencia es el puntero y los hexes.
 *
 * readFileSync tira si alguno de los tres archivos se movió o se renombró: falla cerrado, no pasa en silencio.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — módulo .mjs de scripts/, sin tipos: acá solo importa su comportamiento
import { papelesDeTokens } from '../../scripts/tokens-css.mjs';

const REPO = process.cwd();
const WORKFLOW = readFileSync(join(REPO, '.claude/workflows/barra-estado.js'), 'utf8');
const DECISIONES = readFileSync(join(REPO, 'docs/diseno/decisiones.md'), 'utf8');
const TOKENS = readFileSync(join(REPO, 'src/styles/tokens.css'), 'utf8');

/** Los `## D<n>` de decisiones.md cuyo TÍTULO habla de la barra de estado. Derivado, no enumerado: si mañana
 *  se renumeran las decisiones o se abre una D26 sobre la barra, esto se mueve solo y el workflow tiene que
 *  seguirlo. */
const DECISIONES_DE_LA_BARRA = [...DECISIONES.matchAll(/^## D(\d+) · (.+)$/gm)]
  .filter((m) => /barra de estado/i.test(m[2] ?? ''))
  .map((m) => Number(m[1]));

/** Los `D<n>` que el workflow CITA, únicos y ordenados. */
const DECISIONES_CITADAS = [...new Set([...WORKFLOW.matchAll(/\bD(\d+)\b/g)].map((m) => Number(m[1])))]
  .sort((a, b) => a - b);

describe('el workflow de la barra apunta a la decisión vigente', () => {
  // Sin este `toHaveLength`, el test de abajo aprueba en vacío: dos listas vacías también son iguales.
  it('decisiones.md tiene exactamente UNA decisión sobre la barra de estado', () => {
    expect(DECISIONES_DE_LA_BARRA).toHaveLength(1);
  });

  it('el workflow cita esa decisión y ninguna otra', () => {
    expect(DECISIONES_CITADAS).toEqual(DECISIONES_DE_LA_BARRA);
  });
});

describe('el workflow no congela la paleta adentro del prompt', () => {
  const { claros, oscuros } = papelesDeTokens(TOKENS) as {
    claros: { valor: string }[];
    oscuros: { valor: string }[];
  };
  // cantidad exigida: con tokens.css vacío el `some` de abajo pasaría trivialmente
  it('tokens.css declara --paper claros y oscuros', () => {
    expect(claros.length).toBeGreaterThan(0);
    expect(oscuros.length).toBeGreaterThan(0);
  });

  it('ningún hex del workflow es un --paper de tokens.css', () => {
    const papeles = new Set([...claros, ...oscuros].map((p) => p.valor));
    // `#([0-9A-Fa-f]+)\b` filtrado a 6 dígitos, y no `{6}`, para que el número de bug `#407420295` no
    // aporte un falso `#407420`. El `#131313` MEDIDO en el teléfono pasa a propósito: es evidencia, no una
    // copia de la paleta.
    const hexes = [...WORKFLOW.matchAll(/#([0-9A-Fa-f]+)\b/g)]
      .map((m) => (m[1] ?? '').toUpperCase())
      .filter((h) => h.length === 6)
      .map((h) => `#${h}`);
    expect(hexes.filter((h) => papeles.has(h))).toEqual([]);
  });
});

describe('el schema de hipótesis no exige la premisa que D25 refutó', () => {
  // `explicaElAntes` era clave `required`: obligaba a cada hipótesis a explicar «que ANTES funcionaba y
  // ahora no». La respuesta VERDADERA de D25 —el meta theme-color nunca pintó esa barra— era rechazable por
  // contrato. No es una redacción: es estructura, por eso lleva aserción.
  it('no queda rastro de explicaElAntes', () => {
    expect(WORKFLOW).not.toContain('explicaElAntes');
  });
});
