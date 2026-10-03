import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const replaceExact = (before, after, label) => {
  if (source.includes(after)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return;
  }
  if (!source.includes(before)) throw new Error(`No se encontró: ${label}`);
  source = source.replace(before, after);
  console.log(`[ok] ${label}`);
};

replaceExact(
  '<div className="min-h-[260px] border-b border-white/10 flex flex-col">',
  '<div className={`border-b border-white/10 flex flex-col shrink-0 ${projectionSourceMode === \'media\' ? \'min-h-[360px]\' : \'min-h-[260px]\'}`}>',
  'altura de Pre-proyección para Multimedia'
);

replaceExact(
  `{projectionSourceMode === 'media' && (\n                <div className="mt-4 space-y-3">\n                  {renderMediaTargetSelector()}\n                  <button`,
  `{projectionSourceMode === 'media' && (\n                <div className="mt-3 space-y-2.5 pb-1">\n                  {renderMediaTargetSelector({ compact: true })}\n                  <button`,
  'controles Multimedia compactos y separados'
);

const stopStart = source.indexOf('  const renderMediaStopActions = () => (');
const stopEnd = source.indexOf('\n\n  const renderMediaTargetSelector', stopStart);
if (stopStart < 0 || stopEnd < 0) throw new Error('No se encontró renderMediaStopActions.');
let stopBlock = source.slice(stopStart, stopEnd);
const nextStopBlock = stopBlock
  .replace('className="grid grid-cols-2 gap-2"', 'className="grid grid-cols-2 gap-2 pt-1"')
  .replaceAll('min-h-10 rounded-xl', 'min-h-9 sm:min-h-10 rounded-xl');
if (stopBlock !== nextStopBlock) {
  source = source.slice(0, stopStart) + nextStopBlock + source.slice(stopEnd);
  console.log('[ok] acciones Retirar/Detener con mejor respiración');
} else {
  console.log('[skip] acciones Retirar/Detener: ya compactadas.');
}

const desktopMediaNeedle = `disabled={!canProjectMedia || !previewMedia || !hasMediaTargets(mediaTargets)}\n                    className="w-full py-3.5 bg-violet-600`;
const desktopMediaAfter = `disabled={!canProjectMedia || !previewMedia || !hasMediaTargets(mediaTargets)}\n                    className="w-full py-3 bg-violet-600`;
if (source.includes(desktopMediaAfter)) {
  console.log('[skip] botón Proyectar: ya compactado.');
} else if (source.includes(desktopMediaNeedle)) {
  source = source.replace(desktopMediaNeedle, desktopMediaAfter);
  console.log('[ok] botón Proyectar con altura ajustada');
} else {
  console.log('[warn] no se ajustó altura de botón Proyectar; se conserva el actual.');
}

if (!source.includes("projectionSourceMode === 'media' ? 'min-h-[360px]' : 'min-h-[260px]'")) {
  throw new Error('Validación falló: no quedó la altura dinámica de Pre-proyección.');
}
if (!source.includes('renderMediaTargetSelector({ compact: true })')) {
  throw new Error('Validación falló: selector Multimedia no quedó compacto.');
}

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Ajuste visual aplicado: Destinos Multimedia, Proyectar, Retirar y Detener ya no se pisan con En Vivo.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}
