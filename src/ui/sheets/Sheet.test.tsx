import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

function Pantalla({ abierto, onCerrar, onSalida, focoAlCerrar }: {
  abierto: boolean; onCerrar: () => void; onSalida?: () => void; focoAlCerrar?: () => HTMLElement | null;
}) {
  return (
    <>
      <main tabIndex={-1}>
        <button type="button">Disparador</button>
        <button type="button">Otro</button>
      </main>
      <Sheet abierto={abierto} onCerrar={onCerrar} onSalida={onSalida} focoAlCerrar={focoAlCerrar} titulo="Título">
        <button type="button">Adentro</button>
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  it('abre con showModal, enfoca adentro, y al cerrar devuelve el foco al disparador y llama onSalida', async () => {
    const onCerrar = vi.fn(), onSalida = vi.fn();
    const { rerender } = render(<Pantalla abierto={false} onCerrar={onCerrar} onSalida={onSalida} />);
    const disparador = screen.getByRole('button', { name: 'Disparador' });
    disparador.focus();
    rerender(<Pantalla abierto onCerrar={onCerrar} onSalida={onSalida} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('open'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adentro' })).toHaveFocus());
    expect(onSalida).not.toHaveBeenCalled();

    rerender(<Pantalla abierto={false} onCerrar={onCerrar} onSalida={onSalida} />);
    await waitFor(() => expect(onSalida).toHaveBeenCalledTimes(1));
    // onSalida llega DESPUÉS de dialog.close() y de devolver el foco
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
    expect(disparador).toHaveFocus();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('si el disparador ya no está conectado usa focoAlCerrar', async () => {
    const otro = () => screen.getByRole('button', { name: 'Otro' });
    const focoAlCerrar = vi.fn(() => otro());
    const { rerender } = render(<Pantalla abierto={false} onCerrar={vi.fn()} focoAlCerrar={focoAlCerrar} />);
    // un disparador efímero (p.ej. la fila que se va a borrar)
    const efimero = document.createElement('button');
    document.body.appendChild(efimero);
    efimero.focus();
    rerender(<Pantalla abierto onCerrar={vi.fn()} focoAlCerrar={focoAlCerrar} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('open'));
    efimero.remove();

    rerender(<Pantalla abierto={false} onCerrar={vi.fn()} focoAlCerrar={focoAlCerrar} />);
    await waitFor(() => expect(focoAlCerrar).toHaveBeenCalledTimes(1));
    expect(otro()).toHaveFocus();
  });

  it('sin disparador ni focoAlCerrar cae en <main> (que debe ser enfocable: tabindex=-1)', async () => {
    const { rerender } = render(<Pantalla abierto={false} onCerrar={vi.fn()} />);
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(<Pantalla abierto onCerrar={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('open'));
    rerender(<Pantalla abierto={false} onCerrar={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('Escape y el backdrop llaman onCerrar (el cierre lo decide el padre)', async () => {
    const user = userEvent.setup();
    const onCerrar = vi.fn();
    render(<Pantalla abierto onCerrar={onCerrar} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('open'));
    await user.keyboard('{Escape}');
    expect(onCerrar).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('sheet-backdrop'));
    expect(onCerrar).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
  });
});
