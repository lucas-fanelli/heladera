/**
 * Props de todos los componentes de UI. Es el contrato entre PantallaLista (wiring) y cada componente.
 * Los componentes NO tocan el Db ni el router: reciben datos y callbacks.
 */
import type { RefObject } from 'react';
import type { Cuenta, ListaResumen, Item, Lista, Mercado, Miembro, Sugerencia, Yo } from '@/db/types';
import type { Accion, EstadoConexion, EstadoVacio } from '@/domain';
import type { FilaVM } from '@/app/useLista';
import type { Toast } from '@/app/useToasts';

/**
 * Una lectura que se pide al ABRIR una hoja (no viaja en la Vista, así que la hoja se pinta antes de tenerla):
 * todavía no sé, no pude, o llegó — y si llegó puede llegar vacía. Son TRES respuestas distintas a la misma
 * pregunta, y por eso viven en un valor: colapsarlas en el punto de pintado con `?? []` deja al componente
 * contestando «no hay» sin haber leído un solo documento, que es afirmar lo que no sabe. La forma es una sola
 * para todas las lecturas así: si cada hoja inventa la suya, el criterio queda duplicado.
 */
export type Traida<T> = 'cargando' | 'fallo' | T;

export interface HeaderProps {
  nombreApp: string;
  /** el nombre de ESTA lista: con varias listas, el header dice dónde estás (fallback: nombreApp) */
  nombreLista?: string | null;
  /** volver a "Tus listas". Sin esto el índice sería un laberinto sin salida (D22 · Etapa 2). */
  onVolver?: () => void;
  conexion: EstadoConexion;
  pendientesSync: number;
  ultimaSync: number | null;
  ahora: number;
  yo: Yo;
  miembros: Miembro[];
  onQuienSos: () => void;
  onMenu: () => void;
}

export interface ContadorProps {
  faltan: number;
  coincidencias: number;
  filtroActivo: boolean;
}

export interface ListaProps {
  pendientes: FilaVM[];
  /** comprados (bajo filtro, solo los coincidentes). La Lista los pinta solo si compradosAbierto; si no, están "en el bolsillo" */
  comprados: FilaVM[];
  compradosAbierto: boolean;
  /** el rótulo "Comprados (N)" de la DoneBar: destino de los vuelos (tildar con Comprados cerrado) y origen al abrir */
  bolsillo?: RefObject<HTMLElement | null>;
  /** hay vuelos al/desde el bolsillo (ui/bolsillo.ts → hayVuelos: sin filtro ahora ni recién, sin reduced motion). Lo decide PantallaLista, que también se lo cuenta a la DoneBar */
  vuelos?: boolean;
  filtroActivo: boolean;
  consulta: string;
  ocultos: number;
  vacio: EstadoVacio;
  yo: Yo;
  miembros: Miembro[];
  /** los súper de la casa (D14). Vacío = no hay ninguno todavía: la lista se pinta como siempre, sin títulos */
  mercados?: Mercado[];
  /** el súper que se está buscando por nombre (D17): su sección va arriba de todo */
  mercadoPrimero?: string | null;
  ahora: number;
  /** chips: "lo de siempre" (input vacío con foco) o autocompletado (≥ 2 letras) */
  sugerencias: Sugerencia[];
  mostrarSugerencias: boolean;
  /** id al que hay que scrollear (Ya está / recién agregado) */
  scrollA: string | null;
  onToggle: (itemId: string) => void;
  onEditar: (item: Item) => void;
  onSugerencia: (texto: string) => void;
  /** olvidar un producto aprendido (mantener apretada la sugerencia); quien llama confirma y muestra el toast */
  onBorrarSugerencia: (sug: Sugerencia) => void;
  onVolverAAnotar: (itemId: string) => void;
  onReintentar: () => void;
  /** soltar una fila arrastrada sobre otra sección (D18); sin esto, mantener apretada una fila no hace nada */
  onMoverAMercado?: (itemId: string, mercadoId: string | null) => void;
}

export interface FilaProps {
  fila: FilaVM;
  consulta: string;
  yo: Yo;
  miembros: Miembro[];
  ahora: number;
  onToggle: (itemId: string) => void;
  onEditar: (item: Item) => void;
  /** solo en comprados coincidentes bajo filtro: botón "volver a anotar" */
  onVolverAAnotar?: (itemId: string) => void;
}

export interface DoneBarProps {
  cantidad: number;
  abierto: boolean;
  /** cuántas filas están llegando volando al rótulo en este render (ui/bolsillo.ts → aterrizajes): el número rueda recién cuando aterrizan y el rótulo las "atrapa" */
  llegadas?: number;
  /** ref al rótulo "Comprados (N)": la Lista lo usa como destino/origen de los vuelos */
  bolsilloRef?: RefObject<HTMLElement | null>;
  onToggleAbierto: () => void;
  confirmando: boolean;
  onPedirVaciar: () => void;
  onConfirmarVaciar: () => void;
  onCancelarVaciar: () => void;
}

export interface BarraInputProps {
  valor: string;
  onChange: (v: string) => void;
  accion: Accion;
  onEnviar: () => void;
  /** enfocar al montar (entrada por ?anotar) */
  autoFocus: boolean;
  onFoco?: (enfocado: boolean) => void;
  maxLen: number;
}

export interface EmptyStateProps {
  tipo: EstadoVacio;
  onReintentar: () => void;
}

export interface PastillaProps {
  conexion: EstadoConexion;
  pendientesSync: number;
  ultimaSync: number | null;
  ahora: number;
}

export interface ToastProps {
  toast: Toast | null;
  onCerrar: () => void;
  onPausar: () => void;
  onReanudar: () => void;
}

export interface SheetProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo?: string;
  /** id del elemento con el título, para aria-labelledby */
  labelledBy?: string;
  /** id del elemento que DESCRIBE el diálogo (aria-describedby): lo que el lector anuncia al abrirlo, además del
   *  título. Un texto pintado adentro del panel no se escucha por estar adentro: al abrir se anuncian el nombre
   *  y el control enfocado, nada más. */
  describedBy?: string;
  /** se llama cuando terminó la animación de entrada (después de enfocar el primer control) */
  onEntrada?: () => void;
  /**
   * Dónde va el foco al abrir. 'primero' (default) enfoca el primer control; 'panel' lo deja en el diálogo, que es
   * lo que hay que hacer cuando el primer control es un campo de texto y no queremos que salte el teclado (D15).
   */
  focoInicial?: 'primero' | 'panel';
  /**
   * 'hoja' (default): sube desde abajo, para tareas. 'centro': tarjeta chica centrada, para una pregunta de sí o no
   * que no tiene que mover nada de lo que hay atrás (confirmar algo destructivo).
   */
  variante?: 'hoja' | 'centro';
  /** se llama cuando terminó la animación de SALIDA (después de dialog.close() y de devolver el foco) */
  onSalida?: () => void;
  /** a quién devolver el foco al cerrar si el disparador ya no existe (p.ej. la fila se borró) */
  focoAlCerrar?: () => HTMLElement | null;
  /** clase extra para el panel (p.ej. sheets más altos) */
  className?: string;
  children: React.ReactNode;
}

export interface QuienSosProps {
  abierto: boolean;
  miembros: Miembro[];
  yo: Yo;
  onElegir: (opts: { memberId?: string; nombre?: string }) => Promise<unknown>;
  onCerrar: () => void;
  /** modo "cambiar mi nombre": muestra el nombre actual editable */
  cambiarNombre?: boolean;
  onRenombrar?: (nombre: string) => void;
}

export interface EditarItemProps {
  item: Item | null;      // null = cerrado
  yo: Yo;
  miembros: Miembro[];
  /** los súper de la casa, para los chips de "¿dónde se compra?" */
  mercados: Mercado[];
  /** nombres que se ofrecen cuando todavía no hay ninguno creado (D14) */
  sugerenciasMercados: string[];
  ahora: number;
  onGuardar: (itemId: string, texto: string) => void;
  onBorrar: (itemId: string) => void;
  /** cambia el súper del ítem (null = "en cualquiera") */
  onPonerMercado: (itemId: string, mercadoId: string | null) => void;
  /** crea (o reusa) un súper por nombre y devuelve su id, para dejarle el ítem puesto */
  onCrearMercado: (nombre: string) => Promise<string | null>;
  /** borra un súper (mantener apretada la píldora + confirmar); quien llama muestra el toast con Deshacer */
  onBorrarMercado: (mercadoId: string) => void;
  onCerrar: () => void;
}

export interface ConfirmarProps {
  abierto: boolean;
  /** la pregunta, corta: "¿Borrar «tu prima»?" */
  titulo: string;
  /** qué va a pasar, en una línea (opcional) */
  texto?: string;
  /** etiqueta del botón que confirma ("Borrar") */
  confirmar: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  /** a quién devolver el foco al cerrar si el disparador ya no existe (p.ej. la fila se borró). Se DERIVA de
   *  `SheetProps` a propósito: esta interfaz re-lista a mano un subconjunto de la de abajo, y una lista escrita
   *  a mano envejece — un cable nuevo en `Sheet` queda invisible para quien usa `Confirmar` sin que nada falle. */
  focoAlCerrar?: SheetProps['focoAlCerrar'];
}

export interface MenuProps {
  abierto: boolean;
  lista: Lista | null;
  pendientes: Item[];
  yo: Yo;
  onMandarWhatsApp: () => void;
  /**
   * Crea una invitación y devuelve el link completo (con el código en el fragmento), o null si falló.
   * Ya no se comparte la URL cruda de la lista: desde la Etapa 1 (D22) conocerla no alcanza para entrar.
   */
  onInvitar: () => Promise<string | null>;
  onCopiarLink: (link: string) => void;
  onMandarLink: (link: string) => void;
  /** abre "Quién tiene acceso" */
  onAccesos: () => void;
  /** renombra la lista (cualquier miembro; el nombre nuevo viaja por el snapshot) */
  onRenombrar: (nombre: string) => void;
  onCambiarNombre: () => void;
  onExportar: () => void;
  onCerrar: () => void;
  /** terminó de cerrarse (para encadenar otro sheet sin solapar dos <dialog>) */
  onSalida?: () => void;
}

export interface HomeProps {
  /** las listas de este dispositivo (índice del servidor + el recuerdo local); null = todavía cargando */
  listas: ListaResumen[] | null;
  onCrear: (nombre: string, miembros: string[]) => Promise<void>;
  onAbrir: (listId: string) => void;
  /**
   * La cuenta permanente (D23); null = averiguando, undefined (prop ausente) = este build no maneja cuentas
   * (demo) y la Home no muestra nada al respecto.
   */
  cuenta?: Cuenta | null;
  /** guardar el acceso con una cuenta (redirige a Google: si resuelve, es porque falló antes de irse) */
  onGuardarCuenta?: () => Promise<void>;
  /** entrar con una cuenta ya guardada (cambia la identidad; quien lo llama recarga la app al resolver) */
  onEntrarConCuenta?: () => Promise<void>;
}
