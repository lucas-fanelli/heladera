/**
 * "Quién tiene acceso" (D22 · Etapa 1). Lo que importa probar acá no es que pinte una lista, sino que
 * las dos cosas destructivas —sacarle el acceso a alguien y anular una invitación— pasen SIEMPRE por la
 * pregunta, y que quien no es dueño no las vea siquiera.
 *
 * Y —desde que un `?? []` dejó pintar «no sé» igual que «no hay»— que la hoja no AFIRME lo que todavía no
 * leyó: este sheet contesta una pregunta de seguridad, así que sus tres estados de lectura (cargando, falló,
 * llegó) son tres respuestas distintas y cada una tiene su caso, al final del archivo.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { useCallback, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Acceso, Invitacion, Miembro } from '@/db/types';
import { fechaYHora } from '@/domain/tiempo';
import { poderesDelDuenio, textos } from '@/ui/textos';
import c from '@/ui/controles.module.css';
import { Accesos } from './Accesos';

const AHORA = 1_700_000_000_000;
const DIA = 864e5;

const miembros: Miembro[] = [
  { id: 'm-mama', nombre: 'Mamá', color: 'p1', creadoEn: 1 },
  { id: 'm-papa', nombre: 'Papá', color: 'p2', creadoEn: 2 },
];
const accesos: Acceso[] = [
  { uid: 'uid-mama', memberId: 'm-mama', entroEn: AHORA - 3 * DIA },
  { uid: 'uid-papa', memberId: 'm-papa', entroEn: AHORA - DIA },
  { uid: 'uid-nuevo', memberId: null, entroEn: AHORA - 1000 },
];
const invitacion = (extra: Partial<Invitacion> = {}): Invitacion => ({
  codigo: 'c'.repeat(24), creadaPor: 'uid-mama', creadaEn: AHORA - 1000, venceEn: AHORA + 7 * DIA, revocada: false, ...extra,
});

function montar(over: Partial<React.ComponentProps<typeof Accesos>> = {}) {
  const fns = { onExpulsar: vi.fn(), onRevocar: vi.fn(), onReintentar: vi.fn(), onSalir: vi.fn(), onBorrarLista: vi.fn(), onCerrar: vi.fn() };
  render(
    <Accesos
      abierto accesos={accesos} invitaciones={[invitacion()]} miembros={miembros}
      miUid="uid-mama" duenio="uid-mama" nombreLista="Casa" ahora={AHORA} {...fns} {...over}
    />,
  );
  return fns;
}

/** El Confirmar es otro <dialog>: se busca adentro del que tiene el título de la pregunta. */
const dialogoDe = (titulo: string) => within(screen.getByRole('heading', { name: titulo }).closest('dialog')!);

/** las filas de llave que se muestran con ese texto (el nombre de la persona, o el rótulo de relleno) */
const filasDe = (texto: string): HTMLElement[] =>
  screen.getAllByRole('listitem').filter(li => li.textContent?.includes(texto));
const filaDe = (texto: string): HTMLElement => filasDe(texto)[0]!;
/** el botón destructivo de una fila, buscado por el nombre accesible, que es lo único que este control tiene
 *  para el rotor (`getByRole(…, { name })` computa el nombre accesible, y el aria-label pisa al texto visible) */
const botonSacarDe = (li: HTMLElement): HTMLElement =>
  within(li).getByRole('button', { name: /^Sacarle el acceso/ });
/** los nombres accesibles de TODOS los botones de sacar, planos: así los recorre el rotor, sin «adentro de la fila» */
const nombresDeSacar = (): string[] =>
  screen.getAllByRole('button', { name: /^Sacarle el acceso/ }).map(b => b.getAttribute('aria-label')!);
/** dos llaves de la misma persona: el camino anónimo de D23, mismo día calendario y distinta hora */
const dosLlavesDeMama = (): Partial<React.ComponentProps<typeof Accesos>> => {
  // mismo día calendario, a más de 7 días de AHORA, a distinta hora (local en cualquier TZ)
  const celu = new Date(AHORA - 10 * DIA); celu.setHours(9, 15, 0, 0);
  const tablet = new Date(AHORA - 10 * DIA); tablet.setHours(18, 32, 0, 0);
  return {
    miUid: 'uid-papa',
    duenio: 'uid-papa',
    accesos: [
      { uid: 'uid-mama-celu', memberId: 'm-mama', entroEn: celu.getTime() },
      { uid: 'uid-mama-tablet', memberId: 'm-mama', entroEn: tablet.getTime() },
      { uid: 'uid-papa', memberId: 'm-papa', entroEn: AHORA - DIA },
    ],
  };
};
/** el "cuándo" de una fila sale de la fila misma: el test no reformatea la fecha por su cuenta */
const cuandoDeLaFila = (li: HTMLElement): string => {
  const prefijo = textos.accesos.entro('');
  return within(li).getByText((t: string) => t.startsWith(prefijo)).textContent!.slice(prefijo.length);
};

describe('Accesos · quién tiene la llave', () => {
  it('muestra cada llave por su persona, y marca al dueño y a la propia', () => {
    montar();
    expect(screen.getByText('Mamá')).toBeInTheDocument();
    expect(screen.getByText('Papá')).toBeInTheDocument();
    // el que abrió la lista pero todavía no dijo quién es
    expect(screen.getByText(textos.accesos.sinNombre)).toBeInTheDocument();
    expect(screen.getByText(textos.accesos.duenio)).toBeInTheDocument();
    expect(screen.getByText(textos.accesos.esteTelefono)).toBeInTheDocument();
  });

  it('el dueño puede sacarle el acceso a los otros, pero no a sí mismo', () => {
    montar();
    // dos botones: Papá y el sin nombre. El propio no ofrece expulsarse.
    expect(screen.getAllByRole('button', { name: /^Sacarle el acceso a / })).toHaveLength(2);
  });

  it('quien no es dueño no ve ningún botón de sacar, y se le explica por qué', () => {
    montar({ miUid: 'uid-papa', duenio: 'uid-mama' });
    expect(screen.queryByRole('button', { name: /^Sacarle el acceso a / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: textos.accesos.revocar })).not.toBeInTheDocument();
    expect(screen.getByText(textos.accesos.soloDuenio)).toBeInTheDocument();
  });

  it('sacar el acceso pasa por la pregunta: cancelar no llama a nadie, confirmar sí', async () => {
    const user = userEvent.setup();
    const fns = montar();
    await user.click(botonSacarDe(filaDe('Papá')));

    const q = dialogoDe(textos.accesos.expulsarTitulo('Papá'));
    await user.click(q.getByRole('button', { name: textos.confirmar.cancelar }));
    expect(fns.onExpulsar).not.toHaveBeenCalled();

    await user.click(botonSacarDe(filaDe('Papá')));
    await user.click(dialogoDe(textos.accesos.expulsarTitulo('Papá')).getByRole('button', { name: textos.accesos.expulsarSi }));
    expect(fns.onExpulsar).toHaveBeenCalledWith('uid-papa', 'Papá');
  });

  /**
   * Sacar una llave desmonta la fila DESDE la que se disparó la pregunta, y con ella el control al que `Sheet`
   * le devuelve el foco al cerrar. Hay dos órdenes posibles entre el refresco de la lista y el cierre de la
   * pregunta —online la animación (110 ms) le gana a cuatro viajes a Firestore; de caché no—, y cada uno lo
   * cubre un cable distinto, así que cada uno tiene su caso: un solo test dejaría verde la mitad.
   * La aserción es POSITIVA y sobre el diálogo de la hoja, que sigue abierto. «No quedó en el <main>» sería
   * testear una ficción del entorno: jsdom no implementa `showModal` (lo suple el polyfill de setup-ui, que solo
   * pone el atributo `open`), así que acá no hay top layer ni inertness y el `<main>` de atrás se enfoca — en el
   * navegador ese mismo `.focus()` es un no-op y el foco cae al `<body>`.
   */
  describe('el foco después de sacar una llave', () => {
    /** la hoja adentro de una pantalla que puede sacar una llave de la lista, como `refrescarAccesos` en la app.
     *  El `<main>` va a propósito: es el último recurso de `Sheet` y el destino equivocado que hay que ver. */
    function montarConEstado(refresco: 'alConfirmar' | 'cuandoDiga') {
      const puente = { sacar: (_uid: string): void => {} };
      function Pantalla() {
        const [lista, setLista] = useState<Acceso[]>(accesos);
        const sacar = useCallback((uid: string) => setLista(l => l.filter(a => a.uid !== uid)), []);
        puente.sacar = sacar;
        return (
          <>
            <main tabIndex={-1} />
            <Accesos
              abierto accesos={lista} invitaciones={[invitacion()]} miembros={miembros}
              miUid="uid-mama" duenio="uid-mama" nombreLista="Casa" ahora={AHORA}
              onExpulsar={refresco === 'alConfirmar' ? sacar : () => {}}
              onRevocar={vi.fn()} onReintentar={vi.fn()} onSalir={vi.fn()} onBorrarLista={vi.fn()} onCerrar={vi.fn()}
            />
          </>
        );
      }
      render(<Pantalla />);
      return puente;
    }
    const hoja = (): HTMLElement => screen.getByRole('heading', { name: textos.accesos.titulo }).closest('dialog')!;
    /** la salida segura de la hoja: existe para los dos roles y no se desmonta mientras la hoja está abierta */
    const salida = (): HTMLElement => within(hoja()).getByRole('button', { name: textos.accesos.cerrar });
    const sacarAPapa = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(botonSacarDe(filaDe('Papá')));
      await user.click(dialogoDe(textos.accesos.expulsarTitulo('Papá')).getByRole('button', { name: textos.accesos.expulsarSi }));
    };

    it('el refresco llega DESPUÉS de que la pregunta cerró: el foco no se va con la fila', async () => {
      const user = userEvent.setup();
      const puente = montarConEstado('cuandoDiga');
      await sacarAPapa(user);
      // el orden de todos los días: la pregunta terminó de cerrarse antes, así que el foco volvió al disparador
      // —todavía vivo— y es la fila la que se lo lleva puesto un instante después
      await waitFor(() => expect(botonSacarDe(filaDe('Papá'))).toHaveFocus());
      act(() => puente.sacar('uid-papa'));
      expect(filasDe('Papá')).toHaveLength(0);
      expect(hoja()).toContainElement(document.activeElement as HTMLElement);
      expect(salida()).toHaveFocus();
    });

    it('el refresco GANA la carrera: el foco tampoco se va con la fila', async () => {
      const user = userEvent.setup();
      montarConEstado('alConfirmar');
      await sacarAPapa(user);
      // acá el disparador ya está desconectado cuando la pregunta cierra: el destino lo elige `focoAlCerrar`
      await waitFor(() => expect(filasDe('Papá')).toHaveLength(0));
      await waitFor(() => expect(salida()).toHaveFocus());
      expect(hoja()).toContainElement(document.activeElement as HTMLElement);
    });
  });

  // D23 deja la cuenta OPCIONAL para siempre: en el camino anónimo dos dispositivos pueden elegir a la
  // misma persona y quedan como dos llaves con el mismo nombre. Lo único que las separa es cuándo entró
  // cada una, así que ese dato tiene que alcanzar para elegir — en la fila y en la pregunta que las saca.
  it('dos llaves de la misma persona se distinguen en la fila y en la pregunta', async () => {
    const user = userEvent.setup();
    const fns = montar(dosLlavesDeMama());

    const filasMama = filasDe('Mamá');
    expect(filasMama).toHaveLength(2);
    const [cuandoCelu, cuandoTablet] = filasMama.map(cuandoDeLaFila);

    // 1) la fila: las dos llaves de Mamá no dicen lo mismo
    expect(cuandoTablet).not.toBe(cuandoCelu);

    // 2) la pregunta: dice CUÁL llave se está sacando, con el mismo dato que muestra esa fila
    await user.click(botonSacarDe(filasMama[1]!));
    const dlg = screen.getByRole('heading', { name: textos.accesos.expulsarTitulo('Mamá') }).closest('dialog')!;
    // que el «cuándo» esté PINTADO adentro del diálogo no es que se ESCUCHE: al abrir, el lector anuncia el
    // nombre del diálogo —el título, idéntico para las dos llaves de Mamá— y el control enfocado (Cancelar).
    // El desempate solo llega a quien no mira si el diálogo lo declara como su DESCRIPCIÓN.
    expect(dlg).toHaveAccessibleName(textos.accesos.expulsarTitulo('Mamá'));
    expect(dlg).toHaveAccessibleDescription(textos.accesos.expulsarTexto(cuandoTablet!));
    expect(dlg).not.toHaveAccessibleDescription(textos.accesos.expulsarTexto(cuandoCelu!));

    await user.click(within(dlg).getByRole('button', { name: textos.accesos.expulsarSi }));
    expect(fns.onExpulsar).toHaveBeenCalledWith('uid-mama-tablet', 'Mamá');
  });

  // El aviso de después se lee SOLO: sin la fila ni la pregunta al lado, y encima de la lista que
  // `refrescarAccesos()` vuelve a dibujar con la otra llave de Mamá adentro. `expulsar` borra
  // acceso/{uid} —UNA llave—, así que el aviso nombra la llave, igual que la pregunta que lo precede:
  // «Mamá ya no tiene acceso» le promete a Papá un alcance de PERSONA que el mecanismo no tiene.
  it('el aviso de después no le promete a la persona el alcance que solo tuvo la llave', async () => {
    const user = userEvent.setup();
    const fns = montar(dosLlavesDeMama());
    const filasMama = filasDe('Mamá');
    await user.click(botonSacarDe(filasMama[0]!));
    await user.click(dialogoDe(textos.accesos.expulsarTitulo('Mamá')).getByRole('button', { name: textos.accesos.expulsarSi }));

    // que no apruebe en vacío: el escenario es el de DOS llaves, y la otra sigue en la lista
    expect(filasDe('Mamá')).toHaveLength(2);
    const [, quien] = fns.onExpulsar.mock.calls[0]!;
    expect(quien).toBe('Mamá');
    // la pregunta ya nombra lo que se borra; el aviso usa la misma palabra, en las dos ramas
    expect(textos.accesos.expulsarTexto(null)).toMatch(/llave/i);
    expect(textos.toasts.expulsado(quien)).toMatch(/llave/i);
    expect(textos.toasts.expulsado(null)).toMatch(/llave/i);
  });

  // La fila desempata mirando: el botón está AL LADO del «Entró 4/8 09:15» que lo explica. Recorriendo por
  // controles (el rotor) no hay «al lado», y el aria-label existe justamente para eso: si el desempate no está
  // AHÍ, las dos llaves de Mamá vuelven a ser dos botones destructivos con el mismo nombre y elegir es adivinar.
  // Por eso se mira la lista PLANA de botones y no `within(fila)`: dentro de la fila es el contexto que falta.
  it('dos llaves de la misma persona: en el rotor los botones tampoco se llaman igual', () => {
    montar(dosLlavesDeMama());

    const nombres = nombresDeSacar();
    expect(nombres).toHaveLength(2);              // la cantidad primero: el Set de un array vacío también es «único»
    expect(new Set(nombres).size).toBe(2);

    // y desempatan con el MISMO dato que muestra la fila, no con otro criterio. Sale de la fila, sin
    // reformatear la fecha acá: si el nombre accesible se arma solo, se puede desincronizar sin que nadie avise.
    const cuandos = filasDe('Mamá').map(cuandoDeLaFila);
    expect(new Set(cuandos).size).toBe(2);
    expect(nombres[0]).toContain(cuandos[0]);
    expect(nombres[1]).toContain(cuandos[1]);
    // y siguen diciendo a quién: el «cuándo» se suma al nombre, no lo reemplaza
    expect(nombres.every(n => n.includes('Mamá'))).toBe(true);
  });

  // Lo que D26 verificó del «cuándo» fue siempre el eje DATO: que viaje, que desempate al minuto, que aguante
  // `null`, que llegue a la tercera superficie. Nunca el eje LECTURA. Y el string que eligió es el de la
  // etiqueta de `meta.comprado` («✓ Mamá · 4/8 18:32»), donde el «·» hace el trabajo del «a las»; sin el «·»
  // no lo hace nadie: metido adentro de las oraciones de esta pantalla daba «Entró 20:11», «La llave que entró
  // mié 20:14 deja de ver la lista…» y —peor— un NOMBRE ACCESIBLE, que solo se escucha, donde el lector lee
  // «mié» como la abreviatura que es y «3/8» como una fracción. Justo la superficie que D26 agregó para que el
  // rotor no tenga N botones iguales terminaba leyéndose peor que la fila.
  // Acá se leen las frases, no se mira el dato. Los cuatro tramos en una sola lista —cada uno tiene su forma— y
  // el «cuándo» sale de la fila, sin reformatear nada acá: es el mismo valor único que D26 manda a las cuatro.
  it('el «cuándo» de cada llave se puede leer en voz alta: en la fila, en el botón y en la pregunta', async () => {
    const user = userEvent.setup();
    const enDia = (dias: number, h: number, m: number): number => {
      const d = new Date(AHORA - dias * DIA); d.setHours(h, m, 0, 0); return d.getTime();
    };
    montar({
      miUid: 'uid-papa',
      duenio: 'uid-papa',
      accesos: [
        { uid: 'uid-hoy', memberId: 'm-mama', entroEn: enDia(0, 9, 15) },
        { uid: 'uid-ayer', memberId: 'm-mama', entroEn: enDia(1, 18, 32) },
        { uid: 'uid-semana', memberId: 'm-mama', entroEn: enDia(3, 20, 14) },
        { uid: 'uid-vieja', memberId: 'm-mama', entroEn: enDia(10, 7, 5) },
        { uid: 'uid-papa', memberId: 'm-papa', entroEn: enDia(1, 12, 0) },
      ],
    });

    const filas = filasDe('Mamá');
    expect(filas, 'los cuatro tramos: hoy, ayer, esta semana y más de una semana').toHaveLength(4);
    const cuandos = filas.map(cuandoDeLaFila);
    // sigue desempatando al minuto (D26): la prosa no le sacó nada al dato
    expect(new Set(cuandos).size).toBe(4);

    filas.forEach((fila, i) => {
      const cuando = cuandos[i]!;
      // 1) la fila: es un complemento de tiempo, no una etiqueta. Empieza por una palabra —«hoy», «ayer»,
      //    «el …»— y la hora llega con su preposición: «Entró el miércoles a las 20:14».
      expect(cuando, textos.accesos.entro(cuando)).toMatch(/^(?:hoy|ayer|el )/);
      expect(cuando, textos.accesos.entro(cuando)).toMatch(/ a las \d{2}:\d{2}$/);
      // 2) el nombre accesible del botón: el único texto de ese control, y solo se ESCUCHA. Dice el MISMO
      //    «cuándo» que su fila, así que se lee igual de bien.
      expect(botonSacarDe(fila).getAttribute('aria-label')).toContain(cuando);
    });

    // 3) la pregunta destructiva, en el tramo que más rompía: el del día de la semana, que decía «mié».
    await user.click(botonSacarDe(filas[2]!));
    const dlg = screen.getByRole('heading', { name: textos.accesos.expulsarTitulo('Mamá') }).closest('dialog')!;
    expect(dlg).toHaveAccessibleDescription(textos.accesos.expulsarTexto(cuandos[2]!));
    expect(dlg.textContent).toContain(`entró ${cuandos[2]!} `);

    // y el cierre en negativo, sobre las tres frases COMPUESTAS: ninguna mete un reloj pelado ni una fecha
    // cruda donde va un complemento de tiempo («Entró 20:11», «entró 3/8», «entró mié»).
    const RELOJ_PELADO = /entró (?!hoy\b|ayer\b|el )/i;
    for (const cuando of cuandos)
      for (const frase of [textos.accesos.entro(cuando), textos.accesos.expulsarTexto(cuando), textos.accesos.expulsarA('Mamá', cuando)]) {
        expect(frase, frase).not.toMatch(RELOJ_PELADO);
        // y la fracción, que la de arriba deja pasar cuando viene detrás de «el »: «entró el 4/8 a las 07:05»
        // cruza la puerta de la preposición y se escucha «el cuatro octavos». La puerta se escribe con la
        // PROPIEDAD que defiende —nada de lo que se escucha es una fracción—, no con la forma de los bugs ya
        // vistos. La fila de más de 7 días (`uid-vieja`) ya la ejercita: esto no es hipotético.
        expect(frase, frase).not.toMatch(/\d+\/\d+/);
      }
  });

  // `entroEn` puede ser null: un serverTimestamp que todavía no resolvió (ms() en firestore.ts) o una llave
  // creada sin el campo (las reglas lo permiten). La fila ya lo escondía; la pregunta destructiva tampoco
  // puede inventar una hora que nadie sabe — el mismo dato, un solo criterio.
  it('la llave sin fecha de entrada no muestra ni afirma ninguna hora', async () => {
    const user = userEvent.setup();
    montar({
      miUid: 'uid-papa',
      duenio: 'uid-papa',
      accesos: [
        { uid: 'uid-mama-sinfecha', memberId: 'm-mama', entroEn: null },
        { uid: 'uid-papa', memberId: 'm-papa', entroEn: AHORA - DIA },
      ],
    });

    const prefijo = textos.accesos.entro('');
    const fila = filaDe('Mamá');
    expect(within(fila).queryByText((t: string) => t.startsWith(prefijo))).not.toBeInTheDocument();
    // el nombre accesible tampoco la inventa: sin «cuándo», dice a quién y nada más
    expect(botonSacarDe(fila).getAttribute('aria-label')).toBe(textos.accesos.expulsarA('Mamá', null));

    await user.click(botonSacarDe(fila));
    const dlg = screen.getByRole('heading', { name: textos.accesos.expulsarTitulo('Mamá') }).closest('dialog')!;
    expect(dlg).toHaveAccessibleDescription(textos.accesos.expulsarTexto(null));
    // y NO el "recién" que un formateador nulable devolvería: el valor sale de la fuente, no de un literal.
    // `cuandoDicho` —el que usa esta pantalla— ni siquiera acepta `null`, así que la trampa ya no existe por
    // tipos; el cinturón se queda porque lo que se prueba es que la pregunta destructiva no invente una hora.
    expect(dlg.textContent).not.toContain(fechaYHora(null, AHORA));
  });

  // La llave que entró por invitación y cerró «¿Quién sos?» no tiene nombre propio: `sinNombre` es una oración
  // («Todavía no dijo quién es»), y metida adentro de una frase daba «¿Sacarle el acceso a Todavía no dijo quién
  // es?». Se la nombra por lo que es, y el texto sigue diciendo CUÁL con la fecha y hora de entrada. Son TRES las
  // superficies que la nombran adentro de una frase —el nombre accesible del botón, el título que ese botón abre,
  // y el aviso de después, una capa más abajo—, así que las tres se miran acá: arreglar una sola dejaba al rotor
  // diciendo la frase rota, y arreglar las dos de arriba la dejaba en el toast que se lee justo después.
  it('la llave que no dijo quién es se nombra por lo que es, no con una frase rota', async () => {
    const user = userEvent.setup();
    const fns = montar();

    const fila = filaDe(textos.accesos.sinNombre);
    const cuando = cuandoDeLaFila(fila);

    // 1) el botón: dice CUÁL llave, con el dato de su propia fila. La positiva va primero, que la negativa
    //    sola la pasaría un aria-label vacío.
    const boton = botonSacarDe(fila);
    const nombre = boton.getAttribute('aria-label')!;
    expect(nombre).toContain(cuando);
    expect(nombre).not.toContain(textos.accesos.sinNombre);
    await user.click(boton);

    // 2) la pregunta que ese botón abre: la nombra igual, no con el rótulo de relleno
    const q = dialogoDe(textos.accesos.expulsarTituloLlave);
    expect(
      screen.queryByRole('heading', { name: textos.accesos.expulsarTitulo(textos.accesos.sinNombre) }),
    ).not.toBeInTheDocument();
    // y sigue diciendo CUÁL llave: el mismo dato que muestra su fila
    expect(q.getByText(textos.accesos.expulsarTexto(cuando))).toBeInTheDocument();

    // 3) el aviso de después tampoco puede meter el rótulo en la frase: el relleno es para MOSTRAR el vacío
    //    en la fila, no para interpolarlo («Todavía no dijo quién es ya no tiene acceso»). Viaja la persona.
    await user.click(q.getByRole('button', { name: textos.accesos.expulsarSi }));
    expect(fns.onExpulsar).toHaveBeenCalledWith('uid-nuevo', null);
    // y se compone la frase FINAL con el copy que la va a recibir: verificar lo que el código manda no es
    // verificar lo que la familia lee.
    const [, quien] = fns.onExpulsar.mock.calls[0]!;
    expect(textos.toasts.expulsado(quien)).not.toContain(textos.accesos.sinNombre);
  });

  /** `salir()` borra acceso/{uid}: UNA llave. Con el acceso guardado (D23) ese uid es el de la cuenta y cae en
   *  todos sus dispositivos; anónimo —el default— el uid vive en este navegador y el otro aparato es OTRA llave
   *  (por eso el desempate por fecha y hora, D26). La pregunta es destructiva y sin deshacer: no puede prometer
   *  un alcance mayor que el que borra.
   *
   *  Y tiene un segundo eje: QUIÉN se va. `salir()` no toca el campo `duenio` del doc de la lista, y `esDuenio()`
   *  de las reglas lo resuelve contra ESE campo —sin pedir membresía—, así que si el que se va es el dueño la
   *  lista queda sin nadie MÁS que pueda administrarla: él conserva los tres poderes aunque haya borrado su
   *  llave, y vuelve con el link. Las dos ramas, y por el DOM: verificar lo que el código elige no es verificar
   *  lo que la familia lee. */
  it.each([
    ['la dueña', {}, true],
    ['quien no es dueño', { miUid: 'uid-papa', duenio: 'uid-mama' }, false],
  ] as const)('salir pregunta antes, y a %s la pregunta le dice el alcance real de lo que borra', async (_quien, props, esDuenia) => {
    const user = userEvent.setup();
    const fns = montar(props);
    await user.click(screen.getByRole('button', { name: textos.accesos.salir }));
    expect(fns.onSalir).not.toHaveBeenCalled();
    const q = dialogoDe(textos.accesos.salirTitulo);
    const texto = textos.accesos.salirTexto(esDuenia);
    // la frase LLEGA al diálogo, y es la de ESTE rol: hasta acá nadie lo afirmaba, el test solo miraba el botón
    expect(q.getByText(texto)).toBeInTheDocument();
    // las dos mitades: la que siempre pasa, y la condición que hace verdadera a la otra. En LAS DOS ramas, para
    // que el eje nuevo no se pague con el viejo.
    expect(texto).toMatch(/este dispositivo/);
    expect(texto).toMatch(/acceso guardado/);
    // la promesa incondicional es exactamente la que era falsa para los anónimos, que son todos los de hoy
    expect(texto).not.toMatch(/(en|de) todos (tus|los) dispositivos/i);
    // lo que se pierde es LA LISTA, y se nombra: un clítico acá se le pega a «tu llave» —está en la misma
    // oración—, y la pregunta se lee con el sheet de llaves detrás (Confirmar no mueve nada de lo que hay atrás),
    // así que «dejás de verla» pasa por «tu llave sale de esta lista»: cierto, trivial, y no es lo que se pierde.
    expect(texto).toMatch(/ver la lista/);
    expect(texto).not.toMatch(/verla/);
    // el segundo eje: solo al dueño le toca la mitad que dice qué pierde LA LISTA cuando el que se va es él. La
    // rama negativa es la que caza la falla real: pegársela a todo el mundo, o cablear una sola rama en el sheet.
    if (esDuenia) expect(texto).toContain(poderesDelDuenio('ni'));
    else expect(texto).not.toContain(poderesDelDuenio('ni'));
    // …y esa mitad va ACOTADA, que es lo que la hace verdadera: ninguno de los tres poderes cuelga de la llave
    // —`esDuenio()` no pide membresía y el borrado de la lista mira `resource.data.duenio` directo (lo fija
    // `reglas.emu.test.ts` contra el emulador)—, así que el que se va los conserva enteros y encima vuelve con el
    // link. Un «nadie» sin acotar incluiría al que está leyendo, y daría por permanente algo que se deshace con
    // un toque: es la misma promesa incondicional que ya fue falsa una vez por el lado de los aparatos. Se exige
    // la cota y se PROHÍBE la forma absoluta, porque exigir solo la cota deja pasar que convivan las dos.
    if (esDuenia) {
      expect(texto).toMatch(/mientras no vuelvas/i);
      expect(texto).toContain(`nadie más va a poder ${poderesDelDuenio('ni')}`);
    }
    expect(texto).not.toMatch(/nadie va a poder/i);
    // el tercer eje, el que dice cómo se VUELVE, y sale del MISMO hecho que el anterior: `salir()` no toca el
    // campo `duenio`, así que el `allow create` de acceso/{uid} sigue dejando entrar al dueño sin código —y con
    // apretar ATRÁS alcanza, porque `entrar()` corre en cada montaje— mientras rechaza al que ya no es miembro
    // (lo fija `reglas.emu.test.ts` contra el emulador). La invitación es el único camino de vuelta para UNO de
    // los dos roles, y una pregunta sin deshacer no puede prometerle al otro una puerta cerrada que el mecanismo
    // tiene abierta. Las dos ramas y en las dos direcciones: así emparejarlas no puede pasar por arreglo.
    if (esDuenia) {
      expect(texto).toMatch(/no hace falta invitación/);
      expect(texto).not.toMatch(/vas a necesitar una invitación/);
    } else {
      expect(texto).toMatch(/vas a necesitar una invitación/);
      expect(texto).not.toMatch(/no hace falta invitación/);
    }
    await user.click(q.getByRole('button', { name: textos.accesos.salirSi }));
    expect(fns.onSalir).toHaveBeenCalledTimes(1);
  });

  /** el encabezado cuenta llaves, no aparatos: desde D23 son tres dispositivos, una llave, una fila.
   *  Va por frase y no por el bloque entero, porque el rótulo `esteTelefono` sí dice «este dispositivo» (D26).
   *  Las DOS ramas, porque la de quien no es dueño también se lee en pantalla. */
  it('el encabezado cuenta llaves, no aparatos', () => {
    montar();
    expect(screen.getByText(textos.accesos.texto(true))).toBeInTheDocument();
    for (const t of [textos.accesos.texto(true), textos.accesos.texto(false)]) {
      expect(t).toMatch(/llave/);
      expect(t).not.toMatch(/dispositivo|teléfono|celular/i);
    }
  });

  /** El ítem del menú que abre este sheet no está gateado por dueño: lo abre cualquiera de la casa. Quien no
   *  es dueño no tiene un solo botón para sacar una llave, así que el encabezado no se lo puede prometer y
   *  desmentirlo recién abajo de la lista de llaves Y de las invitaciones (`soloDuenio`). */
  it('quien no es dueño no lee la promesa de sacar accesos', () => {
    montar({ miUid: 'uid-papa', duenio: 'uid-mama' });
    expect(screen.queryAllByRole('button', { name: /^Sacarle el acceso/ })).toHaveLength(0);
    expect(screen.getByText(textos.accesos.texto(false))).toBeInTheDocument();
    expect(screen.queryByText(textos.accesos.texto(true))).not.toBeInTheDocument();
  });

  it('el dueño sí la lee, y la promesa es la única mitad de más', () => {
    montar();
    expect(screen.getAllByRole('button', { name: /^Sacarle el acceso/ }).length).toBeGreaterThan(0);
    expect(screen.getByText(textos.accesos.texto(true))).toBeInTheDocument();
    // que no se "arregle" igualando las dos ramas: la del dueño es la del resto MÁS la promesa
    expect(textos.accesos.texto(true).startsWith(textos.accesos.texto(false))).toBe(true);
    expect(textos.accesos.texto(true)).not.toBe(textos.accesos.texto(false));
  });

  /** El encabezado se lee ARRIBA de las filas, y la pantalla que encabeza puede mostrar dos veces a la misma
   *  persona (camino anónimo, D23/D26: dos uid, un `memberId`, dos filas «Mamá» — la premisa del desempate por
   *  fecha y hora). Una frase que reparte una llave por persona deja esas dos filas sin explicación arriba, y la
   *  lectura natural de dos filas iguales es «se duplicó». El barrido de vocabulario de textos.test.ts no puede
   *  ver esto: «Cada uno que abrió la lista tiene su llave» no nombra ningún aparato. */
  it('el encabezado no reparte una llave por persona: la misma puede tener dos', () => {
    montar(dosLlavesDeMama());
    expect(filasDe('Mamá')).toHaveLength(2);            // que no apruebe en vacío: el escenario es el de DOS llaves
    for (const t of [textos.accesos.texto(true), textos.accesos.texto(false)]) {
      expect(t).toMatch(/más de una/);                  // admite la multiplicidad que la pantalla de abajo muestra
      expect(t).not.toMatch(/cada (uno|persona|quien)/i); // y no la contradice justo arriba de las filas
    }
    expect(screen.getByText(textos.accesos.texto(true))).toBeInTheDocument();
  });

  it('anular una invitación pregunta y después la anula', async () => {
    const user = userEvent.setup();
    const fns = montar();
    await user.click(screen.getByRole('button', { name: textos.accesos.revocar }));
    await user.click(dialogoDe(textos.accesos.revocarTitulo).getByRole('button', { name: textos.accesos.revocarSi }));
    expect(fns.onRevocar).toHaveBeenCalledWith('c'.repeat(24));
  });

  // D26: se borraron las etiquetas por dispositivo. La fila tiene lo justo: quién es, cuándo entró
  // y —si sos el dueño— sacarle el acceso. Nada de editores adentro de la lista.
  it('no hay nada para editar en las filas: solo se saca el acceso', () => {
    montar();
    const botones = screen.getAllByRole('button').map(b => b.textContent);
    expect(botones.filter(t => t === textos.accesos.expulsar)).toHaveLength(2);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  // D26 le sacó a la fila la píldora de etiqueta, que era el único control con nombre propio. El que
  // quedó es el destructivo: tiene que decir A QUIÉN, o en el rotor son N botones iguales.
  it('cada «Sacarle el acceso» dice a quién y cuándo, y ninguno interpola el rótulo de relleno', () => {
    montar();
    const nombres = nombresDeSacar();
    expect(nombres).toHaveLength(2);                     // Papá y la llave que no dijo quién es
    expect(new Set(nombres).size).toBe(nombres.length);
    // lo que dice cada uno se contrasta contra SU fila, no contra la función que lo arma: si el nombre
    // accesible se armara con otro criterio, esto lo ve.
    expect(nombres[0]).toContain('Papá');
    expect(nombres[0]).toContain(cuandoDeLaFila(filaDe('Papá')));
    // la que no dijo quién es no se nombra con el rótulo de relleno: por lo que es, con el dato de su fila
    expect(nombres[1]).toContain(cuandoDeLaFila(filaDe(textos.accesos.sinNombre)));
    expect(nombres[1]).not.toContain(textos.accesos.sinNombre);
  });

  // WCAG 2.5.3: quien maneja por voz dice lo que LEE. El nombre accesible agrega quién y cuándo, pero tiene
  // que empezar por el rótulo que se ve: si rótulo y nombre salen de dos literales, se mueven por separado y
  // el rotor termina diciendo una frase que en la pantalla no existe. Los botones se eligen por lo que se VE
  // (textContent), así la deriva se caza por los dos lados —y también si el botón dejara de pintar el rótulo.
  it('el nombre accesible de cada «sacar» empieza por el rótulo que se ve en el botón', () => {
    montar();
    const botones = screen.getAllByRole('button').filter(b => b.textContent === textos.accesos.expulsar);
    expect(botones).toHaveLength(2);                              // que no apruebe en vacío
    expect(textos.accesos.expulsar.length).toBeGreaterThan(0);    // ni con el rótulo vacío
    for (const b of botones) {
      const visible = b.textContent!;
      const nombre = b.getAttribute('aria-label')!;
      expect(nombre.slice(0, visible.length), `«${visible}» no encabeza «${nombre}»`).toBe(visible);
      expect(nombre.length).toBeGreaterThan(visible.length);      // y agrega quién/cuándo, no lo repite
    }
  });

  /** el panel del sheet: el <h2> del título es hijo directo suyo */
  const panelDelSheet = () => screen.getByRole('heading', { name: textos.accesos.titulo }).parentElement!;
  /**
   * La entrada terminó cuando Motion deja el panel en reposo (`transform: none`): ese es el instante exacto en
   * que el Sheet movería el foco al primer control (Sheet.tsx → alEntrar). Se mira el style INLINE porque
   * getComputedStyle también dice "none" antes de que Motion escriba nada (falso verde), y con timeout propio
   * porque la entrada tarda ~800 ms reales en jsdom aunque __MOTION_SCALE__ sea 0.
   */
  const entradaTerminada = (panel: HTMLElement) =>
    waitFor(() => expect(panel.style.transform).toBe('none'), { timeout: 3000 });

  // D26 se llevó la píldora «+ etiqueta», que sin que nadie lo hubiera decidido era el primer focusable del
  // sheet. Sin focoInicial="panel", la hoja abriría con el foco en un botón destructivo: «Sacarle el acceso»
  // para la dueña, y «Salir de esta lista» para todos los demás, que no tienen ni un control en la lista.
  it.each<[string, Partial<React.ComponentProps<typeof Accesos>>]>([
    ['no dueño', { miUid: 'uid-papa', duenio: 'uid-mama' }],
    ['dueña', {}],
  ])('al abrir, el foco queda en el diálogo y no en el primer botón, que es destructivo (%s)', async (_rol, props) => {
    montar(props);
    const panel = panelDelSheet();
    await entradaTerminada(panel);
    // cuál es "el primero" sale del DOM, igual que en Sheet.tsx: una lista escrita a mano acá envejecería
    // con el sheet y dejaría de mirar el control que de verdad se llevaría el foco.
    expect(within(panel).getAllByRole('button')[0]).not.toHaveFocus();
    expect(panel).toHaveFocus();
  });

  // El COLOR es el tercer canal por el que un control se anuncia, con el orden de foco y el nombre accesible.
  // D26 dejó al destructivo como único control de la fila y puerta de entrada de la hoja, y en la MISMA hoja
  // conviven las dos convenciones: el pie pinta lo destructivo de --danger y las filas lo pintaban de
  // --accent-ink, el color que en todo el repo es «esto no rompe nada» (Cancelar, Cerrar, «no, otro»). Así,
  // «Sacarle el acceso» y «Cerrar» quedaban el mismo botón pintado. No se pinnea un className suelto: se fija
  // el invariante —lo que abre una pregunta destructiva se ve destructivo— y su contraste con lo que no lo es.
  /** las dos formas de decir «esto destruye»: con recuadro en el pie, con silueta de texto en la fila.
   *  Los nombres salen del módulo de CSS —hasheados igual que en el componente—, y se filtran los que no
   *  existan: una clase borrada llegaría acá como `undefined` y volvería trivial el `not` del final. */
  const clasesDePeligro = [c.peligro, c.textoPeligro].filter((k): k is string => typeof k === 'string');
  const pintadoDePeligro = (b: HTMLElement): boolean =>
    clasesDePeligro.some(k => b.classList.contains(k));

  it('todo control que abre una pregunta destructiva se pinta de peligro; el que solo cierra, no', () => {
    expect(clasesDePeligro).toHaveLength(2);   // las dos clases existen: si no, esto no mide nada
    montar();   // dueña: se ven los cinco destructivos de la hoja
    const destructivos = [
      ...screen.getAllByRole('button', { name: /^Sacarle el acceso/ }),   // Papá y la llave sin nombre
      screen.getByRole('button', { name: textos.accesos.revocar }),
      screen.getByRole('button', { name: textos.accesos.salir }),
      screen.getByRole('button', { name: textos.accesos.borrarLista }),
    ];
    expect(destructivos).toHaveLength(5);   // la cantidad primero: un array vacío pasa cualquier every()
    expect(destructivos.every(pintadoDePeligro)).toBe(true);
    // y la otra mitad, que es la que importa: el que cierra la hoja NO se puede ver igual que el que
    // le saca el acceso a alguien
    expect(pintadoDePeligro(screen.getByRole('button', { name: textos.accesos.cerrar }))).toBe(false);
  });

  // La MASA es parte de ese mismo canal, y la fija el ancho. La fila es un flex de dos hijos que se achican
  // los dos, así que sin decir quién cede flexbox reparte el faltante en proporción: la meta en prosa de D26
  // («Entró el miércoles a las 20:14») pide hasta 166 px donde «Entró hace 2 h» pedía 83, la fila queda 8 px
  // corta a 360 px, el botón pierde 3,7 y «Sacarle el acceso» se parte en dos renglones — un bloque rojo de
  // 600 que en masa le gana al nombre de la llave, que es el dato que hay que leer para elegir. La fila tiene
  // que ceder de a RENGLONES ENTEROS: envuelve, y la acción baja entera y pegada a la derecha.
  // jsdom no mide ancho (no hay layout), así que lo que se fija es el invariante DECLARADO, que es todo lo
  // que las puertas pueden ver de esto.
  it('la fila cede de a renglones enteros: la acción baja completa y no se parte su rótulo', () => {
    montar();   // dueña: hay filas de llaves Y de invitaciones, las dos con su control
    const filas = screen.getAllByRole('listitem').filter(li => li.querySelector('button') !== null);
    expect(filas.length).toBeGreaterThanOrEqual(2);   // la cantidad primero: con cero filas esto no mide nada
    for (const fila of filas) {
      expect(getComputedStyle(fila).display).toBe('flex');   // si deja de ser flex, flex-wrap no dice nada
      expect(getComputedStyle(fila).flexWrap).toBe('wrap');
      expect(getComputedStyle(fila.querySelector('button')!).marginLeft).toBe('auto');
    }
  });

  it('borrar la lista: solo el dueño ve el botón, la pregunta nombra la lista y confirmar la borra', async () => {
    const user = userEvent.setup();
    const fns = montar();
    await user.click(screen.getByRole('button', { name: textos.accesos.borrarLista }));
    const q = dialogoDe(textos.accesos.borrarListaTitulo('Casa'));
    // el texto no tiene eufemismos: para todos y sin deshacer
    expect(screen.getByText(textos.accesos.borrarListaTexto)).toBeInTheDocument();
    await user.click(q.getByRole('button', { name: textos.confirmar.cancelar }));
    expect(fns.onBorrarLista).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: textos.accesos.borrarLista }));
    await user.click(dialogoDe(textos.accesos.borrarListaTitulo('Casa')).getByRole('button', { name: textos.accesos.borrarListaSi }));
    expect(fns.onBorrarLista).toHaveBeenCalledTimes(1);
  });

  it('quien no es dueño NO ve el botón de borrar la lista', () => {
    montar({ miUid: 'uid-papa', duenio: 'uid-mama' });
    expect(screen.queryByRole('button', { name: textos.accesos.borrarLista })).not.toBeInTheDocument();
  });

  it('las invitaciones vencidas o anuladas no se listan: solo se ve lo que todavía abre la puerta', () => {
    montar({ invitaciones: [invitacion({ venceEn: AHORA - DIA }), invitacion({ codigo: 'd'.repeat(24), revocada: true })] });
    expect(screen.getByText(textos.accesos.invitacionesVacio)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: textos.accesos.revocar })).not.toBeInTheDocument();
  });

  /**
   * El «cuándo» de la lista HERMANA, dos elementos más abajo en el mismo sheet. D26 fijó para esta hoja que un
   * slot que arma una ORACIÓN recibe el instante en prosa, y lo aplicó a las cuatro superficies que estaba
   * editando; esta quinta venía de D22 con `haceCuanto`, que colapsa de 1 a 7 días al día abreviado
   * (`DIAS[getDay()]`) — y ESE es el tramo de toda invitación viva, porque vencen a los 7. O sea «Creada mié»
   * en régimen, no en un borde, en la misma hoja que arriba dice «Entró el domingo a las 15:00».
   * La aserción va por FORMA y no por literal: `AHORA` es un epoch fijo, así que el día de la semana depende
   * del TZ del runner; lo que se fija —preposición y hora, o sea que es castellano y no una etiqueta al
   * margen— no depende del TZ.
   */
  it('el «Creada» de una invitación viva es una oración, no la etiqueta abreviada', () => {
    montar({ invitaciones: [invitacion({ creadaEn: AHORA - 3 * DIA, venceEn: AHORA + 4 * DIA })] });
    expect(screen.getByText(/^Creada /)).toHaveTextContent(/^Creada (hoy|ayer|el .+) a las \d{2}:\d{2}$/);
  });

  /** misma regla que la fila de una llave sin `entroEn`: la nulidad se ramifica donde se pinta y no se inventa
   *  una hora. El `?? ahora` que había acá decía «Creada recién» de una invitación de fecha desconocida. */
  it('sin fecha de creación no se inventa ninguna: el renglón no está', () => {
    montar({ invitaciones: [invitacion({ creadaEn: null })] });
    expect(screen.getByRole('heading', { name: textos.accesos.invitaciones })).toBeInTheDocument();
    expect(screen.queryByText(/^Creada /)).toBeNull();
  });

  /** `null` no es «no hay»: es «no sé». Las reglas solo le dejan leerlas al dueño (`firestore.rules`,
   *  `allow get, list: if esDuenio(listId)`, fijado en `reglas.emu.test.ts` con `assertFails(getDocs(...))`
   *  para el socio) y `PantallaLista.refrescarAccesos` convierte esa negativa —y el rato de carga— en `null`.
   *  Para quien no es dueño ese valor es null SIEMPRE: afirmarle que no hay ninguna abierta puede ser falso
   *  con tres links dando vueltas. La rama la decide el VALOR, no el rol: por eso van los dos roles. */
  const roles = [
    ['la dueña', { miUid: 'uid-mama', duenio: 'uid-mama' }],
    ['quien no es dueño', { miUid: 'uid-papa', duenio: 'uid-mama' }],
  ] as const;

  it.each(roles)('con las invitaciones en «no sé» (null), a %s no se le afirma que no hay ninguna', (_rol, props) => {
    montar({ ...props, invitaciones: null });
    expect(screen.queryByText(textos.accesos.invitacionesVacio)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: textos.accesos.invitaciones })).not.toBeInTheDocument();
  });

  it.each(roles)('con la lista vacía DE VERDAD ([]), a %s sí se le dice que no hay ninguna', (_rol, props) => {
    montar({ ...props, invitaciones: [] });
    expect(screen.getByRole('heading', { name: textos.accesos.invitaciones })).toBeInTheDocument();
    expect(screen.getByText(textos.accesos.invitacionesVacio)).toBeInTheDocument();
  });

  /**
   * Los tres estados de la LECTURA de las llaves. Un `<ul>` sin filas contestaba «¿quién tiene acceso?» con
   * «nadie» sin haber leído un documento, y cero filas nunca es un estado verdadero acá: quien está mirando
   * tiene llave, así que su propia fila siempre tendría que estar. La aserción que hubiera matado el bug no es
   * «hay cero filas» —eso ya pasaba— sino que la hoja DIGA en cuál de los tres está.
   */
  it('mientras las llaves no llegaron lo dice, en vez de pintar la lista vacía', () => {
    montar({ accesos: 'cargando' });
    expect(screen.getByText(textos.accesos.buscando)).toBeInTheDocument();
    expect(screen.queryByText(textos.accesos.noSePudoLeer)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Sacarle el acceso/ })).toHaveLength(0);
    // ni siquiera la fila propia (la de «Mamá», que es quien mira): la espera no se disfraza de lista
    expect(filasDe('Mamá')).toHaveLength(0);
  });

  it('si no se pudieron leer las llaves lo dice, y se puede reintentar', async () => {
    const fns = montar({ accesos: 'fallo' });
    expect(screen.getByText(textos.accesos.noSePudoLeer)).toBeInTheDocument();
    expect(screen.queryByText(textos.accesos.buscando)).not.toBeInTheDocument();
    // la frase y el botón son una unidad: decir «no pude» y dejar como único control el «Cerrar» del pie es
    // contar la mitad de la verdad
    await userEvent.click(screen.getByRole('button', { name: textos.vacio.reintentar }));
    expect(fns.onReintentar).toHaveBeenCalled();
  });

  /** El caso que motivó todo, y el que NO pasa por el `catch`: sin señal y sin nada en el caché persistente,
   *  `getDocs` resuelve una lectura VACÍA sin tirar error (`db/firestore.ts` → `listarAccesos`). Si el vacío se
   *  pintara como respuesta, la hoja diría «no entra nadie» en el único escenario en que más importa. Cero
   *  llaves no es un estado posible: quien está mirando tiene la suya. */
  it('cero llaves no se pinta como respuesta: sin señal la lectura vuelve vacía y sin error', async () => {
    const fns = montar({ accesos: [] });
    expect(screen.getByText(textos.accesos.noSePudoLeer)).toBeInTheDocument();
    expect(filasDe('Mamá')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: textos.vacio.reintentar }));
    expect(fns.onReintentar).toHaveBeenCalled();
  });

  it('la espera no ofrece reintentar: todavía no falló nada', () => {
    montar({ accesos: 'cargando' });
    expect(screen.queryByRole('button', { name: textos.vacio.reintentar })).not.toBeInTheDocument();
  });

  it('con las llaves ya llegadas no queda ni la espera ni el error', () => {
    montar();
    expect(screen.queryByText(textos.accesos.buscando)).not.toBeInTheDocument();
    expect(screen.queryByText(textos.accesos.noSePudoLeer)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: textos.vacio.reintentar })).not.toBeInTheDocument();
    expect(filasDe('Mamá').length).toBeGreaterThan(0);
  });

  it('ninguna de las dos líneas afirma quién entra ni cuántos son', () => {
    for (const frase of [textos.accesos.buscando, textos.accesos.noSePudoLeer])
      expect(frase, frase).not.toMatch(/nadie|ninguno|ninguna|no hay/i);
  });
});
