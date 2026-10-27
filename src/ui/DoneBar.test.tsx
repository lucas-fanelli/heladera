import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { textos } from '@/ui/textos';
import { COUNTER_DELAY, vuelo } from '@/motion/tokens';
import { DoneBar, retardoRodillo } from './DoneBar';

type Props = React.ComponentProps<typeof DoneBar>;

function pintar(over: Partial<Props> = {}) {
  const props: Props = {
    cantidad: 4, abierto: false, onToggleAbierto: vi.fn(), confirmando: false,
    onPedirVaciar: vi.fn(), onConfirmarVaciar: vi.fn(), onCancelarVaciar: vi.fn(), ...over,
  };
  const r = render(<DoneBar {...props} />);
  const repintar = (cambios: Partial<Props>) => r.rerender(<DoneBar {...props} {...cambios} />);
  return { ...props, ...r, repintar };
}

describe('DoneBar', () => {
  it('sin comprados no se ve ni se opera (aria-hidden + inert), pero sigue montada: es el destino de los vuelos', () => {
    const bolsilloRef = { current: null as HTMLElement | null };
    pintar({ cantidad: 0, bolsilloRef });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(bolsilloRef.current).not.toBeNull();
    const bar = bolsilloRef.current!.closest('[data-visible]')!;
    expect(bar).toHaveAttribute('data-visible', 'false');
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar).toHaveAttribute('inert');
  });

  it('el toggle dice "Comprados (N)" con aria-expanded y llama onToggleAbierto', async () => {
    const user = userEvent.setup();
    const p = pintar();
    const t = screen.getByRole('button', { name: textos.lista.compradosN(4) });
    expect(t).toHaveAttribute('aria-expanded', 'false');
    await user.click(t);
    expect(p.onToggleAbierto).toHaveBeenCalledTimes(1);
  });

  it('"Vaciar" pide confirmación; "¿Vaciar N? Sí" confirma; tap afuera cancela', async () => {
    const user = userEvent.setup();
    const p = pintar();
    await user.click(screen.getByRole('button', { name: textos.lista.vaciar }));
    expect(p.onPedirVaciar).toHaveBeenCalledTimes(1);

    p.repintar({ confirmando: true });
    const si = await screen.findByRole('button', { name: textos.lista.vaciarConfirmar(4) });
    await user.click(si);
    expect(p.onConfirmarVaciar).toHaveBeenCalledTimes(1);
    expect(p.onCancelarVaciar).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(p.onCancelarVaciar).toHaveBeenCalledTimes(1);
  });

  it('es UN solo botón: tras pedir Vaciar el foco sigue en él y su nombre pasa a "¿Vaciar N? Sí"', async () => {
    const user = userEvent.setup();
    const p = pintar();
    const boton = screen.getByRole('button', { name: textos.lista.vaciar });
    await user.click(boton);
    expect(document.activeElement).toBe(boton);

    p.repintar({ confirmando: true });
    expect(document.activeElement).toBe(boton);
    expect(boton).toHaveAccessibleName(textos.lista.vaciarConfirmar(4));
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('Escape cancela y el foco sigue en el mismo botón; al volver a "Vaciar" tampoco se pierde', async () => {
    const user = userEvent.setup();
    const p = pintar();
    const boton = screen.getByRole('button', { name: textos.lista.vaciar });
    await user.click(boton);
    p.repintar({ confirmando: true });
    await user.keyboard('{Escape}');
    expect(p.onCancelarVaciar).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(boton);

    // el timeout de useLista (o el Escape) vuelve confirmando a false: mismo botón, rótulo de vuelta
    p.repintar({ confirmando: false });
    expect(document.activeElement).toBe(boton);
    expect(boton).toHaveAccessibleName(textos.lista.vaciar);
  });

  describe('bolsillo: el rótulo recibe los vuelos', () => {
    it('expone el rótulo "Comprados (N)" en bolsilloRef (destino de los vuelos) y el nombre accesible es uno solo aunque el número ruede', () => {
      const bolsilloRef = { current: null as HTMLElement | null };
      const p = pintar({ cantidad: 3, bolsilloRef });
      expect(bolsilloRef.current).not.toBeNull();
      expect(bolsilloRef.current).toHaveTextContent(textos.lista.compradosN(3));
      p.repintar({ cantidad: 4 });
      // durante el rodillo conviven "3" (saliendo) y "4": el botón sigue llamándose "Comprados (4)"
      expect(screen.getByRole('button', { name: textos.lista.compradosN(4) })).toBeInTheDocument();
    });

    it('el número espera a que la fila aterrice solo si hay filas llegando volando; si no, confirma como el contador', () => {
      expect(retardoRodillo(1)).toBe(vuelo.dur);
      expect(retardoRodillo(0)).toBe(COUNTER_DELAY());
    });
  });
});
