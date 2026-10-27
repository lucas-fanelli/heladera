/**
 * El interlineado del «cuándo» de una llave, fijado donde el próximo editor tiene que DISCUTIR con un test.
 *
 * D22 escribió `.meta { line-height: var(--lh-tight) }` en `src/ui/sheets/Accesos.module.css`, y ahí era
 * cierto: el meta mostraba `entro(haceCuanto(...))` = «Entró hace 2 h», una etiqueta corta. D26 le subió la
 * granularidad al dato para poder distinguir dos llaves de la misma persona, y con eso le cambió la FORMA:
 * `Accesos.tsx` pasó a `entro(cuandoDicho(...))` = «Entró el miércoles a las 20:14», prosa de 30 caracteres.
 * El token se quedó viejo en silencio porque el invariante «esto entra en un renglón» estaba AFIRMADO en el
 * CSS y GARANTIZADO en el TSX: dos archivos que tienen que coincidir y que nada ataba. Se movió uno solo.
 *
 * Medido en Chrome con las hojas reales y la DM Sans del proyecto, a 320 px de ancho y con la fila ya
 * envolviendo (el `.datos` se queda con los 288 px): a tamaño de texto normal entra en un renglón, pero
 * desde ~163 % de zoom de texto parte en dos, «Entró el miércoles a las / 20:14» — preposición huérfana y la
 * hora sola, justo el dato que decide CUÁL llave se borra. A 200 % son 2 renglones de 28,70 px sobre texto
 * de 24,96 px. `--lh-body` deja la caja en 17,47 px en vez de 14,35 px a tamaño normal, y no mueve el alto
 * de las filas de invitación (60 px: lo absorben el botón de 44 px y el padding).
 *
 * LÍMITE, dicho acá porque el test no lo puede decir solo: esto NO prueba el envolvimiento. En la suite no
 * hay layout (el proyecto `unit` corre en node, y `ui` en jsdom, que no calcula cajas). Fija la DECISIÓN, que
 * es lo que se perdía: que `--lh-tight` en este repo vale para lo que ocupa un renglón POR CONSTRUCCIÓN
 * —apareado con algo que lo garantice en la misma hoja, como el `white-space: nowrap` de
 * `Fila.module.css:98-107`— y no para prosa. Lo que sí queda custodiado es que nadie vuelva a bajarlo sin ver
 * este archivo. A propósito no hay barrido global exigiendo ese apareo en todos los `*.module.css`: hoy
 * fallaría en `.nombre` de este mismo sheet, en `.titulo`/`.sub` de Menu y en varios más, todos anteriores a
 * esta release — sería una puerta que grita en falso.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// la hoja REAL de disco: una copia congelada acá dejaría de custodiar la que de verdad pinta la pantalla
// apenas alguien la edite (mismo criterio que tests/unit/tokens-css.test.ts con tokens.css)
const HOJA = readFileSync(join(process.cwd(), 'src/ui/sheets/Accesos.module.css'), 'utf8');

/** El cuerpo de una regla, sin comentarios: el porqué de estas líneas los menciona, y un comentario no pinta. */
function declaracionesDe(css: string, selector: string): string | null {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = new RegExp(String.raw`(?:^|[};])\s*${selector.replace('.', '\\.')}\s*\{([^}]*)\}`);
  return re.exec(sinComentarios)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
}

describe('el «cuándo» de una llave usa el interlineado de la prosa, no el de una etiqueta', () => {
  it('encuentra la regla `.meta` — si la renombran, este test FALLA en vez de aprobar en vacío', () => {
    expect(declaracionesDe(HOJA, '.meta')).not.toBeNull();
  });

  it('`.meta` declara `--lh-body`: es la frase «Entró el miércoles a las 20:14», que envuelve', () => {
    expect(declaracionesDe(HOJA, '.meta')).toContain('line-height: var(--lh-body)');
  });

  it('`.meta` NO vuelve a `--lh-tight`: acá no hay nada que garantice el renglón', () => {
    // el `nowrap` que aparea Fila.module.css con su `--lh-tight` no existe en esta hoja, y el largo del texto
    // lo decide `cuandoDicho` en Accesos.tsx — o sea, otro archivo
    expect(declaracionesDe(HOJA, '.meta')).not.toContain('--lh-tight');
  });
});
