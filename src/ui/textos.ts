/**
 * Todo el copy de la app, en español rioplatense (voseo). Nada de strings sueltos en componentes.
 * Las funciones reciben los datos que interpolan; los plurales se resuelven acá.
 */

/** «Sacarle el acceso»: el rótulo que se VE en el botón, su nombre accesible y el título de la pregunta salen
 *  todos de acá. Si cambia, cambia en las tres — que el nombre accesible deje de contener al rótulo le rompe el
 *  control por voz (WCAG 2.5.3: se dice lo que se lee). */
const SACARLE_EL_ACCESO = 'Sacarle el acceso';
const sacarleElAccesoA = (quien: string) => `${SACARLE_EL_ACCESO} a ${quien}`;

/** Cómo se nombra ADENTRO de una frase la llave que todavía no dijo quién es. `sinNombre` es un rótulo para
 *  MOSTRAR un vacío («Todavía no dijo quién es»), no para interpolarlo en una oración (D26): se la nombra por
 *  lo que ES, más el dato que la separa de las otras —el mismo «cuándo» que muestra su fila y repite
 *  `expulsarTexto`—, así dos llaves sin nombre no suenan igual en el rotor. Con `null` no se sabe cuándo entró
 *  y no se inventa una hora, igual que `expulsarTexto`. Un solo lugar para las DOS superficies que la nombran:
 *  el nombre accesible del botón y el título de la pregunta que ese botón abre.
 *  `cuandoDicho` es el instante EN PROSA (`domain/tiempo.ts`, «el miércoles a las 20:14»): acá adentro va una
 *  frase, no la etiqueta de `meta.comprado` («mié 20:14»), que sin su «·» se queda sin preposición. */
const sacarleElAccesoALaLlave = (cuandoDicho: string | null) =>
  sacarleElAccesoA(cuandoDicho === null ? 'esta llave' : `la llave que entró ${cuandoDicho}`);

/** la cola es la misma con fecha o sin ella: si cambia, cambia en las dos. */
const dejaDeVerLaLista = 'deja de ver la lista en el acto, y las invitaciones que haya mandado dejan de servir.';

/** La mitad del encabezado de accesos que vale para cualquiera que abra el sheet: no se escribe dos veces.
 *  Encabeza la lista de llaves, así que tiene que ser verdadera en los DOS caminos de acceso. Con la cuenta
 *  guardada (D23) son tres dispositivos, un uid, UNA llave; anónimo —el default, y hoy el de la familia
 *  entera— el uid vive en el IndexedDB de cada navegador, así que la misma persona puede aparecer en DOS filas
 *  con el mismo nombre (es la premisa del desempate por fecha y hora de D26). Repartir una llave por persona
 *  deja esas dos filas sin explicación justo arriba de ellas, y dos filas iguales se leen como «se duplicó»:
 *  por eso lo que se cuantifica es la LLAVE, y la multiplicidad va con «puede», que es cierto en los dos
 *  caminos. No se nombra el aparato —el modelo «una llave = un aparato» está derogado (D26)— ni se promete el
 *  desempate sin condición: `entroEn` puede ser `null` y ahí la fila no muestra ningún «Entró …». */
const todosTienenSuLlave = 'Cada llave es una forma de entrar a la lista, no una persona: alguien puede tener más de una.';

/** Lo que SOLO puede hacer quien creó la lista (D22, `esDuenio` en las reglas). Lo enumeran DOS frases del mismo
 *  sheet —la nota que le explica al que no es dueño por qué no tiene ni un botón, y la pregunta de salir cuando
 *  el que se va ES el dueño—, así que la enumeración vive en un solo lugar: el día que el dueño pueda una cosa
 *  más, las dos la dicen. El nexo se pide porque bajo negación el castellano usa «ni»: «nadie va a poder A, B ni
 *  C» apaga las tres, una por una, mientras que «A, B y C» se puede leer como que lo que no se puede es hacer
 *  las tres juntas — y esa frase se lee justo antes de apretar algo que no se deshace. */
export const poderesDelDuenio = (nexo: 'y' | 'ni'): string =>
  `sacar accesos, anular invitaciones ${nexo} borrar la lista`;

/** La primera mitad de la pregunta de salir es la única que vale para cualquiera —qué llaves se apagan—, y por
 *  eso se escribe una vez: las dos ramas no pueden divergir en lo que comparten. Cómo se VUELVE, en cambio,
 *  depende de quién se va, igual que la mitad del medio: `salir()` borra `acceso/{uid}` y no toca el campo
 *  `duenio` de la lista, así que el `allow create` de `acceso/{uid}` sigue dejándolo entrar sin código
 *  (`firestore.rules`: `getAfter(listaRef(listId)).data.get('duenio','') == request.auth.uid`, y fuera de un lote
 *  `getAfter` == `get`) — y con apretar ATRÁS alcanza, porque `useLista` llama a `entrar()` en cada montaje. Al
 *  que no es dueño esa misma regla lo rechaza, y la invitación es de verdad el único camino de vuelta. La cola
 *  del dueño lleva su condición pegada y no es adorno: anónimo —el default— ese uid vive en el IndexedDB de ESTE
 *  navegador, y si se pierde ya no es el `duenio` y el link no lo deja pasar. Es la misma regla que la primera
 *  mitad: una frase de alcance solo afirma sin condición lo que vale en el camino por default. */
const salirTuLlave = 'Se borra tu llave: dejás de ver la lista en este dispositivo, y en cualquier otro donde hayas entrado con tu acceso guardado.';
const salirVolverMiembro = 'Para volver vas a necesitar una invitación.';
const salirVolverDuenio = 'Para volver no hace falta invitación: la lista sigue siendo tuya y se abre con su link, siempre que entres con este mismo acceso.';

/** La causa que hay que descartar primero cuando algo no llegó, y la única que quien lee puede resolver. La
 *  dicen DOS mensajes de bloques distintos —el error de la cuenta y el de las llaves que no se pudieron leer—,
 *  así que se escribe una vez: el día que deje de decir «señal» lo deja de decir en los dos. Va sin punto
 *  porque cada uno sigue distinto: el de la cuenta pide reintentar con palabras (no tiene botón que apretar),
 *  y el de las llaves tiene el «Reintentar» al lado, donde pedirlo por escrito sobra. */
const fijateSiTenesSenal = 'Fijate si tenés señal';

export const textos = {
  app: { nombre: 'Heladera' },

  header: {
    menu: 'Menú',
    volver: 'Tus listas',
    quienSos: 'Cambiar quién soy',
    quienSosActual: (nombre: string) => `Sos ${nombre}. Cambiar quién soy`,
    quienSosAnonimo: 'Todavía no dijiste quién sos. Elegir',
    estado: { live: 'En vivo', offline: 'Sin conexión', sync: 'Sincronizando…' },
    estadoTip: {
      live: 'Conectado: los cambios se ven al instante.',
      offline: 'Sin conexión: lo que hagas se guarda acá y se manda cuando vuelva la señal.',
      sync: 'Mandando tus cambios…',
    },
    pendientes: (n: number) => (n === 1 ? '1 cambio sin sincronizar' : `${n} cambios sin sincronizar`),
    ultimaVez: (hace: string) => `Última vez actualizado ${hace}`,
  },

  contador: {
    faltan: (n: number) => (n === 0 ? 'No falta nada' : n === 1 ? 'Falta 1' : `Faltan ${n}`),
    coinciden: (n: number) => (n === 1 ? '· 1 coincide' : `· ${n} coinciden`),
    ninguna: '· nada coincide',
    aria: (n: number) => (n === 1 ? 'Falta 1 cosa' : `Faltan ${n} cosas`),
  },

  lista: {
    pendientes: 'Pendientes',
    comprados: 'Comprados',
    compradosN: (n: number) => `Comprados (${n})`,
    yaLoCompraron: 'Ya lo compraron',
    otrasVeces: 'Lo compraste otras veces',
    loDeSiempre: 'Lo de siempre',
    vaciar: 'Vaciar',
    vaciarConfirmar: (n: number) => (n === 1 ? '¿Vaciar 1? Sí' : `¿Vaciar ${n}? Sí`),
    volverAAnotar: 'volver a anotar',
    editar: (texto: string) => `Editar «${texto}»`,
    tildar: (texto: string) => `Marcar «${texto}» como comprado`,
    destildar: (texto: string) => `Volver «${texto}» a pendientes`,
    pendienteSync: 'Pendiente de sincronizar',
    ocultosPorFiltro: (n: number) => (n === 1 ? '(1 pendiente oculto por el filtro)' : `(${n} pendientes ocultos por el filtro)`),
    /** título de la sección de lo que no tiene súper, cuando no va primera (D16) */
    enCualquiera: 'En cualquiera',
    seccion: (nombre: string, n: number) => `${nombre} · ${n}`,
    remotoAgrego: (nombre: string, n: number) => (n === 1 ? `${nombre} agregó 1 cosa` : `${nombre} agregó ${n} cosas`),
    ver: 'Ver',
  },

  meta: {
    alguien: 'alguien',
    vos: 'Vos',
    agregado: (nombre: string, hace: string) => `${nombre} · ${hace}`,
    comprado: (nombre: string, hora: string) => `✓ ${nombre} · ${hora}`,
  },

  input: {
    placeholder: 'Anotá o buscá…',
    placeholderEj: 'Anotá o buscá… (ej: 2 kg de papas)',
    label: 'Anotá algo para la lista o buscá lo que ya está',
    agregar: 'Agregar',
    agregarX: (t: string) => `Agregar «${t}»`,
    yaEsta: 'Ya está',
    yaEstaEnLista: 'Ya está en la lista',
    volverX: (t: string) => `Volver a anotar «${t}»`,
    limpiar: 'Limpiar búsqueda',
    nadaParecido: 'Nada parecido: Enter lo agrega',
    olvidarSugerencia: (t: string) => `Olvidar la sugerencia «${t}»`,
    muyLargo: (max: number) => `Máximo ${max} caracteres`,
  },

  /** Olvidar un producto aprendido: se mantiene apretada la sugerencia, igual que una píldora de súper. */
  sugerencias: {
    olvidarTitulo: (t: string) => `¿Olvidar «${t}»?`,
    olvidarTexto: 'Deja de sugerirse. Lo que ya está anotado no se toca. Se puede deshacer.',
    olvidarSi: 'Olvidar',
  },

  toasts: {
    borrado: (t: string) => `Borraste «${t}»`,
    vaciado: (n: number) => (n === 1 ? 'Vaciaste 1 comprado' : `Vaciaste ${n} comprados`),
    borradoMercado: (nombre: string) => `Borraste «${nombre}»`,
    olvidadaSugerencia: (t: string) => `Ya no te sugiero «${t}»`,
    invitacionCreada: 'Invitación lista',
    invitacionRevocada: 'Invitación anulada',
    /** el aviso se nombra por lo que se BORRÓ, igual que la pregunta que lo precede. `expulsar` borra
     *  `acceso/{uid}`: UNA llave. Sin cuenta (D23) —el camino por default, y hoy el de la familia entera—
     *  Mamá puede tener dos, y «Mamá ya no tiene acceso» es falso mientras sigue adentro desde la otra; peor
     *  todavía porque `refrescarAccesos()` deja su otra fila a la vista detrás del toast. Es la misma regla
     *  que `accesos.salirTexto`: una frase que dice el alcance solo puede afirmar sin condición lo que vale en
     *  el camino por default. Y la llave que todavía no dijo quién es no tiene nombre que entre en la frase
     *  (D26): `sinNombre` es un rótulo para MOSTRAR el vacío en la fila, no para interpolarlo acá («Todavía no
     *  dijo quién es ya no tiene acceso»). Por eso llega la persona o `null`, y las dos ramas dicen «llave». */
    expulsado: (quien: string | null) =>
      quien === null ? 'Esa llave ya no tiene acceso' : `${quien} ya no entra con esa llave`,
    saliste: 'Saliste de la lista',
    listaBorrada: (nombre: string) => `Borraste «${nombre}»`,
    noSePudoInvitar: 'No pude crear la invitación. Probá de nuevo.',
    volvi: (t: string) => `Volví «${t}» a la lista`,
    junte: (nombre: string, t: string) => `${nombre} también anotó «${t}»; los junté`,
    deshacer: 'Deshacer',
    sinConexion: 'Sin conexión. Se guarda acá y se sincroniza después.',
    sincronizado: 'Listo, sincronizado.',
    noSePudo: (t: string) => `No se pudo guardar «${t}». Probá de nuevo.`,
    copiado: 'Copiado',
    noSePudoCompartir: 'No se pudo compartir ni copiar en este navegador.',
    linkCopiado: 'Link copiado',
    cerrar: 'Cerrar aviso',
    aviso: 'Aviso',
  },

  vacio: {
    primeraVezTitulo: 'Acá va la lista de casa.',
    primeraVezTexto: 'Anotá lo que falta y todos lo ven al toque.',
    todoCompradoTitulo: 'No falta nada. Qué lindo.',
    todoCompradoTexto: 'Vaciá los comprados o dejalos para la próxima.',
    sinSenalTitulo: 'No tengo señal y todavía no bajé la lista.',
    sinSenalTexto: 'Probá de nuevo cuando tengas conexión.',
    reintentar: 'Reintentar',
    sinAccesoTitulo: 'Esta lista no es tuya… todavía.',
    sinAccesoTexto: 'Pedile a alguien de casa que te mande una invitación y entrás al toque.',
    filtroTitulo: 'Nada coincide.',
    filtroTexto: 'Enter lo agrega tal cual lo escribiste.',
    noExisteTitulo: 'Esta lista no existe.',
    noExisteTexto: 'Revisá el link o pedí que te lo manden de nuevo.',
  },

  quienSos: {
    titulo: '¿Quién sos?',
    texto: 'Así los demás saben quién anotó qué. Sin contraseña ni nada.',
    otroNombre: 'Otro nombre…',
    otroNombreLabel: 'Tu nombre',
    soyYo: 'Soy yo',
    sosVos: (nombre: string) => `¿Sos vos, ${nombre}?`,
    siSoyYo: 'Sí, soy yo',
    noOtro: 'No, poné otro',
    cerrar: 'Ahora no',
    cambiar: 'Cambiar mi nombre',
    guardar: 'Guardar',
    nombreVacio: 'Escribí un nombre',
    nombreLargo: (max: number) => `Máximo ${max} letras`,
    miembrosLabel: 'Elegí tu nombre',
    actual: '(vos)',
  },

  editar: {
    titulo: 'Editar',
    label: 'Texto del ítem',
    guardar: 'Guardar',
    borrar: 'Borrar',
    cancelar: 'Cancelar',
    anoto: (nombre: string, cuando: string) => `Anotó ${nombre} · ${cuando}`,
    // súper (D15): el sheet dejó de ser "renombrar" y es el ítem con sus acciones
    donde: '¿Dónde se compra?',
    enCualquiera: 'En cualquiera',
    otroMercado: 'Otro súper…',
    nuevoMercado: 'Nombre del súper',
    agregarMercado: 'Agregar',
    elegirMercado: (nombre: string) => `Se compra en ${nombre}`,
    sinMercado: 'Se compra en cualquier lado',
    /** mantener apretada la píldora abre la pregunta (Confirmar), que no mueve nada de lo que hay atrás */
    borrarMercadoTitulo: (nombre: string) => `¿Borrar «${nombre}»?`,
    borrarMercadoTexto: 'Lo que estaba ahí queda en cualquiera. Se puede deshacer.',
    borrarMercadoSi: 'Borrar',
  },

  confirmar: {
    cancelar: 'Cancelar',
  },

  /** Quién tiene la llave de esta lista (D22). La llave es una IDENTIDAD, no un aparato: desde D23, una cuenta
   *  es un uid y una sola llave aunque sean tres dispositivos. El rótulo «este dispositivo» se queda porque es
   *  lo que la gente reconoce (D26), pero las frases dicen el alcance real, no el modelo viejo. */
  accesos: {
    titulo: 'Quién tiene acceso',
    /** Dice lo que vale para QUIEN LO ESTÁ LEYENDO. Sacar una llave es del dueño y de nadie más (D22), y el ítem
     *  de menú que abre este sheet no está gateado: quien no es dueño no tiene un solo botón acá, y el aviso que
     *  se lo explica (`soloDuenio`) recién aparece después de las llaves y de las invitaciones. Por eso esa mitad
     *  va condicionada — misma lección que `salirTexto` (D26): una frase que dice el alcance solo puede afirmar
     *  sin condición lo que vale en el camino por default, y el default de esta pantalla es NO ser dueño
     *  (incluido el rato en que `duenio`/`miUid` todavía son null: ahí sale la que no promete de más).
     *  La cola NOMBRA lo que se saca en vez de pronominalizarlo —misma doctrina que `salirTexto` (D26)—: la
     *  primera mitad ya no reparte «su llave» a nadie, así que un clítico se quedaría sin antecedente. */
    texto: (soyDuenio: boolean) =>
      soyDuenio ? `${todosTienenSuLlave} Podés sacar la que quieras.` : todosTienenSuLlave,
    /** Las dos cosas que la hoja puede decir cuando NO tiene las llaves. Sin ellas, «no sé todavía» y «no pude»
     *  se pintaban las dos como una lista sin filas, y una lista de llaves sin filas se lee como «no entra
     *  nadie»: la respuesta más tranquilizadora posible a «¿quién tiene acceso?», dada sin haber leído un solo
     *  documento. Ninguna afirma quién entra; las dos dicen en qué estado está la lectura.
     *  Cero filas no es un estado verdadero acá: quien está leyendo esta hoja tiene llave, así que su propia
     *  fila siempre tendría que estar. Por eso el silencio siempre era mentira, y no solo sin señal. */
    buscando: 'Buscando quién tiene acceso…',
    /** El «Reintentar» que va al lado es parte del mensaje: decir «no pude» y dejar como único control un
     *  «Cerrar» cuatro filas abajo es contar la mitad de la verdad. La cola sale de un solo lugar
     *  (`fijateSiTenesSenal`), y acá termina ahí: lo que sigue —volver a probar— es el botón, no una frase. */
    noSePudoLeer: `No pude leer quién tiene acceso. ${fijateSiTenesSenal}.`,
    duenio: 'dueño',
    esteTelefono: 'este dispositivo',
    sinNombre: 'Todavía no dijo quién es',
    /** el «cuándo entró» de la fila, y la fuente del que repiten las otras tres superficies. También es una
     *  oración («Entró ___»), así que recibe el instante EN PROSA: «Entró hoy a las 20:11», no «Entró 20:11». */
    entro: (cuandoDicho: string) => `Entró ${cuandoDicho}`,
    /** el «cuándo» de la lista hermana, y también una ORACIÓN («Creada ___»): recibe prosa, no la etiqueta de
     *  `meta.comprado`. El nombre del parámetro es el contrato —lo mismo que `entro`, acá arriba—, porque el
     *  tipo `string` acepta la salida de cualquiera de los tres formateadores: hasta D26 le llegaba
     *  `haceCuanto`, que de 1 a 7 días da el día abreviado, y eso es «Creada mié» para casi toda invitación
     *  abierta. Sin fecha no hay frase: el consumidor esconde el renglón en vez de mandar un relleno. */
    invitacionCreada: (cuandoDicho: string) => `Creada ${cuandoDicho}`,
    invitacionVence: (dias: number) => (dias <= 1 ? 'Vence hoy' : `Vence en ${dias} días`),
    expulsar: SACARLE_EL_ACCESO,
    /** El nombre accesible del botón destructivo, y el ÚNICO texto que ese control tiene. En pantalla se apoya en
     *  la fila que tiene al lado; recorriendo por controles (el rotor) no hay «al lado», así que lleva los dos
     *  datos que separan una llave de otra: quién y cuándo entró. Sin cuenta (D23) dos llaves de la misma persona
     *  dicen «Mamá» las dos, y lo único que las desempata es el «cuándo» que muestra la fila: acá va el MISMO
     *  instante, EN PROSA (`cuandoDicho`) — este texto no se lee, se ESCUCHA: la etiqueta de `meta.comprado`
     *  metida acá adentro le hace leer una abreviatura («mié») y una fracción («3/8»), y encima sin preposición.
     *  `persona === null` es la llave que todavía no dijo quién es: se la nombra por lo que ES, igual que el
     *  título, porque `sinNombre` es un rótulo para MOSTRAR un vacío, no para interpolarlo adentro de una frase
     *  (D26). Con `cuandoDicho === null` no se sabe cuándo entró y no se inventa una hora, igual que la fila y
     *  que `expulsarTexto`. Las dos ramas se deciden ACÁ, en un solo lugar: quien lo usa pasa los datos, no
     *  vuelve a elegir — que el criterio viva en el consumidor es lo que dejó al rotor con N botones iguales. */
    expulsarA: (persona: string | null, cuandoDicho: string | null) => {
      if (persona === null) return sacarleElAccesoALaLlave(cuandoDicho);
      return cuandoDicho === null ? sacarleElAccesoA(persona) : `${sacarleElAccesoA(persona)}, entró ${cuandoDicho}`;
    },
    expulsarTitulo: (quien: string) => `¿${sacarleElAccesoA(quien)}?`,
    /** la llave que todavía no dijo quién es no tiene un nombre que entre en la frase: `sinNombre` es una
     *  oración, y metida ahí daba «¿Sacarle el acceso a Todavía no dijo quién es?». Se la nombra por lo que
     *  es —el mismo criterio que el botón, de un solo lugar— y `expulsarTexto` —que va abajo— dice CUÁL con
     *  la fecha y hora de entrada, si se sabe. */
    expulsarTituloLlave: `¿${sacarleElAccesoALaLlave(null)}?`,
    /** dice CUÁL llave se saca: sin cuenta (D23), una misma persona puede tener más de una y el nombre no alcanza.
     *  `cuandoDicho` es el mismo instante que muestra la fila, EN PROSA (`domain/tiempo.ts`): acá adentro va una
     *  oración, no la etiqueta de `meta.comprado` —«La llave que entró mié 20:14 deja de ver la lista…» no se
     *  dice en castellano—. Con `null` —cuando no se sabe cuándo entró— no inventa una hora: dice lo que D22
     *  decía, y nada más. */
    expulsarTexto: (cuandoDicho: string | null) =>
      cuandoDicho === null ? `Esta llave ${dejaDeVerLaLista}` : `La llave que entró ${cuandoDicho} ${dejaDeVerLaLista}`,
    expulsarSi: 'Sacar',
    salir: 'Salir de esta lista',
    borrarLista: 'Borrar la lista',
    borrarListaTitulo: (nombre: string) => `¿Borrar «${nombre}» para todos?`,
    borrarListaTexto: 'Se borra todo lo anotado, para todos los miembros, y no se puede deshacer.',
    borrarListaSi: 'Borrar para todos',
    salirTitulo: '¿Salir de esta lista?',
    /** `salir()` borra UNA llave: la del uid que está mirando. Con el acceso guardado (D23) ese uid es el de la
     *  cuenta y se apagan todos sus dispositivos; anónimo —el default, y hoy el de la familia entera— el uid vive
     *  en ESTE navegador y los otros dispositivos son otras llaves (es la misma premisa del desempate por fecha
     *  y hora, D26). La frase dice las dos mitades: la que siempre pasa, y la que depende del acceso guardado.
     *  Lo que se pierde se NOMBRA —«la lista»— y no se pronominaliza: «tu llave» está en la misma oración y un
     *  clítico se le pega por cercanía, y esto se lee con el sheet de llaves detrás (`Confirmar` no mueve nada de
     *  lo que hay atrás), donde «dejás de verla» pasa por «tu llave sale de esta lista» — cierto, trivial, y lo
     *  contrario de lo que hay que entender antes de apretar algo que no se deshace.
     *
     *  El otro eje es QUIÉN se va, y también cambia lo que la acción provoca: `salir()` borra `acceso/{uid}` y
     *  nada más (`db/firestore.ts`), mientras el campo `duenio` del doc de la lista sigue apuntando al que se
     *  fue y `esDuenio()` lo resuelve contra ESE campo (`firestore.rules`). Si el que sale es el dueño, la lista
     *  queda sin nadie que pueda administrarla —pero ÉL SÍ vuelve, y sin invitación: `entrar()` le re-crea la
     *  llave en el próximo montaje y el `allow create` de `acceso/{uid}` lo autoriza por `duenio`, que es lo que
     *  la cola de esta rama dice (ver `salirVolverDuenio`)—; si además era anónimo y limpia el navegador ese uid
     *  no vuelve nunca, y ahí sí la lista se queda sin administrador para siempre. Es
     *  el mismo hecho que `cuenta.cambiarTexto` ya dice para el caso análogo («queda sin dueño»), y una pregunta
     *  destructiva que se calla el único efecto que su acción tiene sobre el resto de la familia no está
     *  diciendo la verdad completa.
     *
     *  Por eso la mitad del medio va ACOTADA y dice «nadie MÁS»: la enumeración es lo que pierden LOS QUE
     *  QUEDAN, no lo que pierde el que se va. Ninguno de los tres poderes cuelga de la llave —`esDuenio()` no
     *  pide membresía, y el `allow delete` del doc de la lista mira `resource.data.duenio` directo—, así que el
     *  uid que se fue los conserva enteros, y encima vuelve con el link. Un «nadie» sin acotar incluiría al que
     *  está leyendo la pregunta, y prometería como permanente algo que se deshace con un toque: es la misma
     *  promesa incondicional que la primera pasada ya había escrito por el lado de los aparatos. La lección: el
     *  alcance de una pregunta destructiva sale del MECANISMO de la acción —que es lo único que enumera sus DOS
     *  consecuencias, y quién se queda sin cuál—, no del invariante que la release deroga. */
    salirTexto: (soyDuenio: boolean) =>
      soyDuenio
        ? `${salirTuLlave} Y mientras no vuelvas, nadie más va a poder ${poderesDelDuenio('ni')}. ${salirVolverDuenio}`
        : `${salirTuLlave} ${salirVolverMiembro}`,
    salirSi: 'Salir',
    invitaciones: 'Invitaciones abiertas',
    invitacionesVacio: 'No hay ninguna abierta.',
    revocar: 'Anular',
    revocarTitulo: '¿Anular esta invitación?',
    revocarTexto: 'El link deja de funcionar. Los que ya entraron con él se quedan adentro.',
    revocarSi: 'Anular',
    /** la otra frase que enumera los poderes del dueño: la enumeración sale del mismo lugar que la de
     *  `salirTexto`, así no puede haber una lista corta y una larga diciendo lo mismo. */
    soloDuenio: `Solo quien creó la lista puede ${poderesDelDuenio('y')}.`,
    cerrar: 'Cerrar',
  },

  menu: {
    titulo: 'Menú',
    mandar: 'Mandar la lista por WhatsApp',
    mandarSub: (n: number) => (n === 1 ? 'como texto · 1 pendiente' : `como texto · ${n} pendientes`),
    sumar: 'Sumar a alguien',
    sumarSub: 'una invitación que vence en 7 días',
    generarInvitacion: 'Crear la invitación',
    generandoInvitacion: 'Creando…',
    invitacionLista: 'Mandale este link a quien quieras sumar. Vence en 7 días.',
    copiarLink: 'Copiar',
    mandarLink: 'Mandar',
    accesos: 'Quién tiene acceso',
    renombrar: 'Renombrar la lista',
    renombrarLabel: 'Nombre de la lista',
    guardar: 'Guardar',
    cambiarNombre: 'Cambiar mi nombre',
    exportar: 'Exportar',
    exportarSub: 'JSON con todo',
    linkLabel: 'Link de invitación',
    sinNombre: 'sin nombre',
    cerrar: 'Cerrar',
    mensajeSumar: (link: string) => `Te sumo a la lista de compras de casa. Abrí este link, poné quién sos y listo: ${link}`,
    tituloTexto: (nombre: string, n: number) => `Lista de ${nombre} (${n}):`,
    /** separador de súper en el texto que se manda (D16): se lee igual en WhatsApp, que no tiene formato */
    seccionTexto: (nombre: string) => `——— ${nombre} ———`,
    pieTexto: '— mandado desde Heladera',
    nombreExport: (listId: string) => `heladera-${listId}.json`,
  },

  home: {
    titulo: 'La lista de casa',
    texto: 'Una lista compartida para toda la familia. Se abre por link; sin cuentas.',
    nombreLista: 'Nombre de la lista',
    nombreListaDefault: 'Casa',
    miembros: '¿Quiénes viven en casa?',
    miembrosAyuda: 'Los nombres aparecen como chips en “¿Quién sos?”. Después se pueden cambiar.',
    crear: 'Crear la lista',
    creando: 'Creando…',
    miembroLabel: (i: number) => `Nombre ${i}`,
    // ejemplos genéricos a propósito: la app se comparte, y el nombre de nadie viaja en el producto
    miembroEjemplos: ['Tu nombre', 'Mamá', 'Papá', 'Alguien más'] as readonly string[],
    yaTengoLink: '¿Ya te mandaron el link? Abrilo y listo.',
    abrirUltima: (nombre: string) => `Abrir “${nombre}”`,
    tusListas: 'Tus listas',
    oNueva: 'O armá una nueva',
  },

  /**
   * La cuenta permanente (D23). Se dice "guardar tu acceso", no "iniciar sesión": nadie está obligado, todo
   * funciona igual sin cuenta, y Google es el cómo, no el qué. "Entrar con mi cuenta" solo se ofrece en un
   * dispositivo sin listas: en uno con listas cambiaría la identidad y escondería lo que hay (el camino seguro
   * para ese caso es guardar → choque → entrar, que avisa antes).
   */
  cuenta: {
    titulo: 'Tu acceso',
    anonima: 'Tu acceso vive solo en este dispositivo. Si se pierde, hace falta otra invitación.',
    guardar: 'Guardarlo con Google',
    llevando: 'Llevándote a Google…',
    guardada: (email: string) => `Acceso guardado como ${email}.`,
    guardadaSinEmail: 'Acceso guardado con tu cuenta de Google.',
    entrarPregunta: '¿Ya guardaste tu acceso en otro dispositivo?',
    entrar: 'Entrar con mi cuenta',
    choque: (email: string) => `${email} ya guarda otro acceso.`,
    choqueSinEmail: 'Esa cuenta ya guarda otro acceso.',
    choqueEntrar: 'Entrar con esa cuenta',
    choqueOtra: 'Probar con otra',
    /** el canje del choque no viaja a Google (la cuenta ya se eligió): su rótulo ocupado es otro */
    entrando: 'Entrando…',
    cambiarTitulo: '¿Entrar con esa cuenta?',
    // sin promesas falsas: si una lista que queda atrás era SOLO de este dispositivo, nadie la va a administrar
    cambiarTexto: 'Este dispositivo pasa a ver las listas de esa cuenta. Las que veía quedan atrás — y si alguna era solo de este dispositivo, queda sin dueño.',
    cambiarSi: 'Entrar',
    error: `No se pudo. ${fijateSiTenesSenal} y probá de nuevo.`,
  },

  errores: {
    permiso: 'No tenés permiso para hacer eso.',
    red: 'Sin conexión con el servidor.',
    validacion: 'Ese dato no es válido.',
    desconocido: 'Algo salió mal.',
  },

  limites: { textoMax: 120, nombreMax: 30, listaMax: 60, mercadoMax: 40, loDeSiempreN: 6, autocompletarN: 6 },
} as const;

export type Textos = typeof textos;
