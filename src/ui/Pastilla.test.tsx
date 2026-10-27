import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { textos } from '@/ui/textos';
import { timing } from '@/domain/timing';
import { Pastilla } from './Pastilla';

const AHORA = 1_700_000_000_000;

describe('Pastilla', () => {
  it('muestra "En vivo" con punto + texto y el tooltip; el status (polite) anuncia el estado', () => {
    const { container } = render(<Pastilla conexion="live" pendientesSync={0} ultimaSync={AHORA - 1000} ahora={AHORA} />);
    const visible = container.querySelector('[title]')!;
    expect(visible).toHaveTextContent(textos.header.estado.live);
    expect(visible.getAttribute('title')).toContain(textos.header.estadoTip.live);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(textos.header.estado.live);
    expect(status).not.toHaveTextContent(textos.header.estadoTip.live);
  });

  it('"Sin conexión" se muestra al instante y el status anuncia la explicación y los cambios sin sincronizar', () => {
    render(<Pastilla conexion="offline" pendientesSync={3} ultimaSync={null} ahora={AHORA} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(textos.header.estado.offline);
    expect(status).toHaveTextContent(textos.header.estadoTip.offline);
    expect(status).toHaveTextContent(textos.header.pendientes(3));
  });

  it('el status está siempre montado: al cambiar de estado es el mismo nodo con otro texto', () => {
    const { rerender } = render(<Pastilla conexion="live" pendientesSync={0} ultimaSync={null} ahora={AHORA} />);
    const status = screen.getByRole('status');
    rerender(<Pastilla conexion="offline" pendientesSync={0} ultimaSync={null} ahora={AHORA} />);
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent(textos.header.estado.offline);
  });

  it('anti-parpadeo: "Sincronizando…" solo si dura más de SYNC_SHOW_MIN y después se queda SYNC_HOLD_MIN', () => {
    vi.useFakeTimers();
    const t = timing();
    const { rerender } = render(<Pastilla conexion="live" pendientesSync={0} ultimaSync={AHORA} ahora={AHORA} />);
    // sync corto: nunca se ve
    rerender(<Pastilla conexion="sync" pendientesSync={1} ultimaSync={AHORA} ahora={AHORA} />);
    act(() => { vi.advanceTimersByTime(t.SYNC_SHOW_MIN - 50); });
    expect(screen.getByRole('status')).not.toHaveTextContent(textos.header.estado.sync);
    rerender(<Pastilla conexion="live" pendientesSync={0} ultimaSync={AHORA} ahora={AHORA} />);
    act(() => { vi.advanceTimersByTime(t.SYNC_HOLD_MIN + 100); });
    expect(screen.getByRole('status')).toHaveTextContent(textos.header.estado.live);
    expect(screen.getByRole('status')).not.toHaveTextContent(textos.header.estado.sync);

    // sync largo: se ve, y al volver a live se queda al menos SYNC_HOLD_MIN
    rerender(<Pastilla conexion="sync" pendientesSync={1} ultimaSync={AHORA} ahora={AHORA} />);
    act(() => { vi.advanceTimersByTime(t.SYNC_SHOW_MIN + 10); });
    expect(screen.getByRole('status')).toHaveTextContent(textos.header.estado.sync);
    rerender(<Pastilla conexion="live" pendientesSync={0} ultimaSync={AHORA} ahora={AHORA} />);
    act(() => { vi.advanceTimersByTime(t.SYNC_HOLD_MIN / 2); });
    expect(screen.getByRole('status')).toHaveTextContent(textos.header.estado.sync);
    act(() => { vi.advanceTimersByTime(t.SYNC_HOLD_MIN); });
    expect(screen.getByRole('status')).toHaveTextContent(textos.header.estado.live);
  });
});
