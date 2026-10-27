/**
 * El único camino de vuelta que el circuito ofrece después de publicar es un rollback de hosting, y un
 * rollback restaura el manifiesto COMPLETO de esa versión: todo lo que esa release publicaba vuelve al aire.
 * Hasta este release, hosting publicaba los `.map` —el patrón que los tapa nace en ESTE `ignore`—, así que en el minuto
 * siguiente a publicar «la versión anterior» es exactamente la que sirve `sourcesContent` con el fuente entero
 * y los nombres adentro: el incidente que fundó este circuito (D24), y la regla dura que dice que el nombre de
 * nadie viaja en el producto.
 *
 * El hecho NO era desconocido para el circuito: `cortarFuga()` ya lo decía. Pero lo decía pegado a la rama
 * donde la fuga ya se había DETECTADO, y al rollback se llega por otras seis puertas (imprescindibles que
 * faltan, 404, DIFIERE, deep link muerto, Cache-Control, headers de seguridad — las dos últimas imprimen la
 * constante CRUDA, sin siquiera el envoltorio de propagación de CDN). Se había compartido el MECANISMO («cómo
 * se vuelve») y no el CRITERIO («qué te llevás al volver»). Este test ata las dos cosas al único lugar del que
 * salen todas las menciones: la constante `ROLLBACK` de scripts/deploy.mjs, y su espejo en el runbook.
 *
 * Las tres aserciones fallan CERRADO: si la constante se renombra o se mueve, el regex no la encuentra y el
 * primer `it` revienta en vez de dejar pasar los demás en vacío; si la sección del runbook cambia de título,
 * el recorte no la encuentra y también revienta.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = process.cwd();
const DEPLOY = readFileSync(join(REPO, 'scripts/deploy.mjs'), 'utf8');
const SKILL = readFileSync(join(REPO, '.claude/skills/deploy/SKILL.md'), 'utf8');

// el template literal de ROLLBACK lleva backticks ESCAPADOS adentro (el `npx firebase hosting:clone …` que se
// copia y pega), así que el `([^`]+)` que alcanza para SINTOMA_PERMISO cortaría el string en el primero: acá
// el cuerpo se lee par a par (cualquier cosa que no sea backtick ni barra, o una barra con lo que le siga)
const ROLLBACK = DEPLOY.match(/const ROLLBACK = `((?:[^`\\]|\\[\s\S])*)`;/)?.[1];

/**
 * El `ignore` REAL de firebase.json, que es lo que decide qué se le RETIENE al release — o sea, lo que un
 * rollback puede volver a publicar. Leído, no copiado: una copia congelada acá dejaría de custodiar lo que de
 * verdad rige.
 */
const IGNORE_REAL: string[] = JSON.parse(readFileSync(join(REPO, 'firebase.json'), 'utf8')).hosting.ignore;

/**
 * Las entradas que NO le sacan contenido al artefacto: la config misma, los ocultos y las dependencias — nada
 * que el build emita. Cualquier otra entrada esconde parte de lo que el build produjo, y eso es lo que la
 * versión anterior puede estar sirviendo. Si mañana aparece otra entrada estructural que no está acá, el test
 * pide la cláusula de más y no de menos: la dirección segura.
 */
const ESTRUCTURALES = new Set(['firebase.json', '**/.*', '**/node_modules/**']);
const RETIENE_CONTENIDO = IGNORE_REAL.filter((p) => !ESTRUCTURALES.has(p));

/** La forma COPIABLE del camino de vuelta: lo que el operador asustado pega en la terminal o busca en la
 *  consola. (El docstring de deploy.mjs nombra «hosting:clone» al listar el registro de firebase-tools; eso es
 *  historia del bug anterior, no un camino impreso, y por eso el candado mira la forma `npx firebase …`.) */
const MARCAS_DEL_CAMINO = ['npx firebase hosting:clone', 'historial de versiones'];

describe('la vuelta atrás del runbook dice qué se lleva puesto el que la toma', () => {
  it('encuentra la constante ROLLBACK en scripts/deploy.mjs', () => {
    expect(ROLLBACK, 'no encontré `const ROLLBACK = `…`;` en scripts/deploy.mjs').toBeTruthy();
  });

  it('el ignore de firebase.json se leyó de verdad (si no, todo lo de abajo se relajaría en vacío)', () => {
    expect(Array.isArray(IGNORE_REAL) && IGNORE_REAL.length > 0).toBe(true);
  });

  it('mientras el ignore le retenga contenido al release, ROLLBACK nombra el manifiesto completo y sourcesContent', () => {
    if (RETIENE_CONTENIDO.length === 0) return;   // el día que el ignore quede solo con lo estructural, se relaja solo
    const porque = `el ignore de firebase.json retiene ${RETIENE_CONTENIDO.join(', ')}: la versión anterior de hosting los publicaba, y un rollback restaura el manifiesto entero. ROLLBACK (scripts/deploy.mjs) tiene que decirlo, o manda al operador a resucitar el fuente con los nombres adentro (D24)`;
    expect(ROLLBACK, porque).toContain('sourcesContent');
    expect(ROLLBACK, porque).toContain('COMPLETO');
  });

  it.each(MARCAS_DEL_CAMINO)('«%s» solo se escribe dentro de ROLLBACK, que es lo que lleva la advertencia', (marca) => {
    const contar = (texto: string): number => texto.split(marca).length - 1;
    const enElArchivo = contar(DEPLOY);
    // cantidad exigida en las dos direcciones: si la marca dejara de aparecer, esto aprobaría en vacío
    expect(enElArchivo, `«${marca}» no aparece en scripts/deploy.mjs: ¿cambió el camino de vuelta?`).toBeGreaterThanOrEqual(1);
    expect(
      contar(ROLLBACK ?? ''),
      `«${marca}» se escribe ${enElArchivo} vez/veces en scripts/deploy.mjs y no todas caen dentro de ROLLBACK: el camino de vuelta escrito fuera de esa constante viaja SIN la advertencia de qué republica la versión anterior (que es exactamente cómo entró este bug)`,
    ).toBe(enElArchivo);
  });

  it('el runbook de la skill dice lo mismo en la sección donde se llega al rollback', () => {
    // el recorte es imprescindible: SKILL.md ya dice «sourcesContent» en la sección del candado del espejo,
    // que es justamente la que NO tenía el bug — un toContain sobre el archivo entero aprobaría en vacío
    const desde = SKILL.indexOf('**Si falla DESPUÉS de publicar**');
    expect(desde, 'no encontré la sección «Si falla DESPUÉS de publicar» en SKILL.md').toBeGreaterThanOrEqual(0);
    const hasta = SKILL.indexOf('**Si ', desde + 1);
    expect(hasta, 'no encontré dónde termina esa sección (el siguiente «**Si »)').toBeGreaterThan(desde);
    const seccion = SKILL.slice(desde, hasta);

    expect(seccion).toContain('npx firebase hosting:clone');   // el recorte agarró la sección del rollback
    if (RETIENE_CONTENIDO.length > 0) expect(seccion).toContain('sourcesContent');
  });
});
