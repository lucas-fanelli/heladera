/**
 * `--base <url>` apunta la verificación a un canal de preview (el ensayo general que la skill recomienda
 * cuando la release toca firebase.json). Ahí el blanco lo TIPEÓ el operador y es EFÍMERO —la skill crea el
 * canal con `--expires 1h`—, así que los dos modos de fallo probables de esa corrida son la URL mal copiada
 * y el canal vencido. El texto de la señal, en cambio, nació para el modo SIN --base, donde BASE sale de
 * .firebaserc y es un host vivo por construcción: ahí «error de red» sí quiere decir «no hay red».
 *
 * El bug que fija este archivo: con --base y un blanco que no contesta, el mensaje decía solo «(parece un
 * problema de señal…)» — el operador, con internet perfecto, se ponía a mirar el WiFi por un typo en una
 * URL. Lo que se prueba no es la redacción sino el ORDEN: primero el sospechoso más probable (el blanco),
 * después la señal; y que la pista SUMA, no reemplaza.
 *
 * Los dos blancos son LOCALES a propósito: un puerto cerrado da ECONNREFUSED (la misma rama de red que un
 * dominio inexistente, sin depender de que el DNS de casa no secuestre los NXDOMAIN) y un servidor que
 * contesta 404 es el canal vencido/borrado, que cae en la otra rama tocada, la de status.
 *
 * Se corre el script REAL sobre una copia aislada del repo (mkdtemp), con spawn y no spawnSync: el servidor
 * de prueba vive en ESTE proceso y un spawn bloqueante lo dejaría sin event loop para contestar.
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = process.cwd();

let tmp: string;
let servidor404: Server;
let baseQueContesta404: string;
let baseSinNadieEscuchando: string;

/** Un puerto que con seguridad NO tiene a nadie: se pide uno libre al sistema y se lo devuelve enseguida. */
async function puertoCerrado(): Promise<number> {
  const s = createServer();
  await new Promise<void>(listo => s.listen(0, '127.0.0.1', listo));
  const { port } = s.address() as AddressInfo;
  await new Promise<void>(listo => s.close(() => listo()));
  return port;
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'deploy-pista-base-'));
  // scripts/ ENTERO, derivado del directorio real (se importan entre sí y viajan juntos), como en los otros
  // tests del circuito: una lista de archivos acá sería una enumeración que envejece
  cpSync(join(REPO, 'scripts'), join(tmp, 'scripts'), { recursive: true });
  writeFileSync(join(tmp, '.firebaserc'), JSON.stringify({ projects: { default: 'proyecto-fake' } }));
  writeFileSync(join(tmp, 'firebase.json'), JSON.stringify({ hosting: { public: 'dist', ignore: ['**/*.map'] } }));
  // sin dist/ el script aborta ANTES de salir a la red y el test aprobaría en vacío
  mkdirSync(join(tmp, 'dist'));
  // con su <script src> y el archivo: la puerta de imprescindibles deriva la cadena de arranque del index
  writeFileSync(join(tmp, 'dist', 'index.html'), '<!doctype html><title>heladera</title><script type="module" src="/app.js"></script>');
  writeFileSync(join(tmp, 'dist', 'app.js'), 'export const x = 1;\n');

  // el canal vencido o borrado: contesta, pero no sirve lo que se le pide
  servidor404 = createServer((_req, res) => { res.writeHead(404); res.end(''); });
  await new Promise<void>(listo => servidor404.listen(0, '127.0.0.1', listo));
  baseQueContesta404 = `http://127.0.0.1:${(servidor404.address() as AddressInfo).port}`;
  baseSinNadieEscuchando = `http://127.0.0.1:${await puertoCerrado()}`;
});

afterAll(async () => {
  await new Promise<void>(listo => servidor404.close(() => listo()));
  rmSync(tmp, { recursive: true, force: true });
});

function correr(...args: string[]): Promise<{ status: number | null; stderr: string }> {
  return new Promise(resolver => {
    const hijo = spawn(process.execPath, [join(tmp, 'scripts', 'deploy.mjs'), ...args]);
    let stderr = '';
    hijo.stderr.setEncoding('utf8');
    hijo.stderr.on('data', d => { stderr += d; });
    hijo.stdout.resume();                                        // drenar: un pipe lleno colgaría al hijo
    hijo.on('close', status => resolver({ status, stderr }));
  });
}

describe('--solo-verificar --base, cuando el blanco no contesta', () => {
  it('nombra al blanco ANTES que a la señal: el typo y el canal vencido son lo probable, el WiFi no', async () => {
    const r = await correr('--solo-verificar', '--base', baseSinNadieEscuchando);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ABORTADO:');
    // la pista nombra el flag, el blanco y las dos causas probables del ensayo general
    expect(r.stderr).toContain('--base');
    expect(r.stderr).toContain(baseSinNadieEscuchando);
    expect(r.stderr).toContain('hosting:channel:deploy');
    expect(r.stderr).toContain('--expires 1h');
    // el arreglo SUMA: la señal sigue estando (el fallo es de red de verdad)…
    expect(r.stderr).toContain('problema de señal');
    // …pero segunda. El orden ES el hallazgo.
    expect(r.stderr.indexOf('--base')).toBeLessThan(r.stderr.indexOf('problema de señal'));
  });
});

describe('--solo-verificar --base, cuando el blanco contesta 404 (canal vencido o borrado)', () => {
  it('cuelga la misma pista del blanco, y no habla de señal: el servidor contestó', async () => {
    const r = await correr('--solo-verificar', '--base', baseQueContesta404);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ABORTADO:');
    expect(r.stderr).toContain('respondió 404');
    expect(r.stderr).toContain('--expires 1h');
    expect(r.stderr).not.toContain('problema de señal');
  });
});
