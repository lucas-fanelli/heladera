/**
 * Las reglas de foco del repo. Viven acá y no adentro del componente que las estrenó porque el foco es UNO solo
 * para toda la app: un criterio que queda privado en su pantalla no se re-discute en la segunda — se re-decide
 * por omisión, que es peor, porque nadie se entera.
 */
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Controles que CONTINÚAN la escritura (chips de sugerencias, "Agregar", ✕ limpiar, "volver a anotar"): no toman el
 * foco con el puntero. La acción por defecto de mousedown es mover el foco al botón; eso hace blur en el input y el
 * teclado del teléfono se cierra en cada toque. preventDefault en pointerdown cancela los eventos de mouse de
 * compatibilidad (mousedown → focus) y el click sigue disparando (Pointer Events: "preventDefault on pointerdown does
 * not prevent click"). Con teclado físico (Tab) el botón se enfoca normal: esto solo aplica al puntero.
 * Patrón combobox/toolbar: las opciones no son el foco, el campo de texto lo es.
 */
export function noRobarFoco(e: ReactPointerEvent<HTMLElement>): void {
  e.preventDefault();
}

/**
 * Un nodo que se DESMONTA teniendo el foco adentro no lo deja caer al `<body>`: lo reubica a propósito. Se llama
 * desde el cleanup (layout effect o ref callback), que corre ANTES de que el nodo salga del DOM: ahí todavía se
 * puede preguntar quién tenía el foco y quiénes son los vecinos.
 *
 * Lo que cambia entre una lista y otra son los DOS destinos, y por eso se piden:
 *  - `selectorVecino`: el control de la fila de al lado al que se salta (primero hacia abajo, después hacia arriba),
 *    o `null` cuando NO hay vecino al que se quiera ir a propósito — el caso de una lista de acciones destructivas,
 *    donde el vecino es otro botón destructivo y a esos se llega tabulando a propósito (D26).
 *  - `ancla`: el último recurso, leído en el momento (un ref todavía puede estar vacío cuando se arma la llamada).
 *    Tiene que ser algo que siga siendo alcanzable desde donde está el usuario: adentro de una hoja modal abierta,
 *    el `<main>` de la pantalla de atrás es inerte y enfocarlo es un no-op — el foco termina igual en el `<body>`.
 */
export function reubicarFoco(nodo: Element | null, selectorVecino: string | null, ancla: () => HTMLElement | null): void {
  if (!nodo || typeof document === 'undefined') return;
  const activo = document.activeElement;
  if (!activo || !nodo.contains(activo)) return;
  // el vecino más cercano que tenga ese control (saltea notas/cabeceras): primero hacia abajo, después hacia arriba
  const buscar = (paso: 'nextElementSibling' | 'previousElementSibling'): HTMLElement | null => {
    if (selectorVecino === null) return null;
    for (let el = nodo[paso]; el; el = el[paso]) {
      const control = el.querySelector<HTMLElement>(selectorVecino);
      if (control) return control;
    }
    return null;
  };
  const destino = buscar('nextElementSibling') ?? buscar('previousElementSibling') ?? ancla();
  destino?.focus({ preventScroll: true });
}
