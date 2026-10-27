import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Item, Mercado, Sugerencia } from '@/db/types';
import type { FilaVM } from '@/app/useLista';
import { textos } from '@/ui/textos';
import * as motionTokens from '@/motion/tokens';
import * as motionVuelo from '@/motion/vuelo';
import { Lista } from './Lista';

// espiamos el stagger de salida: solo se aplica cuando el motivo de la salida es 'vaciar'
vi.mock('@/motion/tokens', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/motion/tokens')>();
  return { ...real, staggerExit: vi.fn(real.staggerExit) };
});
const staggerExit = vi.mocked(motionTokens.staggerExit);
// y la medición del vuelo: solo se consulta cuando una fila va al bolsillo o sale de él
vi.mock('@/motion/vuelo', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/motion/vuelo')>();
  return { ...real, vueloEntre: vi.fn(real.vueloEntre) };
});
const vueloEntre = vi.mocked(motionVuelo.vueloEntre);

/** un rótulo "Comprados (N)" con tamaño (jsdom no mide): destino de los vuelos */
function rotuloFalso(): { current: HTMLElement | null } {
  const el = document.createElement('span');
  el.getBoundingClientRect = () => ({ left: 40, top: 500, width: 100, height: 24, right: 140, bottom: 524, x: 40, y: 500, toJSON: () => ({}) });
  return { current: el };
}

const AHORA = 1_700_000_000_000;
function item(id: string, texto: string, estado: 'pendiente' | 'comprado' = 'pendiente', mercado: string | null = null): Item {
  return {
    id, texto, textoNorm: texto.toLowerCase(), estado, agregadoEn: AHORA - 1000, agregadoPor: 'm1', agregadoPorNombre: 'Papá',
    compradoEn: estado === 'comprado' ? AHORA - 500 : null, compradoPor: estado === 'comprado' ? 'm1' : null, compradoPorNombre: estado === 'comprado' ? 'Papá' : null,
    borradoEn: null, actualizadoEn: AHORA, mercado, pendiente: false,
  };
}
const MERCA: Mercado = { id: 'x-merca', nombre: 'Mercadona', creadoEn: 1 };
const VERDU: Mercado = { id: 'x-verdu', nombre: 'La Verdulería', creadoEn: 2 };
const vm = (it: Item, grupo: 'pendiente' | 'comprado'): FilaVM => ({ item: it, grupo, tachado: grupo === 'comprado', enEspera: false, protagonista: false, resaltada: false });
const sug: Sugerencia[] = [{ texto: 'Yogur griego', textoNorm: 'yogur griego', veces: 2, ultimaVez: AHORA }];

function pintar(over: Partial<React.ComponentProps<typeof Lista>> = {}) {
  const props: React.ComponentProps<typeof Lista> = {
    pendientes: [vm(item('a', 'Leche'), 'pendiente'), vm(item('b', 'Pan'), 'pendiente')],
    comprados: [vm(item('c', 'Huevos', 'comprado'), 'comprado')],
    compradosAbierto: false, filtroActivo: false, consulta: '', ocultos: 0, vacio: 'ninguno', vuelos: true,
    yo: { memberId: null, nombre: null }, miembros: [], ahora: AHORA,
    sugerencias: [], mostrarSugerencias: false, scrollA: null,
    onToggle: vi.fn(), onEditar: vi.fn(), onSugerencia: vi.fn(), onBorrarSugerencia: vi.fn(), onVolverAAnotar: vi.fn(), onReintentar: vi.fn(),
    ...over,
  };
  const r = render(<Lista {...props} />);
  const repintar = (cambios: Partial<React.ComponentProps<typeof Lista>>) => r.rerender(<Lista {...props} {...cambios} />);
  return { ...props, repintar };
}

describe('Lista · secciones por súper (D16)', () => {
  const ids = () => within(screen.getByRole('list')).getAllByRole('listitem').map(li => li.getAttribute('data-id'));

  it('sin súper creados no aparece ningún título: la lista es la de siempre', () => {
    pintar({ mercados: [] });
    expect(ids()).toEqual(['a', 'b']);
    expect(screen.queryByRole('heading', { name: 'Mercadona' })).not.toBeInTheDocument();
  });

  it('si todo lo que falta es del mismo súper tampoco hay título (no hay nada que agrupar)', () => {
    pintar({
      mercados: [MERCA, VERDU],
      pendientes: [vm(item('a', 'Leche', 'pendiente', 'x-merca'), 'pendiente'), vm(item('b', 'Pan', 'pendiente', 'x-merca'), 'pendiente')],
    });
    expect(ids()).toEqual(['a', 'b']);
    expect(screen.queryByRole('heading', { name: 'Mercadona' })).not.toBeInTheDocument();
  });

  it('lo que no tiene súper va primero y SIN título; los súper vienen abajo con el suyo', () => {
    pintar({
      mercados: [MERCA, VERDU],
      pendientes: [
        vm(item('a', 'Leche', 'pendiente', 'x-merca'), 'pendiente'),
        vm(item('b', 'Pan'), 'pendiente'),
        vm(item('c', 'Yerba', 'pendiente', 'x-verdu'), 'pendiente'),
      ],
    });
    expect(ids()).toEqual(['b', 'enc-p-x-merca', 'a', 'enc-p-x-verdu', 'c']);
    expect(screen.getByRole('heading', { name: 'Mercadona' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: textos.lista.enCualquiera })).not.toBeInTheDocument();
  });

  it('con un súper buscado, ese va arriba y el de "en cualquiera" pasa a llevar título', () => {
    pintar({
      mercados: [MERCA, VERDU],
      mercadoPrimero: 'x-verdu',
      filtroActivo: true,
      pendientes: [vm(item('a', 'Leche'), 'pendiente'), vm(item('c', 'Yerba', 'pendiente', 'x-verdu'), 'pendiente')],
    });
    expect(ids()).toEqual(['enc-p-x-verdu', 'c', 'enc-p-sin-mercado', 'a']);
    expect(screen.getByRole('heading', { name: textos.lista.enCualquiera })).toBeInTheDocument();
  });

  it('el mismo súper arriba y abajo no repite keys: los encabezados de pendientes y comprados son distintos', () => {
    pintar({
      mercados: [MERCA, VERDU],
      compradosAbierto: true,
      pendientes: [vm(item('a', 'Leche', 'pendiente', 'x-merca'), 'pendiente'), vm(item('b', 'Pan'), 'pendiente')],
      comprados: [vm(item('c1', 'Huevos', 'comprado', 'x-merca'), 'comprado'), vm(item('c2', 'Sal', 'comprado'), 'comprado')],
    });
    const ids = within(screen.getByRole('list')).getAllByRole('listitem').map(li => li.getAttribute('data-id'));
    // dos secciones "Mercadona" (una arriba, otra abajo) con ids distintos, y nada repetido en toda la lista
    expect(ids).toEqual(['b', 'enc-p-x-merca', 'a', 'c2', 'enc-c-x-merca', 'c1']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('los comprados se agrupan igual: el súper viaja con el ítem', () => {
    pintar({
      mercados: [MERCA, VERDU],
      compradosAbierto: true,
      pendientes: [],
      comprados: [
        vm(item('c1', 'Huevos', 'comprado', 'x-merca'), 'comprado'),
        vm(item('c2', 'Sal', 'comprado'), 'comprado'),
      ],
    });
    expect(ids()).toEqual(['c2', 'enc-c-x-merca', 'c1']);
  });
});

describe('Lista', () => {
  beforeEach(() => { staggerExit.mockClear(); vueloEntre.mockClear(); });

  it('es UNA sola lista: pendientes primero y los comprados solo si el grupo está abierto', () => {
    pintar();
    const lista = screen.getByRole('list');
    const items = within(lista).getAllByRole('listitem');
    expect(items.map(li => li.getAttribute('data-id'))).toEqual(['a', 'b']);
    expect(screen.queryByText('Huevos')).not.toBeInTheDocument();
  });

  it('con el grupo abierto los comprados van después de los pendientes, en la misma <ul>', () => {
    pintar({ compradosAbierto: true });
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map(li => li.getAttribute('data-id'))).toEqual(['a', 'b', 'c']);
  });

  it('bajo filtro: "(N pendientes ocultos)", cabecera "Ya lo compraron" y "volver a anotar"', async () => {
    const user = userEvent.setup();
    const p = pintar({ filtroActivo: true, consulta: 'hue', compradosAbierto: true, pendientes: [], ocultos: 2 });
    expect(screen.getByText(textos.lista.ocultosPorFiltro(2))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: textos.lista.yaLoCompraron })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: textos.lista.volverAAnotar }));
    expect(p.onVolverAAnotar).toHaveBeenCalledWith('c');
  });

  it('muestra el estado vacío del filtro y los chips de sugerencias (un tap agrega)', async () => {
    const user = userEvent.setup();
    const p = pintar({ pendientes: [], comprados: [], filtroActivo: true, consulta: 'yog', vacio: 'filtro', sugerencias: sug, mostrarSugerencias: true });
    expect(screen.getByText(textos.vacio.filtroTitulo)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: textos.lista.otrasVeces })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: textos.input.agregarX('Yogur griego') }));
    expect(p.onSugerencia).toHaveBeenCalledWith('Yogur griego');
  });

  it('un chip no le roba el foco a quien lo tenga (el input de abajo): el teclado del teléfono sigue abierto', async () => {
    const user = userEvent.setup();
    // un input cualquiera con foco hace de "barra de abajo"
    const input = document.createElement('input'); document.body.appendChild(input); input.focus();
    const p = pintar({ pendientes: [], comprados: [], filtroActivo: true, consulta: 'yog', vacio: 'filtro', sugerencias: sug, mostrarSugerencias: true });
    expect(input).toHaveFocus();
    await user.click(screen.getByRole('button', { name: textos.input.agregarX('Yogur griego') }));
    expect(p.onSugerencia).toHaveBeenCalledWith('Yogur griego');
    expect(input).toHaveFocus();
    input.remove();
  });

  it('"Lo de siempre" cuando no hay filtro; "Reintentar" solo sin señal ni caché', async () => {
    const user = userEvent.setup();
    const p = pintar({ pendientes: [], comprados: [], vacio: 'sinSenalSinCache', sugerencias: sug, mostrarSugerencias: true });
    expect(screen.getByRole('heading', { name: textos.lista.loDeSiempre })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: textos.vacio.reintentar }));
    expect(p.onReintentar).toHaveBeenCalledTimes(1);
  });

  describe('salida de filas (custom de la AnimatePresence)', () => {
    const comprados3 = [vm(item('c', 'Huevos', 'comprado'), 'comprado'), vm(item('d', 'Sal', 'comprado'), 'comprado'), vm(item('e', 'Aceite', 'comprado'), 'comprado')];

    it('al vaciar (los comprados visibles caen a 0) las filas salen con stagger por índice', async () => {
      const p = pintar({ compradosAbierto: true, comprados: comprados3 });
      expect(screen.getByText('Aceite')).toBeInTheDocument();
      await act(async () => { p.repintar({ comprados: [] }); });
      expect(staggerExit).toHaveBeenCalled();
      // Motion resuelve la variante más de una vez por fila: nos importa el conjunto de índices
      const indices = [...new Set(staggerExit.mock.calls.map(c => c[0]))].sort();
      expect(indices).toEqual([0, 1, 2]);
    });

    it('una salida normal (tildar con Comprados cerrado, filtrar) NO lleva stagger', async () => {
      const p = pintar({ compradosAbierto: true, comprados: comprados3 });
      await act(async () => { p.repintar({ pendientes: [vm(item('b', 'Pan'), 'pendiente')] }); });
      expect(staggerExit).not.toHaveBeenCalled();
    });

    it('sacar UN comprado (quedan otros) tampoco es vaciar', async () => {
      const p = pintar({ compradosAbierto: true, comprados: comprados3 });
      await act(async () => { p.repintar({ comprados: comprados3.slice(1) }); });
      expect(staggerExit).not.toHaveBeenCalled();
    });
  });

  describe('bolsillo (vuelos al/desde el rótulo "Comprados (N)")', () => {
    const comprados3 = [vm(item('c', 'Huevos', 'comprado'), 'comprado'), vm(item('d', 'Sal', 'comprado'), 'comprado'), vm(item('e', 'Aceite', 'comprado'), 'comprado')];

    it('tildar con Comprados cerrado: al terminar la espera, la fila que se va vuela al rótulo (se mide el vuelo)', async () => {
      const bolsillo = rotuloFalso();
      // 'a' ya está comprada en el Db pero se ve arriba, tachada, esperando (Fase A)
      const a = vm(item('a', 'Leche', 'comprado'), 'pendiente');
      const p = pintar({ bolsillo, pendientes: [{ ...a, tachado: true, enEspera: true }, vm(item('b', 'Pan'), 'pendiente')], comprados: [comprados3[0]!], compradosAbierto: false });
      // termina la espera: 'a' pasa al grupo comprado, que está cerrado → sale de la lista
      await act(async () => { p.repintar({ pendientes: [vm(item('b', 'Pan'), 'pendiente')], comprados: [comprados3[0]!, vm(item('a', 'Leche', 'comprado'), 'comprado')] }); });
      expect(vueloEntre).toHaveBeenCalled();
      expect(vueloEntre.mock.calls.every(c => c[1] === bolsillo.current)).toBe(true);
      expect(staggerExit).not.toHaveBeenCalled();
    });

    it('cerrar Comprados: las TRES filas vuelan al bolsillo (no es "vaciar" aunque los visibles caigan a 0)', async () => {
      const bolsillo = rotuloFalso();
      const p = pintar({ bolsillo, compradosAbierto: true, comprados: comprados3 });
      await act(async () => { p.repintar({ compradosAbierto: false }); });
      // una medición por fila (Motion puede resolver la variante más de una vez: contamos orígenes distintos)
      const origenes = new Set(vueloEntre.mock.calls.map(c => c[0]));
      expect(origenes.size).toBe(3);
      expect(vueloEntre.mock.calls.every(c => c[1] === bolsillo.current)).toBe(true);
      expect(staggerExit).not.toHaveBeenCalled();
    });

    it('un comprado oculto que vuelve a pendientes (destildar desde otro teléfono, deshacer) entra desde el bolsillo', async () => {
      const bolsillo = rotuloFalso();
      const p = pintar({ bolsillo, compradosAbierto: false, comprados: comprados3 });
      // 'd' (Sal) deja de estar comprada: aparece arriba
      await act(async () => { p.repintar({ pendientes: [vm(item('a', 'Leche'), 'pendiente'), vm(item('b', 'Pan'), 'pendiente'), vm(item('d', 'Sal'), 'pendiente')], comprados: [comprados3[0]!, comprados3[2]!] }); });
      expect(vueloEntre).toHaveBeenCalledTimes(1);
      expect(vueloEntre.mock.calls[0]![1]).toBe(bolsillo.current);
      const fila = document.querySelector('li[data-id="d"]')!;
      expect(fila).toHaveAttribute('data-entrada', 'bolsillo');
      // una fila nueva (agregada), en cambio, entra como siempre
      vueloEntre.mockClear();
      await act(async () => { p.repintar({ pendientes: [vm(item('a', 'Leche'), 'pendiente'), vm(item('b', 'Pan'), 'pendiente'), vm(item('d', 'Sal'), 'pendiente'), vm(item('n', 'Nueva'), 'pendiente')], comprados: [comprados3[0]!, comprados3[2]!] }); });
      expect(vueloEntre).not.toHaveBeenCalled();
      expect(document.querySelector('li[data-id="n"]')).not.toHaveAttribute('data-entrada');
    });

    it('vaciar sigue siendo vaciar: los ítems se fueron (no están en el bolsillo), stagger y sin vuelo', async () => {
      const bolsillo = rotuloFalso();
      const p = pintar({ bolsillo, compradosAbierto: true, comprados: comprados3 });
      await act(async () => { p.repintar({ comprados: [] }); });
      expect(staggerExit).toHaveBeenCalled();
      expect(vueloEntre).not.toHaveBeenCalled();
    });

    it('abrir Comprados: las filas entran desde el bolsillo (se mide el vuelo desde el rótulo)', async () => {
      const bolsillo = rotuloFalso();
      const p = pintar({ bolsillo, compradosAbierto: false, comprados: comprados3 });
      expect(screen.queryByText('Huevos')).not.toBeInTheDocument();
      await act(async () => { p.repintar({ compradosAbierto: true }); });
      const filas = within(screen.getByRole('list')).getAllByRole('listitem').filter(li => li.getAttribute('data-grupo') === 'comprado');
      expect(filas).toHaveLength(3);
      expect(vueloEntre).toHaveBeenCalledTimes(3);
      expect(vueloEntre.mock.calls.every(c => c[1] === bolsillo.current)).toBe(true);
    });

    it('con filtro no hay vuelos (PantallaLista pasa vuelos=false): "Ya lo compraron" entra y sale con fundido, sin medir nada', async () => {
      const bolsillo = rotuloFalso();
      const p = pintar({ bolsillo, vuelos: false, filtroActivo: true, consulta: 'sal', compradosAbierto: true, pendientes: [], comprados: [] });
      await act(async () => { p.repintar({ comprados: [comprados3[1]!] }); });   // 'Sal' coincide → aparece
      await act(async () => { p.repintar({ consulta: 'salx', comprados: [] }); });   // deja de coincidir → se va
      expect(vueloEntre).not.toHaveBeenCalled();
    });

    it('sin rótulo (la DoneBar no está): la fila sale como cualquiera, sin romper', async () => {
      const p = pintar({ compradosAbierto: true, comprados: comprados3 });
      await act(async () => { p.repintar({ compradosAbierto: false }); });
      // se consultó el vuelo, pero sin destino no hay traslado (null) y la salida es la normal
      expect(vueloEntre).toHaveBeenCalled();
      expect(vueloEntre.mock.results.every(r => r.value === null)).toBe(true);
    });
  });

  describe('colchón (la lista no salta cuando se van filas)', () => {
    const comprados3 = [vm(item('c', 'Huevos', 'comprado'), 'comprado'), vm(item('d', 'Sal', 'comprado'), 'comprado'), vm(item('e', 'Aceite', 'comprado'), 'comprado')];
    const ALTO_FILA = 56;
    // jsdom no mide: cada <li> "mide" 56 px
    let restaurar: (() => void) | null = null;
    beforeEach(() => {
      const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.tagName === 'LI' ? ALTO_FILA : 0; } });
      restaurar = () => { if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', desc); };
    });
    afterEach(() => { restaurar?.(); });

    /** jsdom no scrollea: simulamos un contenedor con más contenido que pantalla y el usuario al fondo (o arriba) */
    const scrollFalso = (pos: 'fondo' | 'arriba' | 'corta') => {
      const sc = screen.getByRole('list').parentElement!;
      const [scrollHeight, clientHeight, scrollTop] = pos === 'corta' ? [400, 500, 0] : pos === 'fondo' ? [1000, 500, 500] : [1000, 500, 0];
      Object.defineProperty(sc, 'scrollHeight', { configurable: true, value: scrollHeight });
      Object.defineProperty(sc, 'clientHeight', { configurable: true, value: clientHeight });
      Object.defineProperty(sc, 'scrollTop', { configurable: true, value: scrollTop, writable: true });
    };

    it('al cerrar Comprados estando al fondo, el colchón sostiene el alto de las filas que salen en el MISMO commit', async () => {
      // con animaciones reales (escala 1) las filas tardan en salir: el colchón tiene que verse sostenido mientras tanto
      // (en jsdom las salidas con opacity no terminan nunca —WAAPI a medias—, así que la suelta se prueba aparte, con escala 0)
      window.__MOTION_SCALE__ = 1;
      try {
        const p = pintar({ compradosAbierto: true, comprados: comprados3 });
        scrollFalso('fondo');
        const colchon = screen.getByTestId('colchon');
        expect(colchon).toHaveAttribute('aria-hidden', 'true');
        expect(colchon.style.height).toBe('0px');
        await act(async () => { p.repintar({ compradosAbierto: false }); });
        expect(colchon.style.height).toBe(`${3 * ALTO_FILA}px`);   // sostenido en el commit en que las filas salieron
      } finally {
        window.__MOTION_SCALE__ = 0;
      }
    });

    it('cuando las filas terminaron de salir, el colchón se suelta y vuelve a 0', async () => {
      const p = pintar({ compradosAbierto: true, comprados: comprados3 });
      scrollFalso('fondo');
      const colchon = screen.getByTestId('colchon');
      await act(async () => { p.repintar({ compradosAbierto: false }); });
      // el commit lo puso en 168 (ver test anterior); con las salidas instantáneas, onExitComplete → soltar → 0
      await waitFor(() => expect(colchon.style.height).toBe('0px'));
    });

    it('si el scroll no saltaría (arriba de todo, o la lista entra en pantalla), no hay colchón: cero costo', async () => {
      window.__MOTION_SCALE__ = 1;
      try {
        for (const pos of ['arriba', 'corta'] as const) {
          const p = pintar({ compradosAbierto: true, comprados: comprados3 });
          scrollFalso(pos);
          const colchon = screen.getByTestId('colchon');
          await act(async () => { p.repintar({ compradosAbierto: false }); });
          expect(colchon.style.height).toBe('0px');
          document.body.innerHTML = '';
        }
      } finally {
        window.__MOTION_SCALE__ = 0;
      }
    });

    it('si entran filas, el hueco se llena solo: no hay colchón', async () => {
      const p = pintar({ compradosAbierto: false, comprados: comprados3 });
      await act(async () => { p.repintar({ compradosAbierto: true }); });
      expect(screen.getByTestId('colchon').style.height).toBe('0px');
    });
  });

  describe('sin rótulo', () => {
    const comprados3 = [vm(item('c', 'Huevos', 'comprado'), 'comprado'), vm(item('d', 'Sal', 'comprado'), 'comprado'), vm(item('e', 'Aceite', 'comprado'), 'comprado')];
    it('(la DoneBar no está): la fila sale como cualquiera, sin romper', async () => {
      const p = pintar({ compradosAbierto: true, comprados: comprados3 });
      await act(async () => { p.repintar({ compradosAbierto: false }); });
      // se consultó el vuelo, pero sin destino no hay traslado (null) y la salida es la normal
      expect(vueloEntre).toHaveBeenCalled();
      expect(vueloEntre.mock.results.every(r => r.value === null)).toBe(true);
    });
  });
});
