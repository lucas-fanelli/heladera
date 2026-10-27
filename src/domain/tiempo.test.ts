import { describe, expect, it } from 'vitest';
import { cuandoDicho, fechaCorta, fechaYHora, haceCuanto, horaCorta } from './tiempo';

const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000;
// "ahora" fijo: miércoles 12/8/2026 15:00 local (hora local para que getDay/getDate no dependan del TZ del runner)
const AHORA = new Date(2026, 7, 12, 15, 0, 0).getTime();
const enLocal = (d: number, h: number, m = 0) => new Date(2026, 7, d, h, m, 0).getTime();

describe('haceCuanto', () => {
  it.each<[string, number | null, string]>([
    ['null → recién', null, 'recién'],
    ['0 s', AHORA, 'recién'],
    ['44 s', AHORA - 44_000, 'recién'],
    ['45 s → hace 1 min', AHORA - 45_000, 'hace 1 min'],
    ['1 min', AHORA - 1 * MIN, 'hace 1 min'],
    ['40 min', AHORA - 40 * MIN, 'hace 40 min'],
    ['59 min', AHORA - 59 * MIN, 'hace 59 min'],
    ['1 h', AHORA - 1 * HORA, 'hace 1 h'],
    ['3 h', AHORA - 3 * HORA, 'hace 3 h'],
    ['3 h 20', AHORA - 3 * HORA - 20 * MIN, 'hace 3 h'],
    ['ayer a las 10', enLocal(11, 10), 'ayer'],
    ['ayer a las 20 (menos de 24 h) → sigue en horas', enLocal(11, 20), 'hace 19 h'],
    ['hace 3 días (domingo)', enLocal(9, 12), 'dom'],
    ['hace 6 días (jueves)', enLocal(6, 10), 'jue'],
    ['7 días de calendario (mismo día de semana), hora más tarde → fecha corta', enLocal(5, 20, 0), '5/8'],
    ['hace 8 días → fecha corta', enLocal(4, 10), '4/8'],
    ['hace un mes', new Date(2026, 6, 1, 10).getTime(), '1/7'],
    ['futuro → recién', AHORA + 5 * MIN, 'recién'],
    ['futuro lejano → recién', AHORA + 3 * DIA, 'recién'],
  ])('%s', (_n, ts, esperado) => {
    expect(haceCuanto(ts, AHORA)).toBe(esperado);
  });
});

describe('horaCorta', () => {
  it.each<[number | null, string]>([
    [enLocal(12, 8, 5), '08:05'],
    [enLocal(12, 18, 32), '18:32'],
    [enLocal(12, 0, 0), '00:00'],
    [null, '…'],
  ])('%s → %j', (ts, esperado) => {
    expect(horaCorta(ts)).toBe(esperado);
  });
});

describe('fechaCorta', () => {
  it('día/mes sin ceros', () => {
    expect(fechaCorta(enLocal(6, 10))).toBe('6/8');
    expect(fechaCorta(new Date(2026, 11, 25, 10).getTime())).toBe('25/12');
  });
});

describe('fechaYHora', () => {
  it.each<[string, number | null, string]>([
    ['null → recién', null, 'recién'],
    ['mismo día → hora', enLocal(12, 8, 5), '08:05'],
    ['mismo día, más tarde en el reloj → hora igual', enLocal(12, 14, 59), '14:59'],
    ['ayer → ayer HH:MM', enLocal(11, 18, 32), 'ayer 18:32'],
    ['lunes de esta semana → lun HH:MM', enLocal(10, 18, 32), 'lun 18:32'],
    ['hace 6 días → jue HH:MM', enLocal(6, 9, 15), 'jue 09:15'],
    ['7 días de calendario, hora más tarde → fecha HH:MM', enLocal(5, 20, 0), '5/8 20:00'],
    ['hace 8 días → fecha HH:MM', enLocal(4, 9, 15), '4/8 09:15'],
  ])('%s', (_n, ts, esperado) => {
    expect(fechaYHora(ts, AHORA)).toBe(esperado);
  });
});

// El hermano en prosa (D26): los MISMOS tramos y el mismo instante, dichos para que entren ADENTRO de una
// oración («Entró ___», «La llave que entró ___ deja de ver la lista…») y de un nombre accesible, que solo se
// ESCUCHA. La etiqueta de `fechaYHora` se apoya en el «·» de `meta.comprado` para no necesitar la preposición;
// sin ese «·» daba «Entró mié 20:14», que no es castellano, y le hacía leer al rotor una abreviatura y una
// fracción. Se lee cada fila en voz alta: eso es lo que hay que verificar acá, no que el dato viaje.
describe('cuandoDicho', () => {
  it.each<[string, number, string]>([
    ['mismo día → hoy a las HH:MM', enLocal(12, 8, 5), 'hoy a las 08:05'],
    ['ayer → ayer a las HH:MM', enLocal(11, 9, 15), 'ayer a las 09:15'],
    ['lunes de esta semana → el lunes a las HH:MM', enLocal(10, 18, 32), 'el lunes a las 18:32'],
    ['hace 6 días → el jueves a las HH:MM', enLocal(6, 9, 15), 'el jueves a las 09:15'],
    ['7 días de calendario, hora más tarde → el D de MES a las HH:MM', enLocal(5, 20, 0), 'el 5 de agosto a las 20:00'],
    // el mes se dice con todas las letras: la fecha corta («el 4/8») en un nombre accesible se escucha «el
    // cuatro octavos». El mes largo lo da `Intl` en es-AR, así que no cuesta ninguna tabla escrita a mano.
    ['hace 8 días → el D de MES a las HH:MM', enLocal(4, 9, 15), 'el 4 de agosto a las 09:15'],
    ['hace más de un mes → el mes que sea', new Date(2026, 6, 1, 9, 15).getTime(), 'el 1 de julio a las 09:15'],
  ])('%s', (_n, ts, esperado) => {
    expect(cuandoDicho(ts, AHORA)).toBe(esperado);
  });

  // El barrido cubre SOLO la mitad «fracción» de lo que este formateador vino a arreglar, y día por día porque
  // el tramo 'fecha' —lo de más de 7 días— es el estado de RÉGIMEN de una lista que lleva un mes andando, no un
  // borde: ahí van a estar casi todas las llaves. La otra mitad —«abreviatura»— la fijan las filas exactas de
  // 'semana' («el lunes», «el jueves») de la tabla de arriba; este loop no la mira, no cubre lo que no mira.
  it('ningún tramo dice una fracción: 40 días para atrás, día por día', () => {
    for (let d = 0; d <= 40; d++) {
      const ts = new Date(2026, 7, 12 - d, 9, 15).getTime();
      expect(cuandoDicho(ts, AHORA), `hace ${d} días`).not.toMatch(/\d+\/\d+/);
    }
  });
});

// El segundo trabajo (D26): es lo único que separa dos llaves con el mismo nombre, y viaja adentro de una
// pregunta destructiva. Dos entradas distintas al minuto no pueden decir lo mismo — ni sacándole el día a
// un tramo ni sacándole la hora. Un par por tramo, al lado de las tablas de formato: si se agrega un tramo,
// se agrega su par acá abajo. Va sobre los DOS formateadores porque los dos heredan el mismo `tramoDe`: si
// el invariante viviera pegado a uno solo, se podría perder editando el otro.
describe.each<[string, (ts: number, ahora: number) => string]>([
  ['fechaYHora', fechaYHora],
  ['cuandoDicho', cuandoDicho],
])('%s desempata al minuto', (_f, formatear) => {
  it.each<[string, number, number]>([
    ['mismo día, distinta hora', enLocal(12, 8, 5), enLocal(12, 14, 59)],
    ['ayer, distinta hora', enLocal(11, 9, 15), enLocal(11, 18, 32)],
    ['misma semana, distinto día, misma hora', enLocal(10, 18, 32), enLocal(9, 18, 32)],
    ['más de 7 días, distinto día, misma hora', enLocal(4, 18, 32), enLocal(3, 18, 32)],
  ])('%s', (_n, a, b) => {
    expect(formatear(a, AHORA)).not.toBe(formatear(b, AHORA));
  });
});

// El BORDE de ese desempate, y hasta dónde llega de verdad. El invariante de arriba es del FORMATEADOR («dos
// instantes distintos AL MINUTO no dicen lo mismo»); el requisito de D26 es del PRODUCTO («dos LLAVES distintas
// no dicen lo mismo»), y no son el mismo enunciado: nada acota la separación entre dos `entroEn` —los escribe
// `serverTimestamp()` en `db/firestore.ts`, el lote de `crearLista` y `entrar`—, así que dos llaves del mismo
// minuto de reloj dicen lo mismo en las tres superficies que llevan el «cuándo». Es el límite conocido escrito
// en D26. Se pinea para que el día que alguien suba la precisión esto falle y lo mande a actualizar el
// documento — no para bendecirlo.
it('límite conocido (D26): dos entradas del mismo minuto no se desempatan', () => {
  const a = enLocal(12, 8, 5);                                         // 08:05:00
  expect(cuandoDicho(a + 40_000, AHORA)).toBe(cuandoDicho(a, AHORA));  // 08:05:40
});

// El otro eje que D26 dice haber agregado y que ningún test miraba: además de desempatar y de ser castellano,
// la frase tiene que ser CIERTA. El tramo 'semana' dice el NOMBRE del día, así que nunca puede nombrar el de
// HOY. La ventana en milisegundos lo permitía: 7 días de calendario a una hora más tarde que la de la consulta
// caían adentro, y salía «el miércoles a las 20:00» un miércoles a las 15:00 — una hora que hoy no pasó.
describe.each<[string, (ts: number, ahora: number) => string]>([
  ['fechaYHora', fechaYHora],
  ['cuandoDicho', cuandoDicho],
])('%s nunca nombra el día de HOY', (_f, formatear) => {
  // el nombre del día sale de Intl y no de una lista escrita acá: otra fuente que la del módulo, y no envejece
  const hoyLargo = new Date(AHORA).toLocaleDateString('es-AR', { weekday: 'long' });
  it.each([[0], [9], [15], [20], [23]])('7 días de calendario antes, a las %i', h => {
    const dicho = formatear(enLocal(5, h, 0), AHORA);
    expect(dicho, dicho).not.toContain(hoyLargo);
    expect(dicho, dicho).not.toContain(hoyLargo.slice(0, 3));
  });
});
