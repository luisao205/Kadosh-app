import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');

const touchStartMarker = `                {liveRunnerMode && (\n                  <div className="mt-4 xl:hidden">`;
const timelineMarker = `\n\n                <div className="mt-7">\n                  <input`;
const clockMarker = `\n\n                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">`;

const touchStart = text.indexOf(touchStartMarker);
const clockIndex = text.indexOf(clockMarker);

if (touchStart === -1) throw new Error('No se encontró el panel táctil Live. Ejecuta primero 2K-A/2K-B.');
if (clockIndex === -1) throw new Error('No se encontró el bloque del reloj musical.');

if (touchStart < clockIndex) {
  console.log('Multitrack Live 2K-B layout ya estaba corregido: panel táctil antes del reloj.');
  process.exit(0);
}

const touchEnd = text.indexOf(timelineMarker, touchStart);
if (touchEnd === -1) throw new Error('No se encontró el final del panel táctil Live.');

const touchBlock = text.slice(touchStart, touchEnd);
text = text.slice(0, touchStart) + text.slice(touchEnd);

const nextClockIndex = text.indexOf(clockMarker);
if (nextClockIndex === -1) throw new Error('Se perdió el marcador del reloj durante la reubicación.');

text = text.slice(0, nextClockIndex) + `\n\n${touchBlock}` + text.slice(nextClockIndex);

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2K-B layout corregido: Control táctil movido antes del reloj y loops.');
