/**
 * Bottom sheet genérico sobre <dialog> modal.
 *  - El <dialog> siempre está en el árbol; `showModal()` al abrir. Motion no puede animar el top layer, así que
 *    se anima el panel interno (sube desde abajo, spring.sheet) y un backdrop propio (fade). `dialog.close()`
 *    recién en onExitComplete.
 *  - Escape: se intercepta `cancel` (y keydown) → onCerrar; el cierre real lo decide el padre con `abierto`.
 *  - Foco: atrapado a mano (Tab cicla), al primer control cuando termina la entrada, y de vuelta al disparador al cerrar
 *    (si el disparador ya no existe: `focoAlCerrar`, y si no, <main>).
 *  - `onSalida`: se llama cuando terminó la salida, después de dialog.close() y de devolver el foco. Sirve para
 *    encadenar acciones secuenciales (borrar la fila, abrir otro sheet) sin solapar dos <dialog>.
 *  - Sin layout animations adentro: nada detrás se mueve ni se achica.
 */
import { Fragment, useCallback, useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { SheetProps } from '@/ui/contratos';
import { dur, ease, scl, spring } from '@/motion/tokens';
import { apilarCapa } from '@/ui/capa';
import s from './Sheet.module.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FOCO_FALLBACK = 'main';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute('aria-hidden') && !el.closest('[hidden]'));
}

export function Sheet({ abierto, onCerrar, titulo, labelledBy, describedBy, onEntrada, onSalida, focoAlCerrar, focoInicial = 'primero', variante = 'hoja', className, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previo = useRef<HTMLElement | null>(null);
  const abiertoRef = useRef(abierto);
  abiertoRef.current = abierto;
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;
  const onSalidaRef = useRef(onSalida);
  onSalidaRef.current = onSalida;
  const focoAlCerrarRef = useRef(focoAlCerrar);
  focoAlCerrarRef.current = focoAlCerrar;
  const focoInicialRef = useRef(focoInicial);
  focoInicialRef.current = focoInicial;
  /** baja de la pila de capas (ui/capa.ts); null cuando este sheet no está arriba de nada */
  const bajarCapa = useRef<(() => void) | null>(null);
  useEffect(() => () => { bajarCapa.current?.(); bajarCapa.current = null; }, []);
  const idTitulo = useId();
  const labelId = labelledBy ?? (titulo ? idTitulo : undefined);
  const centro = variante === 'centro';

  // abrir: guardar el foco previo y showModal (el foco pasa al panel, no a un control: el teclado no salta antes de tiempo)
  useEffect(() => {
    const d = dialogRef.current;
    if (!d || !abierto) return;
    if (d.open) return;
    const activo = document.activeElement;
    previo.current = activo instanceof HTMLElement && activo !== document.body ? activo : null;   // body = "nada enfocado"
    d.showModal();
    // desde acá los avisos (toasts) se pintan adentro de este diálogo: es la única forma de quedar por encima de la
    // top layer del navegador. Ver ui/capa.ts.
    bajarCapa.current?.();
    bajarCapa.current = apilarCapa(d);
    panelRef.current?.focus({ preventScroll: true });
  }, [abierto]);

  // Escape / cierre nativo (p.ej. close watcher del navegador que ignora preventDefault).
  // El evento `close` es asíncrono: se ignora si lo disparamos nosotros o si el dialog ya volvió a abrirse.
  const cierrePropio = useRef(false);
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); onCerrarRef.current(); };
    const onClose = () => {
      if (cierrePropio.current) { cierrePropio.current = false; return; }
      if (d.open || !abiertoRef.current) return;
      onCerrarRef.current();
    };
    d.addEventListener('cancel', onCancel);
    d.addEventListener('close', onClose);
    return () => { d.removeEventListener('cancel', onCancel); d.removeEventListener('close', onClose); };
  }, []);

  // desmontar con el sheet abierto: cerrar el dialog (sin avisar al padre)
  useEffect(() => () => { const d = dialogRef.current; if (d?.open) { cierrePropio.current = true; d.close(); } }, []);

  // terminó la salida: cerrar el dialog, devolver el foco (disparador → focoAlCerrar → <main>) y avisar con onSalida
  const cerrarDialog = useCallback(() => {
    const d = dialogRef.current;
    bajarCapa.current?.();
    bajarCapa.current = null;
    if (d?.open) { cierrePropio.current = true; d.close(); }
    const p = previo.current;
    previo.current = null;
    const destino = (p?.isConnected ? p : null) ?? focoAlCerrarRef.current?.() ?? document.querySelector<HTMLElement>(FOCO_FALLBACK);
    destino?.focus({ preventScroll: true });
    onSalidaRef.current?.();
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCerrarRef.current(); return; }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const f = focusables(panel);
    if (f.length === 0) { e.preventDefault(); panel.focus(); return; }
    const first = f[0]!, last = f[f.length - 1]!;
    const activo = document.activeElement;
    if (e.shiftKey) {
      if (activo === first || activo === panel || !panel.contains(activo)) { e.preventDefault(); last.focus(); }
    } else if (activo === last || !panel.contains(activo)) { e.preventDefault(); first.focus(); }
  }, []);

  const alEntrar = useCallback(() => {
    if (!abiertoRef.current) return;   // también se llama al terminar la salida
    const panel = panelRef.current;
    if (panel) {
      const activo = document.activeElement;
      // con foco 'panel' no movemos nada: ya quedó en el diálogo (el lector de pantalla lo anuncia igual) y así
      // un campo de texto como primer control no dispara el teclado
      if (focoInicialRef.current !== 'panel' && (activo === panel || !panel.contains(activo))) {
        (focusables(panel)[0] ?? panel).focus({ preventScroll: true });
      }
    }
    onEntrada?.();
  }, [onEntrada]);

  return (
    <dialog
      ref={dialogRef}
      className={s.dialog}
      aria-modal="true"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
    >
      <AnimatePresence onExitComplete={cerrarDialog}>
        {abierto && (
          <Fragment key="sheet">
            <motion.div
              key="backdrop"
              className={s.backdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.base }}
              onClick={onCerrar}
              aria-hidden="true"
              data-testid="sheet-backdrop"
            />
            <motion.div
              key="panel"
              ref={panelRef}
              className={[centro ? s.centro : s.panel, className].filter(Boolean).join(' ')}
              tabIndex={-1}
              /* la tarjeta centrada no se desliza: aparece en el lugar (mover algo detrás de una pregunta confunde) */
              initial={centro ? { opacity: 0, scale: scl.exit } : { y: '100%' }}
              animate={centro ? { opacity: 1, scale: 1 } : { y: 0 }}
              exit={centro ? { opacity: 0, scale: scl.exit } : { y: '100%' }}
              transition={centro ? { duration: dur.fast, ease: ease.out } : spring.sheet}
              onAnimationComplete={alEntrar}
            >
              {!centro && <div className={s.handle} aria-hidden="true" />}
              {titulo && <h2 id={idTitulo} className={s.titulo}>{titulo}</h2>}
              {children}
            </motion.div>
          </Fragment>
        )}
      </AnimatePresence>
    </dialog>
  );
}
