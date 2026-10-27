/**
 * Interfaz `Db`: la ÚNICA cosa que la UI sabe sobre datos.
 * Implementaciones: `fake.ts` (memoria, tests y demo) y, más adelante, `firestore.ts`.
 *
 * Reglas de la interfaz (vienen del diseño, §5/§6/§12):
 *  - Las mutaciones devuelven de inmediato (sin await): la UI nunca espera a la red.
 *    Los errores llegan por `onError`, no por promesas rechazadas.
 *  - `suscribir` entrega una `Vista` completa cada vez que algo cambia (local o remoto).
 *  - Timestamps en epoch ms; `null` mientras la escritura está pendiente (serverTimestamp sin resolver).
 *  - Borrado siempre lógico (`estado: 'borrado'`), nunca físico.
 *  - Identidad por `memberId` (la persona), no por uid del dispositivo.
 */

export type Estado = 'pendiente' | 'comprado' | 'borrado';

/**
 * Autor de algo hecho sin haber dicho quién sos. Es un centinela, no un memberId: cuando después elegís tu nombre,
 * lo que anotaste en este teléfono se puede reclamar (`reclamarAnonimos`) porque nadie más lo firmó.
 */
export const ANONIMO = 'alguien';

export interface Item {
  id: string;
  texto: string;
  textoNorm: string;
  estado: Estado;
  agregadoEn: number | null;
  agregadoPor: string;            // memberId ("alguien" si no eligió)
  agregadoPorNombre: string;      // denormalizado, por si el miembro no existe
  compradoEn: number | null;
  compradoPor: string | null;
  compradoPorNombre: string | null;
  borradoEn: number | null;
  actualizadoEn: number | null;
  /**
   * Quién tocó el ítem por última vez (D19): lo escribe CADA mutación (agregar, tildar, destildar, editar, mover de
   * súper). La fila muestra esto, no quién lo anotó: si tu vieja destilda algo que anotaste vos, la meta pasa a ser
   * de ella. Opcional porque los ítems anteriores a D19 no lo traen (ahí se cae a comprado/agregado).
   */
  actualizadoPor?: string | null;
  actualizadoPorNombre?: string | null;
  /**
   * Dónde se compra: id de un `Mercado` (D13). Ausente o `null` = "en cualquiera", que es el estado por defecto
   * y de primera clase: no es un dato incompleto. Opcional porque los ítems anteriores a D13 no lo traen.
   */
  mercado?: string | null;
  /** hasPendingWrites: este ítem tiene un cambio local que todavía no confirmó el servidor */
  pendiente: boolean;
}

/**
 * Un lugar donde se compra: "Mercadona", "Lidl", la verdulería (D14). Mismo patrón que `Miembro`:
 * lista corta por casa, nombre libre, sin borrado. El orden canónico es el de creación (ver `ordenarMercados`).
 */
export interface Mercado {
  id: string;
  nombre: string;
  creadoEn: number | null;
}

export interface Miembro {
  id: string;
  nombre: string;
  /** clave de color: 'p1' | 'p2' | 'p3' | 'p4' → variables CSS --p1..--p4 */
  color: ColorPersona;
  creadoEn: number | null;
}
export type ColorPersona = 'p1' | 'p2' | 'p3' | 'p4';

export interface Sugerencia {
  texto: string;
  textoNorm: string;
  veces: number;
  ultimaVez: number | null;
  /**
   * Dónde se compra este producto, aprendido la última vez que alguien lo eligió (D15): un ítem nuevo con este
   * texto nace ya ubicado. Por eso el súper se pregunta ~una vez por producto y no en cada alta.
   */
  mercado?: string | null;
}

/**
 * QUIÉN PUEDE ENTRAR (D22 · Etapa 1). Distinto de QUIÉN ES: `Miembro` es una persona de la casa (Mamá, Papá) y es
 * a quien apuntan `agregadoPor` y compañía; `Acceso` es la llave, y cuelga del uid de Firebase. Separarlos deja
 * que la identidad siga siendo "la persona elegida en este teléfono" sin que eso decida quién entra.
 */
export interface Acceso {
  /** el uid de Firebase. Va también como campo (y no solo como id del doc) porque un collectionGroup no puede
   *  filtrar por id de documento: sin él no hay forma de responder "en qué listas estoy". */
  uid: string;
  /** a quién dice ser esta llave, si con esa llave ya eligieron persona */
  memberId: string | null;
  entroEn: number | null;
}

/** Una puerta abierta con vencimiento. El código es un bearer token: quien lo tiene, entra. */
export interface Invitacion {
  codigo: string;
  creadaPor: string;
  creadaEn: number | null;
  venceEn: number | null;
  revocada: boolean;
}

/**
 * LA CUENTA PERMANENTE (D23). El uid anónimo vive solo en el navegador; "guardar el acceso" lo ata a una cuenta
 * (hoy: Google) SIN cambiar el uid, y entrar con esa cuenta en otro dispositivo devuelve el mismo uid.
 * Una cuenta es UNA identidad: dos dispositivos que entran con ella son la misma llave en todas las listas.
 */
export type Cuenta =
  | { estado: 'anonima' }                          // el acceso vive solo en este navegador
  | { estado: 'guardada'; email: string | null }   // atado a una cuenta: recuperable desde cualquier dispositivo
  | { estado: 'choque'; email: string | null };    // la cuenta elegida YA guarda otro acceso: se ofrece entrar con ella

/** Una fila del índice "Tus listas": lo justo para pintarla y abrirla. */
export interface ListaResumen {
  id: string;
  nombre: string;
}

export interface Lista {
  id: string;
  /** el uid que manda: el único que echa y revoca. `null` en las listas anteriores a la Etapa 1. */
  duenio?: string | null;
  nombre: string;
  creadaEn: number | null;
}

/** Snapshot completo de lo que la UI necesita para pintar. */
export interface Vista {
  lista: Lista | null;            // null mientras carga o si no existe
  existe: boolean;                // false si el id no corresponde a ninguna lista
  items: Item[];                  // solo activos (pendiente | comprado), en cualquier orden
  miembros: Miembro[];
  mercados: Mercado[];            // vacío hasta que alguien crea el primero: sin súper, la lista se ve como antes
  sugerencias: Sugerencia[];
  /** metadatos de conexión */
  fromCache: boolean;             // lo que ves es la copia local, sin servidor
  hasPendingWrites: boolean;      // hay escrituras locales sin confirmar
  online: boolean;                // navigator.onLine (o simulado)
  ultimaSync: number | null;      // última vez que llegó algo del servidor
}

/** Quién soy en este teléfono. */
export interface Yo {
  memberId: string | null;
  nombre: string | null;
}

export type DbErrorTipo = 'permiso' | 'red' | 'validacion' | 'desconocido';
export interface DbError {
  tipo: DbErrorTipo;
  operacion: string;
  itemId?: string;
  mensaje: string;
}

export interface Db {
  /** Crea una lista con sus miembros iniciales y la semilla de sugerencias. Devuelve el listId. */
  crearLista(nombre: string, nombresMiembros: string[]): Promise<string>;

  /** El uid de este teléfono: la identidad que gatea el acceso. `null` mientras la auth no esté lista. */
  miUid(): string | null;

  /** El estado de la cuenta (D23). Espera a la auth y, si venimos de una redirección, a su resultado. */
  miCuenta(): Promise<Cuenta>;
  /**
   * Ata el acceso de este dispositivo a una cuenta (hoy: Google, por redirección: la página se va y vuelve).
   * El uid NO cambia: no hay nada que migrar. Si la cuenta ya guarda otro acceso, al volver `miCuenta()` dice
   * `choque` y la salida es `entrarConCuenta()`.
   */
  guardarCuenta(): Promise<void>;
  /**
   * Entra con una cuenta ya guardada: este dispositivo PASA A SER esa identidad (otro uid). La llave anónima que
   * tuviera queda atrás. OJO con esperar el resolve: en el canje del choque resuelve (y quien llama recarga la
   * app), pero en el viaje por redirección la página se va a Google y la promesa NO resuelve nunca — la vuelta
   * es una carga de página nueva. Lo que tenga que pasar sí o sí, va antes del await.
   */
  entrarConCuenta(): Promise<void>;

  /**
   * Se asegura de que este teléfono tenga la llave de esta lista. Idempotente: si ya la tiene no escribe nada,
   * y si la tiene pero sin persona elegida, se la anota. Devuelve si quedó adentro.
   * Durante la ventana de migración (D22) entra solo; después hace falta un `codigo` de invitación vivo.
   */
  entrar(listId: string, opts?: { codigo?: string | null; memberId?: string | null }): Promise<boolean>;

  /** Crea una invitación que vence en 7 días y devuelve su código (va en el fragmento del link). */
  invitar(listId: string): Promise<string>;
  /** Las invitaciones de la lista, vivas y muertas. Solo el dueño puede. */
  listarInvitaciones(listId: string): Promise<Invitacion[]>;
  revocarInvitacion(listId: string, codigo: string): Promise<void>;

  /** Quiénes tienen la llave. */
  listarAccesos(listId: string): Promise<Acceso[]>;
  /**
   * Echa a alguien. Borra su llave Y revoca lo que esa persona invitó, en el mismo lote: si no se revoca, vuelve
   * a entrar con su propio código. Es la clase de cosa que no se descubre razonando, y hay un test que lo muestra.
   */
  expulsar(listId: string, uid: string): Promise<void>;
  /** Me voy de esta lista (mi llave, no la de nadie más). */
  salir(listId: string): Promise<void>;

  /**
   * Borra la lista PARA TODOS: ítems, miembros, súper, llaves, invitaciones y lo aprendido. Físico y sin
   * deshacer — no hay papelera para una lista entera. Solo el dueño puede (las reglas lo exigen).
   * Firestore no borra en cascada: se desarma por lotes, y el doc de la lista va al FINAL y solo, porque las
   * reglas de los subdocs preguntan por el dueño con un get() a la lista (leer lo que el mismo lote borra explota).
   */
  borrarLista(listId: string): Promise<void>;

  /** Transitorio (D22): la lista que todavía no tiene dueño se lo pone, una sola vez. */
  reclamarLista(listId: string): Promise<void>;

  /**
   * En qué listas está este dispositivo (D22 · Etapa 2): las llaves propias, buscadas en el servidor. El índice
   * te sigue a cualquier dispositivo — no vive en el localStorage de uno solo, que se pisaba en cada apertura.
   */
  misListas(): Promise<ListaResumen[]>;

  /** Renombra la lista (cualquier miembro; las reglas lo permitieron siempre, la app nunca lo expuso). */
  renombrarLista(listId: string, nombre: string): void;

  /** Se suscribe a la vista de una lista. Llama a `cb` de inmediato (caché) y en cada cambio. */
  suscribir(listId: string, cb: (vista: Vista) => void): () => void;

  /**
   * Elige o crea la persona que soy en esta lista.
   * - `{ memberId }` → esa persona.
   * - `{ nombre }` → si ya existe alguien con ese nombre (sin tildes/mayúsculas), lo devuelve; si no, lo crea.
   */
  elegirMiembro(listId: string, opts: { memberId?: string; nombre?: string }): Promise<Miembro>;
  renombrarMiembro(listId: string, memberId: string, nombre: string): void;

  /** Crea un súper, o devuelve el que ya exista con ese nombre (comparando sin tildes ni mayúsculas). */
  crearMercado(listId: string, nombre: string): Promise<Mercado>;
  renombrarMercado(listId: string, mercadoId: string, nombre: string): void;
  /**
   * Borra un súper de verdad (es una etiqueta, no el dato de nadie): los ítems que apuntaban a él conservan el id
   * pero se leen como "en cualquiera". Por eso `deshacer` lo revive con el MISMO id y todo vuelve a su sección.
   * Es el único borrado físico de la app.
   */
  borrarMercado(listId: string, mercadoId: string): { deshacer: () => void };
  /**
   * Pone el súper de un ítem (`null` = "en cualquiera") y lo APRENDE para ese producto: el próximo ítem con el
   * mismo texto nace ya ubicado. Es la única vía para cambiar `Item.mercado`.
   */
  ponerMercado(listId: string, itemId: string, mercadoId: string | null, yo: Yo): void;

  /**
   * Olvida un producto aprendido (lo que se anotó una vez y quedó sugerido para siempre). Es el mismo trato que
   * un súper: una etiqueta, no el dato de nadie. Los ítems que lo usan no se tocan; sólo deja de sugerirse.
   * `deshacer` la repone con sus veces y su súper: lo aprendido no tiene historial, así que si no se repone
   * igual, se perdió. La clave es el `textoNorm`, que es como se guarda.
   */
  borrarSugerencia(listId: string, textoNorm: string): { deshacer: () => void };

  /** Devuelve el id del ítem nuevo de inmediato (id generado en el cliente). */
  agregarItem(listId: string, texto: string, yo: Yo): string;
  marcarComprado(listId: string, itemId: string, comprado: boolean, yo: Yo): void;
  editarItem(listId: string, itemId: string, texto: string, yo: Yo): void;
  /** Borrado lógico. */
  borrarItem(listId: string, itemId: string): void;
  /** Deshacer un borrado: vuelve al estado que tenía. */
  restaurarItem(listId: string, itemId: string, estadoPrevio: 'pendiente' | 'comprado', yo: Yo): void;
  /** Vacía comprados (borrado lógico en lote). Devuelve los ids afectados y una función para deshacer. */
  vaciarComprados(listId: string): { ids: string[]; deshacer: () => void };

  /**
   * Pone tu nombre en lo que hiciste antes de decir quién sos (D20). Solo toca los campos que siguen diciendo
   * `ANONIMO`: nunca le saca la autoría a otra persona. Los ids los junta el cliente en este teléfono, que es el
   * único que sabe qué escribió mientras era "alguien".
   */
  reclamarAnonimos(listId: string, itemIds: string[], yo: Yo): void;

  /** Exporta la lista completa (para el menú ⋯ › Exportar). */
  exportar(listId: string): Promise<unknown>;

  /** Errores de cualquier operación (permisos, validación, red). La UI los muestra como toast. */
  onError(cb: (e: DbError) => void): () => void;
}
