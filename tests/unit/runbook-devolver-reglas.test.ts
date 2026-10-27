/**
 * EL BUG QUE FIJA ESTE TEST: el runbook de vuelta atrás mandaba a pisar `firestore.rules` con la versión que
 * producción tenía —para parar el sangrado de una release que endureció reglas— y, dos renglones después, a
 * converger re-corriendo `npm run deploy -- --dale`. Nunca decía que hay que DEVOLVER el archivo. Y el deploy
 * de esta casa corre sobre el WORKING TREE (`firebase.json` apunta `firestore.rules` al archivo del repo; el
 * paso 1 buildea de ahí y el paso 4 publica de ahí), así que obedecer al pie de la letra publicaba código
 * NUEVO contra reglas VIEJAS: el incidente «mercados» (decisiones.md) al revés, esta vez sin ninguna línea de
 * pantalla que lo anuncie. Ninguna puerta lo vigila —`verificar-release.mjs` no compara `firestore.rules`
 * contra nada—: la única red parcial es la suite del emulador, y solo si esa regla estaba cubierta.
 *
 * El arreglo es UNA constante (`DEVOLVER_REGLAS`) citada por los mensajes que mandan a restaurar, más la
 * misma frase en el runbook de la skill. Lo que este test custodia es la INVARIANTE, no la lista de lugares
 * (enumerarlos acá los envejecería igual que envejeció el runbook): todo mensaje que manda a restaurar tiene
 * que mandar a devolver. Por eso las cuentas se comparan CONTRA la marca del «andá a buscar la vieja», que es
 * la que crece cuando alguien agrega un tercer lugar.
 *
 * Todas las aserciones fallan CERRADO: si la constante se renombra o si una marca cambia de forma, el test
 * revienta en vez de aprobar en vacío con 0 ≥ 0.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = process.cwd();
const DEPLOY = readFileSync(join(REPO, 'scripts/deploy.mjs'), 'utf8');
const SKILL = readFileSync(join(REPO, '.claude/skills/deploy/SKILL.md'), 'utf8');

const contar = (texto: string, marca: string): number => texto.split(marca).length - 1;

/** El cuerpo de la constante. Es un string de comillas SIMPLES justamente porque lleva backticks adentro (los
 *  comandos que el operador copia y pega), así que el recorte corre hasta la próxima comilla simple: si
 *  mañana alguien mete una apóstrofe adentro, lo que se recorte no va a tener las marcas que se exigen abajo
 *  y el test frena — que es la dirección segura. */
const DEVOLVER = DEPLOY.match(/const DEVOLVER_REGLAS = '([^']*)';/)?.[1];

/** La marca del paso que CREA el problema (mandar a buscar la versión vieja del archivo) y la del paso que lo
 *  cierra (devolverlo). Se cuentan una contra otra: es la forma derivada de decir «todo el que manda a
 *  restaurar manda a devolver» sin enumerar dónde. */
const IR_A_BUSCAR = 'git log --oneline -- firestore.rules';
const DEVOLVER_CMD = 'git checkout HEAD -- firestore.rules';

describe('el runbook que manda a restaurar firestore.rules manda también a devolverlo', () => {
  it('encuentra la constante DEVOLVER_REGLAS en scripts/deploy.mjs', () => {
    expect(DEVOLVER, 'no encontré la constante DEVOLVER_REGLAS en scripts/deploy.mjs').toBeTruthy();
  });

  it('la constante dice POR QUÉ (el deploy publica el working tree) y CON QUÉ COMANDO se devuelve', () => {
    // el comando importa tanto como el aviso: `git checkout <sha> -- x` deja el viejo también en el ÍNDICE,
    // así que un `git checkout -- x` restauraría DEL índice y el operador creería que deshizo (verificado a
    // mano en un repo de prueba). Imprimir esa forma sería imprimir un comando que no hace nada.
    expect(DEVOLVER ?? '', 'DEVOLVER_REGLAS no explica que el deploy publica lo que hay en el working tree').toContain('working tree');
    expect(DEVOLVER ?? '', `DEVOLVER_REGLAS no imprime «${DEVOLVER_CMD}», que es la forma que SÍ devuelve el archivo`).toContain(DEVOLVER_CMD);
  });

  it('todo mensaje de deploy.mjs que interpola REGLAS_DE_PROD interpola también DEVOLVER_REGLAS', () => {
    const restaurar = contar(DEPLOY, '${REGLAS_DE_PROD}');
    const devolver = contar(DEPLOY, '${DEVOLVER_REGLAS}');
    // cantidad exigida en las dos direcciones: si las marcas dejaran de aparecer, esto aprobaría en vacío
    expect(restaurar, 'no encontré los usos de REGLAS_DE_PROD en scripts/deploy.mjs: ¿cambió el criterio de restaurar?')
      .toBeGreaterThanOrEqual(2);
    expect(devolver, 'no encontré los usos de DEVOLVER_REGLAS en scripts/deploy.mjs').toBeGreaterThanOrEqual(2);
    expect(
      devolver,
      `${restaurar} mensaje(s) mandan a restaurar firestore.rules y solo ${devolver} manda(n) a devolverlo: el que quedó sin el aviso deja al operador con las reglas VIEJAS en el working tree y lo manda a re-deployar desde ahí — código nuevo contra reglas viejas, con las seis puertas en verde`,
    ).toBeGreaterThanOrEqual(restaurar);
  });

  it('el runbook de la skill dice lo mismo en los dos lugares donde restaura', () => {
    const irABuscar = contar(SKILL, IR_A_BUSCAR);
    const devolver = contar(SKILL, DEVOLVER_CMD);
    expect(irABuscar, `no encontré «${IR_A_BUSCAR}» en SKILL.md: ¿cambió cómo se ubica la versión vieja? (sin esa marca, lo de abajo aprobaría en vacío)`)
      .toBeGreaterThanOrEqual(2);
    expect(
      devolver,
      `SKILL.md manda ${irABuscar} vez/veces a buscar el firestore.rules viejo y solo ${devolver} a devolverlo con «${DEVOLVER_CMD}»: el camino que quedó sin el aviso vuelve al paso 1 con las reglas viejas en el working tree, y el paso 4 las publica contra el código nuevo`,
    ).toBeGreaterThanOrEqual(irABuscar);
  });
});
