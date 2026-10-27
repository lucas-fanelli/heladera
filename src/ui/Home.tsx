/**
 * Pantalla "/": abrir tus listas o crear una nueva (nombre + hasta 4 personas). Sin cuentas obligatorias:
 * la cuenta (D23) es una oferta para que el acceso sobreviva al dispositivo, no una puerta de entrada.
 */
import { useId, useState } from 'react';
import { motion } from 'motion/react';
import type { HomeProps } from '@/ui/contratos';
import { textos } from '@/ui/textos';
import { scl } from '@/motion/tokens';
import { Confirmar } from '@/ui/sheets/Confirmar';
import c from '@/ui/controles.module.css';
import s from './Home.module.css';

const N_MIEMBROS = 4;

export function Home({ listas, onCrear, onAbrir, cuenta, onGuardarCuenta, onEntrarConCuenta }: HomeProps) {
  const [nombre, setNombre] = useState<string>(textos.home.nombreListaDefault);
  const [miembros, setMiembros] = useState<string[]>(() => Array.from({ length: N_MIEMBROS }, () => ''));
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** qué viaje de cuenta está en curso (guardar o entrar): el botón que lo disparó muestra su rótulo ocupado */
  const [viajando, setViajando] = useState<'guardar' | 'entrar' | null>(null);
  const [errorCuenta, setErrorCuenta] = useState(false);
  const [confirmandoEntrar, setConfirmandoEntrar] = useState(false);
  const idNombre = useId();
  const idMiembros = useId();
  const idAyuda = useId();
  const idError = useId();

  const setMiembro = (i: number, v: string) => setMiembros(ms => ms.map((m, j) => (j === i ? v : m)));

  const hayListas = (listas?.length ?? 0) > 0;
  /**
   * Va a Google (o canjea el choque). Con el Db real la redirección se lleva la página (la promesa no resuelve)
   * y si resuelve es que la cuenta quedó: la sección cambia o la app se recarga. En los dos finales felices los
   * botones se quedan ocupados a propósito — re-habilitarlos con la recarga en vuelo era una ventanita para un
   * segundo viaje. Solo un fallo (p. ej. sin señal, antes de irse) los devuelve.
   */
  const viajar = async (que: 'guardar' | 'entrar', accion?: () => Promise<void>) => {
    if (!accion || viajando) return;
    setViajando(que);
    setErrorCuenta(false);
    try {
      await accion();
    } catch {
      setErrorCuenta(true);
      setViajando(null);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creando) return;
    const n = nombre.replace(/\s+/g, ' ').trim() || textos.home.nombreListaDefault;
    const ms = miembros.map(m => m.replace(/\s+/g, ' ').trim()).filter(Boolean);
    setCreando(true);
    setError(null);
    try {
      await onCrear(n, ms);
    } catch {
      setError(textos.errores.desconocido);
      setCreando(false);
    }
  };

  return (
    <main className={s.home}>
      <div className={s.contenido}>
        <header className={s.cabecera}>
          <p className={s.marca}>{textos.app.nombre}</p>
          <h1 className={s.titulo}>{textos.home.titulo}</h1>
          <p className={s.texto}>{textos.home.texto}</p>
        </header>

        {listas && listas.length > 0 && (
          <section className={s.ultima} aria-label={textos.home.tusListas}>
            {listas.length > 1 && <h2 className={s.subtitulo}>{textos.home.tusListas}</h2>}
            <ul className={s.listas}>
              {listas.map(l => (
                <li key={l.id}>
                  <motion.button type="button" className={c.primario} onClick={() => onAbrir(l.id)} whileTap={{ scale: scl.press }}>
                    {textos.home.abrirUltima(l.nombre || textos.home.nombreListaDefault)}
                  </motion.button>
                </li>
              ))}
            </ul>
            <p className={s.oNueva}>{textos.home.oNueva}</p>
          </section>
        )}

        {cuenta && (cuenta.estado !== 'anonima' || hayListas) && (
          <section className={s.cuenta} aria-label={textos.cuenta.titulo}>
            {cuenta.estado === 'guardada' && (
              <p className={s.cuentaTexto}>{cuenta.email ? textos.cuenta.guardada(cuenta.email) : textos.cuenta.guardadaSinEmail}</p>
            )}
            {cuenta.estado === 'anonima' && (
              <>
                <p className={s.cuentaTexto}>{textos.cuenta.anonima}</p>
                <motion.button type="button" className={c.secundario} disabled={viajando !== null} onClick={() => void viajar('guardar', onGuardarCuenta)} whileTap={{ scale: scl.press }}>
                  {viajando === 'guardar' ? textos.cuenta.llevando : textos.cuenta.guardar}
                </motion.button>
              </>
            )}
            {cuenta.estado === 'choque' && (
              <>
                <p className={s.cuentaTexto}>{cuenta.email ? textos.cuenta.choque(cuenta.email) : textos.cuenta.choqueSinEmail}</p>
                <div className={s.cuentaAcciones}>
                  {/* sin disabled: al cerrar la pregunta, el foco vuelve acá (un disabled lo mandaría al body).
                      La guarda de `viajar` ya impide un segundo viaje; el rótulo cuenta que está en eso. */}
                  <motion.button type="button" className={c.secundario} onClick={() => { if (!viajando) setConfirmandoEntrar(true); }} whileTap={{ scale: scl.press }}>
                    {viajando === 'entrar' ? textos.cuenta.entrando : textos.cuenta.choqueEntrar}
                  </motion.button>
                  <motion.button type="button" className={c.texto} disabled={viajando !== null} onClick={() => void viajar('guardar', onGuardarCuenta)} whileTap={{ scale: scl.press }}>
                    {viajando === 'guardar' ? textos.cuenta.llevando : textos.cuenta.choqueOtra}
                  </motion.button>
                </div>
              </>
            )}
            {errorCuenta && <p className={c.error} role="alert">{textos.cuenta.error}</p>}
          </section>
        )}

        <form className={s.form} onSubmit={crear} noValidate aria-busy={creando}>
          <h2 className={s.subtitulo}>{textos.home.crear}</h2>
          <div className={s.campo}>
            <label htmlFor={idNombre} className={c.label}>{textos.home.nombreLista}</label>
            <input
              id={idNombre}
              className={c.campo}
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              maxLength={textos.limites.listaMax}
              autoComplete="off"
              autoCapitalize="sentences"
              enterKeyHint="next"
              disabled={creando}
            />
          </div>

          <fieldset className={s.miembros} aria-describedby={idAyuda}>
            <legend id={idMiembros} className={c.label}>{textos.home.miembros}</legend>
            <div className={s.grilla}>
              {miembros.map((m, i) => (
                <div key={i} className={s.campo}>
                  <label htmlFor={`${idMiembros}-${i}`} className="sr-only">{textos.home.miembroLabel(i + 1)}</label>
                  <input
                    id={`${idMiembros}-${i}`}
                    className={c.campo}
                    type="text"
                    value={m}
                    onChange={e => setMiembro(i, e.target.value)}
                    placeholder={textos.home.miembroEjemplos[i] ?? ''}
                    maxLength={textos.limites.nombreMax}
                    autoComplete="off"
                    autoCapitalize="words"
                    enterKeyHint={i === N_MIEMBROS - 1 ? 'done' : 'next'}
                    disabled={creando}
                  />
                </div>
              ))}
            </div>
            <p id={idAyuda} className={c.ayuda}>{textos.home.miembrosAyuda}</p>
          </fieldset>

          {error && <p id={idError} className={c.error} role="alert">{error}</p>}

          <motion.button type="submit" className={c.primario} disabled={creando} whileTap={{ scale: scl.press }}>
            {creando ? textos.home.creando : textos.home.crear}
          </motion.button>
        </form>

        <p className={s.nota}>{textos.home.yaTengoLink}</p>

        {/* dispositivo sin listas: la vuelta a casa. En uno CON listas este botón no existe: entrar con una
            cuenta acá cambiaría la identidad y escondería lo que hay (ese camino pasa por guardar → choque). */}
        {cuenta?.estado === 'anonima' && listas !== null && !hayListas && (
          <section className={s.cuenta} aria-label={textos.cuenta.titulo}>
            <p className={s.cuentaTexto}>{textos.cuenta.entrarPregunta}</p>
            <motion.button type="button" className={c.secundario} disabled={viajando !== null} onClick={() => void viajar('entrar', onEntrarConCuenta)} whileTap={{ scale: scl.press }}>
              {viajando === 'entrar' ? textos.cuenta.llevando : textos.cuenta.entrar}
            </motion.button>
            {errorCuenta && <p className={c.error} role="alert">{textos.cuenta.error}</p>}
          </section>
        )}
      </div>

      <Confirmar
        abierto={confirmandoEntrar}
        titulo={textos.cuenta.cambiarTitulo}
        texto={textos.cuenta.cambiarTexto}
        confirmar={textos.cuenta.cambiarSi}
        onConfirmar={() => { setConfirmandoEntrar(false); void viajar('entrar', onEntrarConCuenta); }}
        onCancelar={() => setConfirmandoEntrar(false)}
      />
    </main>
  );
}
