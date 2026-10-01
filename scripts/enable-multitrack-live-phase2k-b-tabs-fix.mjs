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
  '<div className="grid w-full min-w-0 grid-cols-2 gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-1.5 sm:gap-2">',
  '<div className="grid w-full min-w-0 gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-1.5 sm:gap-2" style={{ gridTemplateColumns: \'minmax(0, 1fr) minmax(0, 1fr)\' }}>',
  'rejilla explícita tabs touch'
);

replaceOnce(
  "className={'flex min-h-12 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-2 text-[9px] font-black uppercase tracking-[0.08em] transition-colors sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.12em] ' + (liveTouchPanel === 'sections' ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}",
  "className={'flex min-h-12 w-full min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-xl px-2 text-[9px] font-black uppercase tracking-[0.08em] transition-colors sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.12em] ' + (liveTouchPanel === 'sections' ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}",
  'tab Secciones ancho fijo'
);

replaceOnce(
  "className={'flex min-h-12 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-2 text-[9px] font-black uppercase tracking-[0.08em] transition-colors sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.12em] ' + (liveTouchPanel === 'mixer' ? 'bg-blue-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}",
  "className={'flex min-h-12 w-full min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-xl px-2 text-[9px] font-black uppercase tracking-[0.08em] transition-colors sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.12em] ' + (liveTouchPanel === 'mixer' ? 'bg-blue-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/[0.05]')}",
  'tab Mixer ancho fijo'
);

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2K-B tabs corregidas: Secciones y Mixer quedan forzadas a 50/50 en móvil y tablet.');
