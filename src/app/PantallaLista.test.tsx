/**
 * Integración del bolsillo en la pantalla real (useLista + Lista + DoneBar con el Db falso):
 * el primer comprado de la compra tiene que volar igual que los demás, aunque la DoneBar "aparezca" en el mismo commit
 * en que la fila sale (por eso la barra está siempre montada), y la DoneBar tiene que saber que le llega una fila.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearDbFake, type FakeDb } from '@/db/fake';
import { LONG_PRESS_MS, timing } from '@/domain/timing';
import { textos } from '@/ui/textos';
import * as motionVuelo from '@/motion/vuelo';
import { PantallaLista } from './PantallaLista';

vi.mock('@/motion/vuelo', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/motion/vuelo')>();
  return { ...real, vueloEntre: vi.fn(real.vueloEntre) };
});
const vueloEntre = vi.mocked(motionVuelo.vueloEntre);

const PAPA = { memberId: 'm-papa', nombre: 'Papá' };
let db: FakeDb;
let listId: string;

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const avanzar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  window.__MOTION_SCALE__ = 0;
  vueloEntre.mockClear();
  db = crearDbFake({ semilla: 'vacio' });
  listId = await db.crearLista('Casa', ['Papá']);
  db.agregarItem(listId, 'Leche', PAPA);
  db.agregarItem(listId, 'Pan', PAPA);
  localStorage.setItem(`heladera:yo:${listId}`, JSON.stringify(PAPA));   // ya sabemos quién es: sin sheet ¿Quién sos?
});
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('PantallaLista · bolsillo', () => {
  it('el PRIMER comprado vuela: la DoneBar (0 comprados) ya está montada y su rótulo se mide al salir la fila', async () => {
    render(<PantallaLista db={db} listId={listId} anotar={false} />);
    await flush();
    expect(screen.getByRole('checkbox', { name: textos.lista.tildar('Leche') })).toBeInTheDocument();
    // sin comprados: la barra no se ve ni se opera, pero existe
    expect(screen.queryByRole('button', { name: textos.lista.compradosN(0) })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: textos.lista.tildar('Leche') }));
    await avanzar(timing().HOLD_MS + 5);   // termina la espera: la fila baja al bolsillo (cerrado) → vuela

    expect(vueloEntre).toHaveBeenCalled();
    const destinos = vueloEntre.mock.calls.map(c => c[1]);
    expect(destinos.every(d => d instanceof HTMLElement && d.textContent?.includes(textos.lista.compradosN(1).slice(0, 9)))).toBe(true);
    expect(screen.getByRole('button', { name: textos.lista.compradosN(1) })).toBeInTheDocument();
  });

  it('con filtro activo la fila no vuela (se queda en "Ya lo compraron")', async () => {
    render(<PantallaLista db={db} listId={listId} anotar={false} />);
    await flush();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lec' } });
    fireEvent.click(screen.getByRole('checkbox', { name: textos.lista.tildar('Leche') }));
    await avanzar(timing().HOLD_MS + 5);
    expect(vueloEntre).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: textos.lista.destildar('Leche') })).toBeInTheDocument();
  });
});

/**
 * Olvidar una sugerencia (D22). El caso real: alguien anotó "hola" una vez y quedó sugerido para siempre.
 * Se prueba entera la cadena —gesto → pregunta → Db— porque el valor está en el cableado, no en las piezas.
 */
describe('PantallaLista · olvidar una sugerencia', () => {
  const escribir = async (texto: string) => {
    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: texto } });
    await flush();
  };

  it('mantener apretada la sugerencia pregunta; confirmar la olvida y no agrega el ítem', async () => {
    render(<PantallaLista db={db} listId={listId} anotar={false} />);
    await flush();
    await escribir('yerb');                                     // la semilla trae "Yerba"
    const chip = screen.getByRole('button', { name: textos.input.agregarX('Yerba') });

    fireEvent.pointerDown(chip);
    await avanzar(LONG_PRESS_MS + 50);
    expect(screen.getByRole('heading', { name: textos.sugerencias.olvidarTitulo('Yerba') })).toBeInTheDocument();

    fireEvent.pointerUp(chip);                                   // soltar la pulsación larga no agrega
    fireEvent.click(chip);
    await flush();
    expect(screen.queryByRole('checkbox', { name: textos.lista.tildar('Yerba') })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: textos.sugerencias.olvidarSi }));
    await flush();
    await escribir('yerb');
    expect(screen.queryByRole('button', { name: textos.input.agregarX('Yerba') })).not.toBeInTheDocument();
  });

  it('el toast la puede devolver', async () => {
    render(<PantallaLista db={db} listId={listId} anotar={false} />);
    await flush();
    await escribir('yerb');
    fireEvent.pointerDown(screen.getByRole('button', { name: textos.input.agregarX('Yerba') }));
    await avanzar(LONG_PRESS_MS + 50);
    fireEvent.click(screen.getByRole('button', { name: textos.sugerencias.olvidarSi }));
    await flush();

    fireEvent.click(screen.getByRole('button', { name: textos.toasts.deshacer }));
    await flush();
    await escribir('yerb');
    expect(screen.getByRole('button', { name: textos.input.agregarX('Yerba') })).toBeInTheDocument();
  });

  it('en "Lo de siempre" (sin filtro), cancelar la pregunta no se lleva puestos los chips', async () => {
    // el diálogo es modal: se roba el foco del input, y sin foco los chips de "Lo de siempre" no se muestran.
    // Si eso no se contempla, mantener apretado + Cancelar deja la pantalla sin sugerencias hasta volver a tocar el input.
    render(<PantallaLista db={db} listId={listId} anotar={false} />);
    await flush();
    await act(async () => { (screen.getByRole('searchbox') as HTMLElement).focus(); });   // sin escribir nada: "Lo de siempre"
    await flush();
    const chip = screen.getByRole('button', { name: textos.input.agregarX('Aceite') });

    fireEvent.pointerDown(chip);
    await avanzar(LONG_PRESS_MS + 50);
    await act(async () => { (screen.getByRole('searchbox') as HTMLElement).blur(); });     // lo que hace showModal() de verdad
    await flush();
    expect(screen.getByRole('heading', { name: textos.sugerencias.olvidarTitulo('Aceite') })).toBeInTheDocument();
    // el chip sigue exactamente donde estaba mientras la pregunta está abierta
    expect(screen.getByRole('button', { name: textos.input.agregarX('Aceite') })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: textos.confirmar.cancelar }));
    await flush();
    expect(screen.getByRole('button', { name: textos.input.agregarX('Aceite') })).toBeInTheDocument();
  });

  it('un toque normal sigue agregando: el gesto nuevo no se come el viejo', async () => {
    render(<PantallaLista db={db} listId={listId} anotar={false} />);
    await flush();
    await escribir('yerb');
    fireEvent.click(screen.getByRole('button', { name: textos.input.agregarX('Yerba') }));
    await flush();
    expect(screen.queryByRole('heading', { name: textos.sugerencias.olvidarTitulo('Yerba') })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: textos.lista.tildar('Yerba') })).toBeInTheDocument();
  });
});

/**
 * Los DOS `catch` de `refrescarAccesos`. Se escribieron iguales (`() => null`) una línea abajo de la otra, y no
 * lo son: `match /acceso/{uid}` deja listar las llaves a cualquier miembro (`allow list: if esMiembro`,
 * firestore.rules:125), así que ahí un fallo es una falla REAL; `match /invitaciones/{codigo}` solo al dueño
 * (`allow get, list: if esDuenio`, firestore.rules:157), así que ahí el fallo es el camino esperado del que no
 * es dueño. Un solo centinela para los dos dejaba a la hoja sin poder decir cuál de las dos cosas pasó, y
 * pintando «no hay nadie con acceso» cuando lo que había pasado era que no pudo leer. Esto no se ve desde un
 * test de la hoja: el split vive en el wiring, así que se fija acá — y esto es lo que impide que una limpieza
 * futura los vuelva a juntar «porque son la misma línea».
 */
describe('PantallaLista · las llaves y las invitaciones no comparten centinela', () => {
  const abrirAccesos = async () => {
    fireEvent.click(screen.getByRole('button', { name: textos.header.menu }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(textos.menu.accesos) }));
    await flush();
  };

  it('si falla leer las llaves, la hoja lo dice en vez de mostrarse vacía', async () => {
    const roto = { ...db, listarAccesos: () => Promise.reject(new Error('sin señal')) };
    render(<PantallaLista db={roto} listId={listId} anotar={false} />);
    await flush();
    await abrirAccesos();

    expect(screen.getByText(textos.accesos.noSePudoLeer)).toBeInTheDocument();
    // y con qué volver a intentar: sin el botón, el único control que queda es el «Cerrar» del pie
    expect(screen.getByRole('button', { name: textos.vacio.reintentar })).toBeInTheDocument();
  });

  it('al que no es dueño le sigue fallando listarInvitaciones sin que eso sea un error', async () => {
    const roto = { ...db, listarInvitaciones: () => Promise.reject(new Error('sin permiso')) };
    render(<PantallaLista db={roto} listId={listId} anotar={false} />);
    await flush();
    await abrirAccesos();

    // las llaves llegaron: la hoja NO dice que no pudo leerlas (ese mensaje es de la otra lectura)
    expect(screen.getByRole('heading', { name: textos.accesos.titulo })).toBeInTheDocument();
    expect(screen.queryByText(textos.accesos.noSePudoLeer)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: textos.vacio.reintentar })).not.toBeInTheDocument();
    // y las invitaciones quedan en «no sé»: la sección entera se calla en vez de afirmar que no hay ninguna
    expect(screen.queryByText(textos.accesos.invitacionesVacio)).not.toBeInTheDocument();
  });
});
