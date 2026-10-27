/**
 * Quién tiene acceso a esta lista (D22 · Etapa 1). Cada fila es una **identidad**, no un aparato: desde D23 la
 * llave cuelga del uid, y con la cuenta guardada el celu, la tablet y la compu de una persona son una sola.
 * Por eso se fueron las etiquetas por dispositivo (D26): nombrar a mano lo que ya no se multiplica era ruido.
 * Del vocabulario viejo sobrevive un rótulo, "este dispositivo" — decisión de D26, porque es lo que la gente
 * reconoce en la fila propia; el modelo, en cambio, es la identidad, y las frases dicen ESE alcance.
 * Pero la cuenta es opcional para siempre: sin ella, dos dispositivos pueden elegir a la misma persona y quedan
 * dos llaves con el mismo nombre — por eso el "cuándo entró" lleva el día Y la hora, y ese dato viaja a las otras
 * dos superficies que nombran una llave: la pregunta de sacar el acceso, y el nombre accesible del botón que
 * la abre (recorriendo por controles no hay fila al lado, y ese nombre es todo lo que se escucha de la fila).
 * Las tres son ORACIONES, así que el instante viaja DICHO (`cuandoDicho`, «el miércoles a las 20:14») y no como
 * la etiqueta de `meta.comprado` («mié 20:14»), que se apoya en el «·» para no necesitar la preposición.
 *
 * Sacar un acceso y anular una invitación son destructivos, así que van por la misma pregunta aparte (Confirmar)
 * que el resto de la app: nada se mueve de lugar mientras decidís. Y desde D26 el primer control del panel es
 * uno de esos (Sacarle el acceso; Salir de esta lista para quien no es dueño): antes lo tapaba la píldora de
 * etiqueta, que sin que nadie lo decidiera hacía de primer focusable inofensivo. Por eso al abrir el foco queda
 * en el DIÁLOGO (`focoInicial="panel"`) y a los botones se llega tabulando a propósito.
 * Un control se anuncia por TRES canales, y el ascenso se atendió en los tres, no en dos: el orden de foco
 * (arriba), el nombre accesible (`expulsarA`, con quién y cuándo) y el COLOR — `c.textoPeligro`, la silueta de
 * botón de texto que no engorda la fila, pintada con el --danger que el resto de la app le da a lo destructivo.
 * Pintarlos de --accent-ink los dejaba tipográficamente idénticos al «Cerrar» que está cuatro filas abajo.
 * Y lo que cierra ese mismo razonamiento: a dónde queda el foco DESPUÉS de apretarlo. El control se lleva puesta
 * su propia fila, así que el foco no tiene a dónde volver; vuelve a la salida segura de la hoja («Cerrar»).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { Acceso, Invitacion, Miembro } from '@/db/types';
import type { Traida } from '@/ui/contratos';
import { textos } from '@/ui/textos';
import { scl } from '@/motion/tokens';
import { diasQueLeQuedan, invitacionViva } from '@/domain/acceso';
import { cuandoDicho } from '@/domain/tiempo';
import { reubicarFoco } from '@/ui/foco';
import { Sheet } from './Sheet';
import { Confirmar } from './Confirmar';
import c from '@/ui/controles.module.css';
import s from './Accesos.module.css';

export interface AccesosProps {
  abierto: boolean;
  /** Las llaves, con los tres estados de la lectura adentro del valor (`Traida`), porque son tres respuestas
   *  distintas a la pregunta que titula la hoja: `'cargando'` (no viajan en la Vista: se piden al abrir, así
   *  que TODA apertura pasa por acá), `'fallo'` (a quien abre esta hoja la lectura no le tiene que fallar
   *  —`firestore.rules`, `match /acceso/{uid}`: `allow list: if esMiembro(listId)`—, así que un fallo es una
   *  falla real y se dice; no es el caso de `invitaciones`, acá abajo), o el array ya llegado. */
  accesos: Traida<Acceso[]>;
  /** las invitaciones abiertas. `null` NO es «no hay»: es «no sé» — o todavía cargan, o quien mira no las
   *  puede leer (`firestore.rules`, `match /invitaciones/{codigo}`: `allow get, list: if esDuenio(listId)`;
   *  el consumidor convierte esa negativa en null). Ninguna de las dos lecturas habilita a afirmar
   *  «No hay ninguna abierta», así que con `null` la sección entera no se pinta. */
  invitaciones: Invitacion[] | null;
  miembros: Miembro[];
  /** el uid de quien está mirando, para marcar su llave y para no ofrecerle expulsarse a sí mismo */
  miUid: string | null;
  /** el uid del dueño de la lista (el único que saca accesos, anula invitaciones y borra la lista) */
  duenio: string | null;
  /** el nombre de la lista, para que la pregunta de borrarla diga CUÁL */
  nombreLista: string;
  ahora: number;
  /** `null` es la llave que todavía no dijo quién es: el rótulo de relleno se muestra en la fila, no viaja */
  onExpulsar: (uid: string, persona: string | null) => void;
  onRevocar: (codigo: string) => void;
  /** vuelve a pedir las llaves: sin esto, «no pude leer» deja como única salida el «Cerrar» del pie */
  onReintentar: () => void;
  onSalir: () => void;
  /** borra la lista para todos (solo el dueño la ve): física, sin deshacer */
  onBorrarLista: () => void;
  onCerrar: () => void;
  onSalida?: () => void;
}

type Pregunta =
  /** viaja el HECHO, no el rótulo: `persona` es `null` en la llave que todavía no dijo quién es. Ni el título
   *  ni el aviso de después pueden meter el rótulo de relleno adentro de una frase, y cada uno se ramifica por
   *  ESTE valor — el rótulo se calcula donde se pinta (la fila) y se queda ahí */
  | { tipo: 'expulsar'; uid: string; persona: string | null; cuando: string | null }
  | { tipo: 'revocar'; codigo: string }
  | { tipo: 'salir' }
  | { tipo: 'borrarLista' };

export function Accesos({
  abierto, accesos, invitaciones, miembros, miUid, duenio, nombreLista, ahora,
  onExpulsar, onRevocar, onReintentar, onSalir, onBorrarLista, onCerrar, onSalida,
}: AccesosProps) {
  const idTitulo = useId();
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  useEffect(() => { if (!abierto) setPregunta(null); }, [abierto]);

  // ---- foco: la fila que se va no deja el foco afuera de la hoja ----
  // Sacar una llave desmonta la fila DESDE la que se disparó la pregunta, y hay dos órdenes posibles entre el
  // refresco de la lista y el cierre de la pregunta. Cada uno se atiende por su lado y los dos terminan acá:
  //  · el de todos los días (online, cuatro viajes a Firestore contra 110 ms de animación): la pregunta cierra
  //    primero y `Sheet` devuelve el foco al botón de la fila, que todavía existe; después la fila se desmonta
  //    CON el foco adentro → lo reubica el cleanup del ref, abajo.
  //  · el que gana el refresco (todo resuelto de caché): el disparador ya está desconectado cuando cierra la
  //    pregunta, y ahí manda el `focoAlCerrar` del `Confirmar`.
  // El destino es el mismo en los dos: «Cerrar», que existe para los dos roles y no se desmonta mientras la hoja
  // está abierta. NO el botón destructivo de la fila vecina —a esos se llega tabulando a propósito, que es la
  // misma decisión que el `focoInicial="panel"` de arriba— y NUNCA el `<main>` de atrás, que es el último recurso
  // de `Sheet` y acá estaría afuera de un `<dialog>` modal todavía abierto: inerte, y el foco cae al `<body>`.
  const refCerrar = useRef<HTMLButtonElement>(null);
  /** un solo callback para todas las filas (identidad estable: si cambiara en cada render, React correría el
   *  cleanup con la fila todavía viva y le movería el foco a quien está leyendo) */
  const refFila = useCallback((li: HTMLLIElement | null) => () => reubicarFoco(li, null, () => refCerrar.current), []);

  const soyDuenio = miUid !== null && duenio === miUid;
  /** Las llaves, o `null` si no hay ninguna que mostrar (mismo patrón que `cuando`, abajo): la pregunta se hace
   *  UNA vez y las dos superficies —la línea que dice en qué estado está la lectura, y la lista— se ramifican
   *  por ESTE valor. El `?? []` que había acá pintaba «no sé» y «no pude» igual que «no hay».
   *  Un array VACÍO cuenta como «no hay ninguna que mostrar», y no como una respuesta: cero llaves no es un
   *  estado posible —quien está leyendo esta hoja tiene la suya, así que su fila siempre tendría que estar—, y
   *  es justo la forma que toma el caso offline, donde `getDocs` sobre el caché persistente resuelve VACÍO sin
   *  tirar error. Exigir cantidad es lo que impide que una lectura que no contestó se pinte como un «no hay». */
  const llaves = Array.isArray(accesos) && accesos.length > 0 ? accesos : null;
  /** Si la lectura todavía está en camino, o ya terminó sin contestar. UN solo valor elige la frase Y decide si
   *  hay «Reintentar»: son una unidad, porque decir «no pude leer» sin nada con qué volver a intentar deja como
   *  único control el «Cerrar» del pie, y ofrecer reintentar una espera que sigue viva es al revés. */
  const esperando = accesos === 'cargando';
  /** el nombre de la persona que eligió esa llave, o `null` si todavía no eligió ninguna (o la borraron):
   *  el rótulo de relleno lo pone quien lo muestra, porque no toda frase lo puede recibir adentro */
  const nombreDe = useCallback((a: Acceso): string | null => {
    if (a.memberId) return miembros.find(m => m.id === a.memberId)?.nombre ?? null;
    return null;
  }, [miembros]);

  const vivas = (invitaciones ?? []).filter(i => invitacionViva(i, ahora));

  const confirmar = (): void => {
    if (!pregunta) return;
    if (pregunta.tipo === 'expulsar') onExpulsar(pregunta.uid, pregunta.persona);
    else if (pregunta.tipo === 'revocar') onRevocar(pregunta.codigo);
    else if (pregunta.tipo === 'borrarLista') onBorrarLista();
    else onSalir();
    setPregunta(null);
  };

  const copy = (): { titulo: string; texto: string; confirmar: string } => {
    if (pregunta?.tipo === 'expulsar') return {
      titulo: pregunta.persona === null ? textos.accesos.expulsarTituloLlave : textos.accesos.expulsarTitulo(pregunta.persona),
      texto: textos.accesos.expulsarTexto(pregunta.cuando),
      confirmar: textos.accesos.expulsarSi,
    };
    if (pregunta?.tipo === 'revocar') return { titulo: textos.accesos.revocarTitulo, texto: textos.accesos.revocarTexto, confirmar: textos.accesos.revocarSi };
    if (pregunta?.tipo === 'borrarLista') return { titulo: textos.accesos.borrarListaTitulo(nombreLista), texto: textos.accesos.borrarListaTexto, confirmar: textos.accesos.borrarListaSi };
    // salir borra la propia llave y nada más: el campo `duenio` de la lista se queda apuntando al que se va, así
    // que si el que se va es el dueño la lista queda sin quién la administre. La pregunta lo dice, y la rama la
    // decide el MISMO valor que muestra «Borrar la lista» y esconde la nota `soloDuenio`: no se pueden desincronizar.
    return { titulo: textos.accesos.salirTitulo, texto: textos.accesos.salirTexto(soyDuenio), confirmar: textos.accesos.salirSi };
  };
  const q = copy();

  return (
    <Sheet abierto={abierto} onCerrar={onCerrar} onSalida={onSalida} labelledBy={idTitulo} focoInicial="panel">
      <h2 id={idTitulo} className={s.titulo}>{textos.accesos.titulo}</h2>
      {/* la promesa de sacar una llave es del dueño: el consumidor pasa el dato y la rama se decide en textos.ts */}
      <p className={s.texto}>{textos.accesos.texto(soyDuenio)}</p>

      {/* Una lista de llaves SIN filas contesta «¿quién tiene acceso?» con «nadie», y lo contesta con SILENCIO
          —un `<ul>` vacío—, que es la respuesta más tranquilizadora posible a una pregunta de seguridad y encima
          dada sin haber leído un solo documento. Nunca es verdadera: quien está leyendo esta hoja tiene llave,
          así que su propia fila siempre tendría que estar. Por eso mientras no hay llaves la hoja dice en qué
          estado está la lectura en vez de pintar el `<ul>` mudo, y por eso el vacío cuenta como no-contestó y
          no como respuesta: sin señal `getDocs` sobre el caché persistente resuelve VACÍO sin tirar error, así
          que el caso más importante de todos ni siquiera pasa por el `catch`. */}
      {llaves === null ? (
        <>
          <p className={s.vacio}>{esperando ? textos.accesos.buscando : textos.accesos.noSePudoLeer}</p>
          {esperando ? null : (
            <motion.button type="button" className={c.texto} onClick={onReintentar} whileTap={{ scale: scl.press }}>
              {textos.vacio.reintentar}
            </motion.button>
          )}
        </>
      ) : (
        <ul className={s.lista}>
          {llaves.map(a => {
            const yo = a.uid === miUid;
            const esDuenio = a.uid === duenio;
            const persona = nombreDe(a);
            // `null` es una llave que todavía no dijo quién es: se la muestra con el rótulo de relleno, pero
            // ninguna frase lo puede meter adentro («¿Sacarle el acceso a Todavía no dijo quién es?», y una capa
            // más abajo el aviso «Todavía no dijo quién es ya no tiene acceso»). Por eso el rótulo se queda ACÁ,
            // donde se pinta, y aguas abajo viaja `persona`: el hecho, no el relleno.
            const quien = persona ?? textos.accesos.sinNombre;
            // el instante en que entró, DICHO para que entre en una frase (no `haceCuanto`, que colapsa a
            // "ayer"/"lun"/día-mes): sin cuenta, dos dispositivos de la misma persona son dos llaves con el
            // mismo nombre, y esto es lo único que las separa. Va en prosa —«hoy a las 20:11», «el miércoles a
            // las 20:14»— y no en la etiqueta de `meta.comprado` («4/8 18:32»), porque las tres superficies que
            // lo reciben son ORACIONES y una de ellas solo se ESCUCHA.
            // Puede ser `null`: un serverTimestamp que todavía no resolvió (leído de caché, sin señal) o una
            // llave creada sin el campo, que las reglas permiten. Ahí no se sabe cuándo entró, y ni la fila ni
            // la pregunta afirman una hora. La nulidad se decide UNA vez, acá: fila, pregunta y nombre accesible
            // del botón se ramifican por ESTE valor, así que no hay dos criterios que se puedan desincronizar.
            const cuando = a.entroEn === null ? null : cuandoDicho(a.entroEn, ahora);
            return (
              <li key={a.uid} className={s.fila} ref={refFila}>
                <span className={s.datos}>
                  <span className={s.nombre}>
                    {quien}
                    {esDuenio ? <span className={s.etiqueta}>{textos.accesos.duenio}</span> : null}
                    {yo ? <span className={s.etiqueta}>{textos.accesos.esteTelefono}</span> : null}
                  </span>
                  {cuando !== null ? <span className={s.meta}>{textos.accesos.entro(cuando)}</span> : null}
                </span>
                {soyDuenio && !yo ? (
                  <motion.button
                    type="button"
                    // en pantalla el nombre de la llave y su "cuándo" están al lado; recorriendo por botones no
                    // hay "al lado", así que el nombre accesible —el único texto que este control tiene— lleva
                    // los DOS datos que separan una llave de otra. Cómo se arman, y qué pasa si falta alguno,
                    // se decide en textos.ts: acá se pasan los datos, no se vuelve a elegir el criterio.
                    aria-label={textos.accesos.expulsarA(persona, cuando)}
                    className={c.textoPeligro}
                    onClick={() => setPregunta({ tipo: 'expulsar', uid: a.uid, persona, cuando })}
                    whileTap={{ scale: scl.press }}
                  >
                    {textos.accesos.expulsar}
                  </motion.button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* un vacío acá AFIRMA («No hay ninguna abierta»), y `null` es «no sé»: para quien no es dueño ese valor es
          null siempre —las reglas solo le dejan leerlas al dueño— y mientras cargan lo es para todos. La rama la
          decide EL VALOR y no `soyDuenio`: un segundo criterio se puede desincronizar de las reglas, y además
          `soyDuenio` no cubre el rato de carga del propio dueño. */}
      {invitaciones !== null ? (
        <>
          <h3 className={s.subtitulo}>{textos.accesos.invitaciones}</h3>
          {vivas.length === 0 ? (
            <p className={s.vacio}>{textos.accesos.invitacionesVacio}</p>
          ) : (
            <ul className={s.lista}>
              {/* la otra lista de filas que se desmontan con el foco adentro (anular deja de listarlas): mismo criterio, no otro */}
              {vivas.map(i => (
                <li key={i.codigo} className={s.fila} ref={refFila}>
                  <span className={s.datos}>
                    {/* lo que importa de una invitación abierta es cuánto le queda, no cuándo se creó */}
                    <span className={s.nombre}>{textos.accesos.invitacionVence(diasQueLeQuedan(i.venceEn, ahora))}</span>
                    {/* «Creada ___» también es una ORACIÓN, así que recibe el MISMO valor en prosa que la lista
                        de arriba: la regla del sheet es del slot, no de las cuatro superficies que tocó D26.
                        `haceCuanto` colapsa de 1 a 7 días al día abreviado, y ese es el tramo de TODA invitación
                        listada acá —vencen a los 7 (`VENCIMIENTO_INVITACION_MS`) y `vivas` filtra por eso—, así
                        que «Creada mié» era el régimen, no un borde. Y la nulidad se ramifica igual que en la
                        fila de una llave: sin fecha no se dice nada, en vez de inventar «recién». */}
                    {i.creadaEn !== null ? <span className={s.meta}>{textos.accesos.invitacionCreada(cuandoDicho(i.creadaEn, ahora))}</span> : null}
                  </span>
                  {soyDuenio ? (
                    <motion.button type="button" className={c.textoPeligro} onClick={() => setPregunta({ tipo: 'revocar', codigo: i.codigo })} whileTap={{ scale: scl.press }}>
                      {textos.accesos.revocar}
                    </motion.button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {!soyDuenio ? <p className={s.nota}>{textos.accesos.soloDuenio}</p> : null}

      <div className={s.pie}>
        <motion.button type="button" className={c.peligro} onClick={() => setPregunta({ tipo: 'salir' })} whileTap={{ scale: scl.press }}>
          {textos.accesos.salir}
        </motion.button>
        {soyDuenio ? (
          <motion.button type="button" className={c.peligro} onClick={() => setPregunta({ tipo: 'borrarLista' })} whileTap={{ scale: scl.press }}>
            {textos.accesos.borrarLista}
          </motion.button>
        ) : null}
        {/* la salida segura de la hoja: acá vuelve el foco cuando se va la fila que lo tenía (ver arriba) */}
        <motion.button ref={refCerrar} type="button" className={c.texto} onClick={onCerrar} whileTap={{ scale: scl.press }}>
          {textos.accesos.cerrar}
        </motion.button>
      </div>

      <Confirmar
        abierto={pregunta !== null}
        titulo={q.titulo}
        texto={q.texto}
        confirmar={q.confirmar}
        onConfirmar={confirmar}
        onCancelar={() => setPregunta(null)}
        focoAlCerrar={() => refCerrar.current}
      />
    </Sheet>
  );
}
