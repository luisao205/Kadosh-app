import fs from 'node:fs';

const filePath = 'src/components/live/MultitrackLive.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');

const replaceOnce = (source, needle, replacement, label) => {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró: ${label}`);
  if (source.indexOf(needle, first + needle.length) !== -1) throw new Error(`Marcador duplicado: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

if (!text.includes('  const liveRunnerMode = !standaloneSongMode;')) {
  text = replaceOnce(
    text,
    '  const standaloneSongMode = Boolean(songId);',
    ['  const standaloneSongMode = Boolean(songId);', '  const liveRunnerMode = !standaloneSongMode;'].join('\n'),
    'modo Live Runner'
  );
}

text = text.replace(
  '<span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-200">Fase 2F</span>',
  '<span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-200">{liveRunnerMode ? \'Live Runner\' : \'Editor\'}</span>'
);

if (!text.includes('{standaloneSongMode && (\n            <button\n              type="button"\n              onClick={handlePrepareSetlist}')) {
  const prepareStart = '            <button\n              type="button"\n              onClick={handlePrepareSetlist}';
  text = replaceOnce(text, prepareStart, '{standaloneSongMode && (\n            <button\n              type="button"\n              onClick={handlePrepareSetlist}', 'abrir botón preparar solo editor');
  const prepareEnd = "                  : (standaloneSongMode ? 'Preparar canción' : 'Preparar setlist')}\n            </button>";
  text = replaceOnce(text, prepareEnd, prepareEnd + '\n            )}', 'cerrar botón preparar solo editor');
}

if (!text.includes("{standaloneSongMode ? (\n                    <p className=\"mt-2 text-[10px] font-semibold leading-relaxed text-zinc-600\">Marca el instante exacto")) {
  const alignmentBody = [
    '                    <p className="mt-2 text-[10px] font-semibold leading-relaxed text-zinc-600">Marca el instante exacto donde comienza el compás 1. Por ahora esta referencia vive solo durante esta sesión.</p>',
    '                    <p className="mt-3 font-mono text-xs font-black text-zinc-300">Inicio: {formatTime(currentGridOffset)}</p>',
    '                    <div className="mt-3 grid gap-2">',
    '                      <button',
    '                        type="button"',
    '                        onClick={markGridStart}',
    '                        disabled={!currentBpm || playback.stems.length === 0}',
    '                        className="rounded-xl bg-cyan-400 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"',
    '                      >',
    '                        Marcar compás 1 aquí',
    '                      </button>',
    '                      <button',
    '                        type="button"',
    '                        onClick={resetGridStart}',
    '                        disabled={!currentSongGridKey || currentGridOffset === 0}',
    '                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-400 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"',
    '                      >',
    '                        Reiniciar a 0:00',
    '                      </button>',
    '                    </div>'
  ].join('\n');

  const alignmentReplacement = [
    '                    {standaloneSongMode ? (',
    '                      <>',
    '                        <p className="mt-2 text-[10px] font-semibold leading-relaxed text-zinc-600">Marca el instante exacto donde comienza el compás 1. Esta referencia se guarda dentro del Live Map.</p>',
    '                        <p className="mt-3 font-mono text-xs font-black text-zinc-300">Inicio: {formatTime(currentGridOffset)}</p>',
    '                        <div className="mt-3 grid gap-2">',
    '                          <button type="button" onClick={markGridStart} disabled={!currentBpm || playback.stems.length === 0} className="rounded-xl bg-cyan-400 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600">Marcar compás 1 aquí</button>',
    '                          <button type="button" onClick={resetGridStart} disabled={!currentSongGridKey || currentGridOffset === 0} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-zinc-400 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">Reiniciar a 0:00</button>',
    '                        </div>',
    '                      </>',
    '                    ) : (',
    '                      <>',
    '                        <p className="mt-2 text-[10px] font-semibold leading-relaxed text-zinc-600">Alineación cargada desde el Live Map. En modo Live no se modifica accidentalmente.</p>',
    '                        <p className="mt-3 font-mono text-xs font-black text-emerald-200">Compás 1: {formatTime(currentGridOffset)}</p>',
    '                      </>',
    '                    )}'
  ].join('\n');
  text = replaceOnce(text, alignmentBody, alignmentReplacement, 'alineación segura en Live');
}

if (!text.includes('Secciones rápidas')) {
  const sectionStart = '                <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-400/[0.045] p-4">';
  const quickSections = [
    '                {liveRunnerMode && (',
    '                  <div className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.045] p-4">',
    '                    <div>',
    '                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Secciones rápidas</p>',
    '                      <p className="mt-1 text-[10px] font-semibold text-zinc-500">Salta o repite partes usando el Live Map guardado. Aquí no se edita la estructura.</p>',
    '                    </div>',
    '                    {currentSections.length > 0 ? (',
    '                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">',
    '                        {currentSections.map((section, sectionIndex) => (',
    '                          <div key={section.id} className="grid grid-cols-[1fr_66px] gap-2 rounded-2xl border border-white/8 bg-black/20 p-2">',
    '                            <button type="button" onClick={() => goToSection(section)} className="min-h-14 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 text-left hover:bg-cyan-400/20">',
    '                              <p className="truncate text-sm font-black text-cyan-100">{section.label}</p>',
    '                              <p className="mt-1 font-mono text-[9px] font-bold text-cyan-300/55">Compás {section.bar} · {formatTime(section.start)}</p>',
    '                            </button>',
    '                            <button type="button" onClick={() => loopSection(sectionIndex)} disabled={sectionIndex >= currentSections.length - 1} className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/10 text-[9px] font-black uppercase tracking-wide text-fuchsia-200 hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-25">Loop</button>',
    '                          </div>',
    '                        ))}',
    '                      </div>',
    '                    ) : (',
    '                      <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3 text-[10px] font-bold text-amber-200">Esta canción no tiene secciones guardadas. Configúrala desde Administración antes del servicio.</div>',
    '                    )}',
    '                    {sectionError && <div className="mt-3 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-red-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><p className="text-[10px] font-bold leading-relaxed">{sectionError}</p></div>}',
    '                  </div>',
    '                )}',
    '',
    '                {standaloneSongMode && (',
    sectionStart
  ].join('\n');
  text = replaceOnce(text, sectionStart, quickSections, 'secciones rápidas y editor');

  const sectionEnd = '                </div>\n\n                <div className="mt-7">';
  text = replaceOnce(text, sectionEnd, '                </div>\n                )}\n\n                <div className="mt-7">', 'cerrar editor de secciones');
}

if (!text.includes('Operación Live')) {
  const timelineStart = '                <div className="mt-7">\n                  <input';
  const liveTransport = [
    '                {liveRunnerMode && (',
    '                  <div className="mt-5 rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.055] p-4">',
    '                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">',
    '                      <div>',
    '                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Operación Live</p>',
    '                        <p className="mt-1 text-[10px] font-semibold text-zinc-500">Controles grandes para reducir toques accidentales durante el servicio.</p>',
    '                      </div>',
    '                      <div className="font-mono text-sm font-black text-zinc-300">{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</div>',
    '                    </div>',
    '                    <div className="mt-4 grid grid-cols-[60px_60px_minmax(120px,1fr)_60px] items-center gap-3">',
    '                      <button type="button" onClick={() => changeSong(currentIndex - 1)} disabled={currentIndex === 0} className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-25" title="Canción anterior"><SkipBack size={22} /></button>',
    '                      <button type="button" onClick={stopPlayback} disabled={loadingAudio || playback.stems.length === 0} className="flex h-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/20 disabled:opacity-25" title="Stop"><Square size={20} fill="currentColor" /></button>',
    '                      <button type="button" onClick={togglePlay} disabled={loadingAudio || Boolean(audioError) || playback.stems.length === 0} className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-emerald-400 px-5 text-sm font-black uppercase tracking-[0.12em] text-zinc-950 hover:bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500">',
    '                        {loadingAudio ? <Loader2 size={24} className="animate-spin" /> : playback.playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}',
    '                        {loadingAudio ? \'Cargando\' : playback.playing ? \'Pausa\' : \'Play\'}',
    '                      </button>',
    '                      <button type="button" onClick={() => changeSong(currentIndex + 1)} disabled={currentIndex >= playlist.length - 1} className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-25" title="Canción siguiente"><SkipForward size={22} /></button>',
    '                    </div>',
    '                  </div>',
    '                )}',
    '',
    '                <div className="mt-7">',
    '                  <input'
  ].join('\n');
  text = replaceOnce(text, timelineStart, liveTransport, 'transporte Live');
}

if (!text.includes('{standaloneSongMode && (\n                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">')) {
  const transportStart = '                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">';
  text = replaceOnce(text, transportStart, '{standaloneSongMode && (\n                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">', 'transporte editor abrir');
  const transportEnd = '                  <button type="button" onClick={() => changeSong(currentIndex + 1)} disabled={currentIndex >= playlist.length - 1} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-25">\n                    <SkipForward size={21} />\n                  </button>\n                </div>';
  text = replaceOnce(text, transportEnd, transportEnd + '\n                )}', 'transporte editor cerrar');
}

if (!text.includes('{standaloneSongMode && (\n          <div className="grid gap-3 md:grid-cols-2">')) {
  const infoStart = '          <div className="grid gap-3 md:grid-cols-2">';
  text = replaceOnce(text, infoStart, '{standaloneSongMode && (\n          <div className="grid gap-3 md:grid-cols-2">', 'tarjetas informativas abrir');
  const infoEnd = '          </div>\n        </section>\n\n        <aside className="order-3';
  text = replaceOnce(text, infoEnd, '          </div>\n          )}\n        </section>\n\n        <aside className="order-3', 'tarjetas informativas cerrar');
}

text = text.replace(
  '<h2 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300">Mixer</h2>',
  '<h2 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300">{liveRunnerMode ? \'Mixer Live\' : \'Mixer\'}</h2>'
);

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2I integrada: Live Runner separado del editor con controles seguros y secciones rápidas.');
