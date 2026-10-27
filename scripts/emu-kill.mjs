#!/usr/bin/env node
// Mata un emulador de Firestore que haya quedado huérfano escuchando en su puerto.
// En Windows, `firebase emulators:exec` a veces termina pero deja vivo el java del emulador (puerto 8080 tomado):
// la corrida siguiente falla con "port taken". Solo mata procesos java (nunca otra cosa que use el puerto).
//
// Uso: node scripts/emu-kill.mjs [puerto...]   (default: 8080 y 9099)
import { execSync } from 'node:child_process';

const puertos = process.argv.slice(2).map(Number).filter(Boolean);
if (puertos.length === 0) puertos.push(8080, 9099);

function pidsEnPuerto(puerto) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
      const pids = new Set();
      for (const linea of out.split(/\r?\n/)) {
        const m = linea.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/);
        if (m && Number(m[1]) === puerto) pids.add(Number(m[2]));
      }
      return [...pids];
    }
    const out = execSync(`lsof -ti tcp:${puerto} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out.split(/\s+/).map(Number).filter(Boolean);
  } catch {
    return [];
  }
}

function esJava(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
      return /^"java(w)?\.exe"/i.test(out.trim());
    }
    const out = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' });
    return /java/i.test(out);
  } catch {
    return false;
  }
}

for (const puerto of puertos) {
  for (const pid of pidsEnPuerto(puerto)) {
    if (!esJava(pid)) { process.stdout.write(`puerto ${puerto}: lo usa el PID ${pid} y no es java; no lo toco\n`); continue; }
    try {
      if (process.platform === 'win32') execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
      else process.kill(pid, 'SIGKILL');
      process.stdout.write(`puerto ${puerto}: maté el java huérfano (PID ${pid})\n`);
    } catch (e) {
      process.stderr.write(`puerto ${puerto}: no pude matar el PID ${pid}: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
}
