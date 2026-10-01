import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');
const changes = [];

const replaceVariant = (variants, replacement, label) => {
  if (text.includes(replacement)) return;
  const matches = variants.filter((variant) => text.includes(variant));
  if (matches.length === 0) throw new Error(`No se encontró ninguna variante de: ${label}`);
  const selected = matches[0];
  text = text.replace(selected, replacement);
  changes.push(label);
};

const replaceAllVariant = (needle, replacement, label) => {
  if (!text.includes(needle)) {
    if (text.includes(replacement)) return;
    throw new Error(`No se encontró: ${label}`);
  }
  const count = text.split(needle).length - 1;
  text = text.split(needle).join(replacement);
  changes.push(`${label} (${count})`);
};

const patchTouchButton = (anchor, label) => {
  const anchorIndex = text.indexOf(anchor);
  if (anchorIndex === -1) throw new Error(`No se encontró botón touch: ${label}`);
  if (text.indexOf(anchor, anchorIndex + anchor.length) !== -1) throw new Error(`Botón touch duplicado: ${label}`);

  const buttonStart = text.lastIndexOf('<button', anchorIndex);
  const buttonEnd = text.indexOf('>', anchorIndex);
  if (buttonStart === -1 || buttonEnd === -1) throw new Error(`No se pudo aislar botón touch: ${label}`);

  let opening = text.slice(buttonStart, buttonEnd + 1);
  const before = opening;
  if (!opening.includes('w-full')) opening = opening.replace('min-h-12', 'min-h-12 w-full');
  if (!opening.includes('whitespace-nowrap')) opening = opening.replace('overflow-hidden', 'overflow-hidden whitespace-nowrap');
  if (!opening.includes('min-w-0')) throw new Error(`El botón touch ${label} no contiene min-w-0 como se esperaba.`);

  if (opening !== before) {
    text = text.slice(0, buttonStart) + opening + text.slice(buttonEnd + 1);
    changes.push(`botón ${label} 50/50`);
  }
};

const patchTouchTabsWrapper = () => {
  const anchor = "onClick={() => setLiveTouchPanel('sections')}";
  const anchorIndex = text.indexOf(anchor);
  if (anchorIndex === -1) throw new Error('No se encontró la pestaña Secciones.');

  const buttonStart = text.lastIndexOf('<button', anchorIndex);
  const wrapperStart = text.lastIndexOf('<div', buttonStart);
  const wrapperEnd = text.indexOf('>', wrapperStart);
  if (wrapperStart === -1 || wrapperEnd === -1 || wrapperEnd > buttonStart) throw new Error('No se pudo aislar la rejilla de tabs touch.');

  const desired = `<div className="grid w-full min-w-0 gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-1.5 sm:gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>`;
  const current = text.slice(wrapperStart, wrapperEnd + 1);
  if (current !== desired) {
    if (!current.includes('grid') || !current.includes('border-white/8') || !current.includes('bg-black/25')) {
      throw new Error(`La rejilla encontrada no parece ser la de tabs touch: ${current}`);
    }
    text = text.slice(0, wrapperStart) + desired + text.slice(wrapperEnd + 1);
    changes.push('rejilla tabs touch 50/50');
  }
};

replaceVariant(
  ['<div className="min-h-screen bg-[#050608] text-zinc-100">'],
  '<div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#050608] text-zinc-100">',
  'raíz Live Runner'
);

replaceVariant(
  ['<header className="sticky top-0 z-30 border-b border-white/10 bg-[#050608]/95 px-3 py-3 backdrop-blur md:px-5">'],
  '<header className="sticky top-0 z-30 w-full max-w-full overflow-x-hidden border-b border-white/10 bg-[#050608]/95 px-3 py-2.5 backdrop-blur md:px-5 md:py-3">',
  'header Live Runner'
);

replaceVariant(
  ['<div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">'],
  '<div className="mx-auto flex w-full min-w-0 max-w-[1800px] flex-wrap items-center justify-between gap-2 sm:gap-3">',
  'contenido header Live Runner'
);

replaceAllVariant(
  '<div className="mx-auto max-w-[1800px] px-3 pt-3 md:px-5 md:pt-4">',
  '<div className="mx-auto w-full min-w-0 max-w-[1800px] px-3 pt-3 md:px-5 md:pt-4">',
  'wrappers readiness/preparación'
);

replaceVariant(
  [
    '<main className="mx-auto grid max-w-[1800px] gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">',
    '<main className="mx-auto grid min-w-0 max-w-[1800px] overflow-x-hidden gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">'
  ],
  '<main className="mx-auto grid w-full min-w-0 max-w-[1800px] overflow-x-hidden gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">',
  'main Live responsive'
);

replaceVariant(
  ['<aside className="order-2 rounded-3xl border border-white/10 bg-white/[0.035] p-3 xl:order-1 xl:sticky xl:top-[82px] xl:h-[calc(100vh-102px)] xl:overflow-hidden">'],
  '<aside className="order-2 w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-3 xl:order-1 xl:sticky xl:top-[82px] xl:h-[calc(100vh-102px)]">',
  'contenedor Setlist responsive'
);

replaceVariant(
  ['<div className="flex gap-2 overflow-x-auto pb-1 xl:h-[calc(100%-32px)] xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden xl:pr-1">'],
  '<div className="grid w-full min-w-0 grid-cols-1 gap-2 pb-1 sm:grid-cols-2 md:grid-cols-3 xl:h-[calc(100%-32px)] xl:grid-cols-1 xl:overflow-y-auto xl:overflow-x-hidden xl:pr-1">',
  'lista Setlist móvil/tablet'
);

replaceVariant(
  ['className={`min-w-[230px] rounded-2xl border p-3 text-left transition-all xl:min-w-0 ${active ? '],
  'className={`w-full min-w-0 max-w-full rounded-2xl border p-3 text-left transition-all ${active ? ',
  'tarjetas Setlist responsive'
);

replaceVariant(
  ['<section className="order-1 min-w-0 space-y-3 xl:order-2">'],
  '<section className="order-1 w-full min-w-0 max-w-full space-y-3 overflow-x-hidden xl:order-2">',
  'sección central responsive'
);

patchTouchTabsWrapper();
patchTouchButton("onClick={() => setLiveTouchPanel('sections')}", 'Secciones');
patchTouchButton("onClick={() => setLiveTouchPanel('mixer')}", 'Mixer');

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live 2K-B recovery aplicada: ${changes.length ? changes.join(', ') : 'el layout ya estaba corregido'}.`);
