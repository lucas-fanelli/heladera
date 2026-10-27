/**
 * Sheet "¿Quién sos?": identidad en un tap (chip) o con "Otro nombre…". Descartable (Escape / backdrop / "Ahora no").
 * Modo cambiarNombre: mismo sheet con el nombre actual editable ("Guardar" → onRenombrar); elegir otro chip cambia de persona.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { QuienSosProps } from '@/ui/contratos';
import type { Miembro } from '@/db/types';
import { buscarPorNombre, validarNombre } from '@/domain';
import { textos } from '@/ui/textos';
import { scl } from '@/motion/tokens';
import { Sheet } from './Sheet';
import c from '@/ui/controles.module.css';
import s from './QuienSos.module.css';

const MAX = textos.limites.nombreMax;

export function QuienSos({ abierto, miembros, yo, onElegir, onCerrar, cambiarNombre = false, onRenombrar }: QuienSosProps) {
  const [elegido, setElegido] = useState<string | null>(yo.memberId);
  const [otro, setOtro] = useState(false);
  const [nombre, setNombre] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idInput = useId();
  const idError = useId();
  const idGrupo = useId();

  // al abrir: estado limpio (en modo cambiar, el nombre actual)
  useEffect(() => {
    if (!abierto) return;
    setElegido(yo.memberId);
    setOtro(false);
    setNombre(cambiarNombre ? (yo.nombre ?? '') : '');
    setTocado(false);
    setEnviando(false);
  }, [abierto, cambiarNombre, yo.memberId, yo.nombre]);

  const editandoMiNombre = cambiarNombre && !otro && elegido !== null && elegido === yo.memberId;
  const conInput = otro || editandoMiNombre;
  const validacion = useMemo(() => validarNombre(nombre, MAX), [nombre]);
  const nombreValido = validacion.ok ? validacion.nombre : null;
  /** el nombre escrito ya existe (y no soy yo) → "¿Sos vos, X?" */
  const coincidencia: Miembro | null = useMemo(() => {
    if (!conInput || !nombreValido) return null;
    const m = buscarPorNombre(miembros, nombreValido);
    return m && m.id !== yo.memberId ? m : null;
  }, [conInput, nombreValido, miembros, yo.memberId]);

  const error = !validacion.ok && (tocado || validacion.motivo === 'largo')
    ? (validacion.motivo === 'vacio' ? textos.quienSos.nombreVacio : textos.quienSos.nombreLargo(MAX))
    : null;

  const puedeEnviar = !enviando && (
    editandoMiNombre ? (nombreValido !== null && nombreValido !== yo.nombre && !coincidencia)
      : otro ? (nombreValido !== null && !coincidencia)
        : elegido !== null
  );

  const elegir = useCallback(async (opts: { memberId?: string; nombre?: string }) => {
    setEnviando(true);
    try { await onElegir(opts); } finally { setEnviando(false); }
  }, [onElegir]);

  const enviar = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (conInput) setTocado(true);
    if (!puedeEnviar) return;
    if (editandoMiNombre && nombreValido) { onRenombrar?.(nombreValido); onCerrar(); return; }
    if (otro && nombreValido) { void elegir({ nombre: nombreValido }); return; }
    if (elegido) void elegir({ memberId: elegido });
  }, [conInput, puedeEnviar, editandoMiNombre, nombreValido, onRenombrar, onCerrar, otro, elegir, elegido]);

  const tocarChip = (id: string) => { setElegido(id); setOtro(false); setTocado(false); };
  const tocarOtro = () => { setOtro(true); setElegido(null); setNombre(''); setTocado(false); };
  const noOtro = () => { setNombre(''); setTocado(false); inputRef.current?.focus(); };

  // el input de "Otro nombre…" recibe el foco al desplegarse
  useEffect(() => { if (otro) inputRef.current?.focus(); }, [otro]);

  // Al abrir NO se enfoca ningún campo (D15, mismo criterio que el sheet del ítem): enfocar el nombre hacía que la
  // vista bajara al input y después subiera el teclado, con el sheet entrando en el medio — un zigzag. El foco queda
  // en el diálogo y el teclado sale solo si tocás el campo (o si desplegás "Otro nombre…", que sí lo pediste).

  const titulo = cambiarNombre ? textos.quienSos.cambiar : textos.quienSos.titulo;
  const primario = editandoMiNombre ? textos.quienSos.guardar : textos.quienSos.soyYo;

  return (
    <Sheet abierto={abierto} onCerrar={onCerrar} titulo={titulo} focoInicial="panel">
      <form className={s.form} onSubmit={enviar} noValidate>
        {!cambiarNombre && <p className={s.texto}>{textos.quienSos.texto}</p>}

        <div className={s.chips} role="group" aria-labelledby={idGrupo}>
          <span id={idGrupo} className="sr-only">{textos.quienSos.miembrosLabel}</span>
          {miembros.map(m => (
            <motion.button
              key={m.id}
              type="button"
              className={s.chip}
              aria-pressed={elegido === m.id && !otro}
              onClick={() => tocarChip(m.id)}
              whileTap={{ scale: scl.chip }}
            >
              <span className={s.dot} style={{ background: `var(--${m.color})` }} aria-hidden="true" />
              <span className={s.chipNombre}>{m.nombre}</span>
              {m.id === yo.memberId && <span className={s.actual}>{textos.quienSos.actual}</span>}
            </motion.button>
          ))}
          <motion.button
            type="button"
            className={s.chip}
            aria-pressed={otro}
            aria-expanded={otro}
            aria-controls={otro ? idInput : undefined}
            onClick={tocarOtro}
            whileTap={{ scale: scl.chip }}
          >
            <span className={s.chipNombre}>{textos.quienSos.otroNombre}</span>
          </motion.button>
        </div>

        {conInput && (
          <div className={s.campo}>
            <label htmlFor={idInput} className={c.label}>{textos.quienSos.otroNombreLabel}</label>
            <input
              id={idInput}
              ref={inputRef}
              className={c.campo}
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              onBlur={() => setTocado(true)}
              maxLength={MAX}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? idError : undefined}
            />
            {error && <p id={idError} className={c.error} role="alert">{error}</p>}
          </div>
        )}

        {coincidencia && (
          <div className={s.sosVos} role="group" aria-label={textos.quienSos.sosVos(coincidencia.nombre)}>
            <p className={s.sosVosTexto}>{textos.quienSos.sosVos(coincidencia.nombre)}</p>
            <div className={s.sosVosBotones}>
              <motion.button type="button" className={c.secundario} onClick={() => void elegir({ memberId: coincidencia.id })} disabled={enviando} whileTap={{ scale: scl.press }}>
                {textos.quienSos.siSoyYo}
              </motion.button>
              <motion.button type="button" className={c.texto} onClick={noOtro} whileTap={{ scale: scl.press }}>
                {textos.quienSos.noOtro}
              </motion.button>
            </div>
          </div>
        )}

        <div className={s.pie}>
          <motion.button type="submit" className={c.primario} disabled={!puedeEnviar} whileTap={{ scale: scl.press }}>
            {primario}
          </motion.button>
          <motion.button type="button" className={`${c.texto} ${s.ahoraNo}`} onClick={onCerrar} whileTap={{ scale: scl.press }}>
            {textos.quienSos.cerrar}
          </motion.button>
        </div>
      </form>
    </Sheet>
  );
}
