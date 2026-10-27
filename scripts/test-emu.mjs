#!/usr/bin/env node
// Corre el proyecto vitest 'emulador' adentro de `firebase emulators:exec` y SIEMPRE limpia el java del emulador al
// final (en Windows queda huérfano aunque vitest falle). Propaga el código de salida de vitest.
//
// Uso: node scripts/test-emu.mjs [args extra para vitest]
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { javaEnWindows } from './java-windows.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
javaEnWindows(mkdirSync);
const kill = () => spawnSync(process.execPath, [join(ROOT, 'scripts', 'emu-kill.mjs')], { stdio: 'inherit', cwd: ROOT });

kill();
const extra = process.argv.slice(2).join(' ');
const cmd = `vitest run --project emulador${extra ? ' ' + extra : ''}`;
// una sola línea de shell (con el script entre comillas: emulators:exec lo recibe como UN argumento)
const linea = `npx firebase emulators:exec --only firestore --project demo-heladera "${cmd}"`;
const r = spawnSync(linea, { stdio: 'inherit', cwd: ROOT, shell: true });
kill();
process.exit(r.status ?? 1);
