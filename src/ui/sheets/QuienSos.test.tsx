import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Miembro } from '@/db/types';
import { textos } from '@/ui/textos';
import { QuienSos } from './QuienSos';

const miembros: Miembro[] = [
  { id: 'm-ana', nombre: 'Ana', color: 'p1', creadoEn: 1 },
  { id: 'm-mama', nombre: 'Mamá', color: 'p2', creadoEn: 2 },
  { id: 'm-papa', nombre: 'Papá', color: 'p3', creadoEn: 3 },
];
const anonimo = { memberId: null, nombre: null };

function montar(over: Partial<React.ComponentProps<typeof QuienSos>> = {}) {
  const onElegir = vi.fn().mockResolvedValue(null);
  const onCerrar = vi.fn();
  const utils = render(<QuienSos abierto miembros={miembros} yo={anonimo} onElegir={onElegir} onCerrar={onCerrar} {...over} />);
  return { onElegir, onCerrar, ...utils };
}

describe('QuienSos', () => {
  it('muestra el título y elegir el chip "Mamá" + "Soy yo" llama onElegir({ memberId })', async () => {
    const user = userEvent.setup();
    const { onElegir } = montar();
    expect(screen.getByRole('heading', { name: textos.quienSos.titulo })).toBeInTheDocument();
    const soyYo = screen.getByRole('button', { name: textos.quienSos.soyYo });
    expect(soyYo).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Mamá' }));
    expect(soyYo).toBeEnabled();
    await user.click(soyYo);
    expect(onElegir).toHaveBeenCalledWith({ memberId: 'm-mama' });
  });

  it('Escape llama onCerrar (foco atrapado a mano: no depende del <dialog> nativo)', () => {
    const { onCerrar } = montar();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('"Ahora no" llama onCerrar', async () => {
    const user = userEvent.setup();
    const { onCerrar } = montar();
    await user.click(screen.getByRole('button', { name: textos.quienSos.cerrar }));
    expect(onCerrar).toHaveBeenCalled();
  });

  it('escribir "mamá" en Otro nombre muestra "¿Sos vos, Mamá?" y "Sí, soy yo" elige a Mamá', async () => {
    const user = userEvent.setup();
    const { onElegir } = montar();
    await user.click(screen.getByRole('button', { name: textos.quienSos.otroNombre }));
    const input = screen.getByLabelText(textos.quienSos.otroNombreLabel);
    await user.type(input, 'mamá');
    expect(screen.getByText(textos.quienSos.sosVos('Mamá'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: textos.quienSos.soyYo })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: textos.quienSos.siSoyYo }));
    expect(onElegir).toHaveBeenCalledWith({ memberId: 'm-mama' });
  });

  it('un nombre nuevo válido habilita "Soy yo" y llama onElegir({ nombre })', async () => {
    const user = userEvent.setup();
    const { onElegir } = montar();
    await user.click(screen.getByRole('button', { name: textos.quienSos.otroNombre }));
    await user.type(screen.getByLabelText(textos.quienSos.otroNombreLabel), '  Abuela  ');
    const soyYo = screen.getByRole('button', { name: textos.quienSos.soyYo });
    expect(soyYo).toBeEnabled();
    await user.click(soyYo);
    expect(onElegir).toHaveBeenCalledWith({ nombre: 'Abuela' });
  });

  it('nombre vacío al salir del campo muestra el error', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: textos.quienSos.otroNombre }));
    const input = screen.getByLabelText(textos.quienSos.otroNombreLabel);
    await user.click(input);
    await user.tab();
    expect(await screen.findByText(textos.quienSos.nombreVacio)).toBeInTheDocument();
  });

  it('modo cambiarNombre: título, chip actual marcado, input con mi nombre y Guardar llama onRenombrar + onCerrar', async () => {
    const user = userEvent.setup();
    const onRenombrar = vi.fn();
    const { onCerrar } = montar({ yo: { memberId: 'm-ana', nombre: 'Ana' }, cambiarNombre: true, onRenombrar });
    expect(screen.getByRole('heading', { name: textos.quienSos.cambiar })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ana/ })).toHaveAttribute('aria-pressed', 'true');
    const input = screen.getByLabelText(textos.quienSos.otroNombreLabel) as HTMLInputElement;
    expect(input.value).toBe('Ana');
    const guardar = screen.getByRole('button', { name: textos.quienSos.guardar });
    expect(guardar).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'Luqui');
    await user.click(guardar);
    expect(onRenombrar).toHaveBeenCalledWith('Luqui');
    expect(onCerrar).toHaveBeenCalled();
  });

  it('cerrado: no hay panel; al abrir se llama showModal', async () => {
    const { rerender } = render(<QuienSos abierto={false} miembros={miembros} yo={anonimo} onElegir={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.queryByRole('heading', { name: textos.quienSos.titulo })).toBeNull();
    rerender(<QuienSos abierto miembros={miembros} yo={anonimo} onElegir={vi.fn()} onCerrar={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('open'));
  });
});
