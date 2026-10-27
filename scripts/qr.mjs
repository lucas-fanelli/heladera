#!/usr/bin/env node
// Genera el QR del link corto de la lista para imprimir y pegar en la heladera.
// Escribe qr-heladera.png y qr-heladera.svg en la raíz del repo (ignorados por git).
//
// Uso:
//   npm run qr -- https://<proyecto>.web.app/h
//   HELADERA_URL=https://<proyecto>.web.app/h npm run qr
//   node scripts/qr.mjs https://<proyecto>.web.app/h [carpeta-de-salida]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'https://<proyecto>.web.app/h';

const url = process.argv[2] ?? process.env.HELADERA_URL ?? DEFAULT_URL;
const outDir = resolve(process.argv[3] ?? ROOT);

if (url === DEFAULT_URL || !/^https?:\/\/[^<>\s]+$/.test(url)) {
  process.stderr.write(
    [
      'Falta la URL de la lista (el link corto que redirige a /l/<listId>?anotar).',
      '',
      'Pasala por argumento o por la variable HELADERA_URL:',
      '  npm run qr -- https://<proyecto>.web.app/h',
      '  HELADERA_URL=https://<proyecto>.web.app/h npm run qr',
      '',
      `Salida: ${join(outDir, 'qr-heladera.png')} y .svg`,
    ].join('\n') + '\n',
  );
  process.exit(1);
}

// Papel de almacén: fondo papel, módulos cuero. Nivel M: aguanta un poco de desgaste en la pegatina.
const opts = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#7B4A2DFF', light: '#F6F1E7FF' } };

mkdirSync(outDir, { recursive: true });
const png = join(outDir, 'qr-heladera.png');
const svg = join(outDir, 'qr-heladera.svg');
await QRCode.toFile(png, url, { ...opts, type: 'png', width: 1024 }); // 1024 px: nítido impreso a 8–10 cm
writeFileSync(svg, await QRCode.toString(url, { ...opts, type: 'svg' }));

process.stdout.write(`QR generado para ${url}\n  ${png}\n  ${svg}\nImprimilo (8–10 cm de lado alcanza) y pegalo en la heladera.\n`);
