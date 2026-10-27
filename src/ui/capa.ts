/**
 * Qué sheet está abierto arriba de todo, para poder pintar cosas ENCIMA de él.
 *
 * Un `<dialog>` abierto con `showModal()` vive en la "top layer" del navegador: está por encima de todo el documento
 * sin importar el z-index, y no hay forma de ganarle desde afuera. Por eso el aviso de "Link copiado" salía detrás del
 * menú y no sabías si había copiado. La solución es no pelearle: los avisos se pintan DENTRO del diálogo de más
 * arriba (un portal), y cuando no hay ninguno, en el body como siempre.
 *
 * Es una pila, no un solo elemento: el sheet del ítem puede abrir arriba la tarjeta de confirmar.
 */
type Escucha = (encima: HTMLElement | null) => void;

const pila: HTMLElement[] = [];
const escuchas = new Set<Escucha>();

function avisar(): void {
  const encima = pila.at(-1) ?? null;
  for (const cb of [...escuchas]) cb(encima);
}

/** El sheet se anuncia al abrir. Devuelve la función para bajarse (idempotente). */
export function apilarCapa(el: HTMLElement): () => void {
  if (!pila.includes(el)) { pila.push(el); avisar(); }
  return () => {
    const i = pila.indexOf(el);
    if (i < 0) return;
    pila.splice(i, 1);
    avisar();
  };
}

/** El elemento donde hay que pintar para quedar por encima de todo, o null si no hay ningún sheet abierto. */
export function capaDeArriba(): HTMLElement | null {
  return pila.at(-1) ?? null;
}

/** Se entera cada vez que cambia. Devuelve la baja. */
export function alCambiarCapa(cb: Escucha): () => void {
  escuchas.add(cb);
  return () => { escuchas.delete(cb); };
}

/** Solo para tests. */
export function limpiarCapas(): void {
  pila.length = 0;
  escuchas.clear();
}
