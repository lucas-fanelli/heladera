import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { textos } from '@/ui/textos';
import { Contador } from './Contador';

describe('Contador', () => {
  it('"Faltan 7" con 7 pendientes', () => {
    render(<Contador faltan={7} coincidencias={7} filtroActivo={false} />);
    expect(screen.getByRole('heading')).toHaveTextContent(textos.contador.faltan(7));
    expect(screen.getByRole('status')).toHaveTextContent(textos.contador.aria(7));
  });

  it('"Falta 1" en singular', () => {
    render(<Contador faltan={1} coincidencias={1} filtroActivo={false} />);
    expect(screen.getByRole('heading')).toHaveTextContent(textos.contador.faltan(1));
    expect(screen.getByRole('status')).toHaveTextContent(textos.contador.aria(1));
  });

  it('"No falta nada" a cero', () => {
    render(<Contador faltan={0} coincidencias={0} filtroActivo={false} />);
    expect(screen.getByRole('heading')).toHaveTextContent(textos.contador.faltan(0));
    expect(screen.getByRole('status')).toHaveTextContent(textos.contador.faltan(0));
  });

  it('con filtro agrega "· N coinciden" (y "nada coincide" a cero)', () => {
    const { rerender } = render(<Contador faltan={7} coincidencias={1} filtroActivo />);
    expect(screen.getByRole('heading')).toHaveTextContent(textos.contador.coinciden(1));
    rerender(<Contador faltan={7} coincidencias={0} filtroActivo />);
    expect(screen.getByRole('heading')).toHaveTextContent(textos.contador.ninguna);
  });

  it('el aria-live es polite', () => {
    render(<Contador faltan={3} coincidencias={3} filtroActivo={false} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
