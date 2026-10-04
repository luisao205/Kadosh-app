import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceHelper = 'scripts/refine-canva-workspace-mobile-desktop.mjs';
if (!fs.existsSync(sourceHelper)) throw new Error('No existe el helper Canva responsive V1.');

let helper = fs.readFileSync(sourceHelper, 'utf8');
const broken = "${projectionSourceMode === 'canva' ? 'hidden' : 'flex'}";
const escaped = "\\${projectionSourceMode === 'canva' ? 'hidden' : 'flex'}";

if (!helper.includes(broken) && !helper.includes(escaped)) {
  throw new Error('No se encontró la interpolación esperada en el helper Canva responsive.');
}

if (helper.includes(broken)) {
  helper = helper.replace(broken, escaped);
  console.log('[ok] corregida interpolación del helper Canva responsive');
} else {
  console.log('[skip] interpolación del helper Canva responsive: ya corregida.');
}

fs.mkdirSync('tmp', { recursive: true });
const tempHelper = path.resolve('tmp/refine-canva-workspace-mobile-desktop-fixed.mjs');
fs.writeFileSync(tempHelper, helper, 'utf8');

await import(pathToFileURL(tempHelper).href + '?v=' + Date.now());

console.log('Canva responsive V2 aplicado sin modificar el helper original ni otros módulos.');
