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

text = replaceOnce(
  text,
  '<p className="mt-1 text-[9px] font-semibold text-zinc-600">Controles actuales adaptados a touch. Los faders verticales llegan en 2K-B.</p>',
  '<p className="mt-1 text-[9px] font-semibold text-zinc-600">Faders verticales optimizados para touch. Desliza horizontalmente para ver todos los canales.</p>',
  'descripción mixer touch 2K-B'
);

const oldMixerControls = `                          <div className="mb-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                            <div className="flex items-center gap-3">
                              <Volume2 size={16} className="shrink-0 text-emerald-300" />
                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Master</span>
                                  <span className="font-mono text-[10px] font-bold text-zinc-500">{Math.round(playback.masterVolume * 100)}%</span>
                                </div>
                                <input type="range" min="0" max="1" step="0.01" value={playback.masterVolume} onChange={(event) => changeMasterVolume(Number(event.target.value))} className="h-3 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-400" />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {playback.stems.map((stem) => (
                              <div key={stem.id} className="rounded-2xl border border-white/8 bg-black/25 p-3">
                                <div className="flex items-center gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-black text-zinc-200">{stem.name}</p>
                                    <p className="mt-0.5 font-mono text-[9px] font-semibold text-zinc-600">{Math.round(stem.volume * 100)}%</p>
                                  </div>
                                  <button type="button" onClick={() => toggleMute(stem.id)} className={'flex h-11 w-12 items-center justify-center rounded-xl text-[10px] font-black ' + (stem.muted ? 'bg-red-500 text-white' : 'border border-white/10 bg-white/5 text-zinc-400')} title="Mute">{stem.muted ? <VolumeX size={16} /> : 'M'}</button>
                                  <button type="button" onClick={() => toggleSolo(stem.id)} className={'flex h-11 w-12 items-center justify-center rounded-xl text-[10px] font-black ' + (stem.solo ? 'bg-amber-400 text-zinc-950' : 'border border-white/10 bg-white/5 text-zinc-400')} title="Solo">S</button>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                  <Volume2 size={14} className="shrink-0 text-zinc-600" />
                                  <input type="range" min="0" max="1" step="0.01" value={stem.volume} onChange={(event) => changeStemVolume(stem.id, Number(event.target.value))} className="h-3 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-blue-400" />
                                </div>
                              </div>
                            ))}

                            {!loadingAudio && playback.stems.length === 0 && (
                              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                                <Music2 className="mx-auto text-zinc-700" size={28} />
                                <p className="mt-3 text-xs font-bold text-zinc-600">Selecciona una canción con audio para cargar el mixer.</p>
                              </div>
                            )}
                          </div>`;

const newMixerControls = `                          {playback.stems.length > 0 ? (
                            <div className="overflow-x-auto pb-2 overscroll-x-contain">
                              <div className="flex min-w-max gap-2">
                                <div className="flex w-28 shrink-0 flex-col items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-2.5">
                                  <div className="flex min-h-10 w-full items-center justify-center gap-1.5 border-b border-white/8 pb-2">
                                    <Volume2 size={14} className="text-emerald-300" />
                                    <p className="truncate text-[9px] font-black uppercase tracking-widest text-emerald-200">Master</p>
                                  </div>
                                  <p className="mt-2 font-mono text-[10px] font-black text-emerald-300">{Math.round(playback.masterVolume * 100)}%</p>
                                  <div className="my-2 flex h-48 items-center justify-center rounded-xl border border-white/8 bg-black/25 px-3">
                                    <input
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.01"
                                      value={playback.masterVolume}
                                      onChange={(event) => changeMasterVolume(Number(event.target.value))}
                                      aria-label="Volumen master"
                                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                                      className="h-40 w-10 cursor-pointer accent-emerald-400"
                                    />
                                  </div>
                                  <div className="flex h-11 w-full items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] text-[8px] font-black uppercase tracking-widest text-emerald-300">Salida</div>
                                </div>

                                {playback.stems.map((stem) => (
                                  <div key={stem.id} className={'flex w-28 shrink-0 flex-col items-center rounded-2xl border p-2.5 ' + (stem.solo ? 'border-amber-400/35 bg-amber-400/[0.055]' : stem.muted ? 'border-red-400/25 bg-red-400/[0.045]' : 'border-white/8 bg-black/25')}>
                                    <div className="flex min-h-10 w-full items-center border-b border-white/8 pb-2">
                                      <p className="w-full truncate text-center text-[10px] font-black text-zinc-200" title={stem.name}>{stem.name}</p>
                                    </div>
                                    <p className="mt-2 font-mono text-[10px] font-black text-blue-300">{Math.round(stem.volume * 100)}%</p>
                                    <div className="my-2 flex h-48 items-center justify-center rounded-xl border border-white/8 bg-black/25 px-3">
                                      <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={stem.volume}
                                        onChange={(event) => changeStemVolume(stem.id, Number(event.target.value))}
                                        aria-label={'Volumen ' + stem.name}
                                        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                                        className="h-40 w-10 cursor-pointer accent-blue-400"
                                      />
                                    </div>
                                    <div className="grid w-full grid-cols-2 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => toggleMute(stem.id)}
                                        aria-pressed={stem.muted}
                                        className={'flex h-11 items-center justify-center rounded-xl text-[9px] font-black ' + (stem.muted ? 'bg-red-500 text-white' : 'border border-white/10 bg-white/5 text-zinc-400')}
                                        title="Mute"
                                      >
                                        {stem.muted ? <VolumeX size={15} /> : 'M'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => toggleSolo(stem.id)}
                                        aria-pressed={stem.solo}
                                        className={'flex h-11 items-center justify-center rounded-xl text-[9px] font-black ' + (stem.solo ? 'bg-amber-400 text-zinc-950' : 'border border-white/10 bg-white/5 text-zinc-400')}
                                        title="Solo"
                                      >S</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : !loadingAudio ? (
                            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                              <Music2 className="mx-auto text-zinc-700" size={28} />
                              <p className="mt-3 text-xs font-bold text-zinc-600">Selecciona una canción con audio para cargar el mixer.</p>
                            </div>
                          ) : null}`;

text = replaceOnce(text, oldMixerControls, newMixerControls, 'faders verticales mixer touch');

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2K-B integrada: faders verticales táctiles para Master y stems.');
