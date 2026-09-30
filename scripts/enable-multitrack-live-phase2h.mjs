import fs from 'node:fs';

const filePath = 'src/components/admin/MultitrackLiveManagement.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');

const replaceOnce = (source, needle, replacement, label) => {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró: ${label}`);
  if (source.indexOf(needle, first + needle.length) !== -1) throw new Error(`Marcador duplicado: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

if (!text.includes('const [expandedEventIds, setExpandedEventIds]')) {
  text = replaceOnce(
    text,
    '  const [showArchivedEvents, setShowArchivedEvents] = useState(false);',
    [
      '  const [showArchivedEvents, setShowArchivedEvents] = useState(false);',
      '  const [expandedEventIds, setExpandedEventIds] = useState({});'
    ].join('\n'),
    'estado de detalle por setlist'
  );
}

if (!text.includes('Detalle por canción')) {
  const detailBlock = [
    '                    <div className="mt-3 overflow-hidden rounded-2xl border border-white/8 bg-black/15">',
    '                      <button',
    '                        type="button"',
    '                        onClick={() => setExpandedEventIds((previous) => ({ ...previous, [event.id]: !previous[event.id] }))}',
    '                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.035]"',
    '                      >',
    '                        <div>',
    '                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400">Detalle por canción</p>',
    '                          <p className="mt-1 text-[9px] font-semibold text-zinc-600">Revisa Live Map, mezcla y audio local de cada tema del setlist.</p>',
    '                        </div>',
    '                        <div className="flex shrink-0 items-center gap-2 text-[9px] font-black uppercase tracking-wide text-zinc-500">',
    "                          {expandedEventIds[event.id] ? 'Ocultar' : 'Ver canciones'}",
    '                          {expandedEventIds[event.id] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}',
    '                        </div>',
    '                      </button>',
    '',
    '                      {expandedEventIds[event.id] && (',
    '                        <div className="space-y-2 border-t border-white/8 p-3">',
    '                          {eventSongs.length === 0 ? (',
    '                            <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[10px] font-semibold text-zinc-600">Este setlist no tiene canciones.</div>',
    '                          ) : eventSongs.map((song, songIndex) => {',
    "                            const liveMap = song?.livePlayback && typeof song.livePlayback === 'object' ? song.livePlayback : null;",
    '                            const liveMapReady = Boolean(liveMap && Number(liveMap.bpm) > 0 && Array.isArray(liveMap.sections) && liveMap.sections.length > 0);',
    "                            const liveMapLabel = liveMapReady ? 'Live Map listo' : liveMap ? 'Live Map incompleto' : 'Sin Live Map';",
    '                            const mixerSaved = Boolean(liveMap?.mixer);',
    '                            const songAudioCount = getAudioCount(song);',
    '                            const songReadiness = (readiness?.songs || []).find((item) => String(item.key) === String(song.setlistItemId))',
    '                              || (readiness?.songs || []).find((item) => String(item.songId) === String(song.id));',
    '                            const localCached = songReadiness?.cached || 0;',
    '                            const localTotal = songReadiness?.total ?? songAudioCount;',
    '                            const audioReady = localTotal > 0 && localCached === localTotal;',
    '',
    '                            return (',
    '                              <div key={song.setlistItemId || song.id + \'_\' + songIndex} className="rounded-xl border border-white/8 bg-black/20 p-3">',
    '                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">',
    '                                  <div className="min-w-0 flex-1">',
    '                                    <div className="flex items-center gap-2">',
    '                                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] text-[9px] font-black text-zinc-600">{songIndex + 1}</span>',
    '                                      <div className="min-w-0">',
    "                                        <p className=\"truncate text-xs font-black text-zinc-100\">{song.titulo || 'Sin título'}</p>",
    "                                        <p className=\"mt-0.5 truncate text-[9px] font-semibold text-zinc-600\">{song.artista || 'Sin artista'} · {liveMap?.bpm || song.bpm || '--'} BPM</p>",
    '                                      </div>',
    '                                    </div>',
    '                                    <div className="mt-2 flex flex-wrap gap-1.5">',
    "                                      <span className={'rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wide ' + (liveMapReady ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300')}>{liveMapLabel}</span>",
    "                                      <span className={'rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wide ' + (mixerSaved ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-zinc-500')}>{mixerSaved ? 'Mezcla guardada' : 'Sin mezcla guardada'}</span>",
    "                                      <span className={'rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wide ' + (audioReady ? 'border-blue-400/20 bg-blue-400/10 text-blue-200' : songAudioCount === 0 ? 'border-red-400/20 bg-red-400/10 text-red-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300')}>{songAudioCount === 0 ? 'Sin audio' : 'Audio local ' + localCached + '/' + localTotal}</span>",
    '                                    </div>',
    '                                  </div>',
    '                                  <button',
    '                                    type="button"',
    '                                    onClick={() => navigate(`/multitrack-live/cancion/${song.id}`)}',
    '                                    className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-violet-200 hover:bg-violet-400/20"',
    '                                  >',
    "                                    <SlidersHorizontal size={12} /> {liveMap ? 'Editar' : 'Configurar'}",
    '                                  </button>',
    '                                </div>',
    '                              </div>',
    '                            );',
    '                          })}',
    '                        </div>',
    '                      )}',
    '                    </div>',
    ''
  ].join('\n');

  text = replaceOnce(
    text,
    '                    {isPreparing && progress && (',
    detailBlock + '                    {isPreparing && progress && (',
    'panel detalle por canción'
  );
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2H integrada: detalle por canción dentro de cada setlist.');
