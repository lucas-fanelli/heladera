/**
 * El candado del espejo (deploy.mjs) es el único fallo del circuito cuya consecuencia es una FUGA de datos de
 * la familia: el servidor está sirviendo un archivo que el circuito juró que no se publicaba — hoy, los
 * `.map`, que llevan el fuente entero en `sourcesContent` (el incidente fundacional, D24). Su mensaje ahora
 * contiene lo que se corta y CÓMO, y esa contención DEPENDE DEL BLANCO: contra el canal vivo se corta
 * republicando hosting; contra un canal de preview (`--base`) el corte es borrar el canal, y el mensaje NO
 * puede nombrar `--dale` ni `firebase deploy` — mandaría a publicar PRODUCCIÓN en medio de un ensayo, con la
 * app de la familia sana. Ese es el modo de fallar de la rama nueva, y es lo que fija este test.
 *
 * Se corre el script REAL (spawn, no spawnSync: el servidor de prueba vive en ESTE proceso y un spawn
 * bloqueante lo dejaría sin event loop para contestar) sobre una copia aislada del repo (mkdtemp), contra un
 * `node:http` que se comporta como el hosting que ya publicó el ignorado.
 *
 * Limitación honesta: la rama del canal VIVO no es alcanzable end-to-end (sin `--base`, BASE sale de
 * .firebaserc y apunta a https://<proyecto>.web.app), así que acá se fija la rama PELIGROSA —la que puede
 * mandar a tocar producción— y no la copy del camino vivo.
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error — módulo .mjs de scripts/, sin tipos: el deep link sale del espejo compartido y no de una
// copia acá, que sería el mismo criterio en dos lugares
import { RUTA_SPA_DE_PRUEBA } from '../../scripts/dist-publicado.mjs';

const REPO = process.cwd();
// el index trae su <script src>: la puerta de imprescindibles deriva del artefacto la cadena de arranque, y
// un index que no carga nada no es un artefacto (ni acá ni en producción)
const INDEX = Buffer.from('<!doctype html><title>heladera</title><script type="module" src="/app.js"></script>');
const APP = Buffer.from('export const x = 1;\n');
// un sourcemap de mentira: lleva sourcesContent, que es lo que hace grave a la fuga — sin el nombre de nadie
const MAPA = Buffer.from(JSON.stringify({ version: 3, sources: ['app.ts'], sourcesContent: ['// el fuente entero'] }));

let tmp: string;
let servidor: Server;
let base: string;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'candado-espejo-'));
  // scripts/ ENTERO, derivado del directorio real (se importan entre sí y viajan juntos), como en puertas-config
  cpSync(join(REPO, 'scripts'), join(tmp, 'scripts'), { recursive: true });
  writeFileSync(join(tmp, '.firebaserc'), JSON.stringify({ projects: { default: 'proyecto-fake' } }));
  writeFileSync(join(tmp, 'firebase.json'), JSON.stringify({
    hosting: {
      public: 'dist',
      ignore: ['firebase.json', '**/.*', '**/node_modules/**', '**/*.map'],
      cleanUrls: true,
      headers: [{
        source: '**',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      }],
    },
  }));
  mkdirSync(join(tmp, 'dist'));
  writeFileSync(join(tmp, 'dist', 'index.html'), INDEX);
  writeFileSync(join(tmp, 'dist', 'app.js'), APP);
  writeFileSync(join(tmp, 'dist', 'app.js.map'), MAPA);

  // el hosting que YA se comió el ignore: sirve el .map tal cual, con los headers de la política (así el
  // recorrido llega entero hasta el chequeo negativo y no muere antes por bytes o headers) — y resuelve el
  // deep link de la SPA con el index, como hace el rewrite `**` de verdad: ese chequeo va JUSTO antes del
  // candado, así que un blanco que lo diera en 404 nunca llegaría hasta acá
  servidor = createServer((req, res) => {
    const ruta = new URL(req.url ?? '/', 'http://x').pathname;   // el fetch va con ?v=<ts> para saltear cachés
    const cuerpo = ruta === '/' || ruta === RUTA_SPA_DE_PRUEBA ? INDEX : ruta === '/app.js' ? APP : ruta === '/app.js.map' ? MAPA : null;
    res.writeHead(cuerpo ? 200 : 404, {
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    res.end(cuerpo ?? '');
  });
  await new Promise<void>(listo => servidor.listen(0, '127.0.0.1', listo));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(listo => servidor.close(() => listo()));
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

describe('el candado del espejo, cuando el blanco es un canal de preview', () => {
  it('aborta nombrando el archivo, lo que está en juego y la contención del canal — sin mandar a publicar producción', async () => {
    const r = await correr('--solo-verificar', '--base', base);

    expect(r.status).toBe(1);
    // formato de la casa, y el archivo que se está sirviendo
    expect(r.stderr).toContain('ABORTADO:');
    expect(r.stderr).toContain('app.js.map');
    // QUÉ está en juego (lo único que hace existir a este candado) y que pasa AHORA
    expect(r.stderr).toContain('sourcesContent');
    expect(r.stderr).toContain('AHORA');
    // CÓMO se corta, con el corte que corresponde a ESTE blanco
    expect(r.stderr).toContain('hosting:channel:delete');
    // y lo que no puede decir jamás apuntando a un preview: publicar acá tocaría el canal vivo
    expect(r.stderr).not.toContain('--dale');
    expect(r.stderr).not.toContain('firebase deploy --only hosting');
  });

  it('el escenario es el de verdad: el .map del dist se está sirviendo byte a byte (si no, el test aprobaría en vacío)', async () => {
    const res = await fetch(`${base}/app.js.map`);
    const servido = Buffer.from(await res.arrayBuffer());

    expect(res.ok).toBe(true);
    expect(servido.equals(readFileSync(join(tmp, 'dist', 'app.js.map')))).toBe(true);
  });
});
