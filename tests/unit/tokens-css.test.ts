/**
 * El lector de --paper (scripts/tokens-css.mjs) le da a la puerta del release la fuente de verdad visual.
 * Su versión anterior (regex plana inline en verificar-release.mjs) le asignaba el esquema a cada match por
 * orden de aparición: un --paper viejo en un comentario o un bloque :root[data-theme="light"] futuro hacían
 * reventar la puerta con «--paper oscuros que no coinciden» — diagnóstico falso con tokens.css consistente.
 * Estos tests fijan el contrato: el esquema se lee del BLOQUE (media query / data-theme, lo que lee el
 * navegador), los comentarios no cuentan, CRLF parsea igual, y lo irreconocible TIRA en vez de adivinar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — módulo .mjs de scripts/, sin tipos: acá solo importa su comportamiento
import { esquemasDeTokens, papelesDeTokens, propiedadesDeCss, selectoresDeCss } from '../../scripts/tokens-css.mjs';

type Papel = { valor: string; donde: string };
const valores = (grupo: Papel[]) => grupo.map((p) => p.valor);

// el tokens.css REAL, leído de disco: una copia congelada acá dejaría de custodiar la paleta que de verdad
// rige apenas alguien la edite (hallazgo repetido del circuito)
const TOKENS_REAL = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const BASE_REAL = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');

describe('papelesDeTokens contra el tokens.css real', () => {
  it('encuentra al menos un claro y los dos oscuros (media del sistema + data-theme), coincidentes por grupo', () => {
    const { claros, oscuros } = papelesDeTokens(TOKENS_REAL);
    expect(claros.length).toBeGreaterThanOrEqual(1);
    expect(oscuros.length).toBeGreaterThanOrEqual(2);
    expect(new Set(valores(claros)).size).toBe(1);
    expect(new Set(valores(oscuros)).size).toBe(1);
    expect(claros[0].valor).toMatch(/^#[0-9A-F]{6}$/);   // hex normalizado a mayúsculas
    expect(claros[0].valor).not.toBe(oscuros[0].valor);
  });

  it('cada match dice DÓNDE apareció (la mitad del remedio: que un fallo no mande a cazar fantasmas)', () => {
    const { oscuros } = papelesDeTokens(TOKENS_REAL) as { oscuros: Papel[] };
    expect(oscuros.some((p) => p.donde.includes('prefers-color-scheme: dark'))).toBe(true);
    expect(oscuros.some((p) => p.donde.includes('[data-theme="dark"]'))).toBe(true);
  });
});

describe('los dos venenos que rompían el parser plano por orden de aparición', () => {
  const CSS_CON_BLOQUE_LIGHT = [
    ':root { --paper: #F6F1E7; }',
    '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #1C1D1A; } }',
    ':root[data-theme="dark"] { --paper: #1C1D1A; }',
    ':root[data-theme="light"] { --paper: #F6F1E7; }',
  ].join('\n');

  it('un comentario con un --paper viejo arriba de :root NO contamina los claros', () => {
    const css = '/* antes del retoque: --paper: #ABCDEF */\n:root { --paper: #F6F1E7; }\n:root[data-theme="dark"] { --paper: #1C1D1A; }';
    const { claros, oscuros } = papelesDeTokens(css);
    expect(valores(claros)).toEqual(['#F6F1E7']);   // el parser viejo tomaba #ABCDEF como «el claro»
    expect(valores(oscuros)).toEqual(['#1C1D1A']);
  });

  it('un :root[data-theme="light"] DESPUÉS de los bloques oscuros clasifica como claro (el falso «no coinciden» de hoy)', () => {
    const { claros, oscuros } = papelesDeTokens(CSS_CON_BLOQUE_LIGHT);
    expect(valores(claros)).toEqual(['#F6F1E7', '#F6F1E7']);
    expect(valores(oscuros)).toEqual(['#1C1D1A', '#1C1D1A']);   // el parser viejo metía el claro final acá
  });

  it('la misma entrada con CRLF parsea igual (tokens.css es CRLF)', () => {
    expect(papelesDeTokens(CSS_CON_BLOQUE_LIGHT.replaceAll('\n', '\r\n'))).toEqual(papelesDeTokens(CSS_CON_BLOQUE_LIGHT));
  });
});

describe('la negación es un guard y manda el bloque de adentro', () => {
  it('un :root:not([data-theme="dark"]) al tope es CLARO — el espejo del patrón que tokens.css ya usa', () => {
    // el clasificador viejo hacía substring crudo: matcheaba [data-theme="dark"] ADENTRO de la negación y
    // mandaba el claro a oscuros → la puerta acusaba «0 --paper claros y 1 oscuros» con el archivo perfecto
    const css = [
      ':root:not([data-theme="dark"]) { --paper: #F6F1E7; }',
      ':root[data-theme="dark"] { --paper: #1C1D1A; }',
    ].join('\n');
    const { claros, oscuros } = papelesDeTokens(css);
    expect(valores(claros)).toEqual(['#F6F1E7']);
    expect(valores(oscuros)).toEqual(['#1C1D1A']);
  });

  it('la media oscura con :root:not([data-theme="light"]) adentro SIGUE siendo oscura (que el arreglo no la invierta)', () => {
    const css = '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #1C1D1A; } }';
    const { claros, oscuros } = papelesDeTokens(css);
    expect(valores(oscuros)).toEqual(['#1C1D1A']);
    expect(claros).toEqual([]);
  });

  it('un override [data-theme="light"] ANIDADO en la media oscura es claro: manda el bloque más interno', () => {
    // con `pila.some(...)` el bloque de afuera se llevaba el esquema → falso «--paper oscuros que no coinciden»
    const css = [
      ':root { --paper: #F6F1E7; }',
      '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #1C1D1A; } :root[data-theme="light"] { --paper: #F6F1E7; } }',
    ].join('\n');
    const { claros, oscuros } = papelesDeTokens(css);
    expect(valores(claros)).toEqual(['#F6F1E7', '#F6F1E7']);
    expect(valores(oscuros)).toEqual(['#1C1D1A']);
  });
});

describe('fallar cerrado, no adivinar', () => {
  it('un --paper en un bloque irreconocible TIRA en vez de clasificarse mal en silencio', () => {
    expect(() => papelesDeTokens('.tarjeta { --paper: #123456; }')).toThrow(/no reconoce/);
    expect(() => papelesDeTokens('--paper: #123456;')).toThrow(/no reconoce/);   // fuera de todo bloque
  });

  it('una reestructura dark-first TIRA nombrando el bloque, en vez de clasificar al revés en silencio', () => {
    // el peor caso del clasificador viejo: devolvía claros=[#1C1D1A] / oscuros=[#F6F1E7] —INVERTIDO— con uno
    // de cada grupo, así que pasaba el «al menos uno de cada esquema» y los dos «coinciden entre sí», y el NO
    // aparecía tres chequeos después como «background_color del manifest no es el --paper claro», mandando a
    // revisar vite.config.ts. `prefers-color-scheme: light` no se enseña: se enseña acá CON test si existe.
    const css = [
      ':root { --paper: #1C1D1A; }',
      '@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --paper: #F6F1E7; } }',
    ].join('\n');
    expect(() => papelesDeTokens(css)).toThrow(/no reconoce/);
    expect(() => papelesDeTokens(css)).toThrow(/prefers-color-scheme: light/);   // que el mensaje diga DÓNDE
  });

  it('un :not() ANIDADO (el límite de la regex de negaciones) TIRA en vez de adivinar', () => {
    // antes clasificaba OSCURO en silencio por el substring; el límite queda fijado como fallo cerrado
    expect(() => papelesDeTokens(':root:not(:where([data-theme="dark"])) { --paper: #F6F1E7; }')).toThrow(/no reconoce/);
  });

  it('un --paper en otra notación TIRA en vez de caerse del grupo y dejar el valor viejo sosteniéndolo', () => {
    // el descarte silencioso era un piso más abajo que el conjunto vacío: la regex vieja contestaba «¿hay
    // --paper acá?» y «¿cuál es su valor?» con un solo match, así que un valor que no sabía leer era
    // indistinguible de «no hay --paper» y se iba por el `return`. Este css devolvía UN solo oscuro (el del
    // bloque :root[data-theme="dark"], que en la app no lo ejecuta nadie), el `every` de la puerta pasaba
    // trivialmente, y las aserciones de color oscuro del artefacto —el <meta theme-color> de dark— se
    // validaban contra ese #1C1D1A VIEJO: la pantalla con el papel nuevo y la barra de estado clavada en el
    // viejo, con `npm run verificar` en verde.
    const css = [
      ':root { --paper: #F6F1E7; }',
      '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: rgb(10 12 9); } }',
      ':root[data-theme="dark"] { --paper: #1C1D1A; }',
    ].join('\n');
    expect(() => papelesDeTokens(css)).toThrow(/no sabe leer/);
    expect(() => papelesDeTokens(css)).toThrow(/rgb\(10 12 9\)/);            // qué valor
    expect(() => papelesDeTokens(css)).toThrow(/prefers-color-scheme: dark/);   // y en qué bloque
  });

  it('un hex con alfa TIRA en vez de misleerse por prefijo (el hermano peor: los dos grupos coincidían)', () => {
    // acá no faltaba ni un elemento que delatara: la regex vieja tomaba los primeros 6 dígitos, los dos
    // grupos daban #1C1D1A, la puerta firmaba en verde y el navegador pintaba otro color
    const css = [
      '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #1C1D1ACC; } }',
      ':root[data-theme="dark"] { --paper: #1C1D1A; }',
    ].join('\n');
    expect(() => papelesDeTokens(css)).toThrow(/no sabe leer/);
    expect(() => papelesDeTokens(css)).toThrow(/#1C1D1ACC/);
  });

  it('el detector es ANCHO a propósito: `--paper : #F6F1E7` clasifica, y `--paper-edge` no lo confunde', () => {
    // el ensanche queda fijado como intención, no como accidente del arreglo: un espacio antes de los dos
    // puntos es CSS legal y antes se descartaba en silencio (claros: []); y un token vecino que empieza
    // igual no puede colarse como --paper ni hacer tirar al lector
    expect(valores(papelesDeTokens(':root { --paper : #F6F1E7; }').claros)).toEqual(['#F6F1E7']);
    const conVecino = papelesDeTokens(':root { --paper-edge: rgb(1 2 3); --paper: #F6F1E7; }');
    expect(valores(conVecino.claros)).toEqual(['#F6F1E7']);
  });

  it('un css sin --paper oscuro devuelve oscuros vacíos — y la exigencia de CANTIDAD de la puerta lo bloquea', () => {
    const { claros, oscuros } = papelesDeTokens(':root { --paper: #F6F1E7; }');
    expect(valores(claros)).toEqual(['#F6F1E7']);
    expect(oscuros).toEqual([]);
  });
});

/**
 * La notación del ARTEFACTO. El lector se escribió para el CSS escrito a mano y preguntaba por el substring
 * `[data-theme="dark"]` CON comillas; el minificador del build las saca (`:root[data-theme=dark]`,
 * `:root:not([data-theme=light])`), así que sobre la hoja PUBLICADA —que es lo que la puerta del release
 * abre ahora, para auditar el CSS por contenido y no solo por referencia— el lector TIRABA «un bloque que el
 * clasificador no reconoce» en cada corrida. Los fixtures son SINTÉTICOS a propósito: `npm run verificar`
 * corre los tests ANTES del build, así que un test que leyera dist/ sería flaky y dependería del orden.
 */
describe('el valor de data-theme sin comillas (lo que emite el minificador)', () => {
  it('`:root[data-theme=dark]` clasifica OSCURO (antes tiraba «no reconoce»: la hoja publicada reventaba la puerta)', () => {
    const { claros, oscuros } = papelesDeTokens(':root[data-theme=dark]{--paper:#1c1d1a}');
    expect(valores(oscuros)).toEqual(['#1C1D1A']);   // y el hex minúsculo sale normalizado: así compara con la fuente
    expect(claros).toEqual([]);
  });

  it("`:root[data-theme='dark']` con comilla simple: la misma clase, también válida en CSS", () => {
    const { oscuros } = papelesDeTokens(":root[data-theme='dark']{--paper:#1C1D1A}");
    expect(valores(oscuros)).toEqual(['#1C1D1A']);
  });

  it('`:root[data-theme=light]` clasifica CLARO', () => {
    const { claros, oscuros } = papelesDeTokens(':root[data-theme=light]{--paper:#f6f1e7}');
    expect(valores(claros)).toEqual(['#F6F1E7']);
    expect(oscuros).toEqual([]);
  });

  it('la negación SIN comillas sigue siendo un guard: la media oscura no se da vuelta', () => {
    // es la forma LITERAL que emite el build; si el ensanche la rompiera, el grupo se invertiría en silencio
    const { claros, oscuros } = papelesDeTokens('@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--paper:#1c1d1a}}');
    expect(valores(oscuros)).toEqual(['#1C1D1A']);
    expect(claros).toEqual([]);
  });

  it('el ensanche no se aflojó de más: un valor de data-theme que no es ni dark ni light SIGUE tirando', () => {
    expect(() => papelesDeTokens(':root[data-theme=oscuro]{--paper:#123456}')).toThrow(/no reconoce/);
    expect(() => papelesDeTokens(':root[data-theme=darkish]{--paper:#123456}')).toThrow(/no reconoce/);
  });
});
/**
 * `color-scheme` es la mitad CSS del contrato cromático con el sistema operativo, y la otra mitad es el
 * `<meta name="color-scheme">` del index: la puerta del release compara las dos, y el valor tiene que salir
 * de acá y no de una copia congelada adentro del script (misma postura que los --paper). El lector solo
 * pregunta PRESENCIA y UNICIDAD —no clasifica por bloque—, así que lo único que hay que fijar es que no
 * confunda el `prefers-color-scheme` de una @media con una declaración, y que dos declaraciones se vean
 * como dos para que la puerta FRENE en vez de elegir una.
 */
describe('esquemasDeTokens', () => {
  it('contra el tokens.css REAL devuelve exactamente 1: «light dark», el valor que el <meta> del index espeja', () => {
    expect(esquemasDeTokens(TOKENS_REAL)).toEqual(['light dark']);
  });

  it('el `prefers-color-scheme` de una @media NO es una declaración (el falso positivo que dejaría pasar la pérdida)', () => {
    // si matcheara, un tokens.css SIN color-scheme daría 1 y la puerta pasaría por la razón equivocada
    const css = '@media (prefers-color-scheme: dark) { :root { --paper: #112233 } }';
    expect(esquemasDeTokens(css)).toEqual([]);
  });

  it('dos declaraciones se ven como DOS: la puerta frena y se decide, en vez de quedarse con la primera', () => {
    const css = ':root { color-scheme: light dark; }\n:root[data-theme="dark"] { color-scheme: dark; }';
    expect(esquemasDeTokens(css)).toEqual(['light dark', 'dark']);
  });

  it('normaliza espacios, mayúsculas y CRLF, y los comentarios no cuentan (como el lector hermano)', () => {
    const css = '/* antes: color-scheme: only light; */\r\n:root {\r\n  color-scheme:   Light   Dark  ;\r\n}';
    expect(esquemasDeTokens(css)).toEqual(['light dark']);
  });
});

/**
 * Los otros dos lectores, los que le dan a la puerta del release las otras DOS cargas de la hoja publicada.
 * Existen porque esa puerta miraba UN token (--paper) mientras su mensaje prometía cuidar la paleta entera,
 * la escala de espaciado, --font-display/--font-body y el --target: con una hoja de 128 bytes —y hasta con
 * las cinco woff2 fuera del release— la corrida salía en VERDE. La alternativa barata era escribir los
 * nombres a mano adentro del script (`hoja.includes('--font-display:')`), que es una lista que envejece con
 * cada retoque de tokens.css/base.css justo en el archivo que promete comparar contra la FUENTE.
 */
describe('propiedadesDeCss', () => {
  it('contra el tokens.css REAL: saca la lista entera de la fuente, con los tokens que el mensaje de la puerta nombra', () => {
    const props = propiedadesDeCss(TOKENS_REAL);
    expect(props.length).toBeGreaterThan(100);              // hoy 115; el número exacto lo decide la paleta
    expect(props).toContain('--paper');
    expect(props).toContain('--font-display');
    expect(props).toContain('--font-body');
    expect(props).toContain('--target');
    expect(props).toContain('--s-4');
    expect(new Set(props).size).toBe(props.length);         // deduplicado: --paper está en tres bloques
  });

  it('cuenta DECLARACIONES y no usos var(--x) — si contara usos, el stub de 128 bytes pasaría solo', () => {
    // el stub del veneno: declara --paper y USA --ink/--font-body sin declararlos. Si los usos contaran,
    // la puerta vería los tres presentes y firmaría la hoja que justamente no trae el sistema de tokens
    const css = ':root{--paper:#f6f1e7}body{background:var(--paper);color:var(--ink);font-family:var(--font-body)}';
    expect(propiedadesDeCss(css)).toEqual(['--paper']);
  });

  it('un var(--x) anidado adentro de un valor tampoco cuenta (la forma REAL de tokens.css: color-mix)', () => {
    const css = ':root { --line-soft: color-mix(in srgb, var(--line) 55%, var(--paper)); }';
    expect(propiedadesDeCss(css)).toEqual(['--line-soft']);
  });

  it('los comentarios no cuentan y CRLF parsea igual (como los lectores hermanos)', () => {
    const css = '/* sacado: --viejo: 1px; */\r\n:root {\r\n  --nuevo: 2px;\r\n}';
    expect(propiedadesDeCss(css)).toEqual(['--nuevo']);
  });
});

/**
 * La normalización de selectores se VERIFICÓ contra el dist real antes de codearla, no se asumió: el paso que
 * la salvó es el último (sacar el `*` pegado a un pseudo), porque el build emite `*,:before,:after` donde
 * base.css escribe `*, *::before, *::after`. Sin él eran 15 de 16 selectores y la puerta cortaba un release
 * SANO con un rojo falso — el modo de fallo más caro que puede tener una puerta.
 */
describe('selectoresDeCss', () => {
  it('la FUENTE y el ARTEFACTO normalizan igual: `*, *::before, *::after` ≡ `*,:before,:after` (el rojo falso que casi sale)', () => {
    const fuente = selectoresDeCss('*, *::before, *::after { box-sizing: border-box; }');
    const artefacto = selectoresDeCss('*,:before,:after{box-sizing:border-box}');
    expect(fuente).toEqual(['*,:before,:after']);
    expect(fuente).toEqual(artefacto);
  });

  it('`::` → `:`, y los espacios alrededor de comas y combinadores se colapsan como los colapsa el minificador', () => {
    const fuente = selectoresDeCss('dialog::backdrop { a: 1 }\nul, ol { b: 2 }\n.a > .b + .c ~ .d { c: 3 }');
    const artefacto = selectoresDeCss('dialog:backdrop{a:1}ul,ol{b:2}.a>.b+.c~.d{c:3}');
    expect(fuente).toEqual(['dialog:backdrop', 'ul,ol', '.a>.b+.c~.d']);
    expect(fuente).toEqual(artefacto);
  });

  it('las at-rules no son selectores, pero los bloques que ANIDAN aportan los de adentro', () => {
    // si `@media` contara como selector, la puerta lo buscaría en la hoja y daría un rojo falso;
    // si su contenido NO contara, el bloque global de prefers-reduced-motion saldría de la custodia
    const css = '@media (prefers-reduced-motion: reduce) { *, *::before { animation-duration: 0.01ms !important; } }';
    expect(selectoresDeCss(css)).toEqual(['*,:before']);
    expect(selectoresDeCss('@font-face { font-family: X; src: url(/a.woff2) }')).toEqual([]);
  });

  it('contra los archivos REALES: los 16 selectores de base.css salen del archivo, no de una copia acá', () => {
    const sels = selectoresDeCss(BASE_REAL);
    expect(sels.length).toBe(16);
    expect(sels).toContain('body');
    expect(sels).toContain(':focus-visible');
    expect(sels).toContain('*,:before,:after');   // la forma que emite el build, no la que escribe la fuente
    expect(new Set(sels).size).toBe(sels.length);
  });

  it('los comentarios no cuentan y CRLF parsea igual (como los lectores hermanos)', () => {
    expect(selectoresDeCss('/* body { x: 1 } */\r\nmain ,\r\n aside {\r\n  y: 2;\r\n}')).toEqual(['main,aside']);
  });
});
