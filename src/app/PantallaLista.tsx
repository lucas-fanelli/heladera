/**
 * Wiring de la pantalla única: conecta `useLista` (estado + acciones) con los componentes de src/ui.
 * Acá NO hay lógica de negocio ni estilos: solo composición.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Acceso, Db, Invitacion, Item, Sugerencia } from '@/db/types';
import { autocompletar, loDeSiempre, SUGERENCIAS_MERCADOS, textoParaCompartir } from '@/domain';
import { CAP_SIMULTANEO, timing } from '@/domain/timing';
import { aterrizajes, hayVuelos, idsEnBolsillo } from '@/ui/bolsillo';
import { compartirTexto, type OpcionesCompartir } from './compartir';
import { limpiarAnotar, urlDeLista } from './router';
import { useLista } from './useLista';
import { useAhora } from './useAhora';
import type { Traida } from '@/ui/contratos';
import { textos } from '@/ui/textos';
import { Header } from '@/ui/Header';
import { Contador } from '@/ui/Contador';
import { Lista } from '@/ui/Lista';
import { DoneBar } from '@/ui/DoneBar';
import { BarraInput } from '@/ui/BarraInput';
import { ToastView } from '@/ui/Toast';
import { Medidor, pidenMedidor } from '@/ui/Medidor';
import { QuienSos } from '@/ui/sheets/QuienSos';
import { EditarItem } from '@/ui/sheets/EditarItem';
import { Menu } from '@/ui/sheets/Menu';
import { Confirmar } from '@/ui/sheets/Confirmar';
import { Accesos } from '@/ui/sheets/Accesos';
import { linkDeInvitacion } from '@/domain/acceso';
import styles from './PantallaLista.module.css';

export function PantallaLista({ db, listId, anotar, onVolver }: { db: Db; listId: string; anotar: boolean; onVolver?: () => void }) {
  const L = useLista(db, listId);
  const ahora = useAhora(timing().AHORA_TICK_MS);
  // diagnóstico de fluidez en el teléfono: solo con ?fps en la URL (ver ui/Medidor.tsx)
  const [medidor] = useState(pidenMedidor);
  const [compradosAbierto, setCompradosAbierto] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [editando, setEditando] = useState<Item | null>(null);
  /** la sugerencia que se está por olvidar (mantener apretado el chip): null = no hay pregunta abierta */
  const [sugPorOlvidar, setSugPorOlvidar] = useState<Sugerencia | null>(null);
  const [accesosAbierto, setAccesosAbierto] = useState(false);
  const [accesos, setAccesos] = useState<Traida<Acceso[]>>('cargando');
  const [invitaciones, setInvitaciones] = useState<Invitacion[] | null>(null);
  const [cambiandoNombre, setCambiandoNombre] = useState(false);
  const [inputConFoco, setInputConFoco] = useState(false);
  // "Cambiar mi nombre" desde el menú: se abre ¿Quién sos? recién cuando el menú terminó de bajar (un solo <dialog> a la vez)
  const abrirNombreAlSalirMenu = useRef(false);

  // ?anotar: se usa una vez para enfocar el input y se limpia de la URL
  useEffect(() => { if (anotar) limpiarAnotar(); }, [anotar]);

  const items = L.vista?.items ?? [];
  const miembros = L.vista?.miembros ?? [];
  const sugerencias = useMemo(() => {
    const todas = L.vista?.sugerencias ?? [];
    if (L.filtrado.activo) return autocompletar(L.consulta, todas, items, textos.limites.autocompletarN);
    return loDeSiempre(todas, items, textos.limites.loDeSiempreN);
  }, [L.vista?.sugerencias, L.filtrado.activo, L.consulta, items]);
  // el diálogo de olvidar es modal y se roba el foco del input: sin la segunda condición los chips se colapsan
  // detrás de la pregunta justo mientras decidís, y vuelven al cerrar. Nada se mueve de lugar mientras hay pregunta.
  const mostrarSugerencias = L.filtrado.activo ? sugerencias.length > 0 : ((inputConFoco || sugPorOlvidar !== null) && sugerencias.length > 0);

  // comprados: la Lista los pinta si el grupo está abierto o hay filtro (sección "Ya lo compraron"); si no, están en el
  // "bolsillo" (detrás del rótulo "Comprados (N)"), y las filas tildadas vuelan hacia él (ui/bolsillo.ts).
  // Acá se decide UNA vez si hay vuelos (sin filtro ahora ni recién, sin reduced motion) y cuántas filas están
  // llegando en este render (se veían como pendientes y ahora están en el bolsillo): la Lista y la DoneBar reciben lo mismo.
  const compradosVisibles = compradosAbierto || L.filtrado.activo;
  const bolsilloRef = useRef<HTMLElement | null>(null);
  const reducido = useReducedMotion();
  const filtroPrevio = useRef(L.filtrado.activo);
  const pendientesPrevios = useRef<ReadonlySet<string>>(new Set());
  const vuelos = hayVuelos(L.filtrado.activo, filtroPrevio.current, !!reducido);
  const enBolsillo = useMemo(() => idsEnBolsillo(L.comprados, compradosVisibles && L.comprados.length > 0), [L.comprados, compradosVisibles]);
  const llegadas = aterrizajes(pendientesPrevios.current, enBolsillo, vuelos, L.pendientes.length + (compradosVisibles ? L.comprados.length : 0), CAP_SIMULTANEO);
  useEffect(() => {
    filtroPrevio.current = L.filtrado.activo;
    pendientesPrevios.current = new Set(L.pendientes.map(f => f.item.id));
  }, [L.filtrado.activo, L.pendientes]);

  const pendientesItems = useMemo(() => L.pendientes.map(f => f.item), [L.pendientes]);
  const link = useMemo(() => urlDeLista(listId, { absoluta: true }), [listId]);

  const onVolverAAnotar = useCallback((itemId: string) => { L.toggle(itemId); }, [L.toggle]);   // L.toggle es estable (memo de las filas)

  /** compartir/copiar con aviso; si ningún camino funcionó, toast de error (nunca la URL/texto crudo) */
  const compartir = useCallback(async (texto: string, avisoCopiado: string, opts: Omit<OpcionesCompartir, 'avisarCopiado'> = {}) => {
    const ok = await compartirTexto(texto, { ...opts, avisarCopiado: () => L.mostrarToast({ texto: avisoCopiado }) });
    if (!ok) L.mostrarToast({ texto: textos.toasts.noSePudoCompartir });
  }, [L]);

  const mandarWhatsApp = useCallback(async () => {
    const texto = textoParaCompartir(
      L.vista?.lista?.nombre ?? textos.home.nombreListaDefault,
      pendientesItems,
      { titulo: textos.menu.tituloTexto, pie: textos.menu.pieTexto, seccion: textos.menu.seccionTexto },
      L.mercados,
    );
    setMenuAbierto(false);
    await compartir(texto, textos.toasts.copiado, { whatsapp: true });
  }, [L, pendientesItems, compartir]);
  const copiarLink = useCallback(async (l: string) => {
    // copiar y nada más: si no se puede, lo dice (mandar por WhatsApp es el otro botón)
    await compartir(l, textos.toasts.linkCopiado, { soloCopiar: true });
  }, [compartir]);
  const mandarLink = useCallback(async (l: string) => {
    setMenuAbierto(false);
    await compartir(textos.menu.mensajeSumar(l), textos.toasts.linkCopiado, { whatsapp: true });
  }, [compartir]);

  /** Crea la invitación y devuelve el link entero: la lista, y el código en el fragmento (D22). */
  const invitar = useCallback(async (): Promise<string | null> => {
    const codigo = await L.invitar();
    if (!codigo) return null;
    L.mostrarToast({ texto: textos.toasts.invitacionCreada });
    return linkDeInvitacion(link, codigo);
  }, [L, link]);

  /** Los accesos no viajan en la Vista (serían lecturas en cada apertura): se piden al abrir el sheet. */
  const refrescarAccesos = useCallback(async () => {
    const [a, i] = await Promise.all([
      // `match /acceso/{uid}` → `allow list: if esMiembro(listId)` (firestore.rules): a cualquiera que abre esta
      // hoja las reglas lo dejan listar las llaves, así que un fallo acá es una falla REAL y la hoja la dice.
      // No es el mismo caso que la línea de abajo, aunque la forma se le parezca.
      db.listarAccesos(listId).catch(() => 'fallo' as const),
      // `match /invitaciones/{codigo}` → `allow get, list: if esDuenio(listId)`: al que no es dueño le TIENE que
      // fallar. Acá el null es el camino esperado, no un error, y por eso el sheet lo pinta callándose la sección.
      db.listarInvitaciones(listId).catch(() => null),
    ]);
    setAccesos(a); setInvitaciones(i);
  }, [db, listId]);

  const abrirAccesos = useCallback(() => {
    setMenuAbierto(false);
    setAccesos('cargando'); setInvitaciones(null);
    setAccesosAbierto(true);
    void refrescarAccesos();
  }, [refrescarAccesos]);

  const expulsar = useCallback(async (uid: string, quien: string | null) => {
    await L.expulsar(uid, quien);
    await refrescarAccesos();
  }, [L, refrescarAccesos]);
  const revocar = useCallback(async (codigo: string) => {
    await L.revocarInvitacion(codigo);
    await refrescarAccesos();
  }, [L, refrescarAccesos]);
  const salir = useCallback(async () => {
    setAccesosAbierto(false);
    await L.salir();
    onVolver?.();                      // sin llave esta pantalla ya no tiene nada para mostrar
  }, [L, onVolver]);
  const borrarLista = useCallback(async () => {
    const nombre = L.vista?.lista?.nombre ?? '';
    setAccesosAbierto(false);
    try {
      await db.borrarLista(listId);
      L.mostrarToast({ texto: textos.toasts.listaBorrada(nombre) });
    } catch {
      L.mostrarToast({ texto: textos.errores.desconocido });
      return;
    }
    onVolver?.();
  }, [db, listId, L, onVolver]);
  const renombrarLista = useCallback((nombre: string) => {
    db.renombrarLista(listId, nombre); // el nombre nuevo vuelve por el snapshot: header y menú se enteran solos
  }, [db, listId]);
  const exportar = useCallback(async () => {
    setMenuAbierto(false);
    let data: unknown;
    try { data = await db.exportar(listId); } catch { return; }   // el Db ya avisó por onError (toast); sin red y sin caché no hay qué compartir
    if (data == null) { L.mostrarToast({ texto: textos.toasts.noSePudoCompartir }); return; }
    const json = JSON.stringify(data, null, 2);
    await compartir(json, textos.toasts.copiado, { nombreArchivo: textos.menu.nombreExport(listId) });
  }, [db, listId, compartir, L]);

  const onCambiarNombre = useCallback(() => { abrirNombreAlSalirMenu.current = true; setMenuAbierto(false); }, []);
  const onSalidaMenu = useCallback(() => {
    if (!abrirNombreAlSalirMenu.current) return;
    abrirNombreAlSalirMenu.current = false;
    setCambiandoNombre(true);
    L.abrirQuienSos();
  }, [L]);

  return (
    <div className={styles.pantalla} data-filtro={L.filtrado.activo ? 'on' : 'off'}>
      <Header
        nombreApp={textos.app.nombre}
        nombreLista={L.vista?.lista?.nombre ?? null}
        onVolver={onVolver}
        conexion={L.conexion} pendientesSync={L.pendientesSync} ultimaSync={L.ultimaSync} ahora={ahora}
        yo={L.yo} miembros={miembros}
        onQuienSos={() => { setCambiandoNombre(!!L.yo.memberId); L.abrirQuienSos(); }}
        onMenu={() => setMenuAbierto(true)}
      />
      {/* tabIndex=-1: destino de foco de respaldo cuando el disparador de un sheet ya no existe */}
      <main className={styles.main} tabIndex={-1}>
        <Contador faltan={L.faltan} coincidencias={L.filtrado.coincidencias} filtroActivo={L.filtrado.activo} />
        <Lista
          pendientes={L.pendientes} comprados={L.comprados} compradosAbierto={compradosVisibles}
          filtroActivo={L.filtrado.activo} consulta={L.consulta} ocultos={L.ocultos} vacio={L.vacio}
          yo={L.yo} miembros={miembros} mercados={L.mercados} mercadoPrimero={L.mercadoPrimero} ahora={ahora}
          sugerencias={sugerencias} mostrarSugerencias={mostrarSugerencias}
          scrollA={L.scrollA} bolsillo={bolsilloRef} vuelos={vuelos}
          onToggle={L.toggle} onEditar={setEditando} onSugerencia={L.agregarTexto} onVolverAAnotar={onVolverAAnotar}
          onBorrarSugerencia={setSugPorOlvidar}
          onMoverAMercado={L.ponerMercado}
          onReintentar={() => location.reload()}
        />
      </main>
      <DoneBar
        cantidad={L.vaciar.cantidad} abierto={compradosAbierto} onToggleAbierto={() => setCompradosAbierto(v => !v)}
        llegadas={llegadas} bolsilloRef={bolsilloRef}
        confirmando={L.vaciar.confirmando} onPedirVaciar={L.vaciar.pedir} onConfirmarVaciar={L.vaciar.confirmar} onCancelarVaciar={L.vaciar.cancelar}
      />
      <BarraInput valor={L.consulta} onChange={L.setConsulta} accion={L.accion} onEnviar={L.enviar} autoFocus={anotar} onFoco={setInputConFoco} maxLen={textos.limites.textoMax} />
      <ToastView toast={L.toast} onCerrar={L.cerrarToast} onPausar={L.pausarToast} onReanudar={L.reanudarToast} />
      {medidor ? <Medidor /> : null}

      <QuienSos
        abierto={L.quienSosAbierto} miembros={miembros} yo={L.yo}
        onElegir={L.elegirYo} onCerrar={() => { L.cerrarQuienSos(); setCambiandoNombre(false); }}
        cambiarNombre={cambiandoNombre} onRenombrar={L.renombrarme}
      />
      {/* Borrar es secuencial: el sheet cierra (onCerrar) y llama onBorrar recién cuando terminó de bajar */}
      <EditarItem item={editando} yo={L.yo} miembros={miembros} ahora={ahora}
        mercados={L.mercados} sugerenciasMercados={SUGERENCIAS_MERCADOS}
        onGuardar={L.editar}
        onBorrar={L.borrar}
        onPonerMercado={L.ponerMercado}
        onCrearMercado={L.crearMercado}
        onBorrarMercado={L.borrarMercado}
        onCerrar={() => setEditando(null)}
      />
      {/* olvidar una sugerencia: la pregunta va en una tarjeta aparte, los chips no se mueven mientras decidís */}
      <Confirmar
        abierto={sugPorOlvidar !== null}
        titulo={textos.sugerencias.olvidarTitulo(sugPorOlvidar?.texto ?? '')}
        texto={textos.sugerencias.olvidarTexto}
        confirmar={textos.sugerencias.olvidarSi}
        onConfirmar={() => { if (sugPorOlvidar) L.borrarSugerencia(sugPorOlvidar.textoNorm, sugPorOlvidar.texto); setSugPorOlvidar(null); }}
        onCancelar={() => setSugPorOlvidar(null)}
      />
      <Accesos
        abierto={accesosAbierto}
        accesos={accesos} invitaciones={invitaciones} miembros={miembros}
        miUid={db.miUid()} duenio={L.vista?.lista?.duenio ?? null} nombreLista={L.vista?.lista?.nombre ?? ''} ahora={ahora}
        onExpulsar={(uid, quien) => void expulsar(uid, quien)}
        onRevocar={codigo => void revocar(codigo)}
        onReintentar={() => void refrescarAccesos()}
        onSalir={() => void salir()}
        onBorrarLista={() => void borrarLista()}
        onCerrar={() => setAccesosAbierto(false)}
      />
      <Menu
        abierto={menuAbierto} lista={L.vista?.lista ?? null} pendientes={pendientesItems} yo={L.yo}
        onMandarWhatsApp={mandarWhatsApp} onInvitar={invitar} onCopiarLink={copiarLink} onMandarLink={mandarLink}
        onAccesos={abrirAccesos} onRenombrar={renombrarLista}
        onCambiarNombre={onCambiarNombre}
        onExportar={exportar} onCerrar={() => setMenuAbierto(false)} onSalida={onSalidaMenu}
      />
    </div>
  );
}
