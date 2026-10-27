import { useCallback, useEffect, useRef, useState } from 'react';
import { timing } from '@/domain/timing';

export interface Toast {
  id: number;
  texto: string;
  accion?: { etiqueta: string; onClick: () => void };
  /** ms; default TOAST_MS */
  duracion?: number;
}

/** ¿El evento nació en un campo de texto con contenido? Ahí Ctrl+Z es del navegador (deshacer tipeo). */
function enCampoConTexto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target.value.length > 0;
  return target.isContentEditable && (target.textContent ?? '').length > 0;
}

/**
 * Un toast a la vez (el nuevo reemplaza al anterior). El timer se pausa mientras el dedo/mouse está encima.
 * A11y (mientras el toast tiene acción): Ctrl/Cmd+Z fuera de un input con texto dispara la acción (Deshacer);
 * Tab / Shift+Tab re-arman el timer a TOAST_MS para dar tiempo a llegar al botón.
 */
export function useToasts() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restante = useRef<number>(0);
  const inicio = useRef<number>(0);
  const seq = useRef(0);

  const limpiarTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const cerrar = useCallback((id?: number) => {
    setToast(t => (id === undefined || t?.id === id ? null : t));
    limpiarTimer();
  }, []);

  const arrancar = useCallback((ms: number, id: number) => {
    limpiarTimer();
    restante.current = ms; inicio.current = Date.now();
    timer.current = setTimeout(() => cerrar(id), ms);
  }, [cerrar]);

  const mostrar = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToast({ ...t, id });
    arrancar(t.duracion ?? timing().TOAST_MS, id);
    return id;
  }, [arrancar]);

  const pausar = useCallback(() => {
    if (!timer.current) return;
    restante.current = Math.max(0, restante.current - (Date.now() - inicio.current));
    limpiarTimer();
  }, []);
  const reanudar = useCallback(() => { if (toast && !timer.current) arrancar(Math.max(restante.current, timing().TOAST_RESUME_MIN_MS), toast.id); }, [toast, arrancar]);

  // teclado global mientras hay un toast con acción
  useEffect(() => {
    if (!toast?.accion || typeof window === 'undefined') return;
    const { id, accion } = toast;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') { arrancar(timing().TOAST_MS, id); return; }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (enCampoConTexto(e.target)) return;
        e.preventDefault();
        accion.onClick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast, arrancar]);

  useEffect(() => () => limpiarTimer(), []);

  return { toast, mostrar, cerrar, pausar, reanudar };
}
