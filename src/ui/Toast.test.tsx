import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { textos } from '@/ui/textos';
import { limpiarCapas } from './capa';
import { Sheet } from './sheets/Sheet';
import { ToastView } from './Toast';

describe('ToastView · con un sheet abierto', () => {
  afterEach(() => limpiarCapas());

  it('se pinta ADENTRO del diálogo: un <dialog> modal está en la top layer y ningún z-index lo tapa', async () => {
    render(
      <>
        <Sheet abierto onCerrar={vi.fn()} titulo="Menú"><p>contenido</p></Sheet>
        <ToastView toast={{ id: 1, texto: textos.toasts.linkCopiado }} onCerrar={vi.fn()} onPausar={vi.fn()} onReanudar={vi.fn()} />
      </>,
    );
    const aviso = await screen.findByText(textos.toasts.linkCopiado);
    expect(aviso.closest('dialog')).not.toBeNull();
  });

  it('sin ningún sheet abierto se pinta donde siempre', () => {
    render(<ToastView toast={{ id: 1, texto: textos.toasts.linkCopiado }} onCerrar={vi.fn()} onPausar={vi.fn()} onReanudar={vi.fn()} />);
    expect(screen.getByText(textos.toasts.linkCopiado).closest('dialog')).toBeNull();
  });

  it('cuando el sheet se cierra, el aviso vuelve solo al documento', async () => {
    const { rerender } = render(
      <>
        <Sheet abierto onCerrar={vi.fn()} titulo="Menú"><p>contenido</p></Sheet>
        <ToastView toast={{ id: 1, texto: textos.toasts.linkCopiado }} onCerrar={vi.fn()} onPausar={vi.fn()} onReanudar={vi.fn()} />
      </>,
    );
    await screen.findByText(textos.toasts.linkCopiado);
    rerender(
      <>
        <Sheet abierto={false} onCerrar={vi.fn()} titulo="Menú"><p>contenido</p></Sheet>
        <ToastView toast={{ id: 1, texto: textos.toasts.linkCopiado }} onCerrar={vi.fn()} onPausar={vi.fn()} onReanudar={vi.fn()} />
      </>,
    );
    await waitFor(() => expect(screen.getByText(textos.toasts.linkCopiado).closest('dialog')).toBeNull());
  });
});

describe('ToastView', () => {
  it('el contenedor role=status existe aunque toast sea null', () => {
    render(<ToastView toast={null} onCerrar={vi.fn()} onPausar={vi.fn()} onReanudar={vi.fn()} />);
    const zona = screen.getByRole('status');
    expect(zona).toBeInTheDocument();
    expect(zona).toHaveAttribute('aria-live', 'polite');
    expect(zona).toBeEmptyDOMElement();
  });

  it('muestra el texto y el botón de acción llama a onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onCerrar = vi.fn();
    render(
      <ToastView
        toast={{ id: 1, texto: textos.toasts.borrado('Yerba'), accion: { etiqueta: textos.toasts.deshacer, onClick } }}
        onCerrar={onCerrar} onPausar={vi.fn()} onReanudar={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(textos.toasts.borrado('Yerba'));
    await user.click(screen.getByRole('button', { name: textos.toasts.deshacer }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: textos.toasts.cerrar }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('pausa con el puntero encima y reanuda al salir', () => {
    const onPausar = vi.fn(), onReanudar = vi.fn();
    render(<ToastView toast={{ id: 2, texto: textos.toasts.copiado }} onCerrar={vi.fn()} onPausar={onPausar} onReanudar={onReanudar} />);
    const toast = screen.getByText(textos.toasts.copiado).parentElement!;
    fireEvent.pointerEnter(toast);
    expect(onPausar).toHaveBeenCalled();
    fireEvent.pointerLeave(toast);
    expect(onReanudar).toHaveBeenCalled();
  });
});
