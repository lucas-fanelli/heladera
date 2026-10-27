import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Item } from '@/db/types';
import { textos } from '@/ui/textos';
import { Menu } from './Menu';

const item = (id: string): Item => ({
  id, texto: id, textoNorm: id, estado: 'pendiente', agregadoEn: 1, agregadoPor: 'm-ana', agregadoPorNombre: 'Ana',
  compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null, actualizadoEn: 1, pendiente: false,
});

function montar(pendientes: Item[]) {
  const fns = {
    onMandarWhatsApp: vi.fn(), onCopiarLink: vi.fn(), onMandarLink: vi.fn(), onCambiarNombre: vi.fn(), onExportar: vi.fn(), onCerrar: vi.fn(),
    onAccesos: vi.fn(), onRenombrar: vi.fn(), onInvitar: vi.fn(async () => 'https://heladera.web.app/l/l1#i=cccccccccccccccccccccccc'),
  };
  render(
    <Menu abierto lista={{ id: 'l1', nombre: 'Casa', creadaEn: 1 }} pendientes={pendientes} yo={{ memberId: 'm-ana', nombre: 'Ana' }}
      {...fns} />,
  );
  return fns;
}

describe('Menu', () => {
  it('con 0 pendientes "Mandar la lista" está deshabilitado', () => {
    montar([]);
    expect(screen.getByRole('button', { name: new RegExp(textos.menu.mandar) })).toBeDisabled();
    expect(screen.getByText(textos.menu.mandarSub(0))).toBeInTheDocument();
  });

  it('con pendientes se habilita y llama onMandarWhatsApp', async () => {
    const user = userEvent.setup();
    const fns = montar([item('leche'), item('yerba')]);
    const btn = screen.getByRole('button', { name: new RegExp(textos.menu.mandar) });
    expect(btn).toBeEnabled();
    expect(screen.getByText(textos.menu.mandarSub(2))).toBeInTheDocument();
    await user.click(btn);
    expect(fns.onMandarWhatsApp).toHaveBeenCalled();
  });

  it('el link no aparece solo: hay que crear la invitación, y recién ahí Copiar y Mandar lo reciben', async () => {
    const user = userEvent.setup();
    const fns = montar([item('leche')]);
    // una invitación es un acto, no una vista: abrir el menú no abre una puerta
    expect(screen.queryByText(/heladera\.web\.app/)).not.toBeInTheDocument();
    expect(fns.onInvitar).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: textos.menu.generarInvitacion }));
    expect(fns.onInvitar).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/heladera\.web\.app\/l\/l1#i=/)).toBeInTheDocument();

    // el código viaja en el fragmento: no llega al servidor ni al Referer
    await user.click(screen.getByRole('button', { name: textos.menu.copiarLink }));
    expect(fns.onCopiarLink).toHaveBeenCalledWith(expect.stringContaining('#i='));
    await user.click(screen.getByRole('button', { name: textos.menu.mandarLink }));
    expect(fns.onMandarLink).toHaveBeenCalledWith(expect.stringContaining('#i='));
  });

  it('renombrar: la fila abre el editor con el nombre actual, guardar normaliza y llama onRenombrar', async () => {
    const user = userEvent.setup();
    const fns = montar([]);
    await user.click(screen.getByRole('button', { name: new RegExp(textos.menu.renombrar) }));
    const campo = screen.getByLabelText(textos.menu.renombrarLabel) as HTMLInputElement;
    expect(campo.value).toBe('Casa');                          // arranca con el nombre actual, no vacío
    await user.clear(campo);
    await user.type(campo, '  Casa   Grande ');
    await user.click(screen.getByRole('button', { name: textos.menu.guardar }));
    expect(fns.onRenombrar).toHaveBeenCalledWith('Casa Grande');
    // el editor se cierra y la fila vuelve
    expect(screen.queryByLabelText(textos.menu.renombrarLabel)).not.toBeInTheDocument();
  });

  it('renombrar: guardar vacío no renombra nada, cancelar tampoco', async () => {
    const user = userEvent.setup();
    const fns = montar([]);
    await user.click(screen.getByRole('button', { name: new RegExp(textos.menu.renombrar) }));
    await user.clear(screen.getByLabelText(textos.menu.renombrarLabel));
    await user.click(screen.getByRole('button', { name: textos.menu.guardar }));
    expect(fns.onRenombrar).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: new RegExp(textos.menu.renombrar) }));
    await user.click(screen.getByRole('button', { name: textos.confirmar.cancelar }));
    expect(fns.onRenombrar).not.toHaveBeenCalled();
  });

  it('"Quién tiene acceso" abre la pantalla de las llaves', async () => {
    const user = userEvent.setup();
    const fns = montar([]);
    await user.click(screen.getByRole('button', { name: new RegExp(textos.menu.accesos) }));
    expect(fns.onAccesos).toHaveBeenCalledTimes(1);
  });

  it('"Cambiar mi nombre" muestra mi nombre y llama onCambiarNombre; Exportar y Cerrar también', async () => {
    const user = userEvent.setup();
    const fns = montar([]);
    const cambiar = screen.getByRole('button', { name: new RegExp(textos.menu.cambiarNombre) });
    expect(cambiar).toHaveTextContent('Ana');
    await user.click(cambiar);
    expect(fns.onCambiarNombre).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: new RegExp(textos.menu.exportar) }));
    expect(fns.onExportar).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: textos.menu.cerrar }));
    expect(fns.onCerrar).toHaveBeenCalled();
  });
});
