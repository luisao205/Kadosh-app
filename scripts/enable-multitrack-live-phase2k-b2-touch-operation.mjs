import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');
let changes = 0;

const replaceOnceIfPresent = (needle, replacement, label) => {
  if (text.includes(replacement)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return false;
  }
  const first = text.indexOf(needle);
  if (first === -1) {
    console.log(`[skip] ${label}: patrón no encontrado.`);
    return false;
  }
  text = text.slice(0, first) + replacement + text.slice(first + needle.length);
  changes += 1;
  console.log(`[ok] ${label}`);
  return true;
};

const replaceAllIfPresent = (needle, replacement, label) => {
  if (!text.includes(needle)) {
    console.log(`[skip] ${label}: patrón no encontrado o ya aplicado.`);
    return 0;
  }
  const count = text.split(needle).length - 1;
  text = text.split(needle).join(replacement);
  changes += count;
  console.log(`[ok] ${label}: ${count} reemplazo(s)`);
  return count;
};

// En móvil/tablet ocultamos el bloque Operación Live grande original.
replaceOnceIfPresent(
  '<div className="mt-5 rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.055] p-4">',
  '<div className="mt-5 hidden rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.055] p-4 xl:block">',
  'Operación Live grande solo desktop'
);

const tabsMarker = `<div className="grid w-full min-w-0 gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-1.5 sm:gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>`;

const compactMarker = 'Operación táctil';
if (!text.includes(compactMarker)) {
  const tabsIndex = text.indexOf(tabsMarker);
  if (tabsIndex === -1) throw new Error('No se encontró el selector Secciones/Mixer para insertar Operación táctil.');

  const compactOperation = `                      <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-2.5 sm:p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">Operación táctil</p>
                            <p className="mt-0.5 hidden text-[9px] font-semibold text-zinc-600 sm:block">Transporte principal siempre a mano durante Live.</p>
                          </div>
                          <span className="shrink-0 font-mono text-[10px] font-black tabular-nums text-zinc-300 sm:text-xs">{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</span>
                        </div>

                        <input
                          type="range"
                          min="0"
                          max={playback.duration || 1}
                          step="0.01"
                          value={Math.min(playback.currentTime, playback.duration || 0)}
                          onChange={seekPlayback}
                          disabled={loadingAudio || playback.duration <= 0}
                          aria-label="Posición de reproducción Live"
                          className="mt-2.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-2.5"
                        />

                        <div className="mt-2.5 grid min-w-0 grid-cols-[42px_42px_minmax(0,1fr)_42px] items-center gap-1.5 sm:grid-cols-[56px_56px_minmax(120px,1fr)_56px] sm:gap-2.5">
                          <button type="button" onClick={() => changeSong(currentIndex - 1)} disabled={currentIndex === 0} className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 active:scale-[0.98] disabled:opacity-25 sm:h-13 sm:rounded-2xl" title="Canción anterior"><SkipBack size={18} /></button>
                          <button type="button" onClick={stopPlayback} disabled={loadingAudio || playback.stems.length === 0} className="flex h-10 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/10 text-red-200 active:scale-[0.98] disabled:opacity-25 sm:h-13 sm:rounded-2xl" title="Stop"><Square size={16} fill="currentColor" /></button>
                          <button type="button" onClick={togglePlay} disabled={loadingAudio || Boolean(audioError) || playback.stems.length === 0} className="flex h-11 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-emerald-400 px-2 text-[10px] font-black uppercase tracking-[0.06em] text-zinc-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500 sm:h-14 sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-xs sm:tracking-[0.1em]">
                            {loadingAudio ? <Loader2 size={19} className="animate-spin" /> : playback.playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
                            <span className="hidden min-w-0 truncate sm:inline">{loadingAudio ? 'Cargando' : playback.playing ? 'Pausa' : 'Play'}</span>
                          </button>
                          <button type="button" onClick={() => changeSong(currentIndex + 1)} disabled={currentIndex >= playlist.length - 1} className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 active:scale-[0.98] disabled:opacity-25 sm:h-13 sm:rounded-2xl" title="Canción siguiente"><SkipForward size={18} /></button>
                        </div>
                      </div>

                      `;

  text = text.slice(0, tabsIndex) + compactOperation + text.slice(tabsIndex);
  changes += 1;
  console.log('[ok] Operación táctil compacta antes de Secciones/Mixer');
} else {
  console.log('[skip] Operación táctil compacta: ya aplicada.');
}

// El rail del mixer puede desplazarse horizontalmente, pero ya no bloquea el scroll vertical de página.
replaceOnceIfPresent(
  'className="w-full max-w-full overflow-x-auto overflow-y-hidden pb-2 overscroll-x-contain [touch-action:pan-x]"',
  'className="w-full max-w-full overflow-x-auto overflow-y-hidden pb-2 overscroll-x-contain" style={{ touchAction: \'pan-x pan-y\' }}',
  'gesto bidireccional alrededor del Mixer'
);

// El propio fader sí captura el gesto para no mover la página mientras se ajusta volumen.
replaceAllIfPresent(
  "style={{ writingMode: 'vertical-lr', direction: 'rtl' }}",
  "style={{ writingMode: 'vertical-lr', direction: 'rtl', touchAction: 'none' }}",
  'faders touch aislados'
);

const requiredChecks = [
  ['Operación táctil', 'panel Operación táctil'],
  ["gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)'", 'tabs Secciones/Mixer 50/50'],
  ["touchAction: 'pan-x pan-y'", 'scroll vertical/horizontal Mixer'],
  ["touchAction: 'none'", 'captura táctil en faders'],
  ['hidden rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.055] p-4 xl:block', 'Operación Live desktop preservada']
];

for (const [needle, label] of requiredChecks) {
  if (!text.includes(needle)) throw new Error(`Validación final falló: falta ${label}.`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log(`Multitrack Live Fase 2K-B.2 aplicada: Operación táctil arriba y scroll vertical del Mixer restaurado (${changes} ajuste(s)).`);
