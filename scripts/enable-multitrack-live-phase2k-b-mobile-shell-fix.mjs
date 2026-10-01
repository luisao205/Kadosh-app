import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');

const replaceOnce = (needle, replacement, label) => {
  const first = text.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró: ${label}`);
  if (text.indexOf(needle, first + needle.length) !== -1) throw new Error(`Marcador duplicado: ${label}`);
  text = text.slice(0, first) + replacement + text.slice(first + needle.length);
};

const replaceOneOf = (needles, replacement, label) => {
  const matches = needles.filter((needle) => text.includes(needle));
  if (matches.length === 0) throw new Error(`No se encontró ninguna variante de: ${label}`);
  if (matches.length > 1) throw new Error(`Se encontraron varias variantes de: ${label}`);
  replaceOnce(matches[0], replacement, label);
};

replaceOnce(
  '<div className="min-h-screen bg-[#050608] text-zinc-100">',
  '<div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#050608] text-zinc-100">',
  'raíz Live Runner'
);

replaceOnce(
  '<header className="sticky top-0 z-30 border-b border-white/10 bg-[#050608]/95 px-3 py-3 backdrop-blur md:px-5">',
  '<header className="sticky top-0 z-30 w-full max-w-full overflow-x-hidden border-b border-white/10 bg-[#050608]/95 px-3 py-2.5 backdrop-blur md:px-5 md:py-3">',
  'header Live Runner'
);

replaceOnce(
  '<div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">',
  '<div className="mx-auto flex w-full min-w-0 max-w-[1800px] flex-wrap items-center justify-between gap-2 sm:gap-3">',
  'contenido header Live Runner'
);

replaceOnce(
  '<div className="mx-auto max-w-[1800px] px-3 pt-3 md:px-5 md:pt-4">',
  '<div className="mx-auto w-full min-w-0 max-w-[1800px] px-3 pt-3 md:px-5 md:pt-4">',
  'wrapper readiness Live'
);

replaceOneOf(
  [
    '<main className="mx-auto grid max-w-[1800px] gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">',
    '<main className="mx-auto grid min-w-0 max-w-[1800px] overflow-x-hidden gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">'
  ],
  '<main className="mx-auto grid w-full min-w-0 max-w-[1800px] overflow-x-hidden gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">',
  'main Live responsive'
);

replaceOnce(
  '<aside className="order-2 rounded-3xl border border-white/10 bg-white/[0.035] p-3 xl:order-1 xl:sticky xl:top-[82px] xl:h-[calc(100vh-102px)] xl:overflow-hidden">',
  '<aside className="order-2 w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-3 xl:order-1 xl:sticky xl:top-[82px] xl:h-[calc(100vh-102px)]">',
  'contenedor Setlist responsive'
);

replaceOnce(
  '<div className="flex gap-2 overflow-x-auto pb-1 xl:h-[calc(100%-32px)] xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden xl:pr-1">',
  '<div className="grid w-full min-w-0 grid-cols-1 gap-2 pb-1 sm:grid-cols-2 lg:grid-cols-3 xl:h-[calc(100%-32px)] xl:grid-cols-1 xl:overflow-y-auto xl:overflow-x-hidden xl:pr-1">',
  'lista de canciones responsive'
);

replaceOnce(
  'className={`min-w-[230px] rounded-2xl border p-3 text-left transition-all xl:min-w-0 ${active ? ',
  'className={`w-full min-w-0 max-w-full rounded-2xl border p-3 text-left transition-all ${active ? ',
  'tarjetas del Setlist responsive'
);

replaceOnce(
  '<section className="order-1 min-w-0 space-y-3 xl:order-2">',
  '<section className="order-1 w-full min-w-0 max-w-full space-y-3 overflow-x-hidden xl:order-2">',
  'sección central responsive'
);

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2K-B shell móvil corregida: ancho real del viewport y Setlist navegable sin carrusel lateral.');
