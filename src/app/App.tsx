/**
 * Raíz: router mínimo + MotionConfig. La app no sabe desde dónde la abrieron: solo ve la URL.
 */
import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import type { Cuenta, Db, ListaResumen } from '@/db/types';
import { escucharRuta, navegar, rutaActual, type Ruta } from './router';
import { PantallaLista } from './PantallaLista';
import { Home } from '@/ui/Home';
import { leerUltimaLista, olvidarUltimaLista } from '@/identidad/yo';
import { spring } from '@/motion/tokens';

const esDemo = (): boolean => typeof __DEMO__ !== 'undefined' && __DEMO__;

export function App({ db }: { db: Db }) {
  const [ruta, setRuta] = useState<Ruta>(() => rutaActual());
  useEffect(() => escucharRuta(setRuta), []);

  /**
   * El índice "Tus listas" (D22 · Etapa 2). El recuerdo local pinta al instante (y aguanta sin señal); el índice
   * del servidor —las llaves de este dispositivo— lo completa y lo corrige. La ranura local dejó de ser la única
   * memoria: era una sola y se pisaba en cada apertura.
   */
  const [listas, setListas] = useState<ListaResumen[] | null>(null);
  useEffect(() => {
    if (ruta.tipo !== 'home') return;
    let vivo = true;
    const ultima = leerUltimaLista();
    setListas(ultima ? [{ id: ultima.id, nombre: ultima.nombre }] : null);
    void db.misListas().then(filas => {
      // el servidor habló: SU lista es la verdad. El recuerdo local no se mezcla — si tu lista no está acá,
      // es que la borraron o te echaron, y mantenerla sería un botón a una puerta cerrada.
      if (vivo) setListas(filas);
    }).catch(() => { /* sin señal: queda el recuerdo local */ });
    return () => { vivo = false; };
  }, [db, ruta]);

  /**
   * La cuenta (D23): estado para la Home. En demo no hay cuentas (la prop queda ausente y la Home no la nombra).
   * Se pregunta al entrar a la home; miCuenta espera a la auth y al regreso de Google, así que también cubre
   * la vuelta de una redirección (que es una carga de página nueva y pasa por acá).
   */
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  useEffect(() => {
    if (esDemo() || ruta.tipo !== 'home') return;
    let vivo = true;
    void db.miCuenta().then(x => { if (vivo) setCuenta(x); }, () => { /* sin auth: la Home no ofrece nada */ });
    return () => { vivo = false; };
  }, [db, ruta]);

  const guardarCuenta = useCallback(async () => {
    await db.guardarCuenta();
    // con el Db real no se llega acá (la página se fue a Google); con el fake la cuenta ya quedó: refrescar
    setCuenta(await db.miCuenta());
  }, [db]);
  const entrarConCuenta = useCallback(async () => {
    // El olvido va ANTES del viaje: con el Db real la redirección se lleva la página y lo de después de un
    // await que no resuelve no corre nunca — la vuelta de Google pintaría la lista recordada de la identidad
    // ANTERIOR (lo cazó la revisión). Olvidarlo siempre es seguro: es un caché que se repuebla al abrir
    // cualquier lista, y el índice del servidor manda igual.
    olvidarUltimaLista();
    await db.entrarConCuenta();
    // canje del choque (el único camino que resuelve): identidad nueva, la app entera se re-deriva de cero
    location.reload();
  }, [db]);

  const volver = useCallback(() => navegar({ tipo: 'home' }), []);

  // Modo demo (artifact, sin servidor): si no hay una lista abierta ni recordada, entrar directo a la de ejemplo.
  useEffect(() => {
    if (!esDemo()) return;
    if (ruta.tipo !== 'home' || leerUltimaLista()) return;
    const demoId = (db as { listaDemoId?: () => string | null }).listaDemoId?.();
    if (demoId) navegar({ tipo: 'lista', listId: demoId, anotar: false }, true);
  }, [db, ruta.tipo]);

  const crear = useCallback(async (nombre: string, miembros: string[]) => {
    const id = await db.crearLista(nombre, miembros);
    navegar({ tipo: 'lista', listId: id, anotar: false });
  }, [db]);
  const abrir = useCallback((listId: string) => navegar({ tipo: 'lista', listId, anotar: false }), []);

  return (
    <MotionConfig reducedMotion="user" transition={spring.snappy}>
      {ruta.tipo === 'lista'
        ? <PantallaLista key={ruta.listId} db={db} listId={ruta.listId} anotar={ruta.anotar} onVolver={volver} />
        : (
          <Home
            listas={listas} onCrear={crear} onAbrir={abrir}
            cuenta={esDemo() ? undefined : cuenta} onGuardarCuenta={guardarCuenta} onEntrarConCuenta={entrarConCuenta}
          />
        )}
    </MotionConfig>
  );
}
