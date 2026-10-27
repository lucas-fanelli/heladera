/**
 * Hasta esta release el deploy documentado era `npx firebase deploy --only hosting,firestore:rules`, y con
 * ese `--only` firebase-tools NUNCA publicaba `firestore.indexes.json` (`lib/deploy/firestore/prepare.js`:
 * `firestore:rules` ⇒ `excludeIndexes` ⇒ `firestoreIndexes = false`). `scripts/deploy.mjs` pasó a correr
 * `--only firestore,hosting` (`onlyFirestore` ⇒ `firestoreIndexes = true`): desde ahora este archivo es lo
 * que PRODUCE el índice en producción, en cada deploy. La promoción vino sin custodia — el cambio se razonó
 * entero en el vocabulario de «reglas» y los índices entraron de polizón.
 *
 * Y las dos mitades del circuito son estructuralmente ciegas a este archivo: el emulador no lo recibe nunca
 * (`lib/emulator/firestoreEmulator.js` solo le pasa las reglas), así que el contrato que ejercita
 * `misListas()` prueba la SEMÁNTICA de la query y aprueba igual con el archivo vaciado; y las auditorías del
 * release miran el artefacto de hosting. Con `fieldOverrides: []` —un merge, una limpieza de ruido, un
 * proyecto nuevo donde el override nunca se aplicó— `npm run deploy -- --dale` sale entero verde y en
 * producción quien restauró su cuenta ve cero listas.
 *
 * Por eso los dos lados se DERIVAN, y ninguno es una lista a mano: la ruta del archivo sale de
 * `firebase.json` (si esa clave desaparece, `prepare.js` deja de publicar índices EN SILENCIO, así que esta
 * puerta custodia también el cableado) y las queries salen de `src/db/firestore.ts`. La aserción de cantidad
 * es lo que hace que falle CERRADO: si mañana alguien reordena la query o suma una segunda, el regex deja de
 * emparejar y la puerta se cae en vez de aprobar en vacío.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const leer = (ruta: string): string => readFileSync(join(ROOT, ruta), 'utf8');

type IndiceDeCampo = { queryScope?: string; order?: string; arrayConfig?: string };
type FieldOverride = { collectionGroup?: string; fieldPath?: string; indexes?: IndiceDeCampo[] };

/** La ruta NO se hardcodea: es el cableado de firebase.json el que decide si los índices se publican. */
const RUTA_INDICES = (JSON.parse(leer('firebase.json')) as { firestore?: { indexes?: string } }).firestore?.indexes;

/** Las queries que NECESITAN un fieldOverride de collection group, con el campo del MISMO `query(...)`. */
const FUENTE = leer('src/db/firestore.ts');
const PAREJAS = [...FUENTE.matchAll(/collectionGroup\(\s*\w+\s*,\s*'([^']+)'\s*\)\s*,\s*where\(\s*'([^']+)'/g)]
  .map((m) => ({ grupo: m[1], campo: m[2] }));
const CUANTOS = (FUENTE.match(/collectionGroup\(/g) ?? []).length;

/** Lo que dice la verdad completa cuando esto se pone en rojo. */
const PORQUE = `sin este fieldOverride, misListas() (src/db/firestore.ts) tira failed-precondition en producción: quien entra con su cuenta en otro teléfono ve CERO listas. Y no lo caza nadie más: el emulador nunca recibe este archivo (firebase-tools solo le pasa las reglas) y las auditorías del release miran hosting, así que npm run deploy -- --dale sale entero verde.`;

describe('el archivo de índices cubre las queries de collection group que publica el deploy', () => {
  it('firebase.json sigue apuntando a un archivo de índices', () => {
    expect(
      typeof RUTA_INDICES,
      'firebase.json perdió firestore.indexes: sin esa clave el deploy deja de publicar índices EN SILENCIO (prepare.js: `if (firestoreConfig.indexes)`)',
    ).toBe('string');
  });

  it('hay queries de collection group y todas quedaron reconocidas', () => {
    expect(CUANTOS, 'no encontré ninguna collectionGroup() en src/db/firestore.ts').toBeGreaterThan(0);
    expect(
      PAREJAS.length,
      'hay collectionGroup() que este test no supo emparejar con su where(): el regex quedó viejo (¿se reordenó la query?). Arreglalo — si no, la puerta aprueba en vacío',
    ).toBe(CUANTOS);
  });

  it.each(PAREJAS)('$grupo.$campo tiene su fieldOverride con queryScope COLLECTION_GROUP', ({ grupo, campo }) => {
    const spec = JSON.parse(leer(RUTA_INDICES as string)) as { fieldOverrides?: FieldOverride[] };
    const override = (spec.fieldOverrides ?? []).find((f) => f.collectionGroup === grupo && f.fieldPath === campo);
    expect(override, `falta el fieldOverride de ${grupo}.${campo} en ${RUTA_INDICES}: ${PORQUE}`).toBeDefined();
    // `order` y no `arrayConfig` a propósito: un índice de array no sirve a un filtro de igualdad sobre un
    // escalar. La entrada COLLECTION no se exige: hoy está, pero ninguna query la usa.
    expect(
      (override?.indexes ?? []).some((i) => i.queryScope === 'COLLECTION_GROUP' && typeof i.order === 'string'),
      `el fieldOverride de ${grupo}.${campo} no declara un índice ordenado con queryScope COLLECTION_GROUP: ${PORQUE}`,
    ).toBe(true);
  });
});
