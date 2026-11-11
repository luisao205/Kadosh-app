import React, { useState } from 'react';
import {
  ChevronDown,
  FileText as FileIcon,
  Headphones,
  Library,
  Link as LinkIcon,
  Monitor,
  Music,
  Pause,
  Play,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { isVideoMediaUrl } from '../../utils/mediaUtils';
import ProjectionStylePanel from './ProjectionStylePanel';
import LyricFormattingDraftEditor from './LyricFormattingDraftEditor';
import SectionMediaManager from './SectionMediaManager';
import { DEFAULT_PROJECTION_STYLE, getProjectionStyleLabel } from '../../utils/projectionStyle';

const SongResourcesPanel = ({
  // 1. Fondo de Proyección Automático
  fondoUrl = '',
  onFondoUrlChange,
  onUploadFondo,
  isUploadingFondo = false,

  // 2. Estilo de Proyección y Formato especial de letras
  projectionStyle = DEFAULT_PROJECTION_STYLE,
  onProjectionStyleChange,
  canEditProjectionStyle = true,
  canEditFormatting = true,
  lyricFormattingProps = null,
  lyricFormattingEditor = null,

  // 3. Audio (MP3)
  audioUrl = '',
  audioRef,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  volume = 1,
  isMuted = false,
  onToggleAudio,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onAudioFileChange,
  onTimeUpdate,
  onLoadedMetadata,
  onAudioEnded,
  youtubeUrl = '',
  onYoutubeUrlChange,

  // 4. Multitracks
  multitracks = [],
  nombreStem = 'Click',
  onNombreStemChange,
  customStemName = '',
  onCustomStemNameChange,
  onUploadStem,
  onRemoveStem,

  // 5. Recursos de Ensayo
  recursos = [],
  nuevoRecurso = { titulo: '', url: '', tipo: 'youtube', instrumento: 'General' },
  onNuevoRecursoChange,
  onAddRecurso,
  onUploadPDF,
  onRemoveRecurso,
  instrumentosRecursos = ['General', 'Voz Principal', 'Coros', 'Batería', 'Piano', 'Bajo', 'Guitarra Acústica', 'Guitarra Eléctrica', 'Percusión'],

  // 6. Multimedia por Sección
  sectionMediaProps = null,

  // General
  isSaving = false,
  formatTime = (sec = 0) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  },
}) => {
  // Estado inicial cerrado para todos los paneles (independientes)
  const [openSections, setOpenSections] = useState({
    fondo: false,
    estiloYFormato: false,
    audio: false,
    multitracks: false,
    recursos: false,
    multimediaSeccion: false,
  });

  const toggleSection = (sectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const hasFondo = Boolean(fondoUrl && String(fondoUrl).trim());
  const hasAudio = Boolean((audioUrl && String(audioUrl).trim()) || (youtubeUrl && String(youtubeUrl).trim()));
  const multitracksCount = Array.isArray(multitracks) ? multitracks.length : 0;
  const recursosCount = Array.isArray(recursos) ? recursos.length : 0;
  const sectionMediaCount = sectionMediaProps?.sectionMedia ? Object.keys(sectionMediaProps.sectionMedia).length : 0;

  const styleLabel = getProjectionStyleLabel(projectionStyle);
  const hasCustomFormatting = Boolean(lyricFormattingProps?.initialFormatting);

  return (
    <div className="col-span-2 space-y-3 pt-2">
      {/* ─────────────────────────────────────────────────────────────
          1. FONDO DE PROYECCIÓN AUTOMÁTICO
      ────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 transition-colors dark:border-zinc-800 dark:bg-zinc-950/60">
        <button
          type="button"
          onClick={() => toggleSection('fondo')}
          className="flex w-full items-center justify-between gap-3 text-left transition-opacity hover:opacity-90"
          aria-expanded={openSections.fondo}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <Monitor size={17} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                1. Fondo de Proyección Automático
              </span>
              <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Video en loop MP4/WebM o imagen de fondo para proyección
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                hasFondo
                  ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                  : 'border border-zinc-700/50 bg-zinc-800/50 text-zinc-400'
              }`}
            >
              {hasFondo ? (isVideoMediaUrl(fondoUrl) ? 'Video asignado' : 'Imagen asignada') : 'Sin fondo'}
            </span>
            <ChevronDown
              size={18}
              className={`text-zinc-400 transition-transform duration-200 ${
                openSections.fondo ? 'rotate-180 text-emerald-400' : ''
              }`}
            />
          </div>
        </button>

        {/* Contenido desplegable (oculto vía CSS para nunca destruir el estado de inputs) */}
        <div className={openSections.fondo ? 'mt-3 space-y-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/80' : 'hidden'}>
          {hasFondo && (
            <div className="relative h-36 w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              {isVideoMediaUrl(fondoUrl) ? (
                <video src={fondoUrl} autoPlay loop muted playsInline className="h-full w-full object-cover" />
              ) : (
                <img src={fondoUrl} alt="Fondo" className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => onFondoUrlChange?.('')}
                className="absolute right-2 top-2 rounded-lg bg-red-600/80 p-1.5 text-white backdrop-blur hover:bg-red-700 transition-colors"
                title="Quitar fondo"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                URL directa de video (MP4/WebM) o imagen
              </label>
              <input
                type="url"
                value={fondoUrl}
                onChange={(e) => onFondoUrlChange?.(e.target.value)}
                placeholder="https://ejemplo.com/fondo.mp4"
                className="kp-input w-full p-2 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                O subir archivo a Biblioteca
              </label>
              <label className="kp-button-secondary flex items-center justify-center gap-2 p-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <Upload size={14} />
                <span>{isUploadingFondo ? 'Subiendo...' : 'Subir Imagen o Video'}</span>
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm"
                  onChange={onUploadFondo}
                  disabled={isUploadingFondo}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. ESTILO DE PROYECCIÓN Y FORMATO ESPECIAL DE LETRAS (UNIFICADO)
      ────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-3.5 transition-colors dark:border-violet-500/20 dark:bg-violet-950/20">
        <button
          type="button"
          onClick={() => toggleSection('estiloYFormato')}
          className="flex w-full items-center justify-between gap-3 text-left transition-opacity hover:opacity-90"
          aria-expanded={openSections.estiloYFormato}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <SlidersHorizontal size={17} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                2. Estilo de Proyección y Formato especial de letras
              </span>
              <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Preset visual V2.1 (Limpio, Cinemático, Adoración, etc.) y formato personalizado por diapositiva
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-violet-300">
              {styleLabel}{hasCustomFormatting ? ' · Formato activo' : ''}
            </span>
            <ChevronDown
              size={18}
              className={`text-zinc-400 transition-transform duration-200 ${
                openSections.estiloYFormato ? 'rotate-180 text-violet-400' : ''
              }`}
            />
          </div>
        </button>

        {/* Contenido desplegable unificado */}
        <div className={openSections.estiloYFormato ? 'mt-3 space-y-4 pt-3 border-t border-violet-500/20' : 'hidden'}>
          {canEditProjectionStyle && (
            <div>
              <ProjectionStylePanel
                value={projectionStyle}
                onChange={onProjectionStyleChange}
              />
            </div>
          )}

          {lyricFormattingEditor ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-3 pt-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles size={16} className="text-violet-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Formato especial por diapositiva (V2.1)
                </h4>
              </div>
              {lyricFormattingEditor}
            </div>
          ) : canEditFormatting && lyricFormattingProps ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-3 pt-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles size={16} className="text-violet-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Formato especial por diapositiva (V2.1)
                </h4>
              </div>
              <LyricFormattingDraftEditor {...lyricFormattingProps} />
            </div>
          ) : null}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. PISTA O SECUENCIA DE AUDIO (MP3)
      ────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 transition-colors dark:border-zinc-800 dark:bg-zinc-950/60">
        <button
          type="button"
          onClick={() => toggleSection('audio')}
          className="flex w-full items-center justify-between gap-3 text-left transition-opacity hover:opacity-90"
          aria-expanded={openSections.audio}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <Headphones size={17} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                3. Pista o Secuencia de Audio (MP3)
              </span>
              <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Reproductor de audio integrado para ensayo y enlace de YouTube
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                hasAudio
                  ? 'border border-blue-500/30 bg-blue-500/15 text-blue-300'
                  : 'border border-zinc-700/50 bg-zinc-800/50 text-zinc-400'
              }`}
            >
              {hasAudio ? 'Audio configurado' : 'Sin audio'}
            </span>
            <ChevronDown
              size={18}
              className={`text-zinc-400 transition-transform duration-200 ${
                openSections.audio ? 'rotate-180 text-blue-400' : ''
              }`}
            />
          </div>
        </button>

        <div className={openSections.audio ? 'mt-3 space-y-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/80' : 'hidden'}>
          {audioUrl && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  <Music size={13} /> Pista de Audio
                </span>
                <span className="text-xs font-mono font-bold text-zinc-400">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {audioRef && (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onTimeUpdate={onTimeUpdate}
                  onLoadedMetadata={onLoadedMetadata}
                  onEnded={onAudioEnded}
                  preload="metadata"
                />
              )}

              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={onSeek}
                className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleAudio}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30"
                  >
                    {isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  >
                    {isMuted || volume === 0 ? <VolumeX size={15} /> : volume < 0.5 ? <Volume1 size={15} /> : <Volume2 size={15} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={onVolumeChange}
                    className="w-16 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                Subir nuevo archivo de audio MP3
              </label>
              <input
                type="file"
                accept="audio/*"
                onChange={onAudioFileChange}
                className="kp-input w-full p-1.5 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                Enlace de YouTube de referencia
              </label>
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => onYoutubeUrlChange?.(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="kp-input w-full p-2 rounded-xl text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. PISTAS MULTITRACK (IN-EARS / SECUENCIAS)
      ────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 transition-colors dark:border-zinc-800 dark:bg-zinc-950/60">
        <button
          type="button"
          onClick={() => toggleSection('multitracks')}
          className="flex w-full items-center justify-between gap-3 text-left transition-opacity hover:opacity-90"
          aria-expanded={openSections.multitracks}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <Library size={17} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                4. Pistas Multitrack (In-Ears / Secuencias)
              </span>
              <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Stems independientes: Click, Guía, Pianos, Pads, Batería, etc.
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                multitracksCount > 0
                  ? 'border border-violet-500/30 bg-violet-500/15 text-violet-300'
                  : 'border border-zinc-700/50 bg-zinc-800/50 text-zinc-400'
              }`}
            >
              {multitracksCount > 0 ? `${multitracksCount} ${multitracksCount === 1 ? 'stem' : 'stems'}` : 'Sin stems'}
            </span>
            <ChevronDown
              size={18}
              className={`text-zinc-400 transition-transform duration-200 ${
                openSections.multitracks ? 'rotate-180 text-violet-400' : ''
              }`}
            />
          </div>
        </button>

        <div className={openSections.multitracks ? 'mt-3 space-y-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/80' : 'hidden'}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div>
              <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                Tipo de Stem
              </label>
              <select
                value={nombreStem}
                onChange={(e) => onNombreStemChange?.(e.target.value)}
                className="kp-input w-full p-2 rounded-xl text-xs"
              >
                <option value="Click">Click (Metrónomo)</option>
                <option value="Guía">Guía Vocal</option>
                <option value="Batería">Batería</option>
                <option value="Bajo">Bajo</option>
                <option value="Guitarra Eléctrica">Guitarra Eléctrica</option>
                <option value="Guitarra Acústica">Guitarra Acústica</option>
                <option value="Pianos">Pianos / Teclados</option>
                <option value="Sintetizadores">Sintetizadores / Pads</option>
                <option value="Voces">Voces / Coros</option>
                <option value="Otro">Otro (Personalizado)</option>
              </select>
            </div>

            {nombreStem === 'Otro' && (
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                  Nombre Personalizado
                </label>
                <input
                  type="text"
                  value={customStemName}
                  onChange={(e) => onCustomStemNameChange?.(e.target.value)}
                  placeholder="Ej. Shaker, Cello..."
                  className="kp-input w-full p-2 rounded-xl text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                Subir Audio Stem
              </label>
              <label className="kp-button-secondary flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <Upload size={13} />
                <span>Subir Audio</span>
                <input type="file" accept="audio/*" onChange={onUploadStem} className="hidden" />
              </label>
            </div>
          </div>

          {multitracks.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {multitracks.map((stem, idx) => (
                <div
                  key={stem.id || idx}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-violet-400 shrink-0" />
                    <span className="font-bold text-xs text-zinc-800 dark:text-zinc-200 truncate">
                      {stem.nombre || stem.name}
                    </span>
                    <span className="text-[10px] text-zinc-400 truncate max-w-[120px]">
                      {stem.fileName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveStem?.(stem.id)}
                    className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. RECURSOS DE ENSAYO (VIDEOS, PARTITURAS)
      ────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 transition-colors dark:border-zinc-800 dark:bg-zinc-950/60">
        <button
          type="button"
          onClick={() => toggleSection('recursos')}
          className="flex w-full items-center justify-between gap-3 text-left transition-opacity hover:opacity-90"
          aria-expanded={openSections.recursos}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <FileIcon size={17} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                5. Recursos de Ensayo (Videos, Partituras)
              </span>
              <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Tutoriales de YouTube, enlaces de referencia y partituras PDF por instrumento
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                recursosCount > 0
                  ? 'border border-amber-500/30 bg-amber-500/15 text-amber-300'
                  : 'border border-zinc-700/50 bg-zinc-800/50 text-zinc-400'
              }`}
            >
              {recursosCount > 0 ? `${recursosCount} ${recursosCount === 1 ? 'recurso' : 'recursos'}` : 'Sin recursos'}
            </span>
            <ChevronDown
              size={18}
              className={`text-zinc-400 transition-transform duration-200 ${
                openSections.recursos ? 'rotate-180 text-amber-400' : ''
              }`}
            />
          </div>
        </button>

        <div className={openSections.recursos ? 'mt-3 space-y-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/80' : 'hidden'}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              placeholder="Título del recurso..."
              value={nuevoRecurso.titulo}
              onChange={(e) => onNuevoRecursoChange?.({ ...nuevoRecurso, titulo: e.target.value })}
              className="kp-input p-2 rounded-xl text-xs sm:col-span-2"
            />
            <select
              value={nuevoRecurso.instrumento}
              onChange={(e) => onNuevoRecursoChange?.({ ...nuevoRecurso, instrumento: e.target.value })}
              className="kp-input p-2 rounded-xl text-xs"
            >
              {instrumentosRecursos.map((inst) => (
                <option key={inst} value={inst}>{inst}</option>
              ))}
            </select>
            <select
              value={nuevoRecurso.tipo}
              onChange={(e) => onNuevoRecursoChange?.({ ...nuevoRecurso, tipo: e.target.value })}
              className="kp-input p-2 rounded-xl text-xs"
            >
              <option value="youtube">YouTube (Video/Tutorial)</option>
              <option value="enlace">Enlace Web</option>
              <option value="pdf">Partitura (PDF)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {nuevoRecurso.tipo === 'pdf' ? (
              <label className="kp-button-secondary flex items-center justify-center gap-2 p-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <Upload size={14} />
                <span>{isSaving ? 'Subiendo...' : 'Subir Archivo PDF'}</span>
                <input type="file" accept="application/pdf" onChange={onUploadPDF} disabled={isSaving} className="hidden" />
              </label>
            ) : (
              <input
                type="url"
                placeholder="Pega la URL de YouTube o del recurso..."
                value={nuevoRecurso.url}
                onChange={(e) => onNuevoRecursoChange?.({ ...nuevoRecurso, url: e.target.value })}
                className="kp-input p-2 rounded-xl text-xs"
              />
            )}
            <button
              type="button"
              onClick={onAddRecurso}
              className="kp-button-secondary p-2 rounded-xl text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              + Añadir Recurso
            </button>
          </div>

          {recursos.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {recursos.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                      {rec.tipo === 'pdf' ? <FileIcon size={13} /> : <LinkIcon size={13} />}
                    </span>
                    <span className="font-bold text-xs text-zinc-800 dark:text-zinc-200 truncate">
                      {rec.titulo}
                    </span>
                    <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded-md font-medium shrink-0">
                      {rec.instrumento}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveRecurso?.(rec.id)}
                    className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          6. MULTIMEDIA POR SECCIÓN (SI EXISTE EN EL EDITOR)
      ────────────────────────────────────────────────────────────── */}
      {sectionMediaProps && (
        <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 transition-colors dark:border-zinc-800 dark:bg-zinc-950/60">
          <button
            type="button"
            onClick={() => toggleSection('multimediaSeccion')}
            className="flex w-full items-center justify-between gap-3 text-left transition-opacity hover:opacity-90"
            aria-expanded={openSections.multimediaSeccion}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                <Video size={17} />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                  6. Multimedia por Sección
                </span>
                <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Videos, imágenes o fondos asociados a momentos específicos de la canción
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                  sectionMediaCount > 0
                    ? 'border border-cyan-500/30 bg-cyan-500/15 text-cyan-300'
                    : 'border border-zinc-700/50 bg-zinc-800/50 text-zinc-400'
                }`}
              >
                {sectionMediaCount > 0 ? `${sectionMediaCount} secciones` : 'Sin asignar'}
              </span>
              <ChevronDown
                size={18}
                className={`text-zinc-400 transition-transform duration-200 ${
                  openSections.multimediaSeccion ? 'rotate-180 text-cyan-400' : ''
                }`}
              />
            </div>
          </button>

          <div className={openSections.multimediaSeccion ? 'mt-3 space-y-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/80' : 'hidden'}>
            <SectionMediaManager {...sectionMediaProps} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SongResourcesPanel;
