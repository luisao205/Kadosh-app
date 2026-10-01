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

replaceOnce(
  '<main className="mx-auto grid max-w-[1800px] gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">',
  '<main className="mx-auto grid min-w-0 max-w-[1800px] overflow-x-hidden gap-3 p-3 md:gap-4 md:p-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">',
  'contenedor principal responsive'
);

replaceOnce(
  '<div className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-4 shadow-2xl shadow-black/30 md:p-6">',
  '<div className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-4 shadow-2xl shadow-black/30 md:p-6">',
  'tarjeta central Live'
);

replaceOnce(
  '<div className="mt-4 grid grid-cols-[60px_60px_minmax(120px,1fr)_60px] items-center gap-3">',
  '<div className="mt-4 grid min-w-0 grid-cols-[52px_52px_minmax(0,1fr)_52px] items-center gap-2 sm:grid-cols-[60px_60px_minmax(120px,1fr)_60px] sm:gap-3">',
  'rejilla controles operación Live'
);

replaceOnce(
  'className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-emerald-400 px-5 text-sm font-black uppercase tracking-[0.12em] text-zinc-950 hover:bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"',
  'className="flex h-16 min-w-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-emerald-400 px-2 text-xs font-black uppercase tracking-[0.08em] text-zinc-950 hover:bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500 sm:gap-3 sm:px-5 sm:text-sm sm:tracking-[0.12em]"',
  'botón Play responsive'
);

replaceOnce(
  '<div className="mt-4 xl:hidden">',
  '<div className="mt-4 min-w-0 max-w-full xl:hidden">',
  'wrapper Control táctil Live'
);

replaceOnce(
  '<div className="rounded-3xl border border-white/10 bg-white/[0.035] p-3 shadow-xl shadow-black/20">',
  '<div className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-3 shadow-xl shadow-black/20">',
  'contenedor Control táctil Live'
);

replaceOnce(
  '<div className="mb-3 flex items-center justify-between gap-3 px-1">',
  '<div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2 px-1">',
  'cabecera Control táctil Live'
);

replaceOnce(
  '<div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-black/25 p-1.5">',
  '<div className="grid w-full min-w-0 grid-cols-2 gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-1.5 sm:gap-2">',
  'tabs Control táctil Live'
);

replaceOnce(
  "className={'flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.12em] transition-colors ' + (liveTouchPanel === 'sections' ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}",
  "className={'flex min-h-12 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-2 text-[9px] font-black uppercase tracking-[0.08em] transition-colors sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.12em] ' + (liveTouchPanel === 'sections' ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}",
  'tab Secciones responsive'
);

replaceOnce(
  "className={'flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.12em] transition-colors ' + (liveTouchPanel === 'mixer' ? 'bg-blue-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}",
  "className={'flex min-h-12 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-2 text-[9px] font-black uppercase tracking-[0.08em] transition-colors sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.12em] ' + (liveTouchPanel === 'mixer' ? 'bg-blue-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}",
  'tab Mixer responsive'
);

replaceOnce(
  '<div className="mt-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] p-3">',
  '<div className="mt-3 min-w-0 overflow-hidden rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] p-3">',
  'panel Secciones rápidas responsive'
);

replaceOnce(
  '<div key={section.id} className="grid grid-cols-[minmax(0,1fr)_72px] gap-2 rounded-2xl border border-white/8 bg-black/20 p-2">',
  '<div key={section.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_60px] gap-2 rounded-2xl border border-white/8 bg-black/20 p-2 sm:grid-cols-[minmax(0,1fr)_72px]">',
  'fila Sección rápida responsive'
);

replaceOnce(
  '<div className="mt-3 rounded-2xl border border-blue-400/15 bg-blue-400/[0.035] p-3">',
  '<div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-2xl border border-blue-400/15 bg-blue-400/[0.035] p-3">',
  'panel Mixer touch responsive'
);

replaceOnce(
  '<div className="mb-3 flex items-center justify-between gap-2">\n                            <div>\n                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Mixer Live</p>',
  '<div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">\n                            <div className="min-w-0">\n                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Mixer Live</p>',
  'cabecera Mixer touch responsive'
);

replaceOnce(
  '<div className="overflow-x-auto pb-2 overscroll-x-contain">',
  '<div className="w-full max-w-full overflow-x-auto overflow-y-hidden pb-2 overscroll-x-contain [touch-action:pan-x]">',
  'scroll horizontal Mixer touch'
);

replaceOnce(
  '<div className="flex min-w-max gap-2">',
  '<div className="flex w-max min-w-full gap-2">',
  'rail de canales Mixer touch'
);

replaceOnce(
  '<div className="flex w-28 shrink-0 flex-col items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-2.5">',
  '<div className="flex w-24 shrink-0 flex-col items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-2 sm:w-28 sm:p-2.5">',
  'canal Master responsive'
);

replaceOnce(
  "<div key={stem.id} className={'flex w-28 shrink-0 flex-col items-center rounded-2xl border p-2.5 ' + (stem.solo ? 'border-amber-400/35 bg-amber-400/[0.055]' : stem.muted ? 'border-red-400/25 bg-red-400/[0.045]' : 'border-white/8 bg-black/25')}>",
  "<div key={stem.id} className={'flex w-24 shrink-0 flex-col items-center rounded-2xl border p-2 sm:w-28 sm:p-2.5 ' + (stem.solo ? 'border-amber-400/35 bg-amber-400/[0.055]' : stem.muted ? 'border-red-400/25 bg-red-400/[0.045]' : 'border-white/8 bg-black/25')}>",
  'canales stems responsive'
);

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2K-B responsive corregida: viewport protegido, tabs fluidas y scroll aislado del mixer.');
