/**
 * Toast: uno a la vez, por encima de la barra de agregar. Entra desde abajo (y 16→0 + fade), sale con fade + 8px.
 * El contenedor role="status" aria-live="polite" está SIEMPRE en el árbol (aunque vacío) para que los lectores lo anuncien.
 * El timer se pausa con el dedo/mouse encima o con foco adentro (onPausar/onReanudar).
 *
 * Con un sheet abierto se pinta ADENTRO de él (portal a la capa de arriba, ver ui/capa.ts): un `<dialog>` modal vive en
 * la top layer del navegador y ningún z-index lo tapa, así que "Link copiado" quedaba escondido detrás del menú justo
 * cuando más falta hace. El aviso sigue siendo uno solo y el mismo nodo aria-live.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { ToastProps } from '@/ui/contratos';
import { textos } from '@/ui/textos';
import { dist, scl, spring } from '@/motion/tokens';
import { alCambiarCapa, capaDeArriba } from './capa';
import s from './Toast.module.css';

const ENTRA = { opacity: 0, y: dist.toastEnter };
const VISIBLE = { opacity: 1, y: 0 };
const SALE = { opacity: 0, y: dist.toastExit };

export function ToastView({ toast, onCerrar, onPausar, onReanudar }: ToastProps) {
  const [capa, setCapa] = useState<HTMLElement | null>(() => capaDeArriba());
  useEffect(() => { setCapa(capaDeArriba()); return alCambiarCapa(setCapa); }, []);

  const zona = (
    <div className={s.zona} role="status" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            className={s.toast}
            initial={ENTRA}
            animate={VISIBLE}
            exit={SALE}
            transition={spring.sheet}
            onPointerEnter={onPausar}
            onPointerLeave={onReanudar}
            onFocus={onPausar}
            onBlur={onReanudar}
          >
            <span className={s.texto}>{toast.texto}</span>
            {toast.accion && (
              <motion.button type="button" className={s.accion} onClick={toast.accion.onClick} whileTap={{ scale: scl.press }}>
                {toast.accion.etiqueta}
              </motion.button>
            )}
            <motion.button type="button" className={s.cerrar} onClick={onCerrar} aria-label={textos.toasts.cerrar} whileTap={{ scale: scl.press }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // el portal solo cuando hay un sheet abierto: sin eso, el toast vive donde siempre
  return capa ? createPortal(zona, capa) : zona;
}
