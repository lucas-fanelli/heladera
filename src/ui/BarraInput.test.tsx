import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Item } from '@/db/types';
import type { Accion } from '@/domain';
import { textos } from '@/ui/textos';
import { BarraInput } from './BarraInput';

const yogur: Item = {
  id: 'y1', texto: 'Yogur', textoNorm: 'yogur', estado: 'comprado', agregadoEn: 1, agregadoPor: 'm1', agregadoPorNombre: 'Papá',
  compradoEn: 2, compradoPor: 'm1', compradoPorNombre: 'Papá', borradoEn: null, actualizadoEn: 2, pendiente: false,
};

function pintar(valor: string, accion: Accion) {
  const onEnviar = vi.fn();
  const onChange = vi.fn();
  render(<BarraInput valor={valor} onChange={onChange} accion={accion} onEnviar={onEnviar} autoFocus={false} maxLen={textos.limites.textoMax} />);
  return { onEnviar, onChange };
}

describe('BarraInput', () => {
  it('el botón dice "Agregar «yogur»" cuando la acción es agregar', () => {
    pintar('yogur', { tipo: 'agregar', texto: 'yogur' });
    expect(screen.getByRole('button', { name: textos.input.agregarX('yogur') })).toBeInTheDocument();
  });

  it('el botón dice "Ya está" (inactivo) cuando coincide con un pendiente', () => {
    pintar('Yogur', { tipo: 'yaEsta', item: { ...yogur, estado: 'pendiente' } });
    const b = screen.getByRole('button', { name: textos.input.yaEsta });
    expect(b).toHaveAttribute('aria-disabled', 'true');
  });

  it('el botón dice "Volver a anotar «Yogur»" cuando coincide con un comprado', () => {
    pintar('Yogur', { tipo: 'volver', item: yogur });
    expect(screen.getByRole('button', { name: textos.input.volverX('Yogur') })).toBeInTheDocument();
  });

  it('con el input vacío el botón dice "Agregar" y está inactivo (pero no disabled: Enter no rompe)', () => {
    pintar('', { tipo: 'nada' });
    const b = screen.getByRole('button', { name: textos.input.agregar });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).not.toBeDisabled();
  });

  it('Enter en el input llama onEnviar y el foco se queda en el input (modo ráfaga)', async () => {
    const user = userEvent.setup();
    const { onEnviar } = pintar('yogur', { tipo: 'agregar', texto: 'yogur' });
    const input = screen.getByRole('searchbox', { name: textos.input.label });
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(onEnviar).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
  });

  it('tocar "Agregar" o ✕ no le saca el foco al input (el teclado del teléfono no se cierra): el botón no lo toma en pointerdown', async () => {
    const user = userEvent.setup();
    const { onEnviar, onChange } = pintar('yogur', { tipo: 'agregar', texto: 'yogur' });
    const input = screen.getByRole('searchbox', { name: textos.input.label });
    await user.click(input);
    expect(input).toHaveFocus();
    // el default de mousedown (mover el foco al botón) está cancelado en pointerdown; el click sigue andando
    const agregar = screen.getByRole('button', { name: textos.input.agregarX('yogur') });
    let evitoDefault = false;
    const espia = (e: Event) => { evitoDefault = e.defaultPrevented; };
    document.addEventListener('pointerdown', espia);   // después del handler de React (delegado en la raíz)
    await user.click(agregar);
    document.removeEventListener('pointerdown', espia);
    expect(evitoDefault).toBe(true);
    expect(onEnviar).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
    await user.click(screen.getByRole('button', { name: textos.input.limpiar }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(input).toHaveFocus();
  });

  it('el × limpia la búsqueda y solo aparece con texto', async () => {
    const user = userEvent.setup();
    const { onChange } = pintar('yog', { tipo: 'agregar', texto: 'yog' });
    await user.click(screen.getByRole('button', { name: textos.input.limpiar }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('el input tiene los atributos móviles del diseño; es un campo de búsqueda (type=search + name): así el gestor de contraseñas de Chrome no lo toma por un usuario', () => {
    pintar('', { tipo: 'nada' });
    const input = screen.getByRole('searchbox', { name: textos.input.label });
    expect(input).toHaveAttribute('type', 'search');
    expect(input).toHaveAttribute('name', 'buscar');
    expect(input).toHaveAttribute('enterkeyhint', 'done');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('autocapitalize', 'sentences');
    expect(input).toHaveAttribute('maxlength', String(textos.limites.textoMax));
    expect(input).toHaveAttribute('placeholder', textos.input.placeholder);
  });
});
