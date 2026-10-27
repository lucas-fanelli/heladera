/**
 * El router es el dueño de la URL, y la URL es el vehículo de TODAS las perillas de diagnóstico (`?fps`,
 * `?motion=`, `?hold=`, `?teclado=`). Lo que se fija acá es que moverse por dentro de la app no las apague:
 * si `navegar()` las borra, `?teclado=vk` (D28) muere en el primer "Abrir «Casa»" y la medición del teclado
 * "no reproduce dos veces igual" — que es el disparador de abandono acordado.
 *
 * `.test.tsx` a propósito: el proyecto `unit` corre en `environment: 'node'`, donde no existen `location` ni
 * `history` (vite.config.ts). Solo los `*.test.tsx` caen en el proyecto `ui` con jsdom.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { limpiarAnotar, navegar, urlDeLista } from './router';
import { modoTeclado } from '@/ui/useVisualViewport';
import { pidenMedidor } from '@/ui/Medidor';

/** cada caso arranca de una URL limpia: si no, se ensucian entre sí */
afterEach(() => history.replaceState(null, '', '/'));

/**
 * `modoTeclado(…, null)` a propósito en todo este archivo: la perilla además QUEDA PEDIDA en el teléfono
 * (localStorage, ver `useVisualViewport.ts`), y acá lo que se está fijando es que la URL la lleve. Con el
 * storage de por medio, un `?teclado=vk` de un caso anterior haría pasar a estos tests aunque el router se
 * comiera la query: la memoria taparía justo el bug que vinieron a vigilar.
 */

describe('el router conserva las perillas de la URL', () => {
  it('navegar() a una lista no se lleva puesto ?teclado=', () => {
    history.replaceState(null, '', '/?teclado=vk');
    navegar({ tipo: 'lista', listId: 'abc123', anotar: false });
    expect(location.pathname).toBe('/l/abc123');
    expect(modoTeclado(location.search, null)).toBe('vk');
  });

  it('limpiarAnotar() saca `anotar` y NADA más', () => {
    history.replaceState(null, '', '/l/abc123?anotar&teclado=vk&fps');
    limpiarAnotar();
    expect(location.pathname).toBe('/l/abc123');
    expect(new URLSearchParams(location.search).has('anotar')).toBe(false);
    expect(modoTeclado(location.search, null)).toBe('vk');
    expect(pidenMedidor(location.search)).toBe(true);
  });

  it('volver a la home tampoco las pierde', () => {
    history.replaceState(null, '', '/l/abc123?teclado=vk');
    navegar({ tipo: 'home' });
    expect(location.pathname).toBe('/');
    expect(modoTeclado(location.search, null)).toBe('vk');
  });

  it('navegar() con anotar:true no duplica el parámetro', () => {
    history.replaceState(null, '', '/?anotar&teclado=vk');
    navegar({ tipo: 'lista', listId: 'abc123', anotar: true });
    expect(new URLSearchParams(location.search).getAll('anotar')).toHaveLength(1);
    expect(modoTeclado(location.search, null)).toBe('vk');
  });

  // La inversión: el link que se COMPARTE no lleva la query. Es la llave de la lista y se va por WhatsApp;
  // arrastrar `?teclado=vk` o `?fps` ahí sería el arreglo equivocado de este mismo bug.
  it('el link para compartir queda limpio', () => {
    history.replaceState(null, '', '/l/abc123?teclado=vk&fps');
    const link = urlDeLista('abc123', { absoluta: true });
    expect(link).not.toContain('teclado');
    expect(link).not.toContain('fps');
  });
});
