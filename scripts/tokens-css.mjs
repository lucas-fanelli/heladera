/**
 * El lector de los --paper de un CSS, exportado y con tests (tests/unit/tokens-css.test.ts), como los
 * criterios hermanos de dist-publicado.mjs. Lee las DOS puntas con el mismo criterio: la FUENTE
 * (src/styles/tokens.css, la fuente de verdad visual) y el ARTEFACTO (la hoja publicada del dist, que es la
 * que de verdad pinta la pantalla) — por eso el valor del atributo `data-theme` puede venir con comillas o
 * sin ellas: el minificador del build las saca. Un solo lector de --paper, no dos criterios distintos.
 *
 * Está en su propio módulo porque la versión anterior vivía inline en verificar-release.mjs como una regex
 * plana que le asignaba el esquema (claro/oscuro) a cada match por ORDEN DE APARICIÓN — un invariante sobre
 * la estructura de tokens.css que nada declara ni protege. Un valor viejo en un comentario (plausible con el
 * workflow «paleta.html → Copiar tokens») o un bloque :root[data-theme="light"] futuro reventaban la puerta
 * con un diagnóstico FALSO («--paper oscuros que no coinciden» con el archivo perfectamente consistente).
 * Acá el esquema se lee de donde lo lee el NAVEGADOR, con tres reglas explícitas:
 *   · manda el bloque MÁS INTERNO que declare esquema (media prefers-color-scheme / atributo data-theme),
 *     como resuelve la cascada — no «alguno de la pila»: un override claro anidado adentro de la media
 *     oscura es CLARO;
 *   · `:not(...)` es un guard, no una declaración: `:root:not([data-theme="light"])` no declara claro
 *     (es el propio patrón de tokens.css), y `:root:not([data-theme="dark"])` no declara oscuro;
 *   · un `:root` pelado AL TOPE es el default del documento = el claro, mientras la media OSCURA sea la
 *     que lo pisa (la forma que tokens.css tiene hoy).
 * Todo lo demás TIRA nombrando el bloque, en vez de clasificarse mal en silencio (la deriva muda es la peor
 * dirección) — y lo mismo con el VALOR: un `--paper` que no sea `#RRGGBB` tira nombrando valor y bloque,
 * porque descartarlo en silencio deja el grupo sostenido por el valor viejo del OTRO bloque, que es
 * exactamente la deriva token↔barra que la puerta existe para frenar.
 * Ahí caen, a propósito, un archivo dark-first (`@media (prefers-color-scheme: light)`, que
 * obligaría a inferir la polaridad del archivo entero) y un `:not()` anidado como `:not(:where(…))`, que la
 * regex de negaciones no sabe leer: se enseñan acá CON test el día que tokens.css los use.
 */

// La negación es un guard: no declara el esquema que nombra, así que se saca ANTES de preguntar por el texto
// del selector. Límite conocido y aceptado: un `:not()` anidado le gana a `[^)]*` y deja un resto que no
// coincide con nada — cae al throw, que es la dirección segura.
const sinNegaciones = (s) => s.replace(/:not\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

// El valor del atributo puede venir con comillas dobles, simples o SIN comillas: el minificador del build las
// saca (`:root[data-theme=dark]`, `:root:not([data-theme=light])`), y este lector ahora también lee el CSS
// PUBLICADO además de la fuente. Verificado contra el dist/assets/index-*.css real, no asumido: con el
// substring de comillas dobles, ese archivo hacía TIRAR al lector («un bloque que el clasificador no
// reconoce: :root[data-theme=dark]»).
const declaraTema = (s, tema) => new RegExp(String.raw`\[\s*data-theme\s*=\s*(?:"${tema}"|'${tema}'|${tema})\s*\]`).test(s);

// El esquema que declara UN bloque, o null si no declara ninguno (`:root` pelado, una media ajena, un @supports).
const esquemaDelBloque = (s) => {
  const positivo = sinNegaciones(s);
  if (/prefers-color-scheme:\s*dark/.test(positivo) || declaraTema(positivo, 'dark')) return 'oscuro';
  if (declaraTema(positivo, 'light')) return 'claro';
  return null;
};

// Detectar y VALIDAR son dos preguntas distintas: si las contesta la misma regex, un valor que no sabe leer
// es indistinguible de «acá no hay --paper» y el único camino es el `return` que lo borra del grupo — con el
// grupo sostenido por el valor VIEJO del otro bloque y la puerta firmando la deriva token↔barra que existe
// para frenar. El `$` toma el valor ENTERO (el segmento ya viene cortado por `;`/`{`/`}`), así un `#FFF`, un
// `rgb(...)` o un `#RRGGBBAA` llegan al throw en vez de desaparecer o truncarse por prefijo.
const RE_PAPER = /--paper\s*:\s*([^;{}]*?)\s*$/;
const RE_HEX6 = /^#[0-9A-Fa-f]{6}$/;

/**
 * Los --paper de `css` clasificados por su bloque: { claros, oscuros }, cada grupo un array de
 * { valor, donde } con el hex en MAYÚSCULAS y la pila de selectores donde apareció — para que un fallo
 * pueda decir DÓNDE está cada match, no solo que difieren. Los comentarios se descartan ANTES de mirar
 * nada, y CRLF parsea igual que LF (tokens.css es CRLF).
 */
export function papelesDeTokens(css) {
  const texto = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const claros = [];
  const oscuros = [];
  const pila = [];   // selectores / at-rules de los bloques abiertos, de afuera hacia adentro
  const clasificar = (decl) => {
    const m = RE_PAPER.exec(decl);
    if (!m) return;
    const crudo = m[1];
    const donde = pila.join(' > ') || '(fuera de todo bloque)';
    // fallar cerrado también en el eje VALOR: descartarlo dejaría el grupo sostenido por el valor viejo del
    // otro bloque, y el `every` de la puerta pasaría trivialmente sobre un grupo mutilado
    if (!RE_HEX6.test(crudo)) throw new Error(`--paper declarado con un valor que el lector no sabe leer: «${crudo}» en «${donde}» — el lector solo entiende #RRGGBB, y el manifest y los dos <meta theme-color> se comparan contra ESTE valor; agregá la notación a scripts/tokens-css.mjs CON test antes de usarla`);
    const valor = crudo.toUpperCase();
    // El esquema lo decide el bloque MÁS INTERNO que lo declare — lo que resuelve el navegador — y la
    // negación no declara nada: `:not([data-theme="light"])` adentro de la media oscura sigue siendo oscuro,
    // y un `[data-theme="light"]` anidado ahí adentro es claro.
    let esquema = null;
    for (let i = pila.length - 1; i >= 0 && esquema === null; i--) esquema = esquemaDelBloque(pila[i]);
    // nadie declaró: solo un `:root` incondicional AL TOPE es el default (= el claro, mientras la media
    // OSCURA sea la que lo pisa); cualquier otra cosa cae al throw
    if (esquema === null && pila.length === 1 && sinNegaciones(pila[0]) === ':root') esquema = 'claro';
    if (esquema === 'oscuro') {
      oscuros.push({ valor, donde });
    } else if (esquema === 'claro') {
      claros.push({ valor, donde });
    } else {
      // fallar cerrado, no adivinar: un contexto nuevo se enseña acá CON test antes de declarar --paper ahí
      throw new Error(`--paper declarado en un bloque que el clasificador no reconoce: «${donde}» — agregá el caso a scripts/tokens-css.mjs CON test antes de usarlo`);
    }
  };
  let corte = 0;   // arranque del tramo pendiente (un selector o una declaración a medio leer)
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') {
      pila.push(texto.slice(corte, i).replace(/\s+/g, ' ').trim());
      corte = i + 1;
    } else if (c === ';' || c === '}') {
      clasificar(texto.slice(corte, i));
      if (c === '}') pila.pop();
      corte = i + 1;
    }
  }
  clasificar(texto.slice(corte));   // la última declaración puede venir sin `;` antes del fin del texto
  return { claros, oscuros };
}

/**
 * Las declaraciones `color-scheme` de `css` (la mitad CSS del contrato cromático con el sistema operativo),
 * normalizadas a minúsculas y espacio simple. Vive acá y no en la puerta por lo mismo que los --paper: el
 * valor `light dark` está escrito a mano en DOS lugares (src/styles/tokens.css y el <meta> del index.html), y
 * una tercera copia congelada adentro del script que existe para frenar la deriva la dejaría pasar.
 *
 * Sin clasificar por bloque a propósito: acá no se infiere esquema de nada, solo se pregunta PRESENCIA y
 * UNICIDAD — la puerta exige exactamente 1 y cualquier forma nueva la FRENA para que se decida (qué bloque
 * gana cuando hay dos es una precedencia que este circuito no verificó). El `prefers-color-scheme` de una
 * @media no matchea: el segmento tiene que arrancar en `^`/`;`/`{`/`}`, y ahí lo precede `prefers-`.
 */
export function esquemasDeTokens(css) {
  const texto = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...texto.matchAll(/(?:^|[;{}])\s*color-scheme\s*:\s*([^;{}]+)/g)]
    .map(m => m[1].replace(/\s+/g, ' ').trim().toLowerCase());
}

/**
 * Las custom properties que `css` DECLARA (no las que usa), deduplicadas y en orden de aparición.
 *
 * Declarar y USAR son dos preguntas distintas y acá se pregunta la primera: el segmento tiene que arrancar en
 * `^`/`;`/`{`/`}`, así que un `var(--paper)` adentro de un valor —o de un `color-mix(in srgb, var(--line) …)`—
 * no cuenta. Si contara los usos, el stub de 128 bytes con el que se reprodujo el bug (`:root{--paper:…}` y
 * nada más) pasaría igual: el CSS que USA los tokens es justamente el que no llegó.
 *
 * Existe para que la puerta pueda preguntar «¿la hoja publicada trae los tokens de tokens.css?» DERIVANDO la
 * lista de la fuente de verdad, en vez de enumerar cuatro nombres adentro del script — una lista que
 * envejecería con cada retoque de la paleta, en el archivo cuyo encabezado promete lo contrario.
 */
export function propiedadesDeCss(css) {
  const texto = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...new Set([...texto.matchAll(/(?:^|[;{}])\s*(--[A-Za-z0-9_-]+)\s*:/g)].map(m => m[1]))];
}

/**
 * Los selectores que `css` declara (los de las at-rules quedan afuera; los bloques que ANIDAN, como el
 * `@media`, aportan los de adentro), normalizados a la forma que emite el minificador del build para que la
 * FUENTE y el ARTEFACTO se puedan comparar — el mismo criterio leyendo las dos puntas, como papelesDeTokens.
 *
 * La normalización está VERIFICADA contra el dist real (dist/assets/index-*.css), no asumida:
 *   · se colapsa el whitespace y el que rodea a `, > + ~`  (`ul, ol` → `ul,ol`);
 *   · `::` → `:`                                            (`dialog::backdrop` → `dialog:backdrop`);
 *   · se saca el `*` pegado ANTES de un pseudo              (`*::before` → `:before`).
 * El último paso es el que se descubrió midiendo y no razonando: el build emite `*,:before,:after` donde
 * base.css escribe `*, *::before, *::after`. Sin él eran 15 de 16 selectores y la puerta daba un ROJO FALSO
 * sobre un release sano; con él, 16 de 16. Una forma nueva del minificador se ve igual (falta un selector que
 * SÍ está) y se enseña acá CON test, que es la dirección segura: nunca clasifica de más.
 */
export function selectoresDeCss(css) {
  const texto = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const normalizar = (s) => s
    .replace(/\s+/g, ' ').trim()
    .replace(/\s*([,>+~])\s*/g, '$1')
    .replace(/::/g, ':')
    .replace(/\*(?=:)/g, '');
  const out = [];
  let corte = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') {
      const sel = texto.slice(corte, i).replace(/\s+/g, ' ').trim();
      if (sel && !sel.startsWith('@')) out.push(normalizar(sel));   // `@media`/`@font-face` no son selectores
      corte = i + 1;
    } else if (c === ';' || c === '}') {
      corte = i + 1;
    }
  }
  return [...new Set(out)];
}
