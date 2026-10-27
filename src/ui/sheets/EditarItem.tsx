/**
 * Sheet del ítem: su nombre, dónde se compra y las acciones (D15).
 *
 * Al abrir, el foco queda en el DIÁLOGO, no en el campo de texto (`focoInicial="panel"`): así no salta el teclado
 * cada vez que tocás una fila. El nombre se enfoca solo si lo tocás vos.
 * El súper se elige con chips y se aplica al Guardar, igual que el texto: un solo modelo mental, y Cancelar
 * no deja nada a medias. Si elegiste un súper que todavía no existe (un preset o uno escrito), se crea recién ahí.
 * Borrar es secuencial: primero se cierra el sheet (onCerrar) y recién cuando terminó de bajar (onSalida del Sheet)
 * se llama onBorrar(id): la fila se va después, no debajo del sheet. El toast con Deshacer lo maneja quien llama.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { EditarItemProps } from '@/ui/contratos';
import type { Item } from '@/db/types';
import { haceCuanto, mercadoLlamado, nombreDe } from '@/domain';
import { textos } from '@/ui/textos';
import { scl } from '@/motion/tokens';
import { Chip } from '@/ui/Chip';
import { Confirmar } from './Confirmar';
import { Sheet } from './Sheet';
import c from '@/ui/controles.module.css';
import s from './EditarItem.module.css';

const MAX = textos.limites.textoMax;

export function EditarItem({ item, yo, miembros, mercados, sugerenciasMercados, ahora, onGuardar, onBorrar, onPonerMercado, onCrearMercado, onBorrarMercado, onCerrar }: EditarItemProps) {
  // el último ítem se conserva mientras el sheet sale (item ya es null)
  const [ultimo, setUltimo] = useState<Item | null>(item);
  const [texto, setTexto] = useState(item?.texto ?? '');
  /** súper elegido: id existente, o null = "en cualquiera" */
  const [mercadoSel, setMercadoSel] = useState<string | null>(item?.mercado ?? null);
  /** súper elegido que TODAVÍA no existe (preset o escrito): se crea al guardar */
  const [mercadoNuevo, setMercadoNuevo] = useState<string | null>(null);
  const [escribiendoMercado, setEscribiendoMercado] = useState(false);
  const [nombreMercado, setNombreMercado] = useState('');
  const [guardando, setGuardando] = useState(false);
  /** súper con el borrado armado por pulsación larga (el segundo toque lo confirma; se desarma solo) */
  const [porBorrar, setPorBorrar] = useState<string | null>(null);
  if (item && item !== ultimo) {
    setUltimo(item);
    setTexto(item.texto);
    setMercadoSel(item.mercado ?? null);
    setMercadoNuevo(null);
    setEscribiendoMercado(false);
    setNombreMercado('');
    setGuardando(false);
    setPorBorrar(null);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const idInput = useId();
  const idNuevo = useId();
  // id a borrar cuando el sheet termine de salir (null = la salida no es por Borrar)
  const borrarPendiente = useRef<string | null>(null);
  // si se vuelve a abrir antes de que termine la salida, la salida se cancela y no hay que borrar nada
  useEffect(() => { if (item) borrarPendiente.current = null; }, [item]);

  const limpio = texto.replace(/\s+/g, ' ').trim();
  const mercadoOriginal = ultimo?.mercado ?? null;
  const cambioTexto = !!ultimo && limpio !== '' && limpio !== ultimo.texto;
  const cambioMercado = mercadoNuevo !== null || mercadoSel !== mercadoOriginal;
  const puedeGuardar = !!ultimo && limpio !== '' && (cambioTexto || cambioMercado) && !guardando;

  const guardar = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ultimo || !puedeGuardar) return;
    setGuardando(true);
    if (cambioMercado) {
      let id = mercadoSel;
      if (mercadoNuevo !== null) {
        id = await onCrearMercado(mercadoNuevo);
        if (id === null) { setGuardando(false); return; }   // no se pudo crear: el sheet queda abierto (ya hay toast)
      }
      onPonerMercado(ultimo.id, id);
    }
    if (cambioTexto) onGuardar(ultimo.id, limpio);
    onCerrar();
  }, [ultimo, puedeGuardar, cambioMercado, cambioTexto, mercadoSel, mercadoNuevo, onCrearMercado, onPonerMercado, onGuardar, limpio, onCerrar]);

  const borrar = useCallback(() => {
    if (!ultimo) return;
    borrarPendiente.current = ultimo.id;
    onCerrar();
  }, [ultimo, onCerrar]);

  const alSalir = useCallback(() => {
    const id = borrarPendiente.current;
    borrarPendiente.current = null;
    if (id) onBorrar(id);
  }, [onBorrar]);

  // borrado de un súper: la pulsación larga abre la pregunta; confirmar borra (con Deshacer en el toast de afuera)
  const confirmarBorrado = useCallback(() => {
    const id = porBorrar;
    setPorBorrar(null);
    if (!id) return;
    // si el ítem estaba en ese súper, vuelve a "en cualquiera" acá también (el Db ya lo lee así)
    setMercadoSel(sel => (sel === id ? null : sel));
    onBorrarMercado(id);
  }, [porBorrar, onBorrarMercado]);

  const elegir = useCallback((id: string | null) => { setMercadoSel(id); setMercadoNuevo(null); setEscribiendoMercado(false); }, []);
  const elegirNuevo = useCallback((nombre: string) => { setMercadoNuevo(nombre); setMercadoSel(null); setEscribiendoMercado(false); setNombreMercado(''); }, []);
  const confirmarNuevo = useCallback(() => {
    const n = nombreMercado.replace(/\s+/g, ' ').trim();
    if (!n) return;
    // si ya existe uno con ese nombre, es ese: no creamos un duplicado
    const ya = mercadoLlamado(n, mercados);
    if (ya) elegir(ya.id); else elegirNuevo(n);
  }, [nombreMercado, mercados, elegir, elegirNuevo]);

  const meta = ultimo
    ? textos.editar.anoto(nombreDe(ultimo.agregadoPor, ultimo.agregadoPorNombre, miembros, yo, textos.meta), haceCuanto(ultimo.agregadoEn, ahora))
    : '';
  // presets: solo los que todavía no existen (se van gastando a medida que los crean)
  const presets = sugerenciasMercados.filter(n => !mercadoLlamado(n, mercados) && n !== mercadoNuevo);

  return (
    <Sheet abierto={item !== null} onCerrar={onCerrar} titulo={textos.editar.titulo} focoInicial="panel" onSalida={alSalir}>
      <form className={s.form} onSubmit={guardar} noValidate>
        <div>
          <label htmlFor={idInput} className="sr-only">{textos.editar.label}</label>
          <input
            id={idInput}
            ref={inputRef}
            className={c.campo}
            type="text"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            maxLength={MAX}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
          />
          {ultimo && <p className={s.meta}>{meta}</p>}
        </div>

        <fieldset className={s.donde}>
          <legend className={c.label}>{textos.editar.donde}</legend>
          <div className={s.chips}>
            <Chip seleccionado={mercadoSel === null && mercadoNuevo === null} onClick={() => elegir(null)} ariaLabel={textos.editar.sinMercado}>
              {textos.editar.enCualquiera}
            </Chip>
            {mercados.map(m => (
              <Chip
                key={m.id}
                seleccionado={mercadoSel === m.id}
                onClick={() => elegir(m.id)}
                onMantener={() => setPorBorrar(m.id)}
                ariaLabel={textos.editar.elegirMercado(m.nombre)}
              >
                {m.nombre}
              </Chip>
            ))}
            {mercadoNuevo !== null ? (
              <Chip seleccionado onClick={() => elegir(null)} ariaLabel={textos.editar.elegirMercado(mercadoNuevo)}>{mercadoNuevo}</Chip>
            ) : null}
            {presets.map(n => (
              <Chip key={n} onClick={() => elegirNuevo(n)} ariaLabel={textos.editar.elegirMercado(n)} icono={<PlusIcon />}>{n}</Chip>
            ))}
            {!escribiendoMercado ? (
              <Chip onClick={() => setEscribiendoMercado(true)} icono={<PlusIcon />}>{textos.editar.otroMercado}</Chip>
            ) : null}
          </div>
          {escribiendoMercado ? (
            <div className={s.nuevo}>
              <label htmlFor={idNuevo} className="sr-only">{textos.editar.nuevoMercado}</label>
              <input
                id={idNuevo}
                className={c.campo}
                type="text"
                value={nombreMercado}
                onChange={e => setNombreMercado(e.target.value)}
                placeholder={textos.editar.nuevoMercado}
                maxLength={textos.limites.mercadoMax}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="done"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmarNuevo(); } }}
              />
              <motion.button type="button" className={`${c.secundario} ${s.nuevoBoton}`} onClick={confirmarNuevo} disabled={nombreMercado.trim() === ''} whileTap={{ scale: scl.press }}>
                {textos.editar.agregarMercado}
              </motion.button>
            </div>
          ) : null}
        </fieldset>

        <div className={c.acciones}>
          <motion.button type="button" className={c.peligro} onClick={borrar} whileTap={{ scale: scl.press }}>
            {textos.editar.borrar}
          </motion.button>
          <span className={c.espacio} />
          <motion.button type="button" className={c.texto} onClick={onCerrar} whileTap={{ scale: scl.press }}>
            {textos.editar.cancelar}
          </motion.button>
          <motion.button type="submit" className={`${c.primario} ${s.guardar}`} disabled={!puedeGuardar} whileTap={{ scale: scl.press }}>
            {textos.editar.guardar}
          </motion.button>
        </div>
      </form>

      {/* la pregunta va en una tarjeta aparte: las píldoras no se mueven de lugar mientras decidís */}
      <Confirmar
        abierto={porBorrar !== null}
        titulo={textos.editar.borrarMercadoTitulo(mercados.find(m => m.id === porBorrar)?.nombre ?? '')}
        texto={textos.editar.borrarMercadoTexto}
        confirmar={textos.editar.borrarMercadoSi}
        onConfirmar={confirmarBorrado}
        onCancelar={() => setPorBorrar(null)}
      />
    </Sheet>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
