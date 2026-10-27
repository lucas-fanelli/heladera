/**
 * El reloj de la suite de contrato contra el emulador, custodiado.
 *
 * El invariante existía hace rato, escrito en prosa en tres archivos (src/db/contrato.ts, src/db/fake.contrato.test.ts
 * y el propio vite.config.ts) y sin un solo test que lo hiciera cumplir: la espera de la suite (`esperaMs`, que por
 * defecto es ESPERA_MS) tiene que entrar CON MARGEN abajo del testTimeout del proyecto. Con margen, no apenas: el
 * testTimeout es por `it` y los `it` de src/db/firestore.contrato.emu.test.ts encadenan varias esperas —el más largo,
 * (f), encadena seis—, así que si el techo del `it` fuera igual a UNA espera, la primera que se colgara moriría con
 * «test timed out in N ms» y el mensaje diagnóstico que contrato.ts promete (qué se esperaba, qué vista llegó, cuántas
 * hubo) no se vería NUNCA. De ahí el factor 3: techo para lo que ya corrió antes de la espera que se cuelga.
 *
 * El bug que lo trajo: ESPERA_MS estaba en 8 s con la justificación escrita de que «el emulador confirma en decenas de
 * ms», que el propio código ya había invalidado (la escalera de reintentos de `suscribir` ante permission-denied son
 * 3,5 s fijos, y dos tests de la suite se montan encima). Alcanzaba mientras esa suite se corría a mano y un rojo raro
 * se re-corría; dejó de alcanzar cuando scripts/verificar-release.mjs la ascendió a la puerta 4 obligatoria de TODOS
 * los deploys, encadenada después de unit+ui y en frío. El rojo falso no cuesta el minuto: su mensaje acusa al producto
 * («no llegó NINGUNA vista») y manda al operador a buscar un bug de Firestore inexistente el minuto antes de deployar.
 *
 * Cómo evita ser una copia del número: ESPERA_MS se importa de la fuente de verdad y el testTimeout se saca del
 * vite.config REAL, resuelto como lo resuelve vitest. Subir uno sin el otro pone esto en rojo, que es todo el punto.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ESPERA_MS } from '@/db/contrato';

/** Lo único que este test mira de la config resuelta; del resto de su forma no depende. */
interface ConfigResuelta { test?: { projects?: { test?: { name?: string; testTimeout?: number } }[] } }
type FabricaConfig = (env: { mode: string; command: 'serve' }) => ConfigResuelta | Promise<ConfigResuelta>;

/** El testTimeout es por `it` y un `it` encadena varias esperas: el techo tiene que dar para las que ya corrieron. */
const FACTOR = 3;

describe('el reloj de la suite de contrato contra el emulador', () => {
  let previo: string | undefined;
  // el proyecto 'emulador' SOLO existe en la config cuando está esta variable (así `vitest run` a secas no lo ve)
  beforeAll(() => { previo = process.env.FIRESTORE_EMULATOR_HOST; process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'; });
  afterAll(() => { if (previo === undefined) delete process.env.FIRESTORE_EMULATOR_HOST; else process.env.FIRESTORE_EMULATOR_HOST = previo; });

  it('el testTimeout del proyecto «emulador» le deja lugar a ESPERA_MS: el mensaje diagnóstico alcanza a salir', async () => {
    const { default: fabrica } = await import('../../vite.config') as { default: unknown };
    const config = await (fabrica as FabricaConfig)({ mode: 'test', command: 'serve' });
    const emu = (config.test?.projects ?? []).find(p => p.test?.name === 'emulador');

    // falla CERRADO: sin esta guarda, un `find` que no encuentra nada dejaría pasar la aserción de abajo en vacío
    expect(
      emu,
      'no encontré el proyecto «emulador» en la config resuelta de vite.config.ts (lo busco por test.name, con FIRESTORE_EMULATOR_HOST puesto): si la config cambió de forma, este test dejó de custodiar nada',
    ).toBeTruthy();
    expect(
      emu!.test?.testTimeout ?? 0,
      `el proyecto «emulador» tiene testTimeout=${emu!.test?.testTimeout} ms y la suite de contrato espera hasta ESPERA_MS=${ESPERA_MS} ms por condición (src/db/contrato.ts). Hacen falta al menos ${FACTOR} × ${ESPERA_MS} = ${FACTOR * ESPERA_MS} ms: el techo es por «it» y los «it» de src/db/firestore.contrato.emu.test.ts encadenan varias esperas (el más largo, seis), así que sin ese margen la espera que se cuelga muere con «test timed out» y el mensaje diagnóstico —qué se esperaba, qué vista llegó— no se ve nunca. Los dos números se mueven juntos: subí el testTimeout en vite.config.ts o bajá ESPERA_MS.`,
    ).toBeGreaterThanOrEqual(ESPERA_MS * FACTOR);

    // Timeout propio, por lo mismo que tests/unit/fases-deploy.test.ts: este test importa vite.config.ts, que
    // arrastra @vitejs/plugin-react + vite-plugin-pwa + vite-plugin-singlefile, y en frío en Windows eso son
    // decenas de segundos de I/O. Con el default de 5 s saldría ROJO por el disco y no por el release — la misma
    // enfermedad que vino a fijar: una puerta que grita en falso es una puerta que después se ignora.
  }, 120_000);
});
