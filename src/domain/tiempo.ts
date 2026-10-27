/**
 * Formato de tiempo relativo en es-AR. `ahora` siempre inyectado (tests deterministas, sin fake timers).
 * En `haceCuanto` las fechas futuras (reloj del servidor adelantado) se clampean a "recién": nunca "en 2 min".
 * Los formateadores de INSTANTE no clampean: un futuro se dice tal cual, porque de un reloj roto no hay nada
 * cierto que decir —para +5 min "hoy a las 15:05" ya sale bien, y +1 día es desincronización, no copy—.
 */
const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000;
/** la lista larga es la fuente de verdad; la corta se DERIVA, así no envejecen por separado */
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS = DIAS_LARGOS.map(d => d.slice(0, 3));
/**
 * "4 de agosto": el mes largo lo da la plataforma (es-AR), no una tabla nuestra —expandir la fecha no cuesta
 * otra enumeración—. Solo para la PROSA de `cuandoDicho`; la etiqueta corta (`fechaCorta`, "4/8") no se toca,
 * porque sirve al margen apoyada en el «·».
 */
const DIA_Y_MES = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' });

export function haceCuanto(ts: number | null, ahora: number): string {
  if (ts === null) return 'recién';
  const d = ahora - ts;
  if (d < 45_000) return 'recién';
  if (d < HORA) return `hace ${Math.max(1, Math.round(d / MIN))} min`;
  if (d < DIA) return `hace ${Math.round(d / HORA)} h`;
  const ayer = esAyer(ts, ahora);
  if (ayer) return 'ayer';
  if (diasDeCalendario(ts, ahora) < 7) return DIAS[new Date(ts).getDay()] ?? fechaCorta(ts);
  return fechaCorta(ts);
}

/** "18:32" */
export function horaCorta(ts: number | null): string {
  if (ts === null) return '…';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "6/8" (día/mes) */
export function fechaCorta(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

type Tramo = 'hoy' | 'ayer' | 'semana' | 'fecha';

/**
 * Cuánto hay que decir de un instante para que se sepa CUÁL es. Un solo lugar: los dos formateadores de
 * instante —`fechaYHora` (etiqueta) y `cuandoDicho` (prosa)— lo consultan, así no pueden desincronizarse.
 * De acá sale el invariante de desempate que las dos heredan: dos instantes distintos al minuto tienen que
 * dar textos distintos, así que ningún tramo puede achicarse más —el minuto no se cae nunca, y el día solo
 * se calla donde ya es único (hoy)—. Lo fija `tiempo.test.ts`, sobre los dos.
 */
function tramoDe(ts: number, ahora: number): Tramo {
  if (mismoDia(ts, ahora)) return 'hoy';
  if (esAyer(ts, ahora)) return 'ayer';
  return diasDeCalendario(ts, ahora) < 7 ? 'semana' : 'fecha';
}

/**
 * Fecha y hora de un instante como ETIQUETA al margen, lo más corta que se pueda sin perder cuál es: "18:32"
 * (hoy), "ayer 18:32", "lun 18:32", "4/8 18:32". `null` → "recién" (la escritura propia que todavía no volvió
 * del servidor). Un solo uso, y manda sobre el formato: la línea de comprado de la fila (`ui/Fila.tsx`,
 * "✓ Mamá · 4/8 18:32"), donde el «·» hace el trabajo de la preposición. Sin ese «·» no lo hace nadie: esto
 * NO entra adentro de una oración ni de un nombre accesible —ahí va `cuandoDicho`—.
 */
export function fechaYHora(ts: number | null, ahora: number): string {
  if (ts === null) return 'recién';
  const hora = horaCorta(ts);
  switch (tramoDe(ts, ahora)) {
    case 'hoy': return hora;
    case 'ayer': return `ayer ${hora}`;
    case 'semana': return `${DIAS[new Date(ts).getDay()] ?? fechaCorta(ts)} ${hora}`;
    case 'fecha': return `${fechaCorta(ts)} ${hora}`;
  }
}

/**
 * El MISMO instante y los MISMOS tramos que `fechaYHora`, pero en PROSA: "hoy a las 18:32", "ayer a las 18:32",
 * "el lunes a las 18:32", "el 4 de agosto a las 18:32". Existe porque el registro no se transfiere: lo que sirve de
 * etiqueta apoyada en un «·» no es castellano metido adentro de una frase («Entró 18:32», «La llave que entró
 * mié 18:32 deja de ver la lista…»), y una de las superficies que lo recibe es un nombre accesible, que SOLO
 * se escucha —ahí "mié" se lee como la abreviatura que es y "3/8" como una fracción—. Lo usan las llaves
 * (`ui/sheets/Accesos.tsx`, D26): la fila, la pregunta destructiva que la saca y el nombre accesible del botón
 * que la abre. Como hereda `tramoDe`, hereda el desempate: es lo ÚNICO que separa dos llaves con el mismo
 * nombre —D23 deja la cuenta opcional— y viaja adentro de una pregunta que borra. Lo fija `tiempo.test.ts`,
 * y hasta ahí llega: las separa hasta el MINUTO, así que dos llaves que entran en el mismo minuto de reloj
 * dicen lo mismo en las tres superficies. Es un límite conocido de D26 —nada acota la separación entre dos
 * `entroEn`—, pineado en `tiempo.test.ts` abajo del invariante; subir la precisión acá es cambiar D26.
 *
 * `ts` NO es nulable a propósito: cuándo entró una llave puede no saberse, pero esa nulidad se decide UNA vez
 * donde se pinta la fila, y ahí no se dice nada. Que acá no entre `null` es lo que impide devolver "recién"
 * —cierto para la escritura propia de `Fila.tsx`, pero acá sería inventar una hora que nadie sabe—.
 */
export function cuandoDicho(ts: number, ahora: number): string {
  const hora = horaCorta(ts);
  const tramo = tramoDe(ts, ahora);
  const dia =
    tramo === 'hoy' ? 'hoy'
      : tramo === 'ayer' ? 'ayer'
        : tramo === 'semana' ? `el ${DIAS_LARGOS[new Date(ts).getDay()] ?? fechaCorta(ts)}`
          : `el ${DIA_Y_MES.format(new Date(ts))}`;
  return `${dia} a las ${hora}`;
}

function mismoDia(a: number, b: number): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function esAyer(ts: number, ahora: number): boolean {
  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1);
  return mismoDia(ts, ayer.getTime());
}
/**
 * Días de CALENDARIO entre dos instantes, no milisegundos: es lo que separa «el miércoles» de hoy. Un solo
 * lugar, porque el criterio lo consultan `tramoDe` y `haceCuanto`, y dos definiciones de «esta semana» se
 * desincronizan. Restar milisegundos no sirve: 7 * DIA de diferencia a una hora MÁS TARDE que la de la
 * consulta todavía entra en la ventana, y ahí el nombre del día es el de HOY («el miércoles a las 20:00»
 * un miércoles a las 15:00, una hora que hoy no pasó). `Math.round` sobre dos medianoches, así los días de
 * 23/25 h (cambio de hora) no lo corren.
 */
function diasDeCalendario(ts: number, ahora: number): number {
  const a = new Date(ts), b = new Date(ahora);
  a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DIA);
}
function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }
