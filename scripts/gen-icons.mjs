#!/usr/bin/env node
// Genera los íconos de la PWA en public/icons/ sin dependencias nativas.
// Dibuja el motivo procedimentalmente (cuadrado redondeado "papel" + imán/hoja "cuero"
// con una casilla y un tilde en "detalle") con anti-aliasing por supersampling y
// escribe PNG RGBA usando node:zlib. También escribe favicon.svg con el mismo motivo.
//
// Uso: node scripts/gen-icons.mjs
import { deflateSync, crc32 as zlibCrc32 } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');

// Paleta "Papel de almacén" (docs/diseno/paleta.html)
const PAPEL = '#F6F1E7';
const CUERO = '#7B4A2D';
const DETALLE = '#FFFDF8';

const SS = 4; // supersampling por eje (16 muestras por píxel)

// ---------- utilidades de color ----------
function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ---------- geometría (todo en coordenadas normalizadas 0..1 sobre el lienzo) ----------
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
// distancia punto-segmento (para el tilde con trazo redondeado)
function inSegment(x, y, ax, ay, bx, by, w) {
  const vx = bx - ax, vy = by - ay;
  const wx = x - ax, wy = y - ay;
  const l2 = vx * vx + vy * vy;
  const t = Math.min(1, Math.max(0, (wx * vx + wy * vy) / l2));
  const px = ax + vx * t, py = ay + vy * t;
  const dx = x - px, dy = y - py;
  return dx * dx + dy * dy <= w * w;
}

/**
 * Motivo: dentro de la zona segura (cuadrado central de lado `safe`), un
 * "papelito" cuero (rectángulo redondeado, levemente vertical) sostenido por
 * un imán redondo arriba, y adentro una casilla clara con un tilde cuero.
 * Devuelve el color [r,g,b] para un punto (x,y) en 0..1.
 */
function makeMotivo({ safe, roundedBg }) {
  const papel = hex(PAPEL), cuero = hex(CUERO), detalle = hex(DETALLE);
  const o = (1 - safe) / 2; // offset de la zona segura
  const S = (v) => o + v * safe; // mapea 0..1 de la zona segura al lienzo

  // hoja de papel (cuero)
  const hx0 = S(0.20), hx1 = S(0.80), hy0 = S(0.20), hy1 = S(0.86), hr = 0.07 * safe;
  // imán (círculo cuero con centro claro) apoyado en el borde superior de la hoja
  const mcx = S(0.50), mcy = S(0.20), mr = 0.10 * safe, mri = 0.045 * safe;
  // casilla (detalle) dentro de la hoja
  const cx0 = S(0.31), cx1 = S(0.69), cy0 = S(0.40), cy1 = S(0.78), cr = 0.05 * safe;
  // tilde (cuero) dentro de la casilla
  const tw = 0.038 * safe;
  const t1 = [S(0.40), S(0.60)], t2 = [S(0.47), S(0.68)], t3 = [S(0.61), S(0.49)];

  return (x, y) => {
    if (roundedBg && !inRoundedRect(x, y, 0, 0, 1, 1, 0.22)) return null; // transparente
    if (inCircle(x, y, mcx, mcy, mri)) return detalle;
    if (inCircle(x, y, mcx, mcy, mr)) return cuero;
    if (inRoundedRect(x, y, hx0, hy0, hx1, hy1, hr)) {
      if (inSegment(x, y, t1[0], t1[1], t2[0], t2[1], tw) || inSegment(x, y, t2[0], t2[1], t3[0], t3[1], tw)) return cuero;
      if (inRoundedRect(x, y, cx0, cy0, cx1, cy1, cr)) return detalle;
      return cuero;
    }
    return papel;
  };
}

// ---------- raster con supersampling ----------
function render(size, motivo) {
  const px = new Uint8Array(size * size * 4);
  const n = SS * SS;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const x = (i + (si + 0.5) / SS) / size;
          const y = (j + (sj + 0.5) / SS) / size;
          const c = motivo(x, y);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const k = (j * size + i) * 4;
      if (a > 0) {
        px[k] = Math.round(r / a);
        px[k + 1] = Math.round(g / a);
        px[k + 2] = Math.round(b / a);
        px[k + 3] = Math.round((a / n) * 255);
      }
    }
  }
  return px;
}

// ---------- PNG ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32Own(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const crc32 = typeof zlibCrc32 === 'function' ? (b) => zlibCrc32(b) >>> 0 : crc32Own;

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Verificación: firma PNG + IHDR con el tamaño esperado + CRC del IHDR
function checkPng(path, size) {
  const b = readFileSync(path);
  const sig = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const crcOk = b.readUInt32BE(29) === crc32(b.subarray(12, 29));
  const iend = b.subarray(b.length - 8, b.length - 4).toString('ascii') === 'IEND';
  if (!sig || w !== size || h !== size || !crcOk || !iend) {
    throw new Error(`PNG inválido: ${path} (sig=${sig} ${w}x${h} crc=${crcOk} iend=${iend})`);
  }
  return `${path.replace(ROOT, '.')}  ${w}x${h}  ${b.length} bytes  OK`;
}

// ---------- SVG (favicon) ----------
function svg() {
  // Misma geometría que makeMotivo con safe=1 y fondo redondeado, en viewBox 0..100.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="${PAPEL}"/>
  <rect x="20" y="20" width="60" height="66" rx="7" fill="${CUERO}"/>
  <rect x="31" y="40" width="38" height="38" rx="5" fill="${DETALLE}"/>
  <path d="M40 60 L47 68 L61 49" fill="none" stroke="${CUERO}" stroke-width="7.6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="50" cy="20" r="10" fill="${CUERO}"/>
  <circle cx="50" cy="20" r="4.5" fill="${DETALLE}"/>
</svg>
`;
}

// ---------- main ----------
mkdirSync(OUT, { recursive: true });

const normal = makeMotivo({ safe: 1, roundedBg: false });      // el SO recorta si quiere
const maskable = makeMotivo({ safe: 0.8, roundedBg: false });  // motivo dentro del 80 % central

const jobs = [
  ['icon-192.png', 192, normal],
  ['icon-512.png', 512, normal],
  ['icon-maskable-512.png', 512, maskable],
  ['apple-touch-icon.png', 180, normal],
];
const report = [];
for (const [name, size, motivo] of jobs) {
  const path = join(OUT, name);
  writeFileSync(path, encodePng(size, render(size, motivo)));
  report.push(checkPng(path, size));
}
writeFileSync(join(OUT, 'favicon.svg'), svg());
report.push('./public/icons/favicon.svg  OK');
process.stdout.write(report.join('\n') + '\n');
