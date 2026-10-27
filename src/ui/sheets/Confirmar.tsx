/**
 * Pregunta de sí o no para algo destructivo: tarjeta centrada (Sheet variante="centro"), no mueve nada de lo que
 * hay atrás. Antes esto se hacía transformando el propio control en "¿Borrar? Sí"; con textos de largo distinto,
 * el control cambiaba de ancho y reacomodaba a los vecinos justo cuando había que apuntarle.
 * El foco arranca en Cancelar (la salida segura); Escape y el fondo cancelan.
 * El texto de abajo dice QUÉ se pierde (y con D26, CUÁL llave): pintarlo adentro no alcanza para que se escuche
 * —al abrir se anuncian el nombre del diálogo y el control enfocado—, así que va como su `aria-describedby`.
 * Al cerrar, el foco vuelve al disparador; pero acá el disparador suele ser justo lo que se acaba de borrar, así
 * que `focoAlCerrar` (el cable de `Sheet`) se reexporta: quien pregunta es el único que sabe qué le sobrevive.
 */
import { useId } from 'react';
import { motion } from 'motion/react';
import type { ConfirmarProps } from '@/ui/contratos';
import { textos } from '@/ui/textos';
import { scl } from '@/motion/tokens';
import { Sheet } from './Sheet';
import c from '@/ui/controles.module.css';
import s from './Confirmar.module.css';

export function Confirmar({ abierto, titulo, texto, confirmar, onConfirmar, onCancelar, focoAlCerrar }: ConfirmarProps) {
  const idTexto = useId();
  return (
    <Sheet abierto={abierto} onCerrar={onCancelar} titulo={titulo} variante="centro" describedBy={texto ? idTexto : undefined} focoAlCerrar={focoAlCerrar}>
      {texto && <p id={idTexto} className={s.texto}>{texto}</p>}
      <div className={c.acciones}>
        <span className={c.espacio} />
        <motion.button type="button" className={c.texto} onClick={onCancelar} whileTap={{ scale: scl.press }}>
          {textos.confirmar.cancelar}
        </motion.button>
        <motion.button type="button" className={c.peligro} onClick={onConfirmar} whileTap={{ scale: scl.press }}>
          {confirmar}
        </motion.button>
      </div>
    </Sheet>
  );
}
