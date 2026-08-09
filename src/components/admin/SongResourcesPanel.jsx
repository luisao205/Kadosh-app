import React from 'react';
import {
  Headphones,
  Library,
  Link as LinkIcon,
  FileText as FileIcon,
  Monitor,
  Pause,
  Play,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react';
import { isVideoMediaUrl } from '../../utils/mediaUtils';

const SongResourcesPanel = ({
  audioUrl,
  audioRef,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  onToggleAudio,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onAudioFileChange,
  onTimeUpdate,
  onLoadedMetadata,
  onAudioEnded,
  multitracks = [],
  nombreStem,
  onNombreStemChange,
  customStemName,
  onCustomStemNameChange,
  onUploadStem,
  onRemoveStem,
  fondoUrl,
  onFondoUrlChange,
  onUploadFondo,
  recursos = [],
  nuevoRecurso,
  onNuevoRecursoChange,
  onAddRecurso,
  onUploadPDF,
  onRemoveRecurso,
  instrumentosRecursos = [],
  isSaving,
  formatTime
}) => (
  <>
    <div className="col-span-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-2">
      <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Pista o Secuencia de Audio (MP3)</label>
      {audioUrl && (
        <div className="mb-4 flex items-center gap-3 bg-zinc-900 dark:bg-zinc-950 border border-zinc-800 py-2 px-3 rounded-2xl w-full shadow-inner">
          <button type="button" onClick={onToggleAudio} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-zinc-200 text-zinc-900 rounded-xl shadow-md transition-all active:scale-95 shrink-0">
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <div className="flex-1 flex items-center gap-3 px-1">
            <span className="text-xs font-mono text-zinc-400 w-10 text-right">{formatTime(currentTime)}</span>
            <input type="range" min="0" max={duration || 100} value={currentTime} onChange={onSeek} className="flex-1 h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-zinc-200 [&::-webkit-slider-thumb]:transition-colors" />
            <span className="text-xs font-mono text-zinc-500 w-10">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-2 border-l border-zinc-800 pl-3">
            <button type="button" onClick={onToggleMute} className="text-zinc-400 hover:text-white transition-colors" title={isMuted ? "Quitar silencio" : "Silenciar"}>
              {isMuted || volume === 0 ? <VolumeX size={18} /> : volume < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
            </button>
            <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={onVolumeChange} className="hidden sm:block w-16 h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-zinc-200 [&::-webkit-slider-thumb]:transition-colors" title="Volumen" />
          </div>

          <audio ref={audioRef} src={audioUrl} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={onAudioEnded} onCanPlay={(e) => { e.target.volume = volume; e.target.muted = isMuted; }} className="hidden" />
        </div>
      )}
      <input type="file" accept="audio/*" onChange={onAudioFileChange} className="kp-input w-full p-2 rounded-xl text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-amber-500/10 file:text-amber-300 hover:file:bg-amber-500/20 transition-all cursor-pointer" />
    </div>

    <div className="col-span-2 pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800">
      <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
        <SlidersHorizontal size={18} className="text-indigo-500"/> Pistas Multitrack (In-Ears / Secuencias)
      </label>

      <div className="space-y-2 mb-4">
        {multitracks.length === 0 && <p className="text-xs text-zinc-400 italic bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 text-center">No hay pistas separadas agregadas.</p>}
        {multitracks.map(m => (
          <div key={m.id} className="flex items-center justify-between p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"><Headphones size={16}/></div>
              <div className="truncate">
                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{m.nombre}</p>
                <p className="text-[10px] font-bold text-zinc-500 truncate">{m.fileName}</p>
              </div>
            </div>
            <button type="button" onClick={() => onRemoveStem(m.id)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
          </div>
        ))}
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-2 items-center">
        <select value={nombreStem} onChange={e => { onNombreStemChange(e.target.value); onCustomStemNameChange(''); }} className="w-full sm:w-1/3 text-xs p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-zinc-900 dark:text-white font-bold text-zinc-700 dark:text-zinc-300">
          <option value="Click" className="bg-white dark:bg-zinc-900">Click (Metronomo)</option>
          <option value="Guia" className="bg-white dark:bg-zinc-900">Guia (Voz Directora)</option>
          <option value="Bateria" className="bg-white dark:bg-zinc-900">Bateria</option>
          <option value="Bajo" className="bg-white dark:bg-zinc-900">Bajo</option>
          <option value="Secuencia" className="bg-white dark:bg-zinc-900">Secuencia / Synths</option>
          <option value="Coros" className="bg-white dark:bg-zinc-900">Coros</option>
          <option value="Otro" className="bg-white dark:bg-zinc-900">Otro (Escribir nombre)</option>
        </select>
        {nombreStem === 'Otro' && (
          <input
            type="text"
            value={customStemName}
            onChange={e => onCustomStemNameChange(e.target.value)}
            placeholder="Nombre de la pista (ej. Trombon 2)"
            className="w-full sm:flex-1 text-xs p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-zinc-900 dark:text-white font-bold text-zinc-700 dark:text-zinc-300"
          />
        )}
        <label className="w-full sm:flex-1 text-xs font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 py-2.5 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-500/30 transition-colors flex justify-center items-center gap-2 cursor-pointer shadow-sm">
          <Upload size={14} /> Subir Pista (MP3/WAV)
          <input type="file" accept="audio/*" className="hidden" onChange={onUploadStem} disabled={isSaving} />
        </label>
      </div>
    </div>

    <div className="col-span-2 pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800">
      <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
        <Monitor size={18} className="text-emerald-500"/> Fondo de Proyeccion Automatico
      </label>
      <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-3">
        {fondoUrl && (
          <div className="relative w-full h-36 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
            {isVideoMediaUrl(fondoUrl) ? (
              <video src={fondoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
            ) : (
              <img src={fondoUrl} alt="Fondo" className="w-full h-full object-cover" />
            )}
            <button type="button" onClick={() => onFondoUrlChange('')} className="absolute top-2 right-2 p-2 bg-red-600/90 hover:bg-red-600 text-white rounded-lg shadow-md transition-colors active:scale-95">
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="url" value={fondoUrl} onChange={e => onFondoUrlChange(e.target.value)} placeholder="Pegar URL (ej. Cloudinary/YouTube...)" className="flex-1 text-xs p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-zinc-900 dark:text-white" />
          <label className="text-xs font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-4 py-2.5 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-colors flex justify-center items-center gap-2 cursor-pointer shadow-sm shrink-0">
            <Upload size={14} /> Subir Archivo
            <input type="file" accept="image/*,video/*" className="hidden" onChange={onUploadFondo} disabled={isSaving} />
          </label>
        </div>
      </div>
    </div>

    <div className="col-span-2 pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800">
      <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2"><Library size={18} className="text-blue-500"/> Recursos de Ensayo (Videos, Partituras)</label>

      <div className="space-y-2 mb-4">
        {recursos.length === 0 && <p className="text-xs text-zinc-400 italic bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 text-center">No hay tutoriales ni partituras agregadas.</p>}
        {recursos.map(r => (
          <div key={r.id} className="flex items-center justify-between p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`p-2 rounded-lg ${r.tipo === 'youtube' ? 'bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400' : r.tipo === 'pdf' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-400' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400'}`}>
                {r.tipo === 'youtube' ? <Video size={16}/> : r.tipo === 'pdf' ? <FileIcon size={16}/> : <LinkIcon size={16}/>}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{r.titulo}</p>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{r.instrumento}</p>
              </div>
            </div>
            <button type="button" onClick={() => onRemoveRecurso(r.id)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
          </div>
        ))}
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="Titulo (Ej. Intro Guitarra)" value={nuevoRecurso.titulo} onChange={e => onNuevoRecursoChange({ ...nuevoRecurso, titulo: e.target.value })} className="col-span-2 text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 dark:text-white" />
          <input type="url" placeholder="Link (YouTube, TikTok...)" value={nuevoRecurso.url} onChange={e => onNuevoRecursoChange({ ...nuevoRecurso, url: e.target.value })} className="col-span-2 text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 dark:text-white" />
          <select value={nuevoRecurso.instrumento} onChange={e => onNuevoRecursoChange({ ...nuevoRecurso, instrumento: e.target.value })} className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 dark:text-white">
            {instrumentosRecursos.map(inst => <option key={inst} value={inst} className="bg-white dark:bg-zinc-900">{inst}</option>)}
          </select>
          <select value={nuevoRecurso.tipo} onChange={e => onNuevoRecursoChange({ ...nuevoRecurso, tipo: e.target.value })} className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 dark:text-white">
            <option value="youtube" className="bg-white dark:bg-zinc-900">YouTube Embed</option>
            <option value="link" className="bg-white dark:bg-zinc-900">TikTok / Insta / Externo</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onAddRecurso} className="flex-1 text-xs font-bold bg-zinc-800 dark:bg-zinc-700 text-white py-2 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors">Anadir Enlace</button>
          <label className="flex-1 text-xs font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 py-2 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors flex justify-center items-center gap-1 cursor-pointer">
            <Upload size={14} /> Subir PDF
            <input type="file" accept=".pdf" className="hidden" onChange={onUploadPDF} />
          </label>
        </div>
      </div>
    </div>
  </>
);

export default SongResourcesPanel;
