import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/dm-sans';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App';
import { escalaDeLaUrl } from './motion/tokens';
import { setTiming, tiemposDeLaUrl } from './domain/timing';
import { crearDb } from './db';

/**
 * Cuando se publica una versión nueva, el service worker la instala en segundo plano pero la página que ya está
 * abierta sigue mostrando la vieja: había que recargar dos veces para verla, y eso no se lo podemos pedir a la
 * familia. Apenas el service worker nuevo toma el control, recargamos una vez sola.
 * En la primera visita NO hay nada viejo que refrescar (no había controlador): ahí no se recarga.
 */
function recargarAlActualizar(): void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!sw || !sw.controller) return;
  let recargando = false;
  sw.addEventListener('controllerchange', () => {
    if (recargando) return;      // sin guarda, el reload puede encadenarse solo
    recargando = true;
    location.reload();
  });
}
recargarAlActualizar();

const el = document.getElementById('app');
if (!el) throw new Error('Falta #app');
// Perillas de diagnóstico, para calibrar en el teléfono sin recompilar (no cambian nada si no están en la URL):
//   ?motion=0.75  velocidad de las animaciones   ?hold=600  espera antes de que la fila baje a Comprados
const escala = escalaDeLaUrl();
if (escala !== null) window.__MOTION_SCALE__ = escala;
setTiming(tiemposDeLaUrl());
// crearDb es async: con VITE_DB=firestore carga el SDK recién acá (el fake y la demo no lo llevan en el bundle)
void crearDb().then(db => {
  createRoot(el).render(
    <StrictMode>
      <App db={db} />
    </StrictMode>,
  );
});
