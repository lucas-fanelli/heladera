import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { textos } from '@/ui/textos';
import { Home } from './Home';

describe('Home', () => {
  it('sin listas: título, form y crear manda nombre + miembros no vacíos', async () => {
    const user = userEvent.setup();
    const onCrear = vi.fn().mockResolvedValue(undefined);
    render(<Home listas={[]} onCrear={onCrear} onAbrir={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: textos.home.titulo })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir/ })).toBeNull();
    const nombre = screen.getByLabelText(textos.home.nombreLista) as HTMLInputElement;
    expect(nombre.value).toBe(textos.home.nombreListaDefault);
    await user.type(screen.getByLabelText(textos.home.miembroLabel(1)), 'Ana');
    await user.type(screen.getByLabelText(textos.home.miembroLabel(3)), '  Papá ');
    await user.click(screen.getByRole('button', { name: textos.home.crear }));
    expect(onCrear).toHaveBeenCalledWith(textos.home.nombreListaDefault, ['Ana', 'Papá']);
  });

  it('con varias listas, TODAS se listan con su nombre y cada una abre la suya (D22 · Etapa 2)', async () => {
    const user = userEvent.setup();
    const onAbrir = vi.fn();
    render(<Home listas={[{ id: 'l1', nombre: 'Casa' }, { id: 'l2', nombre: 'Trabajo' }]} onCrear={vi.fn()} onAbrir={onAbrir} />);
    expect(screen.getByRole('heading', { name: textos.home.tusListas })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: textos.home.abrirUltima('Trabajo') }));
    expect(onAbrir).toHaveBeenCalledWith('l2');
    await user.click(screen.getByRole('button', { name: textos.home.abrirUltima('Casa') }));
    expect(onAbrir).toHaveBeenCalledWith('l1');
  });

  it('con una lista: el botón grande la abre', async () => {
    const user = userEvent.setup();
    const onAbrir = vi.fn();
    render(<Home listas={[{ id: 'l1', nombre: 'Casa' }]} onCrear={vi.fn()} onAbrir={onAbrir} />);
    await user.click(screen.getByRole('button', { name: textos.home.abrirUltima('Casa') }));
    expect(onAbrir).toHaveBeenCalledWith('l1');
  });

  it('si crear falla, muestra el error y vuelve a habilitar el botón', async () => {
    const user = userEvent.setup();
    const onCrear = vi.fn().mockRejectedValue(new Error('x'));
    render(<Home listas={[]} onCrear={onCrear} onAbrir={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: textos.home.crear }));
    expect(await screen.findByText(textos.errores.desconocido)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: textos.home.crear })).toBeEnabled();
  });
});

/**
 * La cuenta (D23). Lo que importa: la oferta correcta en el momento correcto — guardar donde hay listas que
 * proteger, entrar solo en un dispositivo vacío (en uno con listas cambiaría la identidad sin avisar), y el
 * cambio de identidad del choque SIEMPRE detrás de la pregunta.
 */
describe('Home · la cuenta', () => {
  const listaCasa = [{ id: 'l1', nombre: 'Casa' }];

  it('sin la prop (demo): no se nombra ninguna cuenta, con listas ni sin ellas', () => {
    // las dos formas de la home: el botón de guardar vive en la de listas, el de entrar en la vacía.
    // Sin la prop, ninguno puede aparecer en ninguna de las dos.
    const conListas = render(<Home listas={listaCasa} onCrear={vi.fn()} onAbrir={vi.fn()} />);
    expect(screen.queryByRole('button', { name: textos.cuenta.guardar })).toBeNull();
    conListas.unmount();
    render(<Home listas={[]} onCrear={vi.fn()} onAbrir={vi.fn()} />);
    expect(screen.queryByRole('button', { name: textos.cuenta.entrar })).toBeNull();
  });

  it('anónima con listas: avisa que el acceso vive acá y guardar llama a onGuardarCuenta', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn().mockReturnValue(new Promise(() => {}));   // la redirección real no resuelve
    render(<Home listas={listaCasa} onCrear={vi.fn()} onAbrir={vi.fn()} cuenta={{ estado: 'anonima' }} onGuardarCuenta={onGuardar} onEntrarConCuenta={vi.fn()} />);
    expect(screen.getByText(textos.cuenta.anonima)).toBeInTheDocument();
    // acá no se ofrece entrar con otra cuenta: escondería las listas que este dispositivo ya tiene
    expect(screen.queryByRole('button', { name: textos.cuenta.entrar })).toBeNull();
    await user.click(screen.getByRole('button', { name: textos.cuenta.guardar }));
    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: textos.cuenta.llevando })).toBeDisabled();
  });

  it('anónima sin listas: no hay nada que guardar; se ofrece entrar con la cuenta, sin pregunta (nada que perder)', async () => {
    const user = userEvent.setup();
    const onEntrar = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<Home listas={[]} onCrear={vi.fn()} onAbrir={vi.fn()} cuenta={{ estado: 'anonima' }} onGuardarCuenta={vi.fn()} onEntrarConCuenta={onEntrar} />);
    expect(screen.queryByRole('button', { name: textos.cuenta.guardar })).toBeNull();
    await user.click(screen.getByRole('button', { name: textos.cuenta.entrar }));
    expect(onEntrar).toHaveBeenCalledTimes(1);
  });

  it('mientras las listas cargan (null) no se ofrece entrar: todavía no sabemos si este dispositivo está vacío', () => {
    render(<Home listas={null} onCrear={vi.fn()} onAbrir={vi.fn()} cuenta={{ estado: 'anonima' }} onGuardarCuenta={vi.fn()} onEntrarConCuenta={vi.fn()} />);
    expect(screen.queryByRole('button', { name: textos.cuenta.entrar })).toBeNull();
    expect(screen.queryByRole('button', { name: textos.cuenta.guardar })).toBeNull();
  });

  it('guardada: muestra con qué email quedó, sin botones', () => {
    render(<Home listas={listaCasa} onCrear={vi.fn()} onAbrir={vi.fn()} cuenta={{ estado: 'guardada', email: 'a@b.com' }} onGuardarCuenta={vi.fn()} onEntrarConCuenta={vi.fn()} />);
    expect(screen.getByText(textos.cuenta.guardada('a@b.com'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: textos.cuenta.guardar })).toBeNull();
    expect(screen.queryByRole('button', { name: textos.cuenta.entrar })).toBeNull();
  });

  it('choque: entrar con esa cuenta pasa por la pregunta (cancelar no llama; confirmar sí, y el botón queda "Entrando…")', async () => {
    const user = userEvent.setup();
    const onEntrar = vi.fn().mockReturnValue(new Promise(() => {}));
    const onGuardar = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<Home listas={listaCasa} onCrear={vi.fn()} onAbrir={vi.fn()} cuenta={{ estado: 'choque', email: 'a@b.com' }} onGuardarCuenta={onGuardar} onEntrarConCuenta={onEntrar} />);
    expect(screen.getByText(textos.cuenta.choque('a@b.com'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: textos.cuenta.choqueEntrar }));
    expect(screen.getByText(textos.cuenta.cambiarTexto)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: textos.confirmar.cancelar }));
    expect(onEntrar).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: textos.cuenta.choqueEntrar }));
    await user.click(screen.getByRole('button', { name: textos.cuenta.cambiarSi }));
    expect(onEntrar).toHaveBeenCalledTimes(1);
    expect(onGuardar).not.toHaveBeenCalled();
    // el canje no viaja a Google: su rótulo ocupado es "Entrando…", y tocarlo de nuevo no dispara otra pregunta
    await user.click(screen.getByRole('button', { name: textos.cuenta.entrando }));
    expect(screen.queryByText(textos.cuenta.cambiarTexto)).toBeNull();
    expect(onEntrar).toHaveBeenCalledTimes(1);
  });

  it('choque: "probar con otra" vuelve al viaje de guardar, sin pregunta (no cambia la identidad)', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<Home listas={listaCasa} onCrear={vi.fn()} onAbrir={vi.fn()} cuenta={{ estado: 'choque', email: 'a@b.com' }} onGuardarCuenta={onGuardar} onEntrarConCuenta={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: textos.cuenta.choqueOtra }));
    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: textos.cuenta.llevando })).toBeDisabled();
  });

  it('sin email visible, los avisos no quedan con un hueco: hay copy propio para guardada y para el choque', () => {
    const sinEmail = render(<Home listas={listaCasa} onCrear={vi.fn()} onAbrir={vi.fn()} cuenta={{ estado: 'guardada', email: null }} onGuardarCuenta={vi.fn()} onEntrarConCuenta={vi.fn()} />);
    expect(screen.getByText(textos.cuenta.guardadaSinEmail)).toBeInTheDocument();
    sinEmail.unmount();
    render(<Home listas={listaCasa} onCrear={vi.fn()} onAbrir={vi.fn()} cuenta={{ estado: 'choque', email: null }} onGuardarCuenta={vi.fn()} onEntrarConCuenta={vi.fn()} />);
    expect(screen.getByText(textos.cuenta.choqueSinEmail)).toBeInTheDocument();
  });

  it('si el viaje falla antes de irse (sin señal), lo dice y el botón vuelve', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn().mockRejectedValue(new Error('offline'));
    render(<Home listas={listaCasa} onCrear={vi.fn()} onAbrir={vi.fn()} cuenta={{ estado: 'anonima' }} onGuardarCuenta={onGuardar} onEntrarConCuenta={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: textos.cuenta.guardar }));
    expect(await screen.findByText(textos.cuenta.error)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: textos.cuenta.guardar })).toBeEnabled();
  });
});
