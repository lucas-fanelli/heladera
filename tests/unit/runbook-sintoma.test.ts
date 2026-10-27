/**
 * Los runbooks del deploy le cuentan al operador QUÉ VE LA FAMILIA cuando quedan reglas nuevas contra código
 * viejo. Esa frase se escribió de memoria («la familia ve "No tenés permiso"») y envejeció en silencio: tres
 * días después, D22 sacó las denegaciones de LECTURA del toast y las mandó a la pantalla entera
 * (src/app/useLista.ts → estadoVacio 'sinAcceso' → textos.vacio.sinAccesoTitulo). Quedó copiada a mano en
 * varios lugares, ninguno fuente de verdad, y nadie la vigilaba: el copy del producto vive en textos.ts, que
 * no tiene referencia inversa a quién lo cita. El costo cae en el peor minuto del circuito — con el deploy
 * partido al medio, «me pide una invitación» leído como bug de accesos en vez de como reglas.
 *
 * Por eso la aserción es POSITIVA y sale de la FUENTE DE VERDAD: si mañana cambia el copy de esa pantalla,
 * los runbooks se rompen acá y se actualizan, en vez de envejecer otra vez. La negativa (que no aparezca el
 * toast) no serviría: el texto del toast termina en punto y los runbooks lo citaban sin él, así que no
 * habría cazado el bug de hoy — aprobar en vacío es peor que no tener puerta.
 *
 * El mensaje nombra DOS mitades del mismo síntoma y las dos envejecen igual: la de LECTURAS (la pantalla
 * entera) la citan los dos runbooks y la ata el `it.each` de acá abajo; la de ESCRITURAS (el toast,
 * textos.errores.permiso) la cita textualmente solo scripts/deploy.mjs — SKILL.md dice «un toast», sin
 * frase — y la ata el segundo describe. Cerrar la mitad que ya falló y dejar la de al lado sería dejar el
 * mismo mecanismo intacto en la misma constante.
 *
 * readFileSync tira si el archivo se movió o se renombró: falla cerrado, no pasa en silencio.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textos } from '@/ui/textos';

const REPO = process.cwd();
/** Los dos textos de ops que citan la PANTALLA de una denegación de LECTURA. La mitad de escrituras no va
 *  acá: SKILL.md no cita el toast (dice «un toast», sin frase); se ata abajo, solo contra deploy.mjs. */
const RUNBOOKS = ['scripts/deploy.mjs', '.claude/skills/deploy/SKILL.md'];

describe('los runbooks nombran la pantalla real de una denegación de lectura', () => {
  it.each(RUNBOOKS)('%s cita el estado vacío vigente, no una frase congelada', (ruta) => {
    expect(readFileSync(join(REPO, ruta), 'utf8')).toContain(textos.vacio.sinAccesoTitulo);
  });
});

/** La mitad de ESCRITURAS del mismo mensaje. deploy.mjs es el único runbook que cita el toast textualmente
 *  (SKILL.md dice «un toast», sin frase: por eso no entra en RUNBOOKS). Se afirma sobre el CONTENIDO de
 *  SINTOMA_PERMISO y no sobre el archivo entero, porque el docstring de deploy.mjs:102 cita la frase VIEJA
 *  («No tenés permiso») y una aserción contra todo el archivo podría aprobarse contra esa historia en vez de
 *  contra el mensaje que lee el operador. La paráfrasis de textos.toasts.noSePudo no lleva aserción: tiene
 *  placeholder y comillas distintas, no es cita literal. */
describe('el mensaje del deploy nombra el toast real de una denegación de escritura', () => {
  const SINTOMA = readFileSync(join(REPO, 'scripts/deploy.mjs'), 'utf8')
    .match(/const SINTOMA_PERMISO = `([^`]+)`;/)?.[1];

  it('encuentra el síntoma en deploy.mjs', () => {
    expect(SINTOMA, 'no encontré SINTOMA_PERMISO en scripts/deploy.mjs').toBeTruthy();
  });

  it('cita el toast vigente de textos.ts, no una frase congelada', () => {
    expect(SINTOMA).toContain(textos.errores.permiso);
  });
});
