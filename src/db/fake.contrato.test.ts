/**
 * El Db falso pasa la suite de contrato de `Db` (la misma que corre contra Firestore en el emulador:
 * src/db/firestore.contrato.emu.test.ts). Si el fake se aleja del real, esto es lo que lo delata.
 */
import { describeContratoDb } from './contrato';
import { crearDbFake } from './fake';

/**
 * El fake confirma en el próximo tick: 1,5 s es margen de sobra y queda por debajo del testTimeout del proyecto
 * 'unit' (5 s), así una condición que no se cumple falla con el mensaje diagnóstico y no con "test timed out".
 */
const ESPERA_FAKE_MS = 1500;

describeContratoDb('fake', async () => ({ db: crearDbFake({ semilla: 'vacio', latencia: 0 }) }), { esperaMs: ESPERA_FAKE_MS });
