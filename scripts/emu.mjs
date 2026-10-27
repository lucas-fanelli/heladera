#!/usr/bin/env node
// Levanta los emuladores de Firebase (Firestore + Auth) para desarrollar sin proyecto real (npm run emu).
//  - Mata antes un java huérfano de una corrida anterior (Windows lo deja vivo).
//  - Persiste los datos entre corridas en ./.emu-data (ignorado por git): al salir exporta, al arrancar importa si hay.
//    Así la lista que creaste desde el teléfono sigue ahí mañana. Para empezar de cero: borrá la carpeta.
// Uso: node scripts/emu.mjs [args extra para firebase emulators:start]
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { javaEnWindows } from './java-windows.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATOS = join(ROOT, '.emu-data');
javaEnWindows(mkdirSync);

spawnSync(process.execPath, [join(ROOT, 'scripts', 'emu-kill.mjs')], { stdio: 'inherit', cwd: ROOT });
mkdirSync(DATOS, { recursive: true });

const args = ['firebase', 'emulators:start', '--only', 'firestore,auth', '--project', 'demo-heladera', '--export-on-exit', DATOS];
if (existsSync(join(DATOS, 'firebase-export-metadata.json'))) args.push('--import', DATOS);
args.push(...process.argv.slice(2));

const r = spawnSync('npx', args, { stdio: 'inherit', cwd: ROOT, shell: true });
process.exit(r.status ?? 0);
