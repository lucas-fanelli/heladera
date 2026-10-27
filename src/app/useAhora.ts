import { useEffect, useState } from 'react';

/**
 * "Ahora" que se refresca cada `cadaMs` (para "hace 2 min"), pausado cuando la pestaña no se ve.
 * Con `cadaMs <= 0` no se arma el interval (p.ej. TIMING_SCALE=0 en tests: evita un loop de re-renders).
 */
export function useAhora(cadaMs: number): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (cadaMs <= 0) return;
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!t) t = setInterval(() => setAhora(Date.now()), cadaMs); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    const onVis = () => { if (document.hidden) stop(); else { setAhora(Date.now()); start(); } };
    document.addEventListener('visibilitychange', onVis);
    if (!document.hidden) start();
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [cadaMs]);
  return ahora;
}
