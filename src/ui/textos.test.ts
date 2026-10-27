import { describe, expect, it } from 'vitest';
import { textos } from './textos';

/** El vocabulario del modelo que la release deroga: «una llave = un aparato». D23 lo rompió —una cuenta es UN
 *  uid y UNA llave aunque sean tres dispositivos— y D26 le sacó la última pieza que lo sostenía, la etiqueta
 *  por dispositivo. Una frase de estos bloques que cuente aparatos está citando un invariante que ya no existe. */
const APARATO = /dispositivo|tel[eé]fono|celular|aparato|tablet/i;

/** Los dos bloques de copy que hablan de las llaves: el sheet de accesos, y el ítem de menú que lo abre. */
const BLOQUES = ['accesos', 'menu'] as const;

/** Las ÚNICAS frases de esos bloques que pueden nombrar un aparato, cada una con su porqué (D26). La lista es
 *  corta a propósito: todo lo demás lo decide el barrido, no una enumeración. */
const SANCIONADAS: Record<string, string> = {
  'accesos.esteTelefono': 'rótulo de la fila propia: es vocabulario, y es lo que la gente reconoce en su fila',
  'accesos.salirTexto': 'dice el alcance real de salir(): este dispositivo, y los que compartan el acceso guardado',
};

/** Los plurales y las ramas por `null` se resuelven adentro del copy: mirando una sola sonda, media frase queda
 *  sin leer. Se pasan más argumentos de los que cualquiera toma; los de más se ignoran solos. */
const SONDAS: unknown[][] = [[0], [1], [2], ['x'], ['x', 2], [null], [null, null]];

/** Todo lo que una clave de copy puede llegar a decir en pantalla: el string, las ramas de la función, o —si
 *  el bloque anida, como `header.estado`— lo de adentro. */
const frases = (valor: unknown): string[] =>
  typeof valor === 'string' ? [valor]
    : typeof valor === 'function' ? SONDAS.map(args => String((valor as (...a: unknown[]) => unknown)(...args)))
      : valor !== null && typeof valor === 'object' ? Object.values(valor).flatMap(frases)
        : [];

const frasesDe = (bloque: (typeof BLOQUES)[number], clave: string) =>
  frases((textos[bloque] as Record<string, unknown>)[clave]);

/**
 * D26 derogó «una llave = un aparato» y arregló las frases que lo citaban buscándolas a mano. Lo que se busca a
 * mano se busca donde uno se acuerda: quedó afuera `menu.accesosSub` («N dispositivos»), el subtítulo del ítem
 * que abre justo este sheet, que además nunca tuvo consumidor —nació muerto en D22— y por eso nadie lo vio en
 * tres releases. El universo de este barrido sale de `Object.entries` del propio objeto, así que el copy que se
 * escriba mañana entra sin que nadie se acuerde de agregarlo.
 */
describe('el copy de las llaves no cuenta aparatos', () => {
  it('ninguna frase de accesos ni de menu nombra un aparato, salvo las sancionadas', () => {
    const revisadas: string[] = [];
    for (const bloque of BLOQUES)
      for (const clave of Object.keys(textos[bloque])) {
        if (`${bloque}.${clave}` in SANCIONADAS) continue;
        for (const frase of frasesDe(bloque, clave)) {
          revisadas.push(`${bloque}.${clave}: ${frase}`);
          expect(`${bloque}.${clave}: ${frase}`).not.toMatch(APARATO);
        }
      }

    // que no apruebe en vacío, y que no apruebe a medias: si `frases` dejara de abrir las funciones —los
    // plurales y las ramas por `null`— devolvería una frase por clave y el barrido seguiría verde para siempre.
    const claves = BLOQUES.reduce((n, b) => n + Object.keys(textos[b]).length, 0);
    expect(revisadas.length, 'el barrido no leyó las ramas de las funciones').toBeGreaterThan(claves);
  });

  // La excepción no se otorga sola: si una sancionada se borra, o se reescribe y deja de nombrar un aparato,
  // el permiso sobra y hay que sacarlo de la lista. Sin esto la lista solo crece.
  it.each(Object.entries(SANCIONADAS))('la excepción %s sigue haciendo falta (%s)', ruta => {
    const [bloque, clave] = ruta.split('.') as [(typeof BLOQUES)[number], string];
    expect(Object.keys(textos[bloque]), ruta).toContain(clave);
    expect(frasesDe(bloque, clave).join(' '), ruta).toMatch(APARATO);
  });
});
