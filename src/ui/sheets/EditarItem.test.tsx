import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Item, Mercado, Miembro } from '@/db/types';
import { LONG_PRESS_MS } from '@/domain/timing';
import { textos } from '@/ui/textos';
import { EditarItem } from './EditarItem';

const AHORA = 1_700_000_000_000;
const item: Item = {
  id: 'i1', texto: 'Yerba', textoNorm: 'yerba', estado: 'pendiente', agregadoEn: AHORA - 2 * 3_600_000, agregadoPor: 'm-papa', agregadoPorNombre: 'Papá',
  compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null, actualizadoEn: AHORA, mercado: null, pendiente: false,
};
const miembros: Miembro[] = [{ id: 'm-papa', nombre: 'Papá', color: 'p3', creadoEn: 1 }];
const mercados: Mercado[] = [{ id: 'x-merca', nombre: 'Mercadona', creadoEn: 1 }, { id: 'x-verdu', nombre: 'La Verdulería', creadoEn: 2 }];
const yo = { memberId: 'm-ana', nombre: 'Ana' };
/** props obligatorias que no le importan a cada test */
const base = {
  yo, miembros, ahora: AHORA, mercados, sugerenciasMercados: ['Carrefour', 'Dia'],
  onGuardar: vi.fn(), onBorrar: vi.fn(), onPonerMercado: vi.fn(), onCrearMercado: vi.fn(async () => 'x-nuevo'), onBorrarMercado: vi.fn(), onCerrar: vi.fn(),
};

describe('EditarItem', () => {
  it('muestra el texto, la meta, y Guardar se habilita solo con un texto distinto', async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(<EditarItem {...base} item={item} onGuardar={onGuardar} />);
    const input = screen.getByLabelText(textos.editar.label) as HTMLInputElement;
    expect(input.value).toBe('Yerba');
    expect(screen.getByText(textos.editar.anoto('Papá', 'hace 2 h'))).toBeInTheDocument();
    const guardar = screen.getByRole('button', { name: textos.editar.guardar });
    expect(guardar).toBeDisabled();
    await user.type(input, ' mate');
    expect(guardar).toBeEnabled();
    await user.keyboard('{Enter}');
    expect(onGuardar).toHaveBeenCalledWith('i1', 'Yerba mate');
  });

  it('al abrir NO enfoca el campo de texto: el teclado no salta solo (D15)', () => {
    render(<EditarItem {...base} item={item} />);
    const input = screen.getByLabelText(textos.editar.label);
    expect(document.activeElement).not.toBe(input);
    // pero el foco está adentro del diálogo, no perdido en el fondo
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('sin súper arranca en "En cualquiera"; elegir uno habilita Guardar y lo aplica al guardar', async () => {
    const user = userEvent.setup();
    const onPonerMercado = vi.fn(), onCerrar = vi.fn(), onGuardar = vi.fn();
    render(<EditarItem {...base} item={item} onPonerMercado={onPonerMercado} onCerrar={onCerrar} onGuardar={onGuardar} />);
    expect(screen.getByRole('button', { name: textos.editar.sinMercado })).toHaveAttribute('aria-pressed', 'true');
    const guardar = screen.getByRole('button', { name: textos.editar.guardar });
    expect(guardar).toBeDisabled();
    await user.click(screen.getByRole('button', { name: textos.editar.elegirMercado('Mercadona') }));
    expect(guardar).toBeEnabled();
    await user.click(guardar);
    expect(onPonerMercado).toHaveBeenCalledWith('i1', 'x-merca');
    expect(onGuardar).not.toHaveBeenCalled();   // el texto no cambió: no se reescribe
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('un ítem ya ubicado muestra su súper elegido y se lo puede sacar', async () => {
    const user = userEvent.setup();
    const onPonerMercado = vi.fn();
    render(<EditarItem {...base} item={{ ...item, mercado: 'x-verdu' }} onPonerMercado={onPonerMercado} />);
    expect(screen.getByRole('button', { name: textos.editar.elegirMercado('La Verdulería') })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: textos.editar.sinMercado }));
    await user.click(screen.getByRole('button', { name: textos.editar.guardar }));
    expect(onPonerMercado).toHaveBeenCalledWith('i1', null);
  });

  it('un preset se crea recién al guardar y el ítem queda en el súper nuevo', async () => {
    const user = userEvent.setup();
    const onCrearMercado = vi.fn(async () => 'x-carre');
    const onPonerMercado = vi.fn();
    render(<EditarItem {...base} item={item} onCrearMercado={onCrearMercado} onPonerMercado={onPonerMercado} />);
    await user.click(screen.getByRole('button', { name: textos.editar.elegirMercado('Carrefour') }));
    expect(onCrearMercado).not.toHaveBeenCalled();   // todavía no: Cancelar no tiene que dejar nada creado
    await user.click(screen.getByRole('button', { name: textos.editar.guardar }));
    await waitFor(() => expect(onCrearMercado).toHaveBeenCalledWith('Carrefour'));
    await waitFor(() => expect(onPonerMercado).toHaveBeenCalledWith('i1', 'x-carre'));
  });

  it('"Otro súper…" deja escribir uno nuevo; si el nombre ya existe, usa ese y no crea otro', async () => {
    const user = userEvent.setup();
    const onCrearMercado = vi.fn(async () => 'x-nuevo');
    const onPonerMercado = vi.fn();
    render(<EditarItem {...base} item={item} onCrearMercado={onCrearMercado} onPonerMercado={onPonerMercado} />);
    await user.click(screen.getByRole('button', { name: textos.editar.otroMercado }));
    await user.type(screen.getByLabelText(textos.editar.nuevoMercado), 'mercadona');
    await user.click(screen.getByRole('button', { name: textos.editar.agregarMercado }));
    await user.click(screen.getByRole('button', { name: textos.editar.guardar }));
    expect(onCrearMercado).not.toHaveBeenCalled();
    expect(onPonerMercado).toHaveBeenCalledWith('i1', 'x-merca');
  });

  it('mantener apretada una píldora abre la pregunta, sin mover las píldoras, y confirmar borra', async () => {
    const user = userEvent.setup();
    const onBorrarMercado = vi.fn(), onPonerMercado = vi.fn();
    render(<EditarItem {...base} item={item} onBorrarMercado={onBorrarMercado} onPonerMercado={onPonerMercado} />);
    const chip = screen.getByRole('button', { name: textos.editar.elegirMercado('Mercadona') });
    await user.pointer({ keys: '[MouseLeft>]', target: chip });       // apretar y sostener
    const titulo = await screen.findByRole('heading', { name: textos.editar.borrarMercadoTitulo('Mercadona') }, { timeout: LONG_PRESS_MS + 1000 });
    await user.pointer({ keys: '[/MouseLeft]', target: chip });       // soltar no elige el súper ni confirma
    expect(onBorrarMercado).not.toHaveBeenCalled();
    // la píldora sigue exactamente donde estaba, con su texto
    expect(screen.getByRole('button', { name: textos.editar.elegirMercado('Mercadona') })).toBeInTheDocument();
    const dialogo = within(titulo.closest('dialog')!);
    await user.click(dialogo.getByRole('button', { name: textos.editar.borrarMercadoSi }));
    expect(onBorrarMercado).toHaveBeenCalledWith('x-merca');
    expect(onPonerMercado).not.toHaveBeenCalled();
  });

  it('cancelar la pregunta no borra nada', async () => {
    const user = userEvent.setup();
    const onBorrarMercado = vi.fn();
    render(<EditarItem {...base} item={item} onBorrarMercado={onBorrarMercado} />);
    const chip = screen.getByRole('button', { name: textos.editar.elegirMercado('La Verdulería') });
    chip.focus();
    await user.keyboard('{Delete}');                                   // sin dedo: la tecla Supr también pregunta
    const titulo = await screen.findByRole('heading', { name: textos.editar.borrarMercadoTitulo('La Verdulería') });
    await user.click(within(titulo.closest('dialog')!).getByRole('button', { name: textos.confirmar.cancelar }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: textos.editar.borrarMercadoTitulo('La Verdulería') })).toBeNull());
    expect(onBorrarMercado).not.toHaveBeenCalled();
  });

  it('Borrar cierra primero (onCerrar) y recién llama onBorrar cuando el sheet terminó de salir', async () => {
    const user = userEvent.setup();
    const onBorrar = vi.fn(), onCerrar = vi.fn();
    const props = { ...base, onBorrar, onCerrar };
    const { rerender } = render(<EditarItem {...props} item={item} />);
    await user.click(screen.getByRole('button', { name: textos.editar.borrar }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(onBorrar).not.toHaveBeenCalled();
    // el padre cierra el sheet; el ítem se conserva mientras sale
    rerender(<EditarItem {...props} item={null} />);
    // con __MOTION_SCALE__=0 la salida es instantánea: el Sheet dispara onSalida y ahí se borra
    await waitFor(() => expect(onBorrar).toHaveBeenCalledWith('i1'));
    expect(onBorrar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByLabelText(textos.editar.label)).toBeNull());
  });

  it('Cancelar llama onCerrar y al salir NO borra', async () => {
    const user = userEvent.setup();
    const onBorrar = vi.fn(), onCerrar = vi.fn();
    const props = { ...base, onBorrar, onCerrar };
    const { rerender } = render(<EditarItem {...props} item={item} />);
    await user.click(screen.getByRole('button', { name: textos.editar.cancelar }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
    rerender(<EditarItem {...props} item={null} />);
    await waitFor(() => expect(screen.queryByLabelText(textos.editar.label)).toBeNull());
    expect(onBorrar).not.toHaveBeenCalled();
  });

  it('si se vuelve a abrir antes de salir, el Borrar pendiente se descarta', async () => {
    const user = userEvent.setup();
    const onBorrar = vi.fn(), onCerrar = vi.fn();
    const props = { ...base, onBorrar, onCerrar };
    const { rerender } = render(<EditarItem {...props} item={item} />);
    await user.click(screen.getByRole('button', { name: textos.editar.borrar }));
    // el padre no cierra: vuelve a abrir con otro ítem (o el mismo) sin pasar por la salida
    rerender(<EditarItem {...props} item={{ ...item, id: 'i2', texto: 'Pan' }} />);
    await user.click(screen.getByRole('button', { name: textos.editar.cancelar }));
    rerender(<EditarItem {...props} item={null} />);
    await waitFor(() => expect(screen.queryByLabelText(textos.editar.label)).toBeNull());
    expect(onBorrar).not.toHaveBeenCalled();
  });

  it('con item null no muestra el formulario', () => {
    render(<EditarItem {...base} item={null} />);
    expect(screen.queryByLabelText(textos.editar.label)).toBeNull();
  });
});
