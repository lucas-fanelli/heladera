/// <reference types="vitest/config" />
import { defineConfig, type PluginOption } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

// Modos:
//  - default (dev/build): PWA normal, router por path (/l/<id>), Db según VITE_DB (fake | firestore).
//  - demo: un solo archivo HTML autocontenido con el Db falso y router por hash (#/l/<id>),
//          para publicarlo como artifact / abrirlo desde cualquier lado sin servidor.
/**
 * Modo `emulador`: el navegador habla con los emuladores de Firebase A TRAVÉS de Vite (mismo origen), no directo.
 * Así un teléfono en la red local (npm run dev:emu:lan) llega a Firestore/Auth emulados sin exponer el java del
 * emulador ni pelear con el firewall: los emuladores siguen en 127.0.0.1 y Vite reenvía por prefijo de path
 * (los que usa el SDK: WebChannel de Firestore, Identity Toolkit / Secure Token de Auth). src/db/firebase.ts, en el
 * navegador, conecta los emuladores a location.host; en node (tests) va directo a 127.0.0.1.
 */
const PROXY_EMULADORES = {
  '/google.firestore.v1.Firestore': { target: 'http://127.0.0.1:8080', changeOrigin: false },
  '/identitytoolkit.googleapis.com': { target: 'http://127.0.0.1:9099', changeOrigin: false },
  '/securetoken.googleapis.com': { target: 'http://127.0.0.1:9099', changeOrigin: false },
  '/emulator': { target: 'http://127.0.0.1:9099', changeOrigin: false },
};

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  const plugins: PluginOption[] = [react()];
  if (demo) {
    plugins.push(viteSingleFile({ removeViteModuleLoader: true }));
  } else {
    plugins.push(
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/*.png', 'icons/*.svg'],
        manifest: {
          name: 'Heladera',
          short_name: 'Heladera',
          description: 'La lista de compras de casa, compartida.',
          lang: 'es-AR',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          // El UNICO color que este manifest hornea, y a proposito: no pinta la barra —pinta el splash de la
          // app instalada, antes de que exista una linea de CSS nuestro— y no tiene variante por modo
          // (dark_background_color, que lo intentaba, es de los campos muertos que esta release saca). Va al
          // --paper CLARO para los DOS modos porque ausente Chrome cae a blanco: limite conocido, ver D25.
          background_color: '#F6F1E7',
          // SIN theme_color, a proposito y con evidencia (ver D25 en decisiones.md):
          // en una PWA INSTALADA la barra de estado la pinta Chrome, no la pagina — es un bug conocido de
          // Chromium (#407420295, asignado) que impide dibujar debajo de ella, con el arreglo ya escrito y
          // APAGADO en el navegador (flag web-app-short-edges-cutout-mode).
          // Sin theme_color, Chrome usa su propio par fondo/iconos: siempre legible y siguiendo el modo del
          // sistema. Hornear un color rompe esa pareja — los iconos del reloj y la bateria los decide el
          // MODO, no nuestro color, asi que barra oscura en modo claro = texto negro sobre negro.
          // Y el dia que Google active la feature, gana el fondo real de la app (--paper) y la barra pasa a
          // la paleta sola, por modo, sin tocar nada: verificado en el telefono con el flag prendido.
          // El undefined es EXPLICITO: VitePWA inyecta #42b883 (el verde de Vue) si el campo falta.
          theme_color: undefined as unknown as string,
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // El shell se precachea; los datos NO (Firestore maneja su propio offline).
          globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
          navigateFallback: '/index.html',
          // /__/* es el namespace reservado de Firebase Hosting: ahí viven los handlers de auth (/__/auth/*)
          // que usa la cuenta (D23). Sin esta entrada, el service worker les serviría index.html y el viaje a
          // Google moriría en la app instalada — y solo en la instalada, que es donde hay SW (lo cazó la revisión:
          // el emulador no tiene SW, así que la prueba manual no podía verlo).
          navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
          runtimeCaching: [],
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
    );
  }
  return {
    plugins,
    define: {
      __DEMO__: JSON.stringify(demo),
      // sello del build: lo muestra el medidor (?fps) para saber de un vistazo si el teléfono tiene la versión nueva
      // o el service worker le está sirviendo una vieja
      __BUILD__: JSON.stringify(new Date().toISOString().slice(5, 16).replace('T', ' ')),
    },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      target: 'es2022',
      sourcemap: !demo,
      assetsInlineLimit: demo ? 100_000_000 : 4096,
    },
    server: { port: 5173, strictPort: false, proxy: mode === 'emulador' ? PROXY_EMULADORES : undefined },
    preview: { proxy: mode === 'emulador' ? PROXY_EMULADORES : undefined },
    test: {
      globals: true,
      css: true,
      coverage: {
        provider: 'v8',
        include: ['src/**'],
        // fuera de cobertura: tests, el arranque, y lo que solo se ejercita contra Firebase de verdad o el emulador
        // (firestore.ts, firebase.ts) o es una suite de test compartida y no código de la app (contrato.ts)
        exclude: ['src/**/*.test.*', 'src/main.tsx', 'src/db/firestore.ts', 'src/db/firebase.ts', 'src/db/contrato.ts'],
        thresholds: { 'src/domain/**': { branches: 90, lines: 95 } },
      },
      projects: [
        // los *.emu.test.* (ts o tsx) solo corren en el proyecto 'emulador'; los excludes de vitest se conservan (node_modules, dist…)
        { extends: true, test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'], exclude: [...configDefaults.exclude, '**/*.emu.test.*'] } },
        { extends: true, test: { name: 'ui', environment: 'jsdom', include: ['src/**/*.test.tsx', 'tests/ui/**/*.test.tsx'], exclude: [...configDefaults.exclude, '**/*.emu.test.*'], setupFiles: ['tests/setup-ui.ts'] } },
        // Tests contra el emulador de Firestore (contrato del Db real + reglas). Solo existen como proyecto cuando
        // corremos adentro de `firebase emulators:exec` (que define FIRESTORE_EMULATOR_HOST): sin emulador no aparecen
        // ni como "saltados", así `vitest run` a secas sigue siendo verde y rápido. Los archivos corren de a uno
        // (fileParallelism: false): comparten el proyecto del emulador y cada test lo limpia (clearFirestore).
        // testTimeout = 3 × la ESPERA_MS de src/db/contrato.ts: el techo es por `it` y los `it` de la suite
        // encadenan varias esperas (el más largo, (f), encadena seis), así que con el techo pegado a UNA espera
        // el mensaje diagnóstico del contrato no saldría nunca — saldría "test timed out". Los dos números se
        // mueven juntos y lo hace cumplir tests/unit/reloj-suite-contrato.test.ts.
        ...(process.env.FIRESTORE_EMULATOR_HOST
          ? [{ extends: true as const, test: { name: 'emulador', include: ['src/**/*.emu.test.{ts,tsx}'], environment: 'node' as const, testTimeout: 60_000, hookTimeout: 90000, fileParallelism: false } }]
          : []),
      ],
    },
  };
});
