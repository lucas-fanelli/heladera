import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Item } from '@/db/types';
import type { FilaVM } from '@/app/useLista';
import { textos } from '@/ui/textos';
import { LONG_PRESS_MS, MOVE_CANCEL_PX } from '@/domain/timing';
import { Fila } from './Fila';

const AHORA = 1_700_000_000_000;

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i1', texto: 'Leche', textoNorm: 'leche', estado: 'pendiente',
    agregadoEn: AHORA - 60_000, agregadoPor: 'm1', agregadoPorNombre: 'Papá',
    compradoEn: null, compradoPor: null, compradoPorNombre: null, borradoEn: null, actualizadoEn: AHORA, pendiente: false,
    ...over,
  };
}
function fila(over: Partial<FilaVM> = {}): FilaVM {
  return { item: item(), grupo: 'pendiente', tachado: false, enEspera: false, protagonista: false, resaltada: false, ...over };
}
const miembros = [{ id: 'm1', nombre: 'Papá', color: 'p2' as const, creadoEn: AHORA }];
const yo = { memberId: 'm2', nombre: 'Ana' };

function pintar(f: FilaVM = fila(), props: Partial<React.ComponentProps<typeof Fila>> = {}) {
  const onToggle = vi.fn();
  const onEditar = vi.fn();
  render(<ul><Fila fila={f} consulta="" yo={yo} miembros={miembros} ahora={AHORA} onToggle={onToggle} onEditar={onEditar} {...props} /></ul>);
  return { onToggle, onEditar };
}

describe('Fila', () => {
  it('un click en la fila llama onToggle una sola vez (checkbox real con nombre accesible)', async () => {
    const user = userEvent.setup();
    const { onToggle } = pintar();
    const check = screen.getByRole('checkbox', { name: textos.lista.tildar('Leche') });
    expect(check).not.toBeChecked();
    await user.click(screen.getByText('Leche'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('i1');
  });

  it('un puntero que se mueve más de MOVE_CANCEL_PX (scroll) NO tilda', () => {
    const { onToggle } = pintar();
    const label = screen.getByText('Leche').closest('label')!;
    fireEvent.pointerDown(label, { clientX: 10, clientY: 10, button: 0, pointerType: 'touch' });
    fireEvent.pointerMove(label, { clientX: 10, clientY: 10 + MOVE_CANCEL_PX * 2, pointerType: 'touch' });
    fireEvent.pointerUp(label, { clientX: 10, clientY: 10 + MOVE_CANCEL_PX * 2, pointerType: 'touch' });
    fireEvent.click(label);
    expect(onToggle).not.toHaveBeenCalled();
    // y el siguiente tap limpio sí tilda
    fireEvent.pointerDown(label, { clientX: 10, clientY: 10, button: 0, pointerType: 'touch' });
    fireEvent.pointerUp(label, { clientX: 10, clientY: 10, pointerType: 'touch' });
    fireEvent.click(label);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('un long-press levanta la fila para moverla de súper (D18) y no tilda; Editar ya no sale de acá', () => {
    vi.useFakeTimers();
    const onArrastrar = vi.fn();
    const { onToggle, onEditar } = pintar(fila(), { onArrastrar });
    const label = screen.getByText('Leche').closest('label')!;
    fireEvent.pointerDown(label, { clientX: 10, clientY: 10, button: 0, pointerType: 'touch' });
    vi.advanceTimersByTime(LONG_PRESS_MS + 100);
    fireEvent.pointerUp(label, { clientX: 10, clientY: 10, pointerType: 'touch' });
    fireEvent.click(label);
    expect(onArrastrar).toHaveBeenCalledTimes(1);
    expect(onArrastrar.mock.calls[0]![0]).toMatchObject({ id: 'i1' });
    expect(onToggle).not.toHaveBeenCalled();
    expect(onEditar).not.toHaveBeenCalled();
  });

  it('sin onArrastrar (todavía no hay súper), mantener apretado no hace nada y el tap sigue tildando', () => {
    vi.useFakeTimers();
    const { onToggle, onEditar } = pintar();
    const label = screen.getByText('Leche').closest('label')!;
    fireEvent.pointerDown(label, { clientX: 10, clientY: 10, button: 0, pointerType: 'touch' });
    vi.advanceTimersByTime(LONG_PRESS_MS + 100);
    fireEvent.pointerUp(label, { clientX: 10, clientY: 10, pointerType: 'touch' });
    fireEvent.click(label);
    expect(onEditar).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('muestra la meta con "Vos" cuando lo anoté yo, y la de comprado cuando está en comprados', () => {
    pintar(fila({ item: item({ agregadoPor: 'm2', agregadoPorNombre: 'Ana' }) }));
    expect(screen.getByText(textos.meta.agregado(textos.meta.vos, 'hace 1 min'))).toBeInTheDocument();
  });

  it('el chevron tiene nombre accesible y llama onEditar; el puntito de sync se anuncia', async () => {
    const user = userEvent.setup();
    const { onEditar } = pintar(fila({ item: item({ pendiente: true }) }));
    await user.click(screen.getByRole('button', { name: textos.lista.editar('Leche') }));
    expect(onEditar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: textos.lista.pendienteSync })).toBeInTheDocument();
  });

  it('en comprados bajo filtro muestra "volver a anotar" y resalta la coincidencia', async () => {
    const user = userEvent.setup();
    const onVolver = vi.fn();
    pintar(fila({ grupo: 'comprado', tachado: true, item: item({ estado: 'comprado', compradoEn: AHORA - 1000, compradoPor: 'm1', compradoPorNombre: 'Papá' }) }), { consulta: 'le', onVolverAAnotar: onVolver });
    await user.click(screen.getByRole('button', { name: textos.lista.volverAAnotar }));
    expect(onVolver).toHaveBeenCalledWith('i1');
    expect(screen.getByRole('checkbox', { name: textos.lista.destildar('Leche') })).toBeChecked();
    expect(document.querySelector('mark')?.textContent).toBe('Le');
  });

  describe('foco al desmontarse', () => {
    const base = { consulta: '', yo, miembros, ahora: AHORA, onToggle: vi.fn(), onEditar: vi.fn() };
    const dos = (ids: string[]) => (
      <ul>
        {ids.map(id => <Fila key={id} fila={fila({ item: item({ id, texto: id }) })} {...base} />)}
      </ul>
    );

    it('si la fila enfocada se va, el foco pasa a la casilla de la siguiente', () => {
      const { rerender } = render(dos(['a', 'b', 'c']));
      screen.getByRole('checkbox', { name: textos.lista.tildar('b') }).focus();
      rerender(dos(['a', 'c']));
      expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: textos.lista.tildar('c') }));
    });

    it('si no hay siguiente, va a la anterior', () => {
      const { rerender } = render(dos(['a', 'b']));
      screen.getByRole('checkbox', { name: textos.lista.tildar('b') }).focus();
      rerender(dos(['a']));
      expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: textos.lista.tildar('a') }));
    });

    it('si era la última, va al <main> (nunca al input: abriría el teclado)', () => {
      const conMain = (ids: string[]) => <main tabIndex={-1}>{dos(ids)}</main>;
      const { rerender } = render(conMain(['a']));
      screen.getByRole('checkbox', { name: textos.lista.tildar('a') }).focus();
      rerender(conMain([]));
      expect(document.activeElement).toBe(screen.getByRole('main'));
    });

    it('si la fila que se va no tenía el foco, no lo toca', () => {
      const { rerender } = render(<div><button type="button">otro</button>{dos(['a', 'b'])}</div>);
      const otro = screen.getByRole('button', { name: 'otro' });
      otro.focus();
      rerender(<div><button type="button">otro</button>{dos(['a'])}</div>);
      expect(document.activeElement).toBe(otro);
    });
  });
});
