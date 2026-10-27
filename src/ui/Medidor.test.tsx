import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Medidor, leerTeclado, mediana, pidenMedidor } from './Medidor';

describe('mediana de tiempos entre frames', () => {
  it('con lista vacía es 0', () => {
    expect(mediana([])).toBe(0);
  });

  it('devuelve el valor del medio, no el promedio: un tirón suelto no ensucia el ritmo', () => {
    // nueve frames a 120 Hz y uno de 200 ms: el típico sigue siendo 8,3
    expect(mediana([8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 200])).toBe(8.3);
  });

  it('con cantidad par promedia los dos del medio', () => {
    expect(mediana([16, 8, 32, 8])).toBe(12);   // ordenados: 8, 8, 16, 32
  });
});

describe('pidenMedidor', () => {
  it('solo con ?fps en la URL', () => {
    expect(pidenMedidor('?fps')).toBe(true);
    expect(pidenMedidor('?anotar&fps')).toBe(true);
    expect(pidenMedidor('')).toBe(false);
    expect(pidenMedidor('?anotar')).toBe(false);
  });
});

/**
 * La lectura del teclado (D28). El Medidor es el único lugar del producto donde el modo y el inset se pueden
 * VER, y de eso depende que la sesión de medición sirva: sin el número, «vk corrió y el teclado reportó 0» y
 * «la perilla nunca llegó» se ven igual desde el teléfono. Lee del DOM lo que las superficies leen, no
 * `modoTeclado()`: si preguntara por su cuenta podría reportar un modo que el hook no está corriendo.
 */
describe('leerTeclado (lo que el <html> REALMENTE recibió)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.teclado;
    document.documentElement.style.removeProperty('--kb-inset');
  });

  it('lee el modo publicado y el inset vivo', () => {
    const root = document.documentElement;
    root.dataset.teclado = 'vk';
    root.style.setProperty('--kb-inset', '345px');
    expect(leerTeclado()).toEqual({ teclado: 'vk', kbInset: 345 });
  });

  it('sin nada publicado avisa que el hook ni montó: "—" y 0, que es un cuarto estado, no un cero cualquiera', () => {
    expect(leerTeclado()).toEqual({ teclado: '—', kbInset: 0 });
  });

  it('modo publicado pero teclado guardado: vk 0 — corrió y midió cero, distinto de no haber corrido', () => {
    document.documentElement.dataset.teclado = 'vk';
    expect(leerTeclado()).toEqual({ teclado: 'vk', kbInset: 0 });
  });
});

describe('el Medidor pinta el número, que es el criterio de la sesión de D28', () => {
  afterEach(() => {
    delete document.documentElement.dataset.teclado;
    document.documentElement.style.removeProperty('--kb-inset');
  });

  it('con vk y 345 publicados, se leen de la pantalla', () => {
    const root = document.documentElement;
    root.dataset.teclado = 'vk';
    root.style.setProperty('--kb-inset', '345px');

    render(<Medidor />);

    expect(screen.getByRole('status').textContent).toContain('vk 345');
  });

  it('sin nada publicado muestra "— 0": no se puede confundir con un vk que midió 0', () => {
    render(<Medidor />);
    expect(screen.getByRole('status').textContent).toContain('— 0');
  });
});
