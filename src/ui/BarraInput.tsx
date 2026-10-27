/**
 * Barra fija de abajo: el input es filtro y alta a la vez, y el botón dice lo que va a pasar
 * ("Agregar «yogur»" / "Ya está" / "Volver a anotar «Yogur»"). Enter decide con la misma regla.
 * El input NUNCA cambia de tamaño mientras la lista se mueve: solo cambian el × de limpiar y el rótulo del botón.
 * Sube con el teclado por --kb-inset (useVisualViewport) y respeta safe-area-inset-bottom.
 * "Agregar" y ✕ no toman el foco con el puntero (ui/foco.ts): el input no hace blur y el teclado no se cierra
 * (modo ráfaga también a los toques, no solo con Enter).
 */
import { useEffect, useRef, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { BarraInputProps } from '@/ui/contratos';
import type { Accion } from '@/domain';
import { textos } from '@/ui/textos';
import { dur, scl, spring } from '@/motion/tokens';
import { useVisualViewport } from './useVisualViewport';
import { noRobarFoco } from './foco';
import s from './BarraInput.module.css';

function rotulo(a: Accion): string {
  switch (a.tipo) {
    case 'nada': return textos.input.agregar;
    case 'agregar': return textos.input.agregarX(a.texto);
    case 'yaEsta': return textos.input.yaEsta;
    case 'volver': return textos.input.volverX(a.item.texto);
  }
}

export function BarraInput({ valor, onChange, accion, onEnviar, autoFocus, onFoco, maxLen }: BarraInputProps) {
  const input = useRef<HTMLInputElement>(null);
  useVisualViewport();   // escribe --kb-inset; la barra lo lee por CSS

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    onEnviar();
    // modo ráfaga: el foco se queda (Enter tras Enter)
    input.current?.focus({ preventScroll: true });
  };
  const limpiar = () => { onChange(''); input.current?.focus({ preventScroll: true }); };

  const inactivo = accion.tipo === 'nada' || accion.tipo === 'yaEsta';
  const label = rotulo(accion);

  return (
    <form className={s.barra} onSubmit={onSubmit} aria-label={textos.input.label}>
      <div className={s.campo} data-con-texto={valor ? 'true' : 'false'}>
        {/* type="search" + name="buscar": el campo ES búsqueda (y alta). Con type="text" solo, Chrome Android lo toma
            por un posible usuario ("username-first flow": form con un único campo de texto + botón) y muestra la barra
            de contraseñas/tarjetas del teclado; autocomplete="off" no alcanza para el gestor de contraseñas. */}
        <input
          ref={input}
          className={s.input}
          type="search"
          name="buscar"
          value={valor}
          onChange={e => onChange(e.currentTarget.value)}
          onFocus={() => onFoco?.(true)}
          onBlur={() => onFoco?.(false)}
          placeholder={textos.input.placeholder}
          aria-label={textos.input.label}
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="sentences"
          autoCorrect="off"
          spellCheck={false}
          maxLength={maxLen}
          inputMode="text"
        />
        <span className={s.limpiarSlot}>
          <AnimatePresence initial={false}>
            {valor ? (
              <motion.button
                key="limpiar"
                type="button"
                className={s.limpiar}
                aria-label={textos.input.limpiar}
                onPointerDown={noRobarFoco}
                onClick={limpiar}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.fast }}
                whileTap={{ scale: scl.press }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </motion.button>
            ) : null}
          </AnimatePresence>
        </span>
      </div>
      <motion.button
        type="submit"
        className={s.boton}
        data-accion={accion.tipo}
        aria-disabled={inactivo ? true : undefined}
        title={label}
        onPointerDown={noRobarFoco}
        whileTap={{ scale: scl.press }}
        transition={spring.snappy}
      >
        <span className={s.slot}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={label}
              className={s.rotulo}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.fast }}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.button>
    </form>
  );
}
