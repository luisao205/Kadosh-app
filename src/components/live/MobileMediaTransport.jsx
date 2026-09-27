import React from 'react';
import { FastForward, Film, Pause, Play, Rewind, RotateCcw, Square, Volume2, VolumeX } from 'lucide-react';

const clampVolume = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const MobileMediaTransport = ({ media, onPlayPause, onSeek, onStop, onVolume }) => {
  if (!media || media.type !== 'video') return null;

  const volume = clampVolume(media.volume ?? 1);
  const isPlaying = Boolean(media.playing);

  return (
    <section className="rounded-[1.75rem] border border-violet-500/25 bg-gradient-to-b from-violet-500/10 to-zinc-950/95 p-4 shadow-2xl shadow-black/25">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-950/40">
            <Film size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-violet-300">Control de video</p>
            <p className="truncate text-sm font-black text-white">{media.name || 'Video en pantalla'}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{isPlaying ? 'Reproduciendo' : 'Pausado'}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300 active:scale-95"
          aria-label="Detener video"
          title="Detener"
        >
          <Square size={18} fill="currentColor" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-5 items-center gap-2 rounded-2xl border border-white/5 bg-black/35 p-2">
        <button type="button" onClick={() => onSeek?.('start')} className="flex min-h-12 items-center justify-center rounded-xl text-zinc-300 active:bg-white/10" title="Reiniciar"><RotateCcw size={19} /></button>
        <button type="button" onClick={() => onSeek?.('back10')} className="flex min-h-12 flex-col items-center justify-center rounded-xl text-zinc-300 active:bg-white/10" title="Retroceder 10 segundos"><Rewind size={20} /><span className="mt-0.5 text-[8px] font-black">-10s</span></button>
        <button
          type="button"
          onClick={onPlayPause}
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-zinc-950 shadow-xl shadow-black/30 active:scale-95"
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isPlaying ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" className="ml-0.5" />}
        </button>
        <button type="button" onClick={() => onSeek?.('fwd10')} className="flex min-h-12 flex-col items-center justify-center rounded-xl text-zinc-300 active:bg-white/10" title="Adelantar 10 segundos"><FastForward size={20} /><span className="mt-0.5 text-[8px] font-black">+10s</span></button>
        <button type="button" onClick={onStop} className="flex min-h-12 flex-col items-center justify-center rounded-xl text-red-300 active:bg-red-500/10" title="Stop"><Square size={18} fill="currentColor" /><span className="mt-0.5 text-[8px] font-black">STOP</span></button>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/5 bg-black/35 px-3 py-3">
        <button
          type="button"
          onClick={() => onVolume?.(volume > 0 ? 0 : 1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-violet-300 active:scale-95"
          aria-label={volume > 0 ? 'Silenciar' : 'Activar audio'}
        >
          {volume > 0 ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-zinc-500">
            <span>Volumen</span>
            <span className="text-zinc-300">{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => onVolume?.(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-violet-500"
            aria-label="Volumen del video"
          />
        </div>
      </div>
    </section>
  );
};

export default MobileMediaTransport;
