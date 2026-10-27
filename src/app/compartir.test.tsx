import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compartirTexto, WA_ME_URL } from './compartir';

/** deja navigator/window como los quiere cada test y los devuelve al final */
const original = { clipboard: navigator.clipboard, share: navigator.share, canShare: navigator.canShare, open: window.open, exec: document.execCommand };
const poner = (k: 'clipboard' | 'share' | 'canShare', v: unknown) => Object.defineProperty(navigator, k, { value: v, configurable: true });

beforeEach(() => {
  poner('clipboard', undefined);
  poner('share', undefined);
  poner('canShare', undefined);
  window.open = vi.fn() as unknown as typeof window.open;
  document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;
});
afterEach(() => {
  poner('clipboard', original.clipboard);
  poner('share', original.share);
  poner('canShare', original.canShare);
  window.open = original.open;
  document.execCommand = original.exec;
});

describe('compartirTexto · "Copiar el link"', () => {
  it('copia y avisa, sin tocar Web Share ni WhatsApp', async () => {
    const writeText = vi.fn(async () => {});
    poner('clipboard', { writeText });
    poner('share', vi.fn());
    const avisarCopiado = vi.fn();

    const ok = await compartirTexto('https://heladera.example/l/abc', { avisarCopiado, soloCopiar: true });

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://heladera.example/l/abc');
    expect(avisarCopiado).toHaveBeenCalledTimes(1);
    expect(navigator.share).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('sin portapapeles moderno (http en la red de casa) copia igual con el camino viejo', async () => {
    document.execCommand = vi.fn(() => true) as unknown as typeof document.execCommand;
    const avisarCopiado = vi.fn();

    const ok = await compartirTexto('link', { avisarCopiado, soloCopiar: true });

    expect(ok).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(avisarCopiado).toHaveBeenCalledTimes(1);
    // y no quedó basura en el DOM
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('si no se pudo copiar, devuelve false y NO abre WhatsApp (un botón que dice Copiar no manda mensajes)', async () => {
    poner('clipboard', { writeText: vi.fn(async () => { throw new Error('sin permiso'); }) });
    poner('share', vi.fn());
    const avisarCopiado = vi.fn();

    const ok = await compartirTexto('link', { avisarCopiado, soloCopiar: true, whatsapp: true });

    expect(ok).toBe(false);              // quien llama muestra el error
    expect(avisarCopiado).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(navigator.share).not.toHaveBeenCalled();
  });
});

describe('compartirTexto · "Mandar"', () => {
  it('usa Web Share primero', async () => {
    const share = vi.fn(async () => {});
    poner('share', share);
    poner('clipboard', { writeText: vi.fn(async () => {}) });

    const ok = await compartirTexto('lista', { avisarCopiado: vi.fn(), whatsapp: true });

    expect(ok).toBe(true);
    expect(share).toHaveBeenCalledWith({ text: 'lista' });
    expect(window.open).not.toHaveBeenCalled();
  });

  it('cancelar el diálogo del sistema NO es un fallo: no sigue probando nada más', async () => {
    poner('share', vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }));
    const avisarCopiado = vi.fn();

    const ok = await compartirTexto('lista', { avisarCopiado, whatsapp: true });

    expect(ok).toBe(true);
    expect(avisarCopiado).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('sin Web Share ni portapapeles, último recurso WhatsApp', async () => {
    const ok = await compartirTexto('hola mundo', { avisarCopiado: vi.fn(), whatsapp: true });
    expect(ok).toBe(true);
    expect(window.open).toHaveBeenCalledWith(`${WA_ME_URL}${encodeURIComponent('hola mundo')}`, '_blank', 'noopener');
  });

  it('sin ningún camino disponible devuelve false', async () => {
    expect(await compartirTexto('hola', { avisarCopiado: vi.fn() })).toBe(false);
  });
});
